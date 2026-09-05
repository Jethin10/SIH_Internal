# Evaluation summary

Generated: 2026-09-05T06:17:40.659Z

This report uses synthetic data and local browser fixtures. Generated and external PII scores are kept separate; neither is a real-world accuracy claim.

## Headline results

- Synthetic PII corpus: 1,254 cases, 0 false positives, 0 false negatives.
- Independent Gretel test subset: 99 labelled entities plus 20 negative documents; 42.4% exact recall and 100.0% clean-negative rate.
- Browser E2E: pass. Known task canaries reached the provider only after local tokenization.
- Visual context: 3/3 labelled canvas targets recovered; 100% of OCR-detected sensitive lines masked locally.
- Mock-provider task loop: 86.1 ms; local visual OCR: 650 ms.
- Worst warm p95 across 1k, 5k, 10k, and 20k pages: 9.7 ms.
- Warm p95 budget for this run: 50 ms. Measured inside the browser; debugger transport is reported separately below.
- Worst context-build time after the benchmark mutation: 20.7 ms.
- Minimum context reduction for 5k+ pages: 90.6%.
- Largest measured local graph estimate: 4.02 MB.

## Page benchmarks

| Generated nodes | Warm p50 | Warm p95 | Including debugger p95 | Context build | Context reduction | Changed/reprocessed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 4.6 ms | 5.6 ms | 10.0 ms | 1.1 ms | 52.7% | 10/10 |
| 5,000 | 5.2 ms | 8.7 ms | 16.5 ms | 6.5 ms | 90.6% | 10/10 |
| 10,000 | 7.6 ms | 9.5 ms | 17.1 ms | 8.3 ms | 95.3% | 10/10 |
| 20,000 | 8.7 ms | 9.7 ms | 18.1 ms | 20.7 ms | 97.7% | 10/10 |

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
