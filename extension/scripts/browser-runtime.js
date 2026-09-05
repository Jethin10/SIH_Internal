"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Playwright resolves the pinned browser for macOS (Intel/Apple Silicon),
// Windows and Linux, including PLAYWRIGHT_BROWSERS_PATH overrides.
function chromePath(env = process.env, bundledPath = () => require("playwright").chromium.executablePath()) {
  const executable = env.CHROME_PATH || bundledPath();
  if (!path.isAbsolute(executable) || !fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
    throw new Error(env.CHROME_PATH
      ? "CHROME_PATH must be an absolute path to a Chromium or Chrome for Testing executable."
      : "Test Chromium is missing. Run npm ci, then npm run setup:browsers in extension/. Regular Chrome cannot side-load extensions through the test flags.");
  }
  return executable;
}

function chromeTestArgs(env = process.env, platform = process.platform) {
  // Hosted Ubuntu runners restrict user namespaces for downloaded browsers.
  // Only the disposable CI fixture browser needs this exception.
  return platform === "linux" && env.GITHUB_ACTIONS === "true" ? ["--no-sandbox"] : [];
}

module.exports = { chromePath, chromeTestArgs };
