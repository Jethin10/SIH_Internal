"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Egress = require("../lib/privacy-egress.js");

const context = { PII: require("../lib/pii.js") };
vm.createContext(context);
const source = fs.readFileSync(require.resolve("../content/content-script.js"), "utf8");
vm.runInContext(source.slice(source.indexOf("  function egressInventoryFor("), source.indexOf("  function buildContext(")), context);

// Case 1: label flagged (synthetic street-like phrase), value clean and visible.
// The clean value must NOT become a tracked secret; the flagged label span must.
const cleanValueRecord = {
  id: "e_link", semanticType: "generic", rawLabel: "42 Harbour Lane a referendum membership",
  rawValue: "a referendum", value: "a referendum"
};
const fields = inventory => [...inventory].map(item => String(item.field));
const first = context.egressInventoryFor([cleanValueRecord]);
assert.deepEqual(fields(first), ["label"], "Clean visible value must stay out of the egress inventory: " + JSON.stringify(first));
assert.ok(first[0].value.includes("42 Harbour Lane"));

// Case 2: tokenized value — the raw value is withheld and must be tracked.
const tokenized = {
  id: "e_mail", semanticType: "email", rawLabel: "Email", rawValue: "fixture.user@example.com",
  value: "<EMAIL:ABCDEFABCDEFABCDEFABCDEF>"
};
const second = context.egressInventoryFor([tokenized]);
assert.deepEqual(fields(second), ["value"]);

// Case 3: dropped value (empty safe value) — raw stays secret.
const dropped = { id: "e_note", semanticType: "person", rawLabel: "Note", rawValue: "Fixture Person", value: "" };
const third = context.egressInventoryFor([dropped]);
assert.deepEqual(fields(third), ["value"]);

// End-to-end: the previously-blocking safe context now passes inspection.
const safeContext = {
  page: { title: "Main page" },
  elements: [{ id: "e_link", label: "<ADDRESS:9144488EBF72C8731D4FDCA5> membership negotiations", value: "a referendum" }]
};
const payload = JSON.stringify(safeContext);
assert.equal(Egress.inspectSerialized(payload, Egress.privateValues({}, first)), payload, "Label false positive must not block clean page text");
assert.throws(() => Egress.inspectSerialized(JSON.stringify({ note: tokenized.rawValue }), Egress.privateValues({}, second)), /KNOWN_PRIVATE_VALUE/, "Tokenized raw values stay blocked");

console.log("Egress inventory tracks only withheld values; label false positives no longer block clean pages");

