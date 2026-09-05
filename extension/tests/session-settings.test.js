"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../background/service-worker.js"), "utf8");

(async () => {
  let stored = {};
  let secrets = {};
  let writes = 0;
  const settingsContext = vm.createContext({
    crypto: globalThis.crypto,
    chrome: { storage: {
      local: { get: async () => structuredClone(stored), set: async (value) => { writes++; Object.assign(stored, structuredClone(value)); } },
      session: { get: async () => structuredClone(secrets), set: async (value) => Object.assign(secrets, structuredClone(value)) }
    } }
  });
  vm.runInContext(source.slice(source.indexOf("const DEFAULT_SETTINGS ="), source.indexOf("chrome.runtime.onInstalled")), settingsContext);
  vm.runInContext(source.slice(source.indexOf("async function getSettings("), source.indexOf("async function activeTabId(")), settingsContext);
  const first = await settingsContext.getSettings();
  assert(first.aliasSeed);
  assert.equal(writes, 1, "Initialize settings once");
  for (let i = 0; i < 10; i++) await settingsContext.getSettings();
  assert.equal(writes, 1, "Warm reads must not write to disk");
  stored.gatewaySettings.provider.apiKey = "legacy-test-key";
  await settingsContext.getSettings();
  assert.equal(secrets.gatewaySecrets.apiKey, "legacy-test-key");
  assert.equal(stored.gatewaySettings.provider.apiKey, "");
  await settingsContext.getSettings();
  assert.equal(writes, 2, "Migration must run only once");

  const sessions = new Map();
  let finishPrevious;
  const previous = { cancelled: false, completion: new Promise(resolve => { finishPrevious = resolve; }) };
  sessions.set(1, previous);
  let taskSynced = false;
  const context = vm.createContext({
    sessions, crypto: globalThis.crypto,
    activeTabId: async () => 1, getSettings: async () => ({}),
    assertDomainAllowed: async () => ({ url: "https://example.test/" }), URL,
    sendAllFrames: async () => { taskSynced = true; },
    prepareTaskPrivacy: async () => ({ safeTask: "next task", entities: [] }),
    broadcast: () => {}, runSession: async () => {}
  });
  vm.runInContext(source.slice(source.indexOf("async function startTask("), source.indexOf("async function confirmPending(")), context);
  const starting = context.startTask("next task");
  await new Promise(resolve => setImmediate(resolve));
  assert(previous.cancelled, "Old task must be cancelled");
  assert.equal(taskSynced, false, "Do not replace capabilities while the old planner is running");
  sessions.delete(1); // Old task cleanup happens before the replacement.
  finishPrevious();
  await starting;
  assert.equal(sessions.get(1).task, "next task");
  assert(sessions.get(1).completion);
  console.log("Settings reads avoid disk writes; legacy migration and task replacement pass");
})().catch(error => { console.error(error); process.exitCode = 1; });
