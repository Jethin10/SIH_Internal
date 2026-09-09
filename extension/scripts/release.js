"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const Zip = require("adm-zip");
const root = path.resolve(__dirname, "..");
const output = path.resolve(
  process.env.RELEASE_DIR || path.join(root, "../dist"),
);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
const firefox = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.firefox.json")),
);
const stem = `StrawHats_Privacy_Gateway_v${manifest.version}`;
const names = {
  Chrome: `${stem}-Chrome.zip`,
  Firefox: `${stem}-Firefox.xpi`,
  Source: `${stem}-Source.zip`,
  Windows: "StrawHats-Windows.zip",
};
const checksumName = `${stem}-SHA256SUMS.txt`;
const runtimeDirs = [
  "background",
  "content",
  "lib",
  "sidepanel",
  "visual",
  "vendor",
];
const notices = ["PRIVACY.md", "SECURITY.md", "THIRD-PARTY-NOTICES.md"];
const hash = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();

function addTree(zip, relative, browser) {
  const absolute = path.join(root, relative);
  if (fs.lstatSync(absolute).isSymbolicLink())
    throw new Error(`Release cannot contain symlinks: ${relative}`);
  if (fs.statSync(absolute).isDirectory()) {
    for (const file of fs.readdirSync(absolute).sort())
      addTree(zip, `${relative}/${file}`, browser);
    return;
  }
  if (
    browser === "Chrome" &&
    /^background\/firefox-(adapter.js|page.html)$/.test(relative)
  )
    return;
  if (browser === "Firefox" && relative === "background/chrome-adapter.js")
    return;
  zip.addFile(relative, fs.readFileSync(absolute));
  // Stable dates make repeat builds reproducible across machines/time zones.
  zip.getEntry(relative).header.time = new Date(2020, 0, 1);
}

function verifyRelease() {
  const checksums = new Map(
    fs
      .readFileSync(path.join(output, checksumName), "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^([a-f0-9]{64})  (.+)$/i);
        assert(match, "Malformed checksum manifest");
        return [match[2], match[1].toUpperCase()];
      }),
  );
  for (const [browser, name] of Object.entries(names)) {
    const bytes = fs.readFileSync(path.join(output, name));
    assert.equal(
      hash(bytes),
      checksums.get(name),
      `Checksum mismatch: ${name}`,
    );
    const zip = new Zip(bytes);
    const entries = zip.getEntries().map((entry) => entry.entryName);
    assert.equal(
      new Set(entries).size,
      entries.length,
      "Duplicate archive paths",
    );
    for (const entry of entries)
      assert(
        !entry.startsWith("/") &&
          !entry.includes("\\") &&
          !entry.split("/").includes(".."),
        `Unsafe archive path: ${entry}`,
      );
    const prefix = ["Source", "Windows"].includes(browser) ? "extension/" : "";
    for (const required of [
      "manifest.json",
      "background/service-worker.js",
      "vendor/lang/eng.traineddata.gz",
      "lib/vendor/libphonenumber.js",
      "lib/agent-protocol.js",
    ])
      assert(
        entries.includes(prefix + required),
        `${browser} missing ${required}`,
      );
    if (prefix)
      for (const required of [
        "package.json",
        "Setup.cmd",
        "Start.cmd",
        "scripts/install-windows.ps1",
        "adapters/browser-use/bridge.py",
        "adapters/browser-use/requirements.lock.txt",
        "extension/package-lock.json",
      ])
        assert(entries.includes(required), `${browser} missing ${required}`);
    assert(
      !entries.some((entry) =>
        /(?:^|\/)(?:node_modules|__pycache__|\.venv-browser-use|\.env)(?:\/|$|\.)/.test(
          entry,
        ),
      ),
      "Private/generated files in release",
    );
    const packed = JSON.parse(zip.readAsText(prefix + "manifest.json"));
    assert.equal(packed.version, manifest.version);
    assert.equal(packed.manifest_version, 3);
    if (browser === "Firefox") {
      assert(packed.sidebar_action && !packed.side_panel);
      assert(!entries.includes("background/chrome-adapter.js"));
    } else {
      assert(packed.side_panel);
      if (browser === "Chrome")
        assert(!entries.includes("background/firefox-adapter.js"));
    }
    if (browser === "Source")
      assert(
        entries.includes("extension/tests/browser-use-bridge.test.js"),
        "Source package must include adapter tests",
      );
    console.log(`Verified ${browser}: ${name}`);
  }
}

function packageRelease() {
  assert.equal(
    manifest.version,
    firefox.version,
    "Browser versions must match",
  );
  fs.mkdirSync(output, { recursive: true });
  for (const [browser, name] of Object.entries(names)) {
    const zip = new Zip();
    if (browser === "Source" || browser === "Windows") {
      const repo = path.resolve(root, "..");
      const addRepo = (relative) => {
        const absolute = path.join(repo, relative);
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink())
          throw new Error(`Release cannot contain symlinks: ${relative}`);
        if (
          /(?:^|\/)(?:__pycache__|node_modules|\.env|\.pytest_cache)(?:\/|$|\.)/.test(
            relative,
          )
        )
          return;
        if (stat.isDirectory()) {
          for (const file of fs.readdirSync(absolute).sort())
            addRepo(`${relative}/${file}`);
        } else {
          zip.addFile(relative, fs.readFileSync(absolute));
          zip.getEntry(relative).header.time = new Date(2020, 0, 1);
        }
      };
      const common = [
        "package.json",
        "package-lock.json",
        "README.md",
        "Setup.cmd",
        "Start.cmd",
        "scripts",
        "adapters/browser-use",
        ...runtimeDirs.map((dir) => `extension/${dir}`),
        "extension/scripts",
        "extension/server",
        "extension/package.json",
        "extension/package-lock.json",
        "extension/manifest.json",
        "extension/manifest.firefox.json",
        ...notices.map((file) => `extension/${file}`),
      ];
      for (const relative of [
        ...common,
        ...(browser === "Source"
          ? [
              "docs",
              "extension/tests",
              "extension/README.md",
              "extension/DEVELOPMENT.md",
              ".github",
              ".gitignore",
              ".nvmrc",
              "extension/.gitignore",
              "extension/.nvmrc",
            ]
          : []),
      ])
        addRepo(relative);
      zip.writeZip(path.join(output, name));
      continue;
    }
    for (const relative of ["manifest.json", ...notices, ...runtimeDirs])
      addTree(zip, relative, browser);
    if (browser === "Firefox")
      zip.updateFile(
        "manifest.json",
        Buffer.from(`${JSON.stringify(firefox, null, 2)}\n`),
      );
    zip.writeZip(path.join(output, name));
  }
  fs.writeFileSync(
    path.join(output, checksumName),
    Object.values(names)
      .map(
        (name) => `${hash(fs.readFileSync(path.join(output, name)))}  ${name}`,
      )
      .join("\n") + "\n",
  );
  verifyRelease();
}

function lintFirefox() {
  if (Number(process.versions.node.split(".")[0]) !== 22)
    throw new Error(
      "Firefox lint requires Node 22 LTS (see .nvmrc). The installed Mozilla linter crashes under Node 25 on macOS. Run nvm use, or npm exec --yes --package=node@22 -- node scripts/release.js lint.",
    );
  const stage = fs.mkdtempSync(
    path.join(os.tmpdir(), "strawhats-firefox-lint-"),
  );
  try {
    new Zip(path.join(output, names.Firefox)).extractAllTo(stage);
    const cli = path.join(
      path.dirname(require.resolve("web-ext")),
      "bin/web-ext.js",
    );
    const result = spawnSync(
      process.execPath,
      [cli, "lint", "--source-dir", stage],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `Firefox lint exited ${result.status} (signal: ${result.signal || "none"})`,
      );
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const command = process.argv[2];
    if (command === "package") packageRelease();
    else if (command === "verify") verifyRelease();
    else if (command === "lint") lintFirefox();
    else throw new Error("Usage: node scripts/release.js package|verify|lint");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { packageRelease, verifyRelease };
