"use strict";
const assert = require("node:assert/strict");
const { createCaptureQueue } = require("../lib/capture-queue.js");

(async () => {
  let time = 0;
  const calls = [];
  const capture = createCaptureQueue({
    now: () => time,
    sleep: async (ms) => { time += ms; },
    capture: async (tab) => {
      calls.push({ tab, time });
      if (tab === "failed") throw new Error("Tab closed");
      return tab;
    }
  });
  const results = await Promise.allSettled([capture("first"), capture("failed"), capture("third"), capture("fourth")]);
  assert.deepEqual(calls.map((call) => call.time), [0, 600, 1200, 1800]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "fulfilled", "fulfilled"]);
  assert.equal(results[3].value, "fourth");
  console.log("Screenshot quota scheduling and recovery tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
