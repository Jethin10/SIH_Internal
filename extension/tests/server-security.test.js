"use strict";
const assert = require("assert");
const { createServer, validateUpstreamEndpoint } = require("../server/server.js");

assert.throws(() => validateUpstreamEndpoint("http://provider.example/v1"), /HTTPS/);
assert.equal(validateUpstreamEndpoint("http://127.0.0.1:9000/v1"), "http://127.0.0.1:9000/v1");
assert.equal(validateUpstreamEndpoint("https://provider.example/v1"), "https://provider.example/v1");

async function main() {
  process.env.PLANNER_TOKEN = "correct-horse-battery-staple";
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ messages: [{ role: "user", content: JSON.stringify({ task: "done", context: {}, history: [] }) }] });
  try {
    const missing = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(missing.status, 401);
    const wrong = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" }, body });
    assert.equal(wrong.status, 401);
    const allowed = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer correct-horse-battery-staple" }, body });
    assert.equal(allowed.status, 200);
    console.log("planner security tests passed");
  } finally {
    delete process.env.PLANNER_TOKEN;
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
