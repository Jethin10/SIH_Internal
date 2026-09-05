const assert = require("assert");
const policy = require("../lib/action-policy.js");

assert.strictEqual(policy.validate({ type: "click", targetId: "e_frame_1", expectedVersion: 2, reason: "open" }).ok, true);
assert.strictEqual(policy.validate({ type: "focus", targetId: "e_frame_1", expectedVersion: 1 }).ok, true);
assert.strictEqual(policy.validate({ type: "back", reason: "return" }).ok, true);
assert.match(policy.validate({ type: "click", targetId: "e_frame_1" }).reason, /expectedVersion/);
assert.match(policy.validate({ type: "press", targetId: "e_frame_1", expectedVersion: 1, key: "F12" }).reason, /not allowed/);
assert.match(policy.validate({ type: "click", targetId: "e_frame_1", expectedVersion: 1, script: "alert(1)" }).reason, /Unexpected/);
assert.match(policy.validate({ type: "navigate", url: "https://attacker.invalid" }).reason, /Unsupported/);

console.log("Action policy tests passed");
