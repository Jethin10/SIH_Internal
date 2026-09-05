"use strict";

const fs = require("fs");
const assert = require("assert");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createServer } = require("../server/server.js");
const { chromePath, chromeTestArgs } = require("./browser-runtime.js");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts", "product-ui.png");
const demo = process.argv.includes("--demo");
const auto = process.argv.includes("--auto");
const smoke = process.argv.includes("--smoke");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function waitForTarget(debugPort, predicate, description, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
    const target = targets.find(predicate);
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
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
  // Demo fixtures must never inherit an upstream provider or token.
  if (demo) for (const key of ["UPSTREAM_ENDPOINT", "UPSTREAM_API_KEY", "UPSTREAM_MODEL", "PLANNER_TOKEN"]) delete process.env[key];
  const executable = chromePath();
  const [webPort, debugPort, plannerPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const planner = createServer();
  await new Promise((resolve, reject) => planner.once("error", reject).listen(plannerPort, "127.0.0.1", resolve));
  const server = staticServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(webPort, "127.0.0.1", resolve));
  const fixtureUrl = `http://127.0.0.1:${webPort}/tests/integration.html`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "strawhats-capture-"));
  const browser = spawn(executable, [...chromeTestArgs(), ...(demo ? ["--window-size=1000,900"] : ["--headless=new"]), "--disable-gpu", "--no-first-run", `--remote-debugging-port=${debugPort}`, "--remote-allow-origins=*", `--user-data-dir=${profile}`, `--load-extension=${root}`, fixtureUrl], { stdio: ["ignore", "ignore", "inherit"] });
  browser.once("error", (error) => console.error(`Browser launch failed: ${error.message}`));
  try {
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
    const worker = await waitForTarget(
      debugPort,
      (target) => target.url?.startsWith("chrome-extension://") && target.url.endsWith("background/service-worker.js"),
      "the extension service worker"
    );
    const extensionId = new URL(worker.url).hostname;
    const panelUrl = `chrome-extension://${extensionId}/sidepanel/index.html`;
    await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(panelUrl)}`, { method: "PUT" });
    const fixture = await waitForTarget(debugPort, (target) => target.url === fixtureUrl, "the fixture page");
    const panel = await waitForTarget(debugPort, (target) => target.url === panelUrl, "the extension side panel");
    await fetch(`http://127.0.0.1:${debugPort}/json/activate/${fixture.id}`);

    const fixtureCdp = await connect(fixture.webSocketDebuggerUrl);
    await fixtureCdp.send("Runtime.enable");
    let pageContext;
    const contextDeadline = Date.now() + 15000;
    while (!pageContext && Date.now() < contextDeadline) {
      const live = new Map();
      for (const event of fixtureCdp.events) {
        if (event.method === "Runtime.executionContextsCleared") live.clear();
        if (event.method === "Runtime.executionContextCreated") live.set(event.params.context.id, event.params.context);
        if (event.method === "Runtime.executionContextDestroyed") live.delete(event.params.executionContextId);
      }
      const candidate = [...live.values()].find((context) => context.auxData?.isDefault && context.auxData?.frameId === fixture.id);
      if (candidate) {
        try {
          const ready = await fixtureCdp.send("Runtime.evaluate", { contextId: candidate.id, expression: "document.readyState === 'complete' && Boolean(document.querySelector('#opaque'))", returnByValue: true });
          if (ready.result?.value) pageContext = candidate;
        } catch (_) {}
      }
      if (!pageContext) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!pageContext) throw new Error("The fixture page did not finish loading");
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
      throw new Error(`Timed out waiting for panel state: ${expression}\n${await panelEval("document.body.innerText")}`);
    };

    await waitPanel("document.readyState === 'complete' && Boolean(document.querySelector('#log'))");

    if (demo) {
      await panelEval(`document.querySelector('#settingsPanel').open=true;
        document.querySelector('#endpointInput').value='http://127.0.0.1:${plannerPort}/v1/chat/completions';
        document.querySelector('#modelInput').value='local-demo';
        document.querySelector('#apiKeyInput').value='';
        document.querySelector('#emailInput').value='vault.user@example.com';
        document.querySelector('#saveSettingsButton').click(); true`);
      await waitPanel("document.querySelector('#providerLine').textContent === 'Local planner: local-demo'");
      await panelEval("document.querySelector('#settingsPanel').open=false; document.querySelector('#taskInput').value='fill my email'; true");
      await fixtureCdp.send("Runtime.evaluate", { expression: "document.querySelector('#opaque').scrollIntoView({block:'center'})" });
      await panelEval("document.querySelector('#visualButton').click(); true");
      await waitPanel("document.querySelector('#redactedPreview').src.startsWith('data:image/png;base64,')", 30000);
      // Keep the fixture active for tab targeting and capture. Show the panel
      // beside it in its own window, using the same extension UI as the sidebar.
      await panelEval(`chrome.tabs.getCurrent().then(tab => chrome.windows.create({tabId:tab.id,type:'popup',left:1000,top:0,width:480,height:900,focused:false}))`);
      await panelCdp.send("Emulation.clearDeviceMetricsOverride");
      console.log("READY: offline privacy demo. Synthetic data, no cloud model. OCR is pre-warmed.\n0–8s Inspect page; 8–22s Run 'fill my email'; 22–40s Submit order: Block, then Allow once; 40–55s Local visual scan.\nClose the demo or press Ctrl+C to stop. Your personal Chrome profile is untouched.");
      if (auto || smoke) {
        const started = Date.now();
        const beat = async (seconds, label) => { if (!smoke) await pause(Math.max(0, started + seconds * 1000 - Date.now())); console.log(label); };
        const run = async (task) => panelEval(`document.querySelector('#taskInput').value=${JSON.stringify(task)}; document.querySelector('#runButton').click(); true`);
        await beat(0, "Inspect: raw values stay local.");
        await panelEval("document.querySelector('#refreshButton').click(); true");
        await waitPanel("Number(document.querySelector('#metricNodes').textContent.replace(/,/g,'')) > 0");
        await beat(8, "Fill: the planner uses an alias.");
        await run("fill my email");
        await waitPanel("!document.querySelector('#runButton').disabled");
        assert.equal((await fixtureCdp.send("Runtime.evaluate", { expression: "document.querySelector('#email').value", returnByValue: true })).result.value, "vault.user@example.com");
        await panelEval("document.querySelector('#refreshButton').click(); true");
        await waitPanel("document.querySelector('#metricRawPii').textContent === 'VERIFIED 0'");
        for (const allow of [false, true]) {
          await beat(allow ? 31 : 22, allow ? "Allow once: one synthetic order." : "Block: zero orders.");
          await run("click Submit order");
          await waitPanel("!document.querySelector('#confirmationBox').classList.contains('hidden')");
          if (!smoke) await pause(2500);
          await panelEval(`document.querySelector('#${allow ? "allowButton" : "blockButton"}').click(); true`);
          await waitPanel("!document.querySelector('#runButton').disabled");
          assert.equal((await fixtureCdp.send("Runtime.evaluate", { expression: "window.submitClicks", returnByValue: true })).result.value, allow ? 1 : 0);
        }
        await beat(42, "Vision: local OCR, masked preview.");
        await panelEval("document.querySelector('#visualButton').click(); true");
        await waitPanel("!document.querySelector('#visualButton').disabled", 30000);
        assert.match(await panelEval("document.querySelector('#visualRedactionCount').textContent"), /^[1-9]/);
        const report = { ok: true, platform: process.platform, executable, seconds: (Date.now()-started)/1000, offline: true, prewarmed: true, privateFill: true, verifiedEgress: true, blockedOrders: 0, allowedOrders: 1 };
        fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
        fs.writeFileSync(path.join(root, 'artifacts', 'demo-60.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report));
      }
      if (!smoke) await new Promise(resolve => { browser.once('exit', resolve); process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
      fixtureCdp.ws.close(); panelCdp.ws.close();
      return;
    }

    // Exercise new setup controls before configuring the offline test planner.
    await panelEval("document.querySelector('#settingsPanel').open=true; document.querySelector('#apiKeyInput').value='test-unsaved-key'; document.querySelector('#providerPreset').value='groq'; document.querySelector('#providerPreset').dispatchEvent(new Event('change')); true");
    assert.equal(await panelEval("document.querySelector('#endpointInput').value"), 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(await panelEval("document.querySelector('#modelInput').value"), 'openai/gpt-oss-20b');
    assert.equal(await panelEval("document.querySelector('#apiKeyInput').value"), '', 'Provider switch must clear the previous key');
    await panelEval("document.querySelector('#providerPreset').value='openrouter'; document.querySelector('#providerPreset').dispatchEvent(new Event('change')); true");
    assert.equal(await panelEval("document.querySelector('#modelInput').value"), 'openrouter/free');
    await panelEval("document.querySelector('#flightDemo').open=true; document.querySelector('#flightButton').click(); true");
    await waitPanel("document.querySelector('#flightStatus').textContent.includes('Add your provider')");
    assert.equal(await panelEval("document.querySelector('#runButton').disabled"), false, 'Missing credentials must leave the task runnable');
    await panelEval("document.querySelector('#flightDemo').open=false; true");

    await panelEval("document.querySelector('#log').innerHTML='<div class=\"log-row muted\">No actions yet.</div>'; document.querySelector('#refreshButton').click(); true");
    await waitPanel("Number(document.querySelector('#metricNodes').textContent.replace(/,/g,'')) > 0");
    const inspected = await panelEval("({nodes:document.querySelector('#metricNodes').textContent, raw:document.querySelector('#rawStream').innerText, safe:document.querySelector('#safeStream').innerText})");
    assert(/test\.user@example\.com/i.test(inspected.raw), "Inspect-page UI did not show the local raw email");
    assert(!/test\.user@example\.com/i.test(inspected.safe), "Inspect-page UI leaked the raw email into safe context");

    await panelEval(`document.querySelector('#settingsPanel').open=true;
      document.querySelector('#endpointInput').value='http://127.0.0.1:${plannerPort}/v1/chat/completions';
      document.querySelector('#modelInput').value='local-demo';
      document.querySelector('#emailInput').value='vault.user@example.com';
      document.querySelector('#saveSettingsButton').click(); true`);
    await waitPanel("document.querySelector('#providerLine').textContent === 'Local planner: local-demo'");
    await panelEval("document.querySelector('#settingsPanel').open=false; document.querySelector('#taskInput').value='fill my email'; document.querySelector('#runButton').click(); true");
    await waitPanel("document.querySelector('#log').innerText.includes('Requested browser action completed.')");
    const privateEmail = (await fixtureCdp.send("Runtime.evaluate", { contextId: pageContext.id, expression: "document.querySelector('#email').value", returnByValue: true })).result?.value;
    assert.equal(privateEmail, "vault.user@example.com", "Settings and Run task did not fill the private capability");
    await panelEval("document.querySelector('#refreshButton').click(); true");
    await waitPanel("document.querySelector('#metricRawPii').textContent === 'VERIFIED 0'");

    // A person moves focus into the side panel before scanning. This test opens
    // the panel in a separate target, so remove the fixture's blinking caret.
    // Keep pixel-freshness checks strict; do not mask genuine page changes.
    await fixtureCdp.send("Runtime.evaluate", { contextId: pageContext.id, expression: "document.activeElement.blur(); document.querySelector('#opaque').scrollIntoView({block:'center'})" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await panelEval("document.querySelector('#visualButton').click(); true");
    await waitPanel("document.querySelector('#redactedPreview').src.startsWith('data:image/png;base64,')", 20000);
    const visualState = await panelEval("({count:document.querySelector('#visualRedactionCount').textContent, visible:!document.querySelector('#visualPreviewSection').classList.contains('hidden')})");
    assert(visualState.visible && !/^0 masked/.test(visualState.count), "Visual-scan UI did not show a masked local preview");

    for (const allow of [false, true]) {
      await panelEval("document.querySelector('#taskInput').value='click Private visual fallback'; document.querySelector('#runButton').click(); true");
      await waitPanel("!document.querySelector('#confirmationBox').classList.contains('hidden')");
      await panelEval(`document.querySelector('#${allow ? "allowButton" : "blockButton"}').click(); true`);
      await waitPanel("!document.querySelector('#runButton').disabled");
      const count = (await fixtureCdp.send("Runtime.evaluate", { contextId: pageContext.id, expression: "window.canvasClicks", returnByValue: true })).result?.value;
      assert.equal(count, allow ? 1 : 0, `Visual confirmation through the panel did not match the user's choice: ${await panelEval("document.querySelector('#log').innerText")}`);
    }

    await panelEval("document.querySelector('#taskInput').value='click Submit order'; document.querySelector('#runButton').click(); true");
    await waitPanel("!document.querySelector('#confirmationBox').classList.contains('hidden')");
    await panelEval("document.querySelector('#blockButton').click(); true");
    await waitPanel("Number(document.querySelector('#receiptCount').textContent) > 0");
    const submitClicks = (await fixtureCdp.send("Runtime.evaluate", { contextId: pageContext.id, expression: "window.submitClicks", returnByValue: true })).result?.value;
    assert.strictEqual(submitClicks, 0, "Blocking the visible confirmation still submitted the order");
    const receiptVisible = await panelEval("/block/i.test(document.querySelector('#receipts').innerText)");
    assert(receiptVisible, "Blocked action did not produce a visible privacy receipt");

    await waitPanel("!document.querySelector('#runButton').disabled");
    await panelEval("document.querySelector('#taskInput').value='click Submit order'; document.querySelector('#runButton').click(); true");
    await waitPanel("!document.querySelector('#confirmationBox').classList.contains('hidden')");
    await panelEval("document.querySelector('#allowButton').click(); true");
    await waitPanel("!document.querySelector('#runButton').disabled");
    const allowedSubmit = (await fixtureCdp.send("Runtime.evaluate", { contextId: pageContext.id, expression: "window.submitClicks", returnByValue: true })).result?.value;
    assert.equal(allowedSubmit, 1, "Allow once must submit exactly once");

    await panelEval("document.querySelector('#taskInput').value='click Submit order'; true");
    const shot = await panelCdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(shot.data, "base64"));
    await panelEval("document.querySelector('#clearPrivateButton').click(); true");
    await waitPanel("document.querySelector('#emailInput').value === ''");
    await panelCdp.send("Page.reload");
    await waitPanel("document.querySelector('#modelInput')?.value === 'local-demo'");
    assert.equal(await panelEval("document.querySelector('#emailInput').value"), "", "Cleared secrets returned after panel reload");
    await panelEval("document.querySelector('#clearAuditButton').click(); true");
    await waitPanel("document.querySelector('#receiptCount').textContent === '0'");
    fixtureCdp.ws.close(); panelCdp.ws.close();
    console.log(JSON.stringify({ ok: true, output, journeys: { inspectPage: inspected.nodes, privateFill: true, localPlannerEgress: true, visualMask: visualState.count, visualBlockAndAllow: true, blockedSubmit: submitClicks, allowedSubmit, receiptVisible, clearSecretsAndReload: true, clearReceipts: true } }, null, 2));
  } finally {
    browser.kill(); server.close(); planner.close();
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) {}
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
