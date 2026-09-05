"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("../server/server.js");
const root = path.resolve(__dirname, "..");
const routes = new Map([
  ["/", "tests/integration.html"],
  ["/tests/integration.html", "tests/integration.html"],
  ["/tests/cross-frame.html", "tests/cross-frame.html"],
  ["/tests/benchmark.html", "tests/benchmark.html"]
]);
const fixture = http.createServer((request, response) => {
  const file = routes.get(new URL(request.url, "http://localhost").pathname);
  if (!file || request.method !== "GET") return response.writeHead(404).end("Not found");
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  fs.createReadStream(path.join(root, file)).pipe(response);
});
// This command deliberately starts the offline planner, regardless of a shell's
// upstream settings. Use npm run server to configure a real provider separately.
delete process.env.UPSTREAM_ENDPOINT;
delete process.env.UPSTREAM_API_KEY;
delete process.env.UPSTREAM_MODEL;
delete process.env.PLANNER_TOKEN;
const planner = createServer();
function shutdown() {
  fixture.close();
  planner.close();
}
async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}
(async () => {
  try {
    await listen(planner, 8787);
    // The second hostname is used to prove cross-origin isolation in the fixture.
    await listen(fixture, 8765);
    console.log(`Demo ready. Keep this terminal open.
Open http://127.0.0.1:8765/tests/integration.html
Load unpacked extension: ${root}
Panel Settings: endpoint http://127.0.0.1:8787/v1/chat/completions
Model: local-demo. API key: leave empty.
Demo profile email: vault.user@example.com
Runbook: ${path.join(root, "DEMO.md")}
Large-page demo: http://127.0.0.1:8765/tests/benchmark.html?nodes=20000
Ctrl+C stops both local servers.`);
  } catch (error) {
    shutdown();
    console.error(`Demo startup failed: ${error.message}. Close any previous demo terminal and try again.`);
    process.exitCode = 1;
  }
})();
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
