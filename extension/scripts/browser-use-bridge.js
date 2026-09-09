"use strict";
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const repo = path.resolve(__dirname, "../..");
async function startBridge() {
  const python = path.join(
    repo,
    ".venv-browser-use",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  if (!fs.existsSync(python))
    throw new Error(
      "Browser Use is not installed. Run npm run setup:browser-use first.",
    );
  const token = crypto.randomBytes(32).toString("hex");
  const env = {};
  // The planner process does not inherit model credentials or user profiles.
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
    "LANG",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    PRIVACY_BRIDGE_TOKEN: token,
    PRIVACY_BRIDGE_PORT: "0",
    PYTHONUTF8: "1",
  });
  const child = spawn(
    python,
    [path.join(repo, "adapters/browser-use/bridge.py")],
    {
      cwd: path.join(repo, "adapters/browser-use"),
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Browser Use startup timed out"));
    }, 45000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Could not start Browser Use"));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Browser Use exited during startup (${code})`));
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      for (const line of output.split(/\r?\n/)) {
        try {
          const data = JSON.parse(line);
          if (data.ready) {
            clearTimeout(timer);
            resolve(data);
          }
        } catch (_) {}
      }
    });
    child.stderr.on("data", () => {}); // Do not echo dependency/model internals.
  });
  return {
    endpoint: `http://127.0.0.1:${ready.port}`,
    token,
    engine: ready.engine,
    close: () => child.kill(),
    child,
  };
}
module.exports = { startBridge };
