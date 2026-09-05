# SIH 26171 evaluation card

Use the generated values in `artifacts/EVALUATION-SUMMARY.md` during judging. Run `npm run evaluate` on the presentation machine immediately before the event so every number matches that machine.

| Criterion | What is measured | Evidence | Honest boundary |
| --- | --- | --- | --- |
| PII detection | Precision, recall, and F1 across 1,254 generated regression cases covering ten deterministic identifiers | `tests/pii-eval.js` | Synthetic rule coverage, not population accuracy |
| Visual context accuracy | Recovery of three labelled targets rendered only inside a Canvas | Browser E2E | One controlled fixture, not a broad CV benchmark |
| Visual redaction | Percentage of OCR-detected sensitive lines receiving an on-device screenshot mask | Browser E2E and redacted preview | Detection coverage, not independent pixel-level precision |
| Latency | Warm structured-context p95, local OCR time, and full mock-provider task loop | CDP benchmark and browser E2E | Local machine; internet latency excluded |
| Resource use | Estimated privacy-graph memory through a 20,000-node page | CDP benchmark | Graph estimate, not whole-browser process memory |

Do not say “100% real-world accuracy,” “zero data can ever leak,” or “production ready.” Say: “All automated release gates pass on our controlled evaluation; the limitations are stated beside every metric.”

The separate contextual challenge (`npm run test:privacy`) reports all misses and false positives in `artifacts/pii-contextual.json`. It currently contains 31 synthetic English/Hindi, formatting, OCR-error-text, and negative cases, with 94.7% precision and 75% recall. This score is not combined with the generated 1,254-case regression score and is not a real-world population estimate. A genuine held-out dataset, OCR engine evaluation across varied images, and whole-browser CPU/memory measurements on a second machine remain future evidence work.
