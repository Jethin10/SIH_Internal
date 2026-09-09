# Evaluation summary

Generated: 2026-09-05T08:36:54.370Z

This report uses synthetic data and local browser fixtures. Generated and external PII scores are kept separate; neither is a real-world accuracy claim.

## Headline results

- Synthetic PII corpus: 1,254 cases, 0 false positives, 0 false negatives.
- Independent Gretel test subset: 99 labelled entities plus 20 negative documents; 92.9% exact recall and 100.0% clean-negative rate.
- Browser E2E: pass. Known task canaries reached the provider only after local tokenization.
- Visual context: 3/3 labelled canvas targets recovered; 100% of OCR-detected sensitive lines masked locally.
- Mock-provider task loop: 87.1 ms; local visual OCR: 561 ms.
- Worst warm p95 across 1k, 5k, 10k, and 20k pages: 11.6 ms.
- Warm p95 budget for this run: 50 ms. Measured inside the browser; debugger transport is reported separately below.
- Worst context-build time after the benchmark mutation: 22.4 ms.
- Minimum context reduction for 5k+ pages: 90.6%.
- Largest measured local graph estimate: 4.02 MB.

## Page benchmarks

| Generated nodes | Warm p50 | Warm p95 | Including debugger p95 | Context build | Context reduction | Changed/reprocessed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 9.7 ms | 11.6 ms | 23.9 ms | 1.4 ms | 52.7% | 10/10 |
| 5,000 | 5.9 ms | 8.4 ms | 16.0 ms | 4.1 ms | 90.6% | 10/10 |
| 10,000 | 7.7 ms | 10.1 ms | 19.9 ms | 8.9 ms | 95.3% | 10/10 |
| 20,000 | 9.1 ms | 10.4 ms | 19.9 ms | 22.4 ms | 97.7% | 10/10 |

## Release gates

| Gate | Result |
| --- | --- |
| syntheticPiiRegression | PASS |
| independentPiiBaseline | PASS |
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
