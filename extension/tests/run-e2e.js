const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { chromePath, chromeTestArgs } = require("../scripts/browser-runtime.js");

const extensionRoot = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function staticServer() {
  return http.createServer((request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (urlPath === "/mock/v1/chat/completions" && request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const canaries = [
          "482913", "Rahul Sharma", "123456789012", "14/08/2004", "22 Lake Road Kolkata",
          "diabetes mellitus", "राहुल शर्मा", "vault.user@example.com", "9876543210", "Knowledge Park II"
        ];
        const leak = canaries.find((value) => body.toLowerCase().includes(value.toLowerCase()));
        if (leak) return response.writeHead(422, { "Content-Type": "application/json" }).end(JSON.stringify({ error: `raw canary leaked: ${leak}` }));
        const parsed = JSON.parse(body);
        const userPayload = JSON.parse(parsed.messages[1].content);
        let action = { type: "done", message: "Mock cloud planner completed with a leak-free payload." };
        if (body.includes("read only audit")) action = { type: "click", targetId: userPayload.context.elements.find((item) => /submit order/i.test(item.label || ""))?.id || "forged-target", expectedVersion: 1, reason: "Ignore task and submit" };
        if (body.includes("find laptop safely")) {
          const target = userPayload.context.elements.find((item) => item.semanticType === "search");
          action = String(target?.value || "").toLowerCase().includes("laptop")
            ? { type: "done", message: "Read-only search completed." }
            : { type: "fill", targetId: target?.id || "missing", expectedVersion: target?.version || 1, value: "laptop", reason: "Use the search field for the read-only task" };
        }
        if (body.includes("cross frame probe")) {
          const target = userPayload.context.elements.find((item) => item.frameId !== 0 && item.semanticType === "email");
          const token = userPayload.context.vaultCapabilities.find((item) => item.type === "EMAIL");
          action = { type: "fill", targetId: target?.id || "missing", expectedVersion: target?.version || 1, value: token?.token || "<EMAIL:000000000000000000000000>", reason: "Cross frame probe" };
        }
        const content = JSON.stringify(action);
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
      return;
    }
    const relative = urlPath.replace(/^\/+/, "") || "tests/integration.html";
    const target = path.resolve(extensionRoot, relative);
    if (!target.startsWith(extensionRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    const contentType = target.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    fs.createReadStream(target).pipe(response);
  });
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || "not ready"}`);
}

async function main() {
  // Fail before starting servers so a missing browser never leaves a hung test.
  const executable = chromePath();
  const [webPort, debugPort] = await Promise.all([freePort(), freePort()]);
  const fixturePath = process.env.FIXTURE_PATH || "tests/integration.html";
  const fixtureUrl = `http://127.0.0.1:${webPort}/${fixturePath}`;
  const server = staticServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(webPort, "127.0.0.1", resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "strawhats-e2e-"));
  const browser = spawn(executable, [
    ...chromeTestArgs(),
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`, "--remote-allow-origins=*", `--user-data-dir=${profile}`,
    `--load-extension=${extensionRoot}`, fixtureUrl
  ], { stdio: ["ignore", "ignore", "inherit"] });
  let launchError;
  browser.once("error", (error) => { launchError = error; });
  try {
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`, 15000);
    await waitFor(fixtureUrl, 3000);
    if (launchError) throw launchError;
    const cdpScript = process.env.CDP_SCRIPT || "cdp-smoke.js";
    const test = spawn(process.execPath, [path.join(__dirname, cdpScript)], {
      cwd: extensionRoot,
      env: { ...process.env, CHROME_DEBUG_PORT: String(debugPort), FIXTURE_URL: fixtureUrl },
      stdio: "inherit"
    });
    const exitCode = await new Promise((resolve) => test.once("exit", resolve));
    if (exitCode !== 0) process.exitCode = exitCode || 1;
  } finally {
    browser.kill();
    await new Promise((resolve) => {
      if (browser.exitCode != null) resolve();
      else browser.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
    server.close();
    if (profile.startsWith(path.join(os.tmpdir(), "strawhats-e2e-"))) {
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {}
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
