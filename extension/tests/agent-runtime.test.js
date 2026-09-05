"use strict";

const assert = require("node:assert/strict");
const Runtime = require("../background/agent-runtime.js");

const elements = Array.from({ length: 120 }, (_, index) => ({
  id: `e-${index}`,
  frameId: 0,
  source: "structure",
  role: index < 5 ? "link" : "text",
  label: index === 0 ? "IndiGo 2:15 AM to 4:40 AM nonstop ₹8,288 Select flight" : `Page element ${index} ${"x".repeat(90)}`,
  value: "",
  semanticType: "none",
  actionable: index < 5,
  policy: "KEEP",
  version: 1,
  bbox: { x: 10, y: index < 8 ? 100 + index * 30 : 1800 + index * 10, width: 400, height: 24 }
}));
const compact = Runtime.compactPlannerContext({
  page: { origin: "https://www.google.com", path: "/travel/flights", viewport: { width: 1280, height: 800 }, epoch: 1 },
  visual: { scanned: false, lineCount: 0, epoch: 1 },
  opaqueRegions: [],
  vaultCapabilities: {},
  elements
}, 6500);
assert(JSON.stringify(compact).length <= 6500, "planner context must stay inside its byte budget");
assert(compact.omittedElements > 0, "large pages should be pruned");
assert.equal(compact.elements[0].id, "e-0", "visible actionable controls must be ranked first");
assert(compact.elements.some((item) => item.label.includes("₹8,288")), "visible flight result text must survive compaction");

const url = new URL(Runtime.buildFlightUrl("Hyderabad HYD", "Delhi DEL", "2099-10-12"));
assert.equal(url.hostname, "www.google.com");
assert.equal(url.pathname, "/travel/flights");
assert.equal(url.searchParams.get("curr"), "INR");
assert(url.searchParams.get("q").includes("Hyderabad HYD") && url.searchParams.get("q").includes("Delhi DEL") && url.searchParams.get("q").includes("2099-10-12"));

const settings = Runtime.applyProviderDefaults({ provider: { endpoint: "https://api.groq.com/openai/v1/chat/completions", model: "" }, policy: {} });
assert.equal(settings.provider.model, "openai/gpt-oss-20b");
const custom = Runtime.applyProviderDefaults({ provider: { endpoint: "https://example.com/v1/chat/completions", model: "custom-model" } });
assert.equal(custom.provider.model, "custom-model");

const tuned = Runtime.tuneProviderBody("https://api.groq.com/openai/v1/chat/completions", { model: "openai/gpt-oss-20b", messages: [], max_completion_tokens: 2000 });
assert.equal(tuned.max_completion_tokens, 512);
assert.deepEqual(tuned.response_format, { type: "json_object" });
assert.equal(tuned.reasoning_effort, "low");

console.log("Agent runtime budget, Groq defaults, and flight fast-path tests passed");
