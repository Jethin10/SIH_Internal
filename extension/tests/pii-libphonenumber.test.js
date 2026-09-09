"use strict";

// libphonenumber-js integration must stay strictly additive: international
// (+country-code) recall and cued Indian landlines are added, and every
// existing PHONE rule keeps its spans unchanged. A missing vendor wiring
// must fail this test loudly instead of silently degrading.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PII = require("../lib/pii.js");

const vendorPath = path.join(__dirname, "../lib/vendor/libphonenumber.js");
assert(fs.existsSync(vendorPath), "vendored libphonenumber.js is missing from lib/vendor");

// The base detector must expose the integration for coverage checks.
assert.strictEqual(typeof PII.libphonenumberActive, "function", "pii.js must expose libphonenumberActive()");
assert(PII.libphonenumberActive(), "vendored libphonenumber matcher must load in this environment");

// International +country-code forms that carry no label cue and no Indian
// mobile shape: new recall that only the vendored matcher provides.
const international = [
  ["Ship to +31 20 555 0190 today", "+31 20 555 0190"],
  ["Reachable on (+44) 123-456-7890 anytime", "(+44) 123-456-7890"],
  ["Call +49 30 901820 office", "+49 30 901820"],
  ["contact +91-98-765-43210 now", "+91-98-765-43210"],
  ["Ship notice: +44 20 7946 0958", "+44 20 7946 0958"]
];
for (const [text, span] of international) {
  const found = PII.findPII(text).some((item) => item.type === "PHONE" && item.value.trim() === span);
  assert(found, `international phone missed: ${JSON.stringify(text)}`);
}

// The fuller span (leading + and extension) outranks the shorter NANP form.
const fuller = PII.findPII("Support: +1 (800) 555-3535 x1234").filter((item) => item.type === "PHONE");
assert(fuller.some((item) => item.value.trim() === "+1 (800) 555-3535 x1234"), "the +code span with extension must win over the bare NANP span");

// Cued Indian landline without a labelled separator is new recall; the
// labelled-separator forms below already passed before this integration and
// must keep passing.
const cuedIndian = [
  ["Call 080-4123-4567 for details", "080-4123-4567"],
  ["Tel: 011 2345 6789", "011 2345 6789"],
  ["contact us at 011-2345-6789", "011-2345-6789"],
  ["phone is 022 2611 2233", "022 2611 2233"]
];
for (const [text, span] of cuedIndian) {
  const found = PII.findPII(text).some((item) => item.type === "PHONE" && item.value.trim() === span);
  assert(found, `cued Indian phone missed: ${JSON.stringify(text)}`);
}

// Cases the detector already handled keep their spans.
const untouched = [
  ["Phone 9000000001", "9000000001"],
  ["Mobile: 98765 43210", "98765 43210"],
  ["Contact: +91-9876543210", "+91-9876543210"],
  ["Phone Number: 001-397-680-4345 x3930", "001-397-680-4345 x3930"],
  ["Call us at 9876543210", "9876543210"]
];
for (const [text, span] of untouched) {
  const found = PII.findPII(text).some((item) => item.type === "PHONE" && item.value.trim() === span);
  assert(found, `existing phone rule regressed: ${JSON.stringify(text)}`);
}

// A real international number amid plus-sign distractors is found, and only
// the real number is: the distractors add no PHONE findings.
const distractors = [
  ["score +12 points, then +44 20 7946 0958 wins and we agree", "+44 20 7946 0958"],
  ["topup +49 176 12345678 done", "+49 176 12345678"]
];
for (const [text, span] of distractors) {
  const phones = PII.findPII(text).filter((item) => item.type === "PHONE");
  assert.equal(phones.length, 1, `exactly one phone expected: ${JSON.stringify(text)} -> ${JSON.stringify(phones.map((f) => f.value))}`);
  assert.equal(phones[0].value.trim(), span, `distractor case found wrong span: ${JSON.stringify(text)}`);
}

// Inputs the vendored matcher must never flag (base rules are out of scope
// here; these documents return no PHONE finding before and after).
const negatives = [
  "Reference 1234567890 closed",
  "Meeting on 12/09/2026 at 10:30",
  "pi = 3.1415926535",
  "OTP is 456789 valid",
  "ISBN 9780306406157 printed",
  "total 1234567.89 rupees",
  "invalid intl +1 1234567890 here",
  "invalid intl +31 20 555 01999 tail",
  "x + 1234567 y",
  "C++ 2020 standard",
  "invoice +91 only",
  "ref +#123456789",
  "telephones are old. Ref 1234567890",
  "version 1.2.30 and 10.30.40",
  "sum 1+23456789012 here",
  "The tally +49 176 123456789999 is long"
];
for (const text of negatives) {
  const phones = PII.findPII(text).filter((item) => item.type === "PHONE");
  assert.deepEqual(phones, [], `unexpected PHONE finding: ${JSON.stringify(text)} -> ${JSON.stringify(phones.map((f) => f.value))}`);
}

// Redaction still replaces the new spans end to end.
const redactVault = new PII.AliasVault("libphonenumber-redaction");
const redacted = PII.redactText("Ship to +31 20 555 0190 today", redactVault);
assert(!redacted.safe.includes("+31 20 555 0190"), "redaction must remove the international phone span");
assert(redacted.safe.includes("<PHONE:"), "redaction must tokenize the international phone span");

console.log("libphonenumber additive integration tests passed");
