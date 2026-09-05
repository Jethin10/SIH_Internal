"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { chromePath } = require("../scripts/browser-runtime.js");
const { createServer } = require("../server/server.js");
const root = path.resolve(__dirname, "..");
const listen = (server) => new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", () => resolve(server.address().port)));

async function main() {
  const offline = process.argv.includes("--offline-harness");
  if (!offline && (!process.env.UPSTREAM_ENDPOINT || !process.env.UPSTREAM_MODEL)) {
    throw new Error("Real-model verification requires UPSTREAM_ENDPOINT and UPSTREAM_MODEL (and UPSTREAM_API_KEY if required by that provider). Use npm run test:provider:harness to verify the harness offline; that is not real-model evidence.");
  }
  const endpoint = offline ? null : new URL(process.env.UPSTREAM_ENDPOINT);
  if (endpoint && (endpoint.username || endpoint.password || endpoint.search)) throw new Error("Use UPSTREAM_API_KEY for credentials, not endpoint URL credentials or query parameters.");
  if (offline) {
    delete process.env.UPSTREAM_ENDPOINT; delete process.env.UPSTREAM_MODEL; delete process.env.UPSTREAM_API_KEY;
  }
  process.env.PLANNER_TOKEN = crypto.randomBytes(24).toString("hex");
  const executablePath = chromePath();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "strawhats-provider-"));
  const fixture = http.createServer((_req, res) => res.writeHead(200, { "Content-Type": "text/html" }).end(
    '<!doctype html><title>Synthetic provider check</title><label>Email <input id="email" type="email" value="fixture.user@example.com"></label><p>Synthetic data only. Do not send messages or submit forms.</p>'
  ));
  const planner = createServer();
  const requests = [];
  planner.on("request", (request, response) => {
    if (request.method !== "POST") return;
    const started = performance.now();
    let bytes = "";
    request.on("data", (chunk) => { bytes += chunk; });
    response.on("finish", () => requests.push({ body: bytes, status: response.statusCode, providerRoundTripMs: Math.round(performance.now() - started) }));
  });
  let browser;
  try {
    const fixturePort = await listen(fixture);
    const plannerPort = await listen(planner);
    browser = await chromium.launchPersistentContext(profile, { executablePath, headless: true,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).hostname;
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${fixturePort}`);
    const panel = await browser.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
    await page.bringToFront();
    const message = async (payload) => {
      const result = await panel.evaluate((payload) => chrome.runtime.sendMessage(payload), payload);
      assert(result?.ok !== false, `${payload.type} failed`);
      return result;
    };
    await message({ type: "SAVE_SETTINGS", settings: { provider: {
      endpoint: `http://127.0.0.1:${plannerPort}/v1/chat/completions`, model: offline ? "local-demo" : process.env.UPSTREAM_MODEL, apiKey: process.env.PLANNER_TOKEN
    }, userProfile: { email: "vault.user@example.com" } } });
    await message({ type: "REFRESH_CONTEXT" });
    const taskStarted = performance.now();
    await message({ type: "START_TASK", task: "fill my email" });
    const deadline = Date.now() + 90000;
    let receipts = [];
    while (Date.now() < deadline) {
      receipts = (await message({ type: "GET_AUDIT" })).receipts;
      if (receipts.some((item) => item.localDecision === "done")) break;
      if (receipts.some((item) => item.action === "error")) throw new Error("Provider task failed; check provider configuration. No successful real-model result was recorded.");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert(receipts.some((item) => item.localDecision === "done"), "Provider task did not complete within 90 seconds");
    assert.equal(await page.locator("#email").inputValue(), "vault.user@example.com", "Provider did not fill the private capability");
    assert(requests.length > 0 && requests.every((item) => item.status === 200), "Provider requests did not succeed");
    for (const request of requests) {
      for (const raw of ["vault.user@example.com", "fixture.user@example.com"]) assert(!request.body.includes(raw), "Synthetic private value escaped tokenization");
      assert(!request.body.includes("data:image"), "Screenshot was sent to planner");
    }
    const report = { ok: true, mode: offline ? "offline-harness-only" : "configured-model", generatedAt: new Date().toISOString(), platform: process.platform,
      providerHost: endpoint?.hostname || "offline", model: offline ? "local-demo" : process.env.UPSTREAM_MODEL,
      taskMs: Math.round(performance.now() - taskStarted), requests: requests.map(({ status, providerRoundTripMs }) => ({ status, providerRoundTripMs })),
      checks: { privateFill: true, rawSyntheticValuesAbsent: true, screenshotAbsent: true },
      limitation: "One synthetic email-fill task. Provider round-trip includes proxy, network and inference; it does not isolate model inference time." };
    fs.writeFileSync(path.join(root, `artifacts/${offline ? "provider-harness" : "provider-live"}.json`), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fixture.close(); planner.close();
    if (browser) await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
