const assert = require("assert");
require("../lib/domain-policy.js");
const P = globalThis.PrivacyDomainPolicy;

assert(P.evaluate("https://shop.example.com/cart", { allowedDomains: "example.com" }).ok);
assert(!P.evaluate("https://evil.test", { allowedDomains: "example.com" }).ok);
assert(!P.evaluate("https://pay.example.com", { blockedDomains: "*.example.com" }).ok);
assert(P.evaluate("http://localhost:8000", {}).ok);
console.log("domain policy tests passed");
