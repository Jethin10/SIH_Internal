"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../background/service-worker.js"), "utf8");

async function main() {
  let created = 0;
  let started;
  const settings = { policy: { cloudEnabled: true }, provider: { endpoint: "https://api.groq.com/openai/v1/chat/completions", model: "test-model", apiKey: "" } };
  const context = { URL, Date, setTimeout, getSettings: async () => settings,
    DomainPolicy: { evaluate: () => ({ ok: true }) },
    chrome: { tabs: { create: async () => { created++; return { id: 7 }; }, get: async () => ({ status: "complete" }) } },
    sendAllFrames: async () => [{ frameId: 0, result: { status: "fulfilled" } }],
    startTask: async (task, tabId) => { started = { task, tabId }; return { ok: true, tabId }; }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("async function startFlightDemo("), source.indexOf("chrome.runtime.onMessage.addListener")), context);
  const input = { from: "Hyderabad HYD", to: "Delhi DEL", date: "2099-10-12" };
  await assert.rejects(context.startFlightDemo(input), /Add your provider/);
  assert.equal(created, 0, "Missing credentials must not open a tab");
  settings.provider.apiKey = "fake-test-key";
  await assert.rejects(context.startFlightDemo({ ...input, date: "2099-02-31" }), /valid departure/);
  await assert.rejects(context.startFlightDemo({ ...input, to: input.from }), /different cities/);
  settings.provider.endpoint = "http://example.test/v1/chat/completions";
  await assert.rejects(context.startFlightDemo(input), /HTTPS/);
  settings.provider.endpoint = "https://api.groq.com/openai/v1/chat/completions";
  context.DomainPolicy.evaluate = () => ({ ok: false, reason: "blocked domain" });
  await assert.rejects(context.startFlightDemo(input), /blocked domain/);
  assert.equal(created, 0);
  context.DomainPolicy.evaluate = () => ({ ok: true });
  const result = await context.startFlightDemo(input);
  assert.equal(result.tabId, 7);
  assert.equal(started.tabId, 7);
  assert(started.task.includes(input.from) && started.task.includes(input.to) && started.task.includes(input.date));

  // A delayed provider response must not execute back navigation after Stop.
  let resolvePlan;
  let navigation = 0;
  const session = { tabId: 1, step: 0, maxSteps: 30, history: [], safeTask: "go back" };
  const sessions = new Map([[1, session]]);
  const runner = { sessions, getSettings: async () => ({ policy: {} }), assertSessionBoundary: async () => true,
    collectContext: async () => ({ safeContext: { page: {}, elements: [] } }), visualCache: new Map(),
    augmentWithVisual: (c) => c, broadcast: () => {},
    planAction: () => new Promise((resolve) => { resolvePlan = resolve; }),
    chrome: { tabs: { goBack: async () => { navigation++; } } },
    recordAudit: (_tabId, _session, _context, action, result) => ({ reason: result.reason, action: action.type })
  };
  vm.createContext(runner);
  vm.runInContext(source.slice(source.indexOf("async function runSession("), source.indexOf("async function startTask(")), runner);
  const running = runner.runSession(1);
  while (!resolvePlan) await new Promise((resolve) => setImmediate(resolve));
  session.cancelled = true; sessions.delete(1);
  resolvePlan({ type: "back" });
  await running;
  assert.equal(navigation, 0);

  // Exercise the speech handlers with a simulated browser recognizer.
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: "", checked: false, disabled: false, textContent: "", handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; }, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} }, querySelector() { return { textContent: "" }; } });
    return elements.get(id);
  };
  let recognizer;
  class Speech {
    constructor() { recognizer = this; }
    start() {}
    stop() { this.onend(); }
    abort() { this.onend(); }
  }
  const panel = { document: { getElementById: element }, window: { addEventListener() {} }, navigator: { language: "en-IN" },
    SpeechRecognition: Speech, URL, Date, setTimeout,
    chrome: { runtime: { onMessage: { addListener() {} }, sendMessage: () => new Promise(() => {}) } }
  };
  vm.createContext(panel);
  vm.runInContext(fs.readFileSync(require.resolve("../sidepanel/app.js"), "utf8"), panel);
  element("voiceButton").handlers.click();
  recognizer.onresult({ results: [[{ transcript: "search flights to Delhi" }]] });
  assert.equal(element("taskInput").value, "search flights to Delhi");
  assert.equal(element("runButton").disabled, false, "Speech must not automatically submit the transcript");
  recognizer.onerror({ error: "not-allowed" });
  recognizer.onend();
  assert.match(element("voiceStatus").textContent, /denied/);
  assert.equal(element("voiceButton").textContent, "Speak task");
  console.log("Flight setup, target tab, cancellation, and simulated speech recovery tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
