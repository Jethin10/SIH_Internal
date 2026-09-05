"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DATASET = "gretelai/synthetic_pii_finance_multilingual";
const REVISION = "7b844d16738527a04264f50214cb426a4cea0897";
const CONFIG = "default";
const SPLIT = "test";
const SOURCE_OFFSET = 1000;
const SOURCE_ROWS = 1000;
const OUTPUT = path.join(__dirname, "pii-independent.json");
const LABEL_MAP = Object.freeze({
  name: "PERSON",
  first_name: "PERSON",
  street_address: "ADDRESS",
  email: "EMAIL",
  phone_number: "PHONE",
  ipv4: "IP",
  credit_card_number: "CARD",
  passport_number: "PASSPORT"
});
const QUOTAS = Object.freeze({
  name: 20,
  first_name: 5,
  street_address: 20,
  email: 15,
  phone_number: 15,
  ipv4: 8,
  credit_card_number: 8,
  passport_number: 8
});

function codePoints(value) {
  return Array.from(String(value || ""));
}

function spanValue(text, span) {
  return codePoints(text).slice(span.start, span.end).join("");
}

function makeSnippet(text, span) {
  const points = codePoints(text);
  let start = Math.max(0, span.start - 96);
  let end = Math.min(points.length, span.end + 96);
  while (start < span.start && !/\s/.test(points[start])) start += 1;
  while (end > span.end && !/\s/.test(points[end - 1])) end -= 1;
  const snippet = points.slice(start, end).join("")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();
  return snippet;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "SIH-Internal-independent-eval-importer/1.0" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const metadata = await getJson(`https://huggingface.co/api/datasets/${DATASET}`);
  if (metadata.sha !== REVISION) {
    throw new Error(`Dataset revision changed: expected ${REVISION}, received ${metadata.sha}. Review the new data before updating REVISION.`);
  }

  const sourceRows = [];
  for (let offset = SOURCE_OFFSET; offset < SOURCE_OFFSET + SOURCE_ROWS; offset += 100) {
    const query = new URLSearchParams({ dataset: DATASET, config: CONFIG, split: SPLIT, offset: String(offset), length: "100" });
    const page = await getJson(`https://datasets-server.huggingface.co/rows?${query}`);
    sourceRows.push(...page.rows);
  }

  const selected = [];
  const counts = Object.fromEntries(Object.keys(QUOTAS).map((label) => [label, 0]));
  const seen = new Set();
  for (const item of sourceRows) {
    const row = item.row;
    if (row.language !== "English") continue;
    const spans = JSON.parse(row.pii_spans);
    for (let sourceSpan = 0; sourceSpan < spans.length; sourceSpan += 1) {
      const span = spans[sourceSpan];
      if (!LABEL_MAP[span.label] || counts[span.label] >= QUOTAS[span.label]) continue;
      const value = spanValue(row.generated_text, span).trim();
      if (!value) continue;
      const text = makeSnippet(row.generated_text, span);
      if (!text.includes(value)) continue;
      const key = `${item.row_idx}\u0000${span.label}\u0000${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push({
        id: `gretel-test-${item.row_idx}-${sourceSpan}`,
        sourceRow: item.row_idx,
        sourceIndex: row.index,
        sourceLabel: span.label,
        type: LABEL_MAP[span.label],
        text,
        entity: value
      });
      counts[span.label] += 1;
    }
  }

  const negatives = [];
  for (const item of sourceRows) {
    if (negatives.length >= 20) break;
    const row = item.row;
    if (row.language !== "English" || JSON.parse(row.pii_spans).length !== 0) continue;
    const text = codePoints(row.generated_text).slice(0, 240).join("")
      .replace(/[\t\f\v ]+/gu, " ")
      .replace(/ *\n */gu, "\n")
      .trim();
    if (text) negatives.push({ id: `gretel-test-${item.row_idx}-negative`, sourceRow: item.row_idx, text });
  }

  const fixture = {
    schemaVersion: 1,
    provenance: {
      dataset: DATASET,
      url: `https://huggingface.co/datasets/${DATASET}`,
      revision: REVISION,
      config: CONFIG,
      split: SPLIT,
      license: "Apache-2.0",
      authorship: "Created independently by Gretel; no project-generated examples are included.",
      selection: `Deterministic scan of source rows ${SOURCE_OFFSET}-${SOURCE_OFFSET + SOURCE_ROWS - 1}; English only; earliest non-empty labelled spans up to fixed per-label quotas. Rows 0-499 were used only to understand source conventions and are excluded from this evaluation fixture.`,
      transformation: "Each positive is a whitespace-normalized source excerpt with up to 96 Unicode code points of context on either side. Negatives are the first 20 English source rows with no labelled spans, truncated to 240 code points.",
      scope: "Labels are mapped only where this detector has a corresponding privacy type. Unmapped dataset labels are excluded. PHONE and PASSPORT retain the project's India-specific validation, and CARD retains Luhn validation, so misses outside those formats remain visible.",
      importedAt: new Date().toISOString()
    },
    labelMap: LABEL_MAP,
    quotas: QUOTAS,
    counts,
    positives: selected,
    negatives
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(JSON.stringify({ output: OUTPUT, positives: selected.length, negatives: negatives.length, counts }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
