"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

function run(script, timeout = 180000) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: root,
    env: { ...process.env },
    encoding: "utf8",
    timeout
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
  return String(result.stdout || "").trim();
}

function parseWholeJson(text) {
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

function parseLastJson(text, markerKey) {
  const marker = `\n{\n  \"${markerKey}\"`;
  let start = text.lastIndexOf(marker);
  if (start >= 0) start += 1;
  else start = text.indexOf(`{\n  \"${markerKey}\"`);
  if (start < 0) throw new Error(`Could not find ${markerKey} JSON output`);
  return JSON.parse(text.slice(start));
}

const pii = parseWholeJson(run("pii-eval.js"));
const e2e = parseWholeJson(run("run-e2e.js"));
const benchmarkOutput = run("run-benchmarks.js", 240000);
const benchmarks = parseLastJson(benchmarkOutput, "generatedAt");

const maxWarmP95Ms = Math.max(...benchmarks.results.map((item) => Number(item.warmP95Ms || Infinity)));
// Hosted runner scheduling can add latency to the runtime message round trip. Keep the
// local target strict while using a documented budget for CI measurements.
const warmP95BudgetMs = Number(process.env.WARM_P95_BUDGET_MS || (process.env.CI ? 300 : 50));
const maxContextBuildMs = Math.max(...benchmarks.results.map((item) => Number(item.contextBuildMs || Infinity)));
const largePages = benchmarks.results.filter((item) => item.nodes >= 5000);
const minLargePageReductionPct = Math.min(...largePages.map((item) => Number(item.reductionPct || 0)));
const maxGraphApproxMb = Math.max(...benchmarks.results.map((item) => Number(item.graphApproxBytes || 0))) / (1024 * 1024);

const gates = {
  syntheticPiiRegression: pii.fp === 0 && pii.fn === 0 && pii.cases >= 1000,
  adversarialBrowserE2E: e2e.ok === true,
  zeroKnownRawPiiEgress: e2e.egressStatus === "verified_zero",
  dangerousTaskScopeFalseAllows: e2e.adversarialScope === "unrelated cloud action blocked",
  crossOriginCapabilityIsolation: e2e.crossOriginCapability === "blocked",
  blockPolicyExclusion: e2e.blockedFieldPolicy === "password omitted from safe context",
  visualConfirmation: e2e.visualActionPolicy === "all visual clicks require local confirmation",
  visualContextTargetsRecovered: e2e.visualRecoveredTargets === e2e.visualExpectedTargets && e2e.visualExpectedTargets >= 3,
  visualSensitiveLinesMasked: e2e.visualMaskCoveragePct >= 100 && e2e.visualDetectedSensitiveLines > 0,
  mockEndToEndTaskUnder500Ms: e2e.mockTaskLatencyMs < 500,
  domainPolicy: e2e.domainPolicy === "blocked origin enforcement verified",
  completeGraphs: benchmarks.results.every((item) => item.graphComplete === true && Number(item.pendingScanNodes || 0) === 0),
  incrementalMutationOnly: benchmarks.results.every((item) => item.changed === 10 && item.reprocessed === 10),
  warmStructuredP95WithinBudget: maxWarmP95Ms < warmP95BudgetMs,
  contextBuildUnder50Ms: maxContextBuildMs < 50,
  largePageReductionAtLeast70Pct: minLargePageReductionPct >= 70,
  graphApproxUnder20MbAt20k: maxGraphApproxMb <= 20
};

const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model || "unknown",
    logicalCpus: os.cpus().length,
    systemMemoryGb: Number((os.totalmem() / 1024 ** 3).toFixed(1))
  },
  scope: {
    pii: "Generated synthetic regression corpus. Not a real-world accuracy estimate.",
    browser: "Local deterministic fixtures in a clean temporary Chromium profile.",
    latency: "Warm runtime-message round trip measured inside the browser with performance.now(). Debugger discovery/result transfer, cold initial scan and OCR are reported separately."
  },
  pii,
  e2e,
  benchmarks,
  sihCriteria: {
    piiDetection: {
      metric: "precision / recall / F1 on generated held-out regression cases",
      value: { precision: pii.precision, recall: pii.recall, f1: pii.f1, cases: pii.cases },
      limitation: "Synthetic deterministic corpus; not a real-world population estimate."
    },
    visualContextAccuracy: {
      metric: "labelled canvas text targets recovered by local OCR",
      value: { recovered: e2e.visualRecoveredTargets, expected: e2e.visualExpectedTargets, recall: Number((e2e.visualRecoveredTargets / e2e.visualExpectedTargets).toFixed(3)) },
      limitation: "Single controlled browser fixture."
    },
    visualRedaction: {
      metric: "OCR-detected sensitive lines covered by local screenshot masks",
      value: { detectedSensitiveLines: e2e.visualDetectedSensitiveLines, masks: e2e.visualRedactions, coveragePct: e2e.visualMaskCoveragePct },
      limitation: "Coverage of detected lines, not independent pixel-level precision."
    },
    latency: {
      metric: "warm context p95 / local OCR / mock-provider task loop",
      value: { warmContextP95Ms: Number(maxWarmP95Ms.toFixed(2)), warmP95BudgetMs, visualOcrMs: e2e.visualOcrMs, mockTaskLatencyMs: e2e.mockTaskLatencyMs },
      limitation: "Local machine and deterministic fixtures; network and debugger transport are excluded. Hosted CI retains a 300 ms scheduling budget; developer runs use 50 ms."
    },
    resourceUse: {
      metric: "estimated in-memory privacy graph at the largest 20k-node fixture",
      value: { maxGraphApproxMb: Number(maxGraphApproxMb.toFixed(2)), largestFixtureNodes: Math.max(...benchmarks.results.map((item) => item.nodes)) },
      limitation: "Graph estimate, not whole-browser process memory."
    }
  },
  summary: {
    maxWarmP95Ms: Number(maxWarmP95Ms.toFixed(2)),
    warmP95BudgetMs,
    maxContextBuildMs: Number(maxContextBuildMs.toFixed(2)),
    minLargePageReductionPct: Number(minLargePageReductionPct.toFixed(1)),
    maxGraphApproxMb: Number(maxGraphApproxMb.toFixed(2)),
    allGatesPassed: Object.values(gates).every(Boolean)
  },
  gates
};

const reportPath = path.join(artifacts, "evaluation-report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const rows = benchmarks.results.map((item) =>
  `| ${item.nodes.toLocaleString()} | ${Number(item.warmP50Ms).toFixed(1)} ms | ${Number(item.warmP95Ms).toFixed(1)} ms | ${Number(item.debuggerRoundTripP95Ms).toFixed(1)} ms | ${Number(item.contextBuildMs).toFixed(1)} ms | ${item.reductionPct}% | ${item.changed}/${item.reprocessed} |`
).join("\n");
const gateRows = Object.entries(gates).map(([name, passed]) => `| ${name} | ${passed ? "PASS" : "FAIL"} |`).join("\n");
const summary = `# Evaluation summary

Generated: ${report.generatedAt}

This report uses synthetic local fixtures. The PII score is a regression score for the deterministic rules, not a real-world accuracy claim.

## Headline results

- Synthetic PII corpus: ${pii.cases.toLocaleString()} cases, ${pii.fp} false positives, ${pii.fn} false negatives.
- Browser E2E: ${e2e.ok ? "pass" : "fail"}. Known task canaries reached the provider only after local tokenization.
- Visual context: ${e2e.visualRecoveredTargets}/${e2e.visualExpectedTargets} labelled canvas targets recovered; ${e2e.visualMaskCoveragePct}% of OCR-detected sensitive lines masked locally.
- Mock-provider task loop: ${e2e.mockTaskLatencyMs} ms; local visual OCR: ${e2e.visualOcrMs} ms.
- Worst warm p95 across 1k, 5k, 10k, and 20k pages: ${report.summary.maxWarmP95Ms} ms.
- Warm p95 budget for this run: ${warmP95BudgetMs} ms. Measured inside the browser; debugger transport is reported separately below.
- Worst context-build time after the benchmark mutation: ${report.summary.maxContextBuildMs} ms.
- Minimum context reduction for 5k+ pages: ${report.summary.minLargePageReductionPct}%.
- Largest measured local graph estimate: ${report.summary.maxGraphApproxMb} MB.

## Page benchmarks

| Generated nodes | Warm p50 | Warm p95 | Including debugger p95 | Context build | Context reduction | Changed/reprocessed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Release gates

| Gate | Result |
| --- | --- |
${gateRows}
`;
const summaryPath = path.join(artifacts, "EVALUATION-SUMMARY.md");
fs.writeFileSync(summaryPath, summary);

console.log(JSON.stringify({
  ok: report.summary.allGatesPassed,
  reportPath,
  summaryPath,
  summary: report.summary,
  gates
}, null, 2));

if (!report.summary.allGatesPassed) process.exitCode = 1;
