const assert = require("assert");
const PII = require("../lib/pii.js");

const vault = new PII.AliasVault("test-seed");
vault.registerUserProfile({
  name: "Jethin Kosaraju",
  email: "jethin@example.com",
  phone: "9876543210",
  address: "Knowledge Park II, Greater Noida",
  upi: "jethin@upi"
});

const email = PII.redactText("Contact jethin@example.com now", vault);
assert(!email.safe.includes("jethin@example.com"));
assert(email.safe.includes("<EMAIL:"));

const profile = PII.redactText("Ship to Knowledge Park II, Greater Noida", vault);
assert(!profile.safe.includes("Knowledge Park II"));
assert(profile.safe.includes("<ADDRESS:"));

const cardVault = new PII.AliasVault("cards");
const card = PII.redactText("4111 1111 1111 1111", cardVault);
assert(card.safe.includes("<CARD:"));
assert.strictEqual(PII.luhn("4111111111111111"), true);
assert.strictEqual(PII.luhn("4111111111111112"), false);

const secretVault = new PII.AliasVault("secret");
const secret = PII.redactText("hunter2", secretVault, { semanticType: "password" });
assert(secret.safe.startsWith("<SECRET:"));
assert.strictEqual(secretVault.resolve(secret.safe), "hunter2");

assert(PII.redactText("IFSC HDFC0001234", new PII.AliasVault("ifsc")).safe.includes("<IFSC:"));
assert(PII.redactText("Passport K1234567", new PII.AliasVault("passport")).safe.includes("<PASSPORT:"));
assert.strictEqual(PII.findPII("Invalid Aadhaar 234567890123").some((item) => item.type === "AADHAAR"), false);
assert.deepEqual(PII.findPII("Address: <PRIVATE_TOKEN>"), [], "Capability placeholders must not be classified as address PII");

const capabilityVault = new PII.AliasVault("capabilities");
capabilityVault.registerUserProfile({ email: "private@example.com" });
const emailToken = capabilityVault.capabilities(true)[0].token;
assert.match(emailToken, /^<EMAIL:[A-F0-9]{24}>$/, "private aliases must use 96 bits of random hexadecimal entropy");
const secondVault = new PII.AliasVault("capabilities");
secondVault.registerUserProfile({ email: "private@example.com" });
assert.notStrictEqual(secondVault.capabilities(true)[0].token, emailToken, "aliases must not be deterministic across task vaults");
assert.strictEqual(capabilityVault.resolveForUse(emailToken, { action: "fill", semanticType: "email", consume: true }).ok, true);
assert.match(capabilityVault.resolveForUse(emailToken, { action: "fill", semanticType: "search" }).error, /destination/);
capabilityVault.resolveForUse(emailToken, { action: "fill", semanticType: "email", consume: true });
capabilityVault.resolveForUse(emailToken, { action: "fill", semanticType: "email", consume: true });
assert.match(capabilityVault.resolveForUse(emailToken, { action: "fill", semanticType: "email", consume: true }).error, /limit/);

const pageVault = new PII.AliasVault("page-value");
const pageToken = pageVault.register("EMAIL", "page@example.com", { source: "page" });
assert.match(pageVault.resolveForUse(pageToken, { action: "fill", semanticType: "email" }).error, /Page-derived/);

console.log("PII core tests passed");
