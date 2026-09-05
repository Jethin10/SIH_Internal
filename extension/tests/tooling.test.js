"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { chromePath, chromeTestArgs } = require("../scripts/browser-runtime.js");
const root = path.resolve(__dirname, "..");
assert.deepEqual(chromeTestArgs({ GITHUB_ACTIONS: "true" }, "linux"), ["--no-sandbox"]);
assert.deepEqual(chromeTestArgs({}, "linux"), []);
assert.deepEqual(chromeTestArgs({ GITHUB_ACTIONS: "true" }, "darwin"), []);
assert.deepEqual(chromeTestArgs({ GITHUB_ACTIONS: "true" }, "win32"), []);
assert.equal(chromePath({}, () => process.execPath), process.execPath);
assert.equal(chromePath({ CHROME_PATH: process.execPath }, () => { throw new Error("Must honor override"); }), process.execPath);
assert.throws(() => chromePath({ CHROME_PATH: "relative.exe" }), /absolute path/);
for (const script of ["tests/run-e2e.js", "scripts/capture-product-ui.js"]) {
  const run = spawnSync(process.execPath, [path.join(root, script)], {
    env: { ...process.env, CHROME_PATH: path.join(os.tmpdir(), "strawhats-nonexistent-browser") }, timeout: 3000, encoding: "utf8"
  });
  assert.equal(run.status, 1, `${script} must exit promptly when the browser is missing; ${run.error || run.stderr}`);
}
const output = fs.mkdtempSync(path.join(os.tmpdir(), "strawhats-package-test-"));
const runRelease = (command) => spawnSync(process.execPath, [path.join(root, "scripts/release.js"), command], {
  env: { ...process.env, RELEASE_DIR: output }, encoding: "utf8", timeout: 60000
});
try {
  const build = runRelease("package");
  assert.equal(build.status, 0, build.stderr);
  const files = fs.readdirSync(output).filter((file) => file.endsWith(".zip") || file.endsWith(".xpi"));
  const original = new Map(files.map((file) => [file, fs.readFileSync(path.join(output, file))]));
  assert.equal(runRelease("package").status, 0);
  for (const file of files) assert(original.get(file).equals(fs.readFileSync(path.join(output, file))), `${file}: repeated build changed bytes`);
  const archive = path.join(output, files[0]);
  const bytes = fs.readFileSync(archive);
  bytes[bytes.length - 1] ^= 1;
  fs.writeFileSync(archive, bytes);
  const verify = runRelease("verify");
  assert.equal(verify.status, 1, "Corrupt archive must fail verification");
  assert.match(verify.stderr, /Checksum mismatch/);
  console.log("Browser override, missing-browser cleanup, reproducible archives and corruption checks passed");
} finally { fs.rmSync(output, { recursive: true, force: true }); }
