"use strict";

const fs = require("fs");
const assert = require("assert");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts", "product-ui.png");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function chromePath() {
  const roots = [process.env.CHROME_PATH].filter(Boolean);
  const playwright = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  if (fs.existsSync(playwright)) for (const folder of fs.readdirSync(playwright).sort().reverse()) roots.push(path.join(playwright, folder, "chrome-win64", "chrome.exe"));
  roots.push(path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"));
  const found = roots.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Chrome was not found");
  return found;
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return events.push(message);
    const item = pending.get(message.id); pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  };
  return { ws, events, send(method, params = {}) { return new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params })); }); } };
}

async function waitFor(url, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const response = await fetch(url); if (response.ok) return response; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function staticServer() {
  return http.createServer((request, response) => {
    const target = path.resolve(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "") || "tests/integration.html");
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": target.endsWith(".html") ? "text/html" : "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(target).pipe(response);
  });
}

async function main() {
  const [webPort, debugPort] = await Promise.all([freePort(), freePort()]);
  const server = staticServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(webPort, "127.0.0.1", resolve));
  const fixtureUrl = `http://127.0.0.1:${webPort}/tests/integration.html`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "strawhats-capture-"));
  const browser = spawn(chromePath(), ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${debugPort}`, "--remote-allow-origins=*", `--user-data-dir=${profile}`, `--load-extension=${root}`, fixtureUrl], { stdio: "ignore" });
  try {
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
    await new Promise((resolve) => setTimeout(resolve, 900));
    let targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
    const worker = targets.find((target) => target.url?.startsWith("chrome-extension://") && target.url.endsWith("background/service-worker.js"));
    if (!worker) throw new Error("Extension service worker target was not found");
    const extensionId = new URL(worker.url).hostname;
    const panelUrl = `chrome-extension://${extensionId}/sidepanel/index.html`;
    await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(panelUrl)}`, { method: "PUT" });
    await new Promise((resolve) => setTimeout(resolve, 500));
    targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
    const fixture = targets.find((target) => target.url === fixtureUrl);
    const panel = targets.find((target) => target.url === panelUrl);
    if (!fixture || !panel) throw new Error("Capture targets were not found");
    await fetch(`http://127.0.0.1:${debugPort}/json/activate/${fixture.id}`);

    const fixtureCdp = await connect(fixture.webSocketDebuggerUrl);
    await fixtureCdp.send("Runtime.enable");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const contexts = fixtureCdp.events.filter((event) => event.method === "Runtime.executionContextCreated").map((event) => event.params.context);
    const extensionContext = contexts.find((context) => !context.auxData?.isDefault && context.auxData?.frameId === fixture.id);
    const pageContext = contexts.find((context) => context.auxData?.isDefault && context.auxData?.frameId === fixture.id);
    if (!extensionContext || !pageContext) throw new Error("Fixture contexts were not found");
    const panelCdp = await connect(panel.webSocketDebuggerUrl);
    await panelCdp.send("Runtime.enable");
    await panelCdp.send("Page.enable");
    await panelCdp.send("Emulation.setDeviceMetricsOverride", { width: 430, height: 1200, deviceScaleFactor: 1, mobile: false });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const panelEval = async (expression) => (await panelCdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
    const waitPanel = async (expression, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const value = await panelEval(expression);
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out waiting for panel state: ${expression}`);
    };

    await panelEval("document.querySelector('#log').innerHTML='<div class=\"log-row muted\">No actions yet.</div>'; document.querySelector('#refreshButton').click(); true");
    await waitPanel("Number(document.querySelector('#metricNodes').textContent.replace(/,/g,'')) > 0");
    const inspected = await panelEval("({nodes:document.querySelector('#metricNodes').textContent, raw:document.querySelector('#rawStream').innerText, safe:document.querySelector('#safeStream').innerText})");
    assert(/test\.user@example\.com/i.test(inspected.raw), "Inspect-page UI did not show the local raw email");
    assert(!/test\.user@example\.com/i.test(inspected.safe), "Inspect-page UI leaked the raw email into safe context");

    await fixtureCdp.send("Runtime.evaluate", { contextId: pageContext.id, expression: "document.querySelector('#opaque').scrollIntoView({block:'center'})" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await panelEval("document.querySelector('#visualButton').click(); true");
    await waitPanel("document.querySelector('#redactedPreview').src.startsWith('data:image/png;base64,')", 20000);
    const visualState = await panelEval("({count:document.querySelector('#visualRedactionCount').textContent, visible:!document.querySelector('#visualPreviewSection').classList.contains('hidden')})");
    assert(visualState.visible && !/^0 masked/.test(visualState.count), "Visual-scan UI did not show a masked local preview");

    await panelEval("document.querySelector('#taskInput').value='click Submit order'; document.querySelector('#runButton').click(); true");
    await waitPanel("!document.querySelector('#confirmationBox').classList.contains('hidden')");
    await panelEval("document.querySelector('#blockButton').click(); true");
    await waitPanel("Number(document.querySelector('#receiptCount').textContent) > 0");
    const submitClicks = (await fixtureCdp.send("Runtime.evaluate", { contextId: pageContext.id, expression: "window.submitClicks", returnByValue: true })).result?.value;
    assert.strictEqual(submitClicks, 0, "Blocking the visible confirmation still submitted the order");
    const receiptVisible = await panelEval("/block/i.test(document.querySelector('#receipts').innerText)");
    assert(receiptVisible, "Blocked action did not produce a visible privacy receipt");

    await panelEval("document.querySelector('#taskInput').value='Fill my email, then submit the order'; document.querySelector('#providerLine').textContent='Local planner server · safe context only'; true");
    const shot = await panelCdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(shot.data, "base64"));
    fixtureCdp.ws.close(); panelCdp.ws.close();
    console.log(JSON.stringify({ ok: true, output, journeys: { inspectPage: inspected.nodes, visualMask: visualState.count, blockedSubmit: submitClicks, receiptVisible } }, null, 2));
  } finally {
    browser.kill(); server.close();
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) {}
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
