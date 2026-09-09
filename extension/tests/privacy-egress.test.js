"use strict";
const assert = require("node:assert/strict");
const Egress = require("../lib/privacy-egress.js");

const secret = "synthetic-swordfish";
const safe = JSON.stringify({ task: "Inspect products", token: "<EMAIL:ABCDEFABCDEFABCDEFABCDEF>" });
assert.equal(Egress.inspectSerialized(safe, [secret]), safe, "Return the exact inspected bytes");
for (const value of [secret, secret.toUpperCase(), encodeURIComponent("synthetic swordfish"), encodeURIComponent(encodeURIComponent("synthetic swordfish"))]) {
  assert.throws(() => Egress.inspectSerialized(JSON.stringify({ nested: [{ value }] }), [secret, "synthetic swordfish"]), /KNOWN_PRIVATE_VALUE/);
}
assert.throws(() => Egress.inspectSerialized('{"value":"synthetic-\\u0073wordfish"}', [secret]), /KNOWN_PRIVATE_VALUE/);
assert.throws(() => Egress.inspectSerialized(JSON.stringify({ [secret]: "value" }), [secret]), /KNOWN_PRIVATE_VALUE/);
assert.throws(() => Egress.inspectSerialized(JSON.stringify({ value: "person@example.com" })), /RAW_PII/);
assert.throws(() => Egress.inspectSerialized(JSON.stringify({ value: "person%40example.com" })), /RAW_PII/);
assert.throws(() => Egress.inspectSerialized(JSON.stringify({ label: "Patient:", value: "Ada Lovelace" })), /RAW_PII/);
assert.throws(() => Egress.inspectSerialized("not JSON"), /INVALID_JSON/);
const values = Egress.privateValues({ userProfile: { name: "Synthetic Person" }, provider: { apiKey: "fixture-primary-key", fallbackApiKeys: ["fixture-fallback-key"] } }, [{ value: secret }]);
for (const value of values) {
  assert.throws(() => Egress.inspectSerialized(JSON.stringify({ history: { reason: value } }), values), error => {
    assert(!error.message.includes(value), "Errors must not echo secrets");
    return error.code === "KNOWN_PRIVATE_VALUE";
  });
}
console.log("Shared privacy egress rejects nested, escaped, URL-encoded, profile and provider secrets");
