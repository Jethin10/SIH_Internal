"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { Builder } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const { createServer } = require("../server/server.js");
const root = path.resolve(__dirname, "..");
const uuid = "120b51a3-6e08-44ef-8e45-586daf411faa";
const manifest = require("../manifest.firefox.json");
const listen = (server) => new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", () => resolve(server.address().port)));

async function main() {
  const options = new firefox.Options().addArguments("-headless")
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ [manifest.browser_specific_settings.gecko.id]: uuid }));
  if (process.env.FIREFOX_PATH) options.setBinary(process.env.FIREFOX_PATH);
  else options.setBrowserVersion("stable");
  // Selenium Manager downloads Firefox/geckodriver to its cache when needed.
  const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options)
    .setFirefoxService(new firefox.ServiceBuilder().addArguments("--allow-system-access")).build();
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (!["/tests/integration.html", "/tests/cross-frame.html"].includes(pathname)) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fs.readFileSync(path.join(root, pathname)));
  });
  const planner = createServer();
  try {
    const port = await listen(server);
    const plannerPort = await listen(planner);
    await driver.manage().setTimeouts({ script: 45000 });
    await driver.manage().window().setRect({ width: 1200, height: 1000 });
    const xpi = path.join(process.env.RELEASE_DIR || path.join(root, ".."), `StrawHats_Privacy_Gateway_v${manifest.version}-Firefox.xpi`);
    await driver.installAddon(xpi, true);
    await driver.get(`http://127.0.0.1:${port}/tests/integration.html`);
    const fixtureHandle = await driver.getWindowHandle();
    await driver.switchTo().newWindow("tab");
    // WebDriver intentionally rejects direct navigation to privileged extension
    // URLs. Open the installed panel via Firefox's browser chrome in this clean
    // test profile, then return to normal content context for all assertions.
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript(function (url) {
      window.gBrowser.selectedBrowser.loadURI(Services.io.newURI(url), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
    }, `moz-extension://${uuid}/sidepanel/index.html`);
    await driver.setContext(firefox.Context.CONTENT);
    await driver.wait(async () => driver.executeScript("return document.readyState === 'complete' && Boolean(document.querySelector('#log'))"), 15000);
    const panelHandle = await driver.getWindowHandle();
    const message = async (payload) => {
      await driver.switchTo().window(panelHandle);
      const result = await driver.executeAsyncScript(function (payload, fixtureUrl, done) {
        (async () => {
          const allTabs = await browser.tabs.query({});
          const tabs = allTabs.filter((tab) => tab.url === fixtureUrl);
          if (!tabs[0]) throw new Error(`Fixture tab is missing: ${JSON.stringify(allTabs.map(({id,url}) => ({id,url})))}`);
          await browser.tabs.update(tabs[0].id, { active: true });
          // Allow the visible fixture to repaint after activating it; actual
          // users keep the fixture active while operating the sidebar.
          await new Promise((resolve) => setTimeout(resolve, 250));
          if (payload.type === "TEST_FRAME_PRIVACY") {
            const frames = await browser.webNavigation.getAllFrames({ tabId: tabs[0].id });
            const child = frames.find((frame) => frame.frameId !== 0 && frame.url.startsWith("http://localhost:"));
            if (!child) throw new Error("Cross-origin fixture frame is missing");
            const response = await browser.tabs.sendMessage(tabs[0].id, { type: "GET_SAFE_CONTEXT" }, { frameId: child.frameId });
            return { ok: true, capabilities: response.context.vaultCapabilities };
          }
          if (payload.type === "TEST_DIAGNOSTIC") {
            const response = await browser.tabs.sendMessage(tabs[0].id, { type: "GET_SAFE_CONTEXT" }, { frameId: 0 });
            return { ok: true, inventory: response.egressInventory.filter((item) => item.type === "password"), elements: response.context.elements };
          }
          return browser.runtime.sendMessage(payload);
        })().then(done, (error) => done({ ok: false, error: error.message }));
      }, payload, `http://127.0.0.1:${port}/tests/integration.html`);
      if (result?.ok === false) throw new Error(`${payload.type}: ${result.error}`);
      return result;
    };
    const wait = async (check, label, timeout = 20000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error(`Firefox timed out: ${label}`);
    };
    await message({ type: "SAVE_SETTINGS", settings: {
      provider: { endpoint: `http://127.0.0.1:${plannerPort}/v1/chat/completions`, model: "local-demo", apiKey: "" },
      userProfile: { email: "vault.user@example.com" }
    } });
    let context;
    await wait(async () => {
      context = (await message({ type: "REFRESH_CONTEXT" })).context;
      return context.metrics.graphComplete && context.elements.length > 0;
    }, "page inspection");
    assert(!JSON.stringify(context).includes("test.user@example.com"), "Raw fixture email leaked into safe context");
    assert(!JSON.stringify(context).includes("swordfish42"), "Password leaked into safe context");
    const diagnostic = await message({ type: "TEST_DIAGNOSTIC" });
    assert(diagnostic.inventory.some((item) => item.value === "swordfish42"), "Actual password must remain in the sensitive inventory");
    assert(!diagnostic.inventory.some((item) => item.value === "Password"), "Public field caption must not be classified as a private value");
    await message({ type: "START_TASK", task: "fill my email" });
    await wait(async () => (await message({ type: "GET_AUDIT" })).receipts.some((r) => r.localDecision === "done"), "private fill completion");
    await driver.switchTo().window(fixtureHandle);
    assert.equal(await driver.executeScript("return document.querySelector('#email').value"), "vault.user@example.com");
    assert.equal((await message({ type: "TEST_FRAME_PRIVACY" })).capabilities.length, 0, "Cross-origin frame received private capabilities");
    await driver.switchTo().window(fixtureHandle);
    await driver.executeScript("document.activeElement.blur(); document.querySelector('#opaque').scrollIntoView({block:'center'})");
    const scan = await message({ type: "VISUAL_SCAN" });
    assert(scan.visual.redactionCount > 0 && scan.visual.redactedPreviewDataUrl.startsWith("data:image/png"), "Firefox local OCR preview missing");
    for (const task of ["click Submit order", "click Private visual fallback"]) {
      for (const allow of [false, true]) {
        await message({ type: "CLEAR_AUDIT" });
        if (task.includes("visual")) await message({ type: "VISUAL_SCAN" });
        await message({ type: "START_TASK", task });
        await wait(async () => {
          const receipts = (await message({ type: "GET_AUDIT" })).receipts;
          if (receipts.some((r) => r.action === "error" || r.localDecision === "done")) throw new Error(`${task} allow=${allow}: ${JSON.stringify(receipts)}; synthetic fixture diagnostics: ${JSON.stringify(await message({type:"TEST_DIAGNOSTIC"}))}`);
          return receipts.some((r) => r.localDecision === "needs_confirmation");
        }, `${task} allow=${allow}: confirmation`);
        await message({ type: "CONFIRM_PENDING", allow });
        await wait(async () => (await message({ type: "GET_AUDIT" })).receipts.some((r) => r.localDecision === (allow ? "done" : "block")), `${task}: confirmed task completion`);
        await driver.switchTo().window(fixtureHandle);
        const counter = task.includes("visual") ? "canvasClicks" : "submitClicks";
        assert.equal(await driver.executeScript(`return window.${counter}`), allow ? 1 : 0, `${task} allow=${allow}`);
      }
    }
    await message({ type: "CLEAR_PRIVATE_SESSION" });
    assert.equal((await message({ type: "GET_SETTINGS" })).settings.userProfile.email, "");
    await message({ type: "CLEAR_AUDIT" });
    assert.equal((await message({ type: "GET_AUDIT" })).receipts.length, 0);
    const report = { ok: true, generatedAt: new Date().toISOString(), platform: process.platform,
      browserVersion: (await driver.getCapabilities()).get("browserVersion"),
      checks: ["safe context", "public captions versus private values", "private fill", "cross-origin capability exclusion", "local OCR masks", "submit block/allow once", "visual block/allow once", "clear secrets", "clear receipts"] };
    fs.writeFileSync(path.join(root, "artifacts/firefox-runtime.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    server.close(); planner.close(); await driver.quit();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
