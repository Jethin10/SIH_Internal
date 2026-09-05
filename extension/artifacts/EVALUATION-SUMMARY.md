# Evaluation summary

Generated: 2026-09-05T06:13:15.890Z

This report uses synthetic local fixtures. The PII score is a regression score for the deterministic rules, not a real-world accuracy claim.

## Headline results

- Synthetic PII corpus: 1,254 cases, 0 false positives, 0 false negatives.
- Browser E2E: pass. Known task canaries reached the provider only after local tokenization.
- Visual context: 3/3 labelled canvas targets recovered; 100% of OCR-detected sensitive lines masked locally.
- Mock-provider task loop: 88.5 ms; local visual OCR: 497 ms.
- Worst warm p95 across 1k, 5k, 10k, and 20k pages: 16 ms.
- Warm p95 budget for this run: 50 ms. Measured inside the browser; debugger transport is reported separately below.
- Worst context-build time after the benchmark mutation: 12 ms.
- Minimum context reduction for 5k+ pages: 90.6%.
- Largest measured local graph estimate: 4.02 MB.

## Page benchmarks

| Generated nodes | Warm p50 | Warm p95 | Including debugger p95 | Context build | Context reduction | Changed/reprocessed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 11.2 ms | 16.0 ms | 24.2 ms | 1.6 ms | 52.7% | 10/10 |
| 5,000 | 10.2 ms | 10.6 ms | 15.3 ms | 2.8 ms | 90.6% | 10/10 |
| 10,000 | 10.8 ms | 11.8 ms | 16.9 ms | 5.6 ms | 95.3% | 10/10 |
| 20,000 | 11.1 ms | 12.3 ms | 16.9 ms | 12.0 ms | 97.7% | 10/10 |

## Release gates

| Gate | Result |
| --- | --- |
| syntheticPiiRegression | PASS |
| adversarialBrowserE2E | PASS |
| zeroKnownRawPiiEgress | PASS |
| dangerousTaskScopeFalseAllows | PASS |
| crossOriginCapabilityIsolation | PASS |
| blockPolicyExclusion | PASS |
| visualConfirmation | PASS |
| visualContextTargetsRecovered | PASS |
| visualSensitiveLinesMasked | PASS |
| mockEndToEndTaskUnder500Ms | PASS |
| domainPolicy | PASS |
| completeGraphs | PASS |
| incrementalMutationOnly | PASS |
| warmStructuredP95WithinBudget | PASS |
| contextBuildUnder50Ms | PASS |
| largePageReductionAtLeast70Pct | PASS |
| graphApproxUnder20MbAt20k | PASS |
