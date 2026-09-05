# Evaluation summary

Generated: 2026-09-05T04:05:37.732Z

This report uses synthetic local fixtures. The PII score is a regression score for the deterministic rules, not a real-world accuracy claim.

## Headline results

- Synthetic PII corpus: 1,254 cases, 0 false positives, 0 false negatives.
- Browser E2E: pass. Known task canaries reached the provider only after local tokenization.
- Visual context: 3/3 labelled canvas targets recovered; 100% of OCR-detected sensitive lines masked locally.
- Mock-provider task loop: 100.2 ms; local visual OCR: 420 ms.
- Worst warm p95 across 1k, 5k, 10k, and 20k pages: 11.37 ms.
- Worst context-build time after the benchmark mutation: 10.2 ms.
- Minimum context reduction for 5k+ pages: 90.6%.
- Largest measured local graph estimate: 4.02 MB.

## Page benchmarks

| Generated nodes | Warm p50 | Warm p95 | Context build | Context reduction | Changed/reprocessed |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 9.9 ms | 10.7 ms | 1.0 ms | 52.7% | 10/10 |
| 5,000 | 9.2 ms | 11.1 ms | 3.0 ms | 90.6% | 10/10 |
| 10,000 | 9.9 ms | 11.0 ms | 4.9 ms | 95.3% | 10/10 |
| 20,000 | 10.2 ms | 11.4 ms | 10.2 ms | 97.7% | 10/10 |

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
| warmStructuredP95Under50Ms | PASS |
| contextBuildUnder50Ms | PASS |
| largePageReductionAtLeast70Pct | PASS |
| graphApproxUnder20MbAt20k | PASS |
