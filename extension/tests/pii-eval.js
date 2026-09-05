"use strict";

const assert = require("assert");
const PII = require("../lib/pii.js");

function pad(value, width) {
  return String(value).padStart(width, "0");
}

function makeLuhn(prefix) {
  for (let digit = 0; digit <= 9; digit += 1) {
    const candidate = `${prefix}${digit}`;
    if (PII.luhn(candidate)) return candidate;
  }
  throw new Error(`Could not create Luhn value from ${prefix}`);
}

function makeAadhaar(seed) {
  const prefix = `2345${pad(seed % 10000000, 7)}`;
  for (let digit = 0; digit <= 9; digit += 1) {
    const candidate = `${prefix}${digit}`;
    if (PII.verhoeff(candidate)) return candidate;
  }
  throw new Error(`Could not create Verhoeff value from ${prefix}`);
}

const cases = [];
const add = (text, types) => cases.push({ text, types });

for (let i = 0; i < 100; i += 1) {
  add(`Email user.${i}@example${i % 9}.com`, ["EMAIL"]);
  add(`Phone ${9000000000 + i}`, ["PHONE"]);
  add(`PAN ABCDE${pad(i, 4)}F`, ["PAN"]);
  add(`IFSC HDFC0${pad(i, 6)}`, ["IFSC"]);
  add(`UPI user${i}@bank`, ["UPI"]);
  add(`Voter ABC${pad(i, 7)}`, ["VOTER_ID"]);
  add(`Passport A${1000000 + i}`, ["PASSPORT"]);
  add(`Private network 10.${i % 250}.${Math.floor(i / 10) % 250}.${(i * 7) % 250}`, ["IP"]);
  add(`Card ${makeLuhn(`41111111111${pad(i, 4)}`)}`, ["CARD"]);
  add(`Aadhaar ${makeAadhaar(i)}`, ["AADHAAR"]);
}

for (let i = 0; i < 250; i += 1) {
  add(`Order ${pad(100000 + i, 6)} shipped at 10:${pad(i % 60, 2)}`, []);
}
add("Invalid card 4111 1111 1111 1112", []);
add("Invalid Aadhaar 0000 0000 0000", []);
add("Product code ABCD-1234-EFGH", []);
add("Price 59999 INR", []);

let tp = 0;
let fp = 0;
let fn = 0;
const perType = {};

for (const item of cases) {
  const got = new Set(PII.findPII(item.text).map((match) => match.type));
  const want = new Set(item.types);
  for (const type of got) {
    perType[type] ||= { tp: 0, fp: 0, fn: 0 };
    if (want.has(type)) {
      tp += 1;
      perType[type].tp += 1;
    } else {
      fp += 1;
      perType[type].fp += 1;
    }
  }
  for (const type of want) {
    perType[type] ||= { tp: 0, fp: 0, fn: 0 };
    if (!got.has(type)) {
      fn += 1;
      perType[type].fn += 1;
    }
  }
}

const precision = tp / Math.max(1, tp + fp);
const recall = tp / Math.max(1, tp + fn);
const f1 = (2 * precision * recall) / Math.max(0.0001, precision + recall);

assert(fp === 0 && fn === 0, `PII eval failed: fp=${fp} fn=${fn}`);
console.log(JSON.stringify({
  cases: cases.length,
  positives: tp + fn,
  negatives: cases.filter((item) => item.types.length === 0).length,
  tp,
  fp,
  fn,
  precision,
  recall,
  f1,
  perType,
  note: "Generated synthetic regression corpus. This proves deterministic rule coverage, not real-world PII accuracy."
}, null, 2));
