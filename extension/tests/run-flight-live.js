"use strict";

// Opt-in live-site verification. Never run in CI or bundle credentials.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { chromePath } = require("../scripts/browser-runtime.js");
const root = path.resolve(__dirname, "..");

async function main() {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required for this opt-in live flight test");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "strawhats-flight-"));
  let browser;
  const events = [];
  const requests = [];
  const started = Date.now();
  try {
    browser = await chromium.launchPersistentContext(profile, { executablePath: chromePath(), headless: true,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).hostname;
    const panel = await browser.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
    await panel.exposeFunction("recordAgentEvent", (event) => {
      events.push(event);
      if (["ACTION_PROPOSED", "TASK_DONE", "TASK_ERROR"].includes(event.type)) console.log(JSON.stringify(event));
    });
    await panel.evaluate(() => {
      chrome.runtime.onMessage.addListener((m) => {
        if (m?.source !== "gateway-worker") return;
        if (["ACTION_PROPOSED", "ACTION_RESULT", "TASK_DONE", "TASK_ERROR", "CONFIRMATION_REQUIRED", "PLANNER_WAIT"].includes(m.type)) {
          window.recordAgentEvent({ type: m.type, action: m.action?.type, step: m.step,
            status: m.result?.status, reason: m.result?.reason, message: m.message, error: m.error });
        }
      });
    });
    browser.on("response", async (response) => {
      if (response.url() !== "https://api.groq.com/openai/v1/chat/completions") return;
      const record = { status: response.status(), requestBytes: Buffer.byteLength(response.request().postData() || "") };
      requests.push(record);
      if (response.status() >= 400) {
        const data = await response.json().catch(() => ({}));
        record.error = String(data?.error?.message || "").replace(/gsk_[A-Za-z0-9]+|org_[A-Za-z0-9]+/g, "[redacted]").slice(0, 700);
        console.log(JSON.stringify(record));
      }
    });
    await panel.locator("#settingsPanel").evaluate((el) => { el.open = true; });
    await panel.locator("#providerPreset").selectOption("groq");
    await panel.locator("#apiKeyInput").fill(process.env.GROQ_API_KEY);
    await panel.locator("#maxStepsInput").selectOption("30");
    await panel.locator("#saveSettingsButton").click();
    await panel.waitForFunction(() => document.querySelector("#providerLine").textContent.includes("openai/gpt-oss-20b"));
    await panel.locator("#flightDemo").evaluate((el) => { el.open = true; });
    await panel.locator("#flightButton").click();
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
      if (events.some((e) => ["TASK_DONE", "TASK_ERROR", "CONFIRMATION_REQUIRED"].includes(e.type))) break;
      const status = await panel.locator("#flightStatus").innerText();
      if (/did not become ready|Add your provider|blocked by local policy/.test(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const flight = browser.pages().find((p) => p.url().startsWith("https://www.google.com/travel/flights"));
    const pageText = flight ? await flight.locator("body").innerText({ timeout: 10000 }) : "";
    const terminal = events.find((e) => ["TASK_DONE", "TASK_ERROR", "CONFIRMATION_REQUIRED"].includes(e.type));
    const report = { generatedAt: new Date().toISOString(), model: "openai/gpt-oss-20b", provider: "Groq",
      elapsedMs: Date.now() - started, pageLoaded: Boolean(flight), requests, events,
      panelStatus: await panel.locator("#flightStatus").innerText(),
      resultEvidence: pageText.slice(0, 18000),
      outcome: terminal?.type || "timeout", limitation: "Real flight search only. No passenger data, reservation, or payment is submitted. A done message alone does not prove correct results." };
    fs.writeFileSync(path.join(root, "artifacts/flight-live.json"), JSON.stringify(report, null, 2) + "\n");
    if (flight) await flight.screenshot({ path: path.join(root, "artifacts/flight-live.png"), fullPage: false });
    console.log(JSON.stringify({ outcome: report.outcome, elapsedMs: report.elapsedMs, requests, evidence: "artifacts/flight-live.json" }));
    await panel.evaluate(() => chrome.runtime.sendMessage({ type: "STOP_TASK" })).catch(() => {});
  } finally {
    if (browser) await browser.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
main().catch(() => { console.error("Live flight verification failed; no successful flight result is claimed."); process.exitCode = 1; });
