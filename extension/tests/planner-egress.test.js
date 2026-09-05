"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const PII = require("../lib/pii.js");
const source = fs.readFileSync(require.resolve("../background/service-worker.js"), "utf8");
const context = { PII };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf("function compactForPlanner("), source.indexOf("function updateEgressState(")), context);
const safe = { page: { epoch: 1 }, elements: [], vaultCapabilities: [], visual: { scanned: true, epoch: 1, lineCount: 7, confidence: 98.9876543219, ocrMs: 715 } };
assert(PII.findPII(JSON.stringify(safe)).length > 0, "Regression must reproduce telemetry matching a phone pattern");
assert.doesNotThrow(() => context.assertEgressSafe(safe, [], { userProfile: {} }, "click Canvas", []));
const history = [{ action: { type: "visual_scan" }, result: { status: "executed", ocrMs: 98.9876543219, receipt: { id: "9876543219" } } }];
assert.doesNotThrow(() => context.assertEgressSafe(safe, [], { userProfile: {} }, "click Canvas", history));
assert.equal(context.compactPlannerHistory(history)[0].result.status, "executed");
assert(!JSON.stringify(context.compactPlannerHistory(history)).includes("9876543219"));
const leaked = { ...safe, elements: [{ label: "user@example.com" }] };
assert.throws(() => context.assertEgressSafe(leaked, [], { userProfile: {} }, "click Canvas", []), /PII/);
console.log("Planner telemetry minimization and raw PII rejection tests passed");

const crowded = { ...safe, page: { viewport: { height: 800 } }, elements: Array.from({length: 200}, (_, i) => ({
  id: `e_${i}`, version: 3, label: `Product ${i} ${'x'.repeat(150)}`, actionable: i === 199,
  bbox: { y: i === 199 ? 20 : 1200, height: 30 }
})) };
const compact = context.compactForPlanner(crowded);
assert.equal(compact.elements[0].id, 'e_199', 'Visible actionable controls must survive crowded pages');
assert(compact.omittedElements > 0);
assert.equal(compact.omittedElements + compact.elements.length, 200);
assert(JSON.stringify(compact).length <= 10100, 'Serialized planner context must respect its budget including metadata');
assert(compact.elements.every(e => e.version === 3 && /^e_/.test(e.id)));
