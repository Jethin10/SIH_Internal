"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PII = require("../lib/pii.js");
const fixture = require("./pii-independent.json");

assert.equal(fixture.schemaVersion, 1, "Unsupported independent fixture schema");
assert.equal(fixture.provenance.split, "test", "Independent benchmark must use the source test split");
assert.equal(fixture.provenance.license, "Apache-2.0", "Independent fixture license must remain recorded");
assert(fixture.positives.length >= 80, "Independent fixture must retain at least 80 labelled positives");
assert(fixture.negatives.length >= 20, "Independent fixture must retain at least 20 negative documents");

let tp = 0;
let fn = 0;
let negativeFalsePositives = 0;
const perType = {};
const misses = [];
const negativeFindings = [];

for (const item of fixture.positives) {
  const findings = PII.findPII(item.text);
  const found = findings.some((finding) => finding.type === item.type && finding.value.trim() === item.entity.trim());
  perType[item.type] ||= { expected: 0, detected: 0, missed: 0 };
  perType[item.type].expected += 1;
  if (found) {
    tp += 1;
    perType[item.type].detected += 1;
    const redacted = PII.redactText(item.text, new PII.AliasVault());
    assert(!redacted.safe.includes(item.entity), `${item.id}: detected raw entity survived redaction`);
  } else {
    fn += 1;
    perType[item.type].missed += 1;
    misses.push({ id: item.id, sourceRow: item.sourceRow, sourceLabel: item.sourceLabel, type: item.type, entity: item.entity });
  }
}

for (const item of fixture.negatives) {
  const findings = PII.findPII(item.text);
  negativeFalsePositives += findings.length;
  if (findings.length) negativeFindings.push({ id: item.id, findings: findings.map(({ type, value }) => ({ type, value })) });
}

const recall = tp / Math.max(1, tp + fn);
const negativeDocumentsWithFindings = negativeFindings.length;
const cleanNegativeRate = (fixture.negatives.length - negativeDocumentsWithFindings) / Math.max(1, fixture.negatives.length);
const report = {
  generatedAt: new Date().toISOString(),
  provenance: fixture.provenance,
  cases: fixture.positives.length + fixture.negatives.length,
  positives: fixture.positives.length,
  negativeDocuments: fixture.negatives.length,
  tp,
  fn,
  recall,
  negativeFalsePositives,
  negativeDocumentsWithFindings,
  cleanNegativeRate,
  perType,
  misses,
  negativeFindings,
  note: "External independently authored synthetic test data. Recall is exact type-and-value recall on mapped labels; clean-negative rate is the share of source documents labelled with no PII where the detector also returns no findings. It is reported separately from the generated regression corpus."
};

const artifacts = path.join(__dirname, "../artifacts");
fs.mkdirSync(artifacts, { recursive: true });
fs.writeFileSync(path.join(artifacts, "pii-independent.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

assert(recall >= 0.40, `Independent exact recall regressed below frozen baseline: ${recall}`);
assert(cleanNegativeRate >= 0.80, `Independent clean-negative rate regressed below frozen baseline: ${cleanNegativeRate}`);
assert(perType.EMAIL.detected >= 14, "Independent email recall regressed");
assert(perType.IP.detected === perType.IP.expected, "Independent IPv4 recall regressed");
