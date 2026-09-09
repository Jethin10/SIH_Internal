"use strict";
// Live real-site verification: extension + real Browser Use planner + real model.
// Read-only task on a public site. Key arrives via env only; never logged or saved.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { chromePath } = require('../scripts/browser-runtime');
const { startBridge } = require('../scripts/browser-use-bridge');
const root = path.resolve(__dirname, '..');
const url = (process.argv.find(a => a.startsWith('--url=')) || '--url=https://en.wikipedia.org/').slice(6);
const task = (process.argv.find(a => a.startsWith('--task=')) || '--task=Search Wikipedia for "Solar System", open the article, and tell me the first sentence of the article, then stop.').slice(7);
async function main() {
  const provider = process.env.GEMINI_API_KEY ? {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: process.env.AGENT_MODEL || 'gemini-3.6-flash',
    apiKey: process.env.GEMINI_API_KEY
  } : null;
  if (!provider) throw new Error('Set GEMINI_API_KEY in the environment (process-local only).');
  const events = [];
  const bridge = await startBridge();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'strawhats-live-site-'));
  let browser;
  try {
    browser = await chromium.launchPersistentContext(profile, { executablePath: chromePath(), headless: false, args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--window-size=1280,900'] });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const panel = await browser.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).hostname}/sidepanel/index.html`);
    await panel.exposeFunction('agentEvent', event => { events.push(event); console.log(JSON.stringify(event)); });
    await panel.evaluate(() => chrome.runtime.onMessage.addListener(m => { if (m?.source === 'gateway-worker') window.agentEvent({ type: m.type, action: m.action?.type, url: m.action?.url, query: m.action?.query, message: m.message, error: m.error, reason: m.result?.reason }); }));
    await panel.evaluate(async ({ provider, agent }) => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { agent, provider, userProfile: { name: 'Fixture Person', email: 'fixture.person@example.com', phone: '0000000000', address: 'Fixture Lane' }, policy: { visualEnabled: true, maxSteps: 20 } } }), { provider, agent: { kind: 'browser-use', endpoint: bridge.endpoint, token: bridge.token } });
    await page.bringToFront();
    // Real demo layout: the panel lives in its own popup window so the target
    // tab stays active for visible-tab capture.
    await panel.evaluate(async () => { const tab = await chrome.tabs.getCurrent(); await chrome.windows.create({ tabId: tab.id, type: 'popup', left: 1320, top: 0, width: 560, height: 900, focused: false }); });
    await panel.reload();
    // Re-register after reload: exposed bindings survive reloads in Playwright, so
    // only the in-page listener (which dies with the document) is re-registered.
    // Re-exposing agentEvent here would throw "already registered".
    await panel.evaluate(() => chrome.runtime.onMessage.addListener(m => { if (m?.source === 'gateway-worker') window.agentEvent({ type: m.type, action: m.action?.type, url: m.action?.url, query: m.action?.query, message: m.message, error: m.error, reason: m.result?.reason }); }));
    await panel.locator('#taskInput').fill(task);
    await panel.locator('#runButton').click();
    const deadline = Date.now() + 480000;
    while (Date.now() < deadline && !events.some(e => ['TASK_DONE', 'TASK_ERROR'].includes(e.type))) await new Promise(r => setTimeout(r, 500));
    const done = events.find(e => e.type === 'TASK_DONE');
    const error = events.find(e => e.type === 'TASK_ERROR');
    const report = { ok: Boolean(done), site: url, task, steps: events.filter(e => e.type === 'ACTION_PROPOSED').map(e => e.action), confirmations: events.filter(e => e.type === 'CONFIRMATION_REQUIRED').length, done: done?.message || null, error: error?.error || null, model: provider.model, engine: bridge.engine };
    fs.writeFileSync(path.join(root, 'artifacts/live-site-run.json'), JSON.stringify(report, null, 2));
    console.log('REPORT ' + JSON.stringify({ ok: report.ok, steps: report.steps.length, done: report.done, error: report.error }));
  } finally {
    bridge.close();
    if (browser) await browser.close().catch(() => {});
    const resolved = path.resolve(profile), temp = path.resolve(os.tmpdir()) + path.sep;
    if (resolved.startsWith(temp) && path.basename(resolved).startsWith('strawhats-live-site-')) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  process.exit(0);
}
main().catch(error => { console.error('LIVE_SITE_FAIL', error.message); process.exit(1); });
