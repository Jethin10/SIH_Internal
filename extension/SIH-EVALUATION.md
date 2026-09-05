# SIH 26171 evaluation card

Use the generated values in `artifacts/EVALUATION-SUMMARY.md` during judging. Run `npm run evaluate` on the presentation machine immediately before the event so every number matches that machine.

| Criterion | What is measured | Evidence | Honest boundary |
| --- | --- | --- | --- |
| PII detection | Generated precision/recall/F1 plus separately reported exact recall and clean-negative rate on an external Gretel test subset | `tests/pii-eval.js`, `tests/pii-independent.test.js` | Both are synthetic; the external subset is independent but not representative field data |
| Visual context accuracy | Recovery of three labelled targets rendered only inside a Canvas | Browser E2E | One controlled fixture, not a broad CV benchmark |
| Visual redaction | Percentage of OCR-detected sensitive lines receiving an on-device screenshot mask | Browser E2E and redacted preview | Detection coverage, not independent pixel-level precision |
| Latency | Warm structured-context p95, local OCR time, and full mock-provider task loop | CDP benchmark and browser E2E | Browser clock measures the runtime-message round trip; debugger discovery and transfer are reported separately; internet latency excluded |
| Resource use | Estimated privacy-graph memory through a 20,000-node page | CDP benchmark | Graph estimate, not whole-browser process memory |

Do not say “100% real-world accuracy,” “zero data can ever leak,” or “production ready.” Say: “All automated release gates pass on our controlled evaluation; the limitations are stated beside every metric.”

The warm request budget is 50 ms locally and 300 ms under CI, with the selected budget recorded in each report. Previous reports included debugger overhead in warm request timings and are not directly comparable. The separate debugger timing retains that diagnostic measurement; context construction still has its own 50 ms gate.

The contextual development challenge (`npm run test:privacy`) contains 36 hand-authored English/Hindi, formatting, OCR-error-text, and negative cases. It now has 31/31 entity recall and no false positives. The independent command (`npm run test:privacy:independent`) uses a checked-in snapshot of 99 mapped labels and 20 negative documents from the Apache-2.0 Gretel test split at revision `7b844d16738527a04264f50214cb426a4cea0897`. It currently reports 42.4% exact recall and a 100% clean-negative rate. The source-development window (rows 0–499) is excluded from the frozen evaluation window (rows 1000–1999). These scores are kept separate from the generated 1,254-case regression score. Representative real-world data, OCR engine evaluation across varied images, and whole-browser CPU/memory measurements on a second machine remain future evidence work.
