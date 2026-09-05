# Evaluation summary

Generated: 2026-09-05T05:44:39.172Z

This report uses synthetic local fixtures. The PII score is a regression score for the deterministic rules, not a real-world accuracy claim.

## Headline results

- Synthetic PII corpus: 1,254 cases, 0 false positives, 0 false negatives.
- Browser E2E: pass. Known task canaries reached the provider only after local tokenization.
- Visual context: 3/3 labelled canvas targets recovered; 100% of OCR-detected sensitive lines masked locally.
- Mock-provider task loop: 91.1 ms; local visual OCR: 647 ms.
- Worst warm p95 across 1k, 5k, 10k, and 20k pages: 5.2 ms.
- Warm p95 budget for this run: 50 ms. Measured inside the browser; debugger transport is reported separately below.
- Worst context-build time after the benchmark mutation: 14 ms.
- Minimum context reduction for 5k+ pages: 90.6%.
- Largest measured local graph estimate: 4.02 MB.

## Page benchmarks

| Generated nodes | Warm p50 | Warm p95 | Including debugger p95 | Context build | Context reduction | Changed/reprocessed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 4.4 ms | 4.8 ms | 9.5 ms | 1.0 ms | 52.7% | 10/10 |
| 5,000 | 4.5 ms | 4.8 ms | 9.1 ms | 3.8 ms | 90.6% | 10/10 |
| 10,000 | 4.3 ms | 4.7 ms | 9.1 ms | 6.8 ms | 95.3% | 10/10 |
| 20,000 | 4.4 ms | 5.2 ms | 9.9 ms | 14.0 ms | 97.7% | 10/10 |

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
