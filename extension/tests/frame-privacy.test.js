"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(
  require.resolve("../background/service-worker.js"),
  "utf8",
);
let frameUrl = "https://shop.test/frame";
const context = vm.createContext({
  URL,
  chrome: {
    tabs: {
      get: async () => ({ url: "https://shop.test/" }),
      sendMessage: async (_, message) => message,
    },
    webNavigation: {
      getFrame: async () => {
        if (frameUrl === null) throw Error("gone");
        return { url: frameUrl };
      },
    },
  },
});
vm.runInContext(
  source.slice(
    source.indexOf("async function sendFrame("),
    source.indexOf("async function sendAllFrames("),
  ),
  context,
);
vm.runInContext(
  source.slice(
    source.indexOf("function bestElement("),
    source.indexOf("async function planAction("),
  ),
  context,
);
(async () => {
  const settings = {
    aliasSeed: "fixture",
    userProfile: { name: "Fixture Person" },
    policy: {},
    provider: { apiKey: "fixture-key" },
    agent: { token: "fixture-token" },
  };
  for (const frameId of [0, 1]) {
    const received = await context.sendFrame(1, frameId, {
      type: "SYNC_SETTINGS",
      settings,
    });
    assert.equal(received.settings.userProfile.name, "Fixture Person");
    assert(!JSON.stringify(received).includes("fixture-key"));
    assert(!JSON.stringify(received).includes("fixture-token"));
  }
  for (frameUrl of ["https://other.test/", "about:blank", null]) {
    const received = await context.sendFrame(1, 1, {
      type: "SYNC_SETTINGS",
      settings,
    });
    assert.equal(Object.keys(received.settings.userProfile).length, 0);
    assert.equal(
      (
        await context.sendFrame(1, 1, {
          type: "REGISTER_TASK_VALUES",
          entities: [{ value: "secret" }],
        })
      ).entities.length,
      0,
    );
    assert.equal(
      (
        await context.sendFrame(1, 1, {
          type: "SET_TASK",
          task: "My private task",
        })
      ).task,
      "",
    );
  }
  const planned = context.localPlan(
    "fill my email",
    {
      elements: [
        {
          id: "foreign",
          frameId: 1,
          role: "textbox",
          semanticType: "email",
          label: "Email",
          relevance: 100,
          actionable: true,
          version: 1,
        },
        {
          id: "local",
          frameId: 0,
          role: "textbox",
          semanticType: "email",
          label: "Email",
          relevance: 1,
          actionable: true,
          version: 1,
        },
      ],
      vaultCapabilities: [{ token: "local-token", type: "EMAIL", frameId: 0 }],
    },
    [],
  );
  assert.equal(
    planned.targetId,
    "local",
    "Higher-ranked foreign field cannot consume the main-frame token",
  );
  assert.equal(planned.value, "local-token");
  console.log(
    "Profile, task and capability values withheld from foreign, opaque and missing frames",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
