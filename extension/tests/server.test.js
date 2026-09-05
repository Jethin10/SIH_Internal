"use strict";

const assert = require("assert");
const { createServer, localPlan } = require("../server/server.js");

async function main() {
  const visualPayload = {
    task: "click Private visual fallback",
    context: { elements: [{ id: "visual-1", label: "Private visual fallback", source: "vision", actionable: true, version: 1 }], visual: { scanned: true } },
    history: [{ action: { type: "visual_scan" }, result: { status: "executed", localOnly: true } }]
  };
  assert.equal(localPlan(visualPayload).type, "click", "A successful scan must continue to the requested action");
  visualPayload.history.push({ action: { type: "click" }, result: { status: "executed" } });
  assert.equal(localPlan(visualPayload).type, "done", "A successful click must not be repeated");
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/health`).then((response) => response.json());
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.mode, "local");

    const request = {
      model: "local-demo",
      messages: [
        { role: "system", content: "Return JSON" },
        { role: "user", content: JSON.stringify({ task: "search for privacy gateway", context: { elements: [{ id: "search-1", role: "textbox", semanticType: "search", label: "Search", value: "", actionable: true, disabled: false, version: 2 }], vaultCapabilities: [] }, history: [] }) }
      ]
    };
    const response = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    assert.strictEqual(response.status, 200);
    const data = await response.json();
    const action = JSON.parse(data.choices[0].message.content);
    assert.deepStrictEqual(action, { type: "fill", targetId: "search-1", expectedVersion: 2, value: "privacy gateway", reason: "Enter the requested search query" });

    const malformed = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    assert.strictEqual(malformed.status, 400);

    const wrongType = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    assert.strictEqual(wrongType.status, 415);

    const hostileOrigin = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://hostile.example" }, body: JSON.stringify(request) });
    assert.strictEqual(hostileOrigin.status, 403);

    const extensionOrigin = await fetch(`${base}/health`, { headers: { Origin: "moz-extension://12345678-abcd" } });
    assert.strictEqual(extensionOrigin.status, 200);
    assert.strictEqual(extensionOrigin.headers.get("access-control-allow-origin"), "moz-extension://12345678-abcd");
    console.log("Local planner server tests passed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
