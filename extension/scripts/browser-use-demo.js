"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { chromePath } = require("./browser-runtime");
const { startBridge } = require("./browser-use-bridge");
const { createDemoStore, testProfile } = require("./demo-store");
const root = path.resolve(__dirname, "..");
const task =
  "Find running shoes under Rs 3000 in size 9. Compare the options, add the affordable pair to the cart, fill all my saved contact fields, and stop before placing an order.";

// Optional local provider file outside the repository, e.g.
// %USERPROFILE%\.strawhats\provider.json with {endpoint, model, apiKey}.
// It is preloaded into the session so users do not have to open Settings.
function loadLocalProvider() {
  const candidates = [
    path.join(os.homedir(), ".strawhats", "provider.json"),
    path.join(root, "..", "provider.local.json"),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (
        typeof parsed.apiKey === "string" &&
        parsed.apiKey &&
        typeof parsed.model === "string" &&
        parsed.model
      )
        return {
          endpoint:
            typeof parsed.endpoint === "string" && parsed.endpoint
              ? parsed.endpoint
              : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          model: parsed.model,
          apiKey: parsed.apiKey,
        };
    } catch (_) {
      // Missing or invalid file is fine; the user can still use Settings.
    }
  }
  return null;
}
async function main({ demo = true } = {}) {
  const executablePath = chromePath();
  const bridge = await startBridge();
  const store = demo ? createDemoStore() : null;
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "privacy-browser-use-"),
  );
  let browser;
  try {
    if (store)
      await new Promise((resolve, reject) => {
        store.once("error", reject);
        store.listen(0, "127.0.0.1", resolve);
      });
    browser = await chromium.launchPersistentContext(profile, {
      executablePath,
      headless: false,
      viewport: null,
      args: [
        `--disable-extensions-except=${root}`,
        `--load-extension=${root}`,
        "--window-size=1050,900",
      ],
    });
    const worker =
      browser.serviceWorkers()[0] ||
      (await browser.waitForEvent("serviceworker"));
    const page = await browser.newPage();
    await page.goto(
      store ? `http://127.0.0.1:${store.address().port}/` : "about:blank",
    );
    const panel = await browser.newPage();
    await panel.goto(
      `chrome-extension://${new URL(worker.url()).hostname}/sidepanel/index.html`,
    );
    const localProvider = loadLocalProvider();
    await panel.evaluate(
      async ({ agent, userProfile, provider }) =>
        chrome.runtime.sendMessage({
          type: "SAVE_SETTINGS",
          settings: {
            agent,
            userProfile,
            provider,
            policy: { visualEnabled: true, maxSteps: 30 },
          },
        }),
      {
        agent: {
          kind: "browser-use",
          endpoint: bridge.endpoint,
          token: bridge.token,
        },
        userProfile: demo ? testProfile : {},
        provider:
          localProvider ||
          {
            endpoint:
              "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            model: "",
            apiKey: "",
          },
      },
    );
    await page.bringToFront();
    await panel.evaluate(async () => {
      const tab = await chrome.tabs.getCurrent();
      await chrome.windows.create({
        tabId: tab.id,
        type: "popup",
        left: 1050,
        top: 0,
        width: 490,
        height: 900,
        focused: true,
      });
    });
    await panel.reload();
    await panel.locator("#taskInput").fill(demo ? task : "");
    if (localProvider) {
      await panel.locator("#settingsPanel").evaluate((el) => (el.open = false));
      console.log(
        `StrawHats is ready with ${localProvider.model} preloaded from your local provider file. Open a website in the main browser window, type a task, and press Ctrl+Enter. Close the browser or press Ctrl+C here to quit. Keys and private profile values last only for this session.`,
      );
    } else {
      await panel.locator("#settingsPanel").evaluate((el) => (el.open = true));
      await panel.locator("#modelInput").scrollIntoViewIfNeeded();
      console.log(
        "StrawHats is ready. Save your provider, model and key in Settings, open a website in the main browser window, then type a task and press Ctrl+Enter. Close the browser or press Ctrl+C here to quit. Keys and private profile values last only for this session.",
      );
    }
    if (demo)
      console.log("Demo mode: the store and saved profile are synthetic.");
    let stopped = false;
    const stop = new Promise((resolve) => {
      browser.on("close", () => {
        stopped = true;
        resolve();
      });
      process.once("SIGINT", () => {
        stopped = true;
        resolve();
      });
      process.once("SIGTERM", () => {
        stopped = true;
        resolve();
      });
    });
    if (demo && process.argv.includes("--verify-when-ready")) {
      console.log(
        "Waiting for locally saved Gemini settings; then the synthetic shopping verification will run automatically.",
      );
      while (!stopped) {
        const ready = await panel
          .evaluate(async () => {
            const r = await chrome.runtime.sendMessage({
              type: "GET_SETTINGS",
            });
            return Boolean(
              r.settings?.provider?.model && r.settings?.provider?.apiKey,
            );
          })
          .catch(() => false);
        if (ready) break;
        await Promise.race([
          stop,
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);
      }
      if (!stopped) {
        const events = [];
        await panel.exposeFunction("verificationEvent", (e) => events.push(e));
        await panel.evaluate(() =>
          chrome.runtime.onMessage.addListener((m) => {
            if (
              m?.source === "gateway-worker" &&
              ["TASK_DONE", "TASK_ERROR", "CONFIRMATION_REQUIRED"].includes(
                m.type,
              )
            )
              window.verificationEvent({
                type: m.type,
                error: m.error,
                message: m.message,
              });
          }),
        );
        await panel
          .locator("#settingsPanel")
          .evaluate((el) => (el.open = false));
        await page.bringToFront();
        await panel.locator("#runButton").click();
        const deadline = Date.now() + 240000;
        while (!stopped && Date.now() < deadline && !events.length)
          await new Promise((resolve) => setTimeout(resolve, 500));
        const values = await page
          .locator("input,textarea")
          .evaluateAll((elements) =>
            Object.fromEntries(
              elements.filter((e) => e.id).map((e) => [e.id, e.value]),
            ),
          );
        const report = {
          agent: bridge.engine,
          mode: "real-model",
          browser: browser.browser()?.version(),
          onCart: new URL(page.url()).pathname === "/cart",
          privateFieldsFilled: Object.entries(testProfile).every(
            ([key, value]) => values[key] === value,
          ),
          orderNotSubmitted: await page
            .locator("#notice")
            .textContent()
            .then((s) => s === "Order not submitted")
            .catch(() => false),
          finished: events.some((e) => e.type === "TASK_DONE"),
          error: events.find((e) => e.type === "TASK_ERROR")?.error || null,
        };
        report.ok =
          report.onCart &&
          report.privateFieldsFilled &&
          report.orderNotSubmitted &&
          report.finished;
        fs.writeFileSync(
          path.join(root, "artifacts/browser-use-gemini-verification.json"),
          JSON.stringify(report, null, 2),
        );
        console.log(JSON.stringify(report));
        console.log(
          "Browser remains open for rehearsal. You can change the task or model in the panel.",
        );
      }
    }
    await stop;
  } finally {
    bridge.close();
    if (store) {
      store.closeAllConnections();
      await new Promise((resolve) => store.close(resolve));
    }
    if (browser) await browser.close().catch(() => {});
    // Delete only this launcher-created temporary profile.
    const resolved = path.resolve(profile),
      temp = path.resolve(os.tmpdir()) + path.sep;
    if (
      resolved.startsWith(temp) &&
      path.basename(resolved).startsWith("privacy-browser-use-")
    )
      fs.rmSync(resolved, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main };
