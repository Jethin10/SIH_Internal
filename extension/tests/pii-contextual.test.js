"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PII = require("../lib/pii.js");
const corpus = require("./pii-contextual.json");
let tp = 0, fp = 0, fn = 0;
const results = corpus.cases.map((item) => {
  const detected = PII.findPII(item.text).map((entity) => entity.value.trim());
  const missed = item.entities.filter((value) => !detected.includes(value));
  const extra = detected.filter((value) => !item.entities.includes(value));
  tp += item.entities.length - missed.length; fn += missed.length; fp += extra.length;
  if (!item.knownGap) {
    assert.deepEqual(missed, [], `${item.id}: missed entity`);
    assert.deepEqual(extra, [], `${item.id}: false positive`);
    const redacted = PII.redactText(item.text, new PII.AliasVault());
    for (const entity of item.entities) assert(!redacted.safe.includes(entity), `${item.id}: raw value survived redaction`);
  }
  return { id: item.id, category: item.category, expected: item.entities.length, detected: detected.length, missed: missed.length, falsePositives: extra.length, knownGap: item.knownGap || null };
});
const report = { generatedAt: new Date().toISOString(), provenance: corpus.provenance, cases: results.length,
  tp, fp, fn, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1),
  note: "Known gaps remain included in accuracy totals. Only supported-case regressions fail this command. OCR-error cases are text inputs, not measured OCR engine accuracy.", results };
fs.mkdirSync(path.join(__dirname, "../artifacts"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "../artifacts/pii-contextual.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ cases: report.cases, tp, fp, fn, precision: report.precision, recall: report.recall, knownGaps: results.filter((r) => r.knownGap).length, note: report.note }, null, 2));
