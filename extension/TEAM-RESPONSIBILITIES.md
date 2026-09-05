# Team knowledge map for judges

Every area has three members. These are knowledge responsibilities, not hierarchy titles; each person should be able to explain the area, demonstrate it, and answer likely judge questions.

## Frontend and judge-facing experience — Jethin, Shubhangi, Shreya

Learn the side-panel information flow, Chrome MV3 side panels, accessible HTML/CSS, loading/error/confirmation states, raw-versus-safe visualization, local redacted preview, responsive layout, and the complete live-demo sequence. Be ready to explain why the interface shows evidence instead of vague “secure” claims.

## Privacy graph and PII pipeline — Ishu, Divyam, Maan

Learn DOM/ARIA extraction, open Shadow DOM and iframe coverage, stable element IDs, mutation batching, node versions, task relevance, `KEEP`/`TOKENIZE`/`DROP`/`BLOCK`, deterministic Indian-identifier rules, checksum validation, false positives versus false negatives, and the limits of the synthetic corpus.

## Planner, server, and egress security — Jethin, Divyam, Maan

Learn the safe planner payload, local versus upstream server modes, OpenAI-compatible request shape, complete sensitive-value inventory, final egress inspection, strict JSON parsing, request/response size limits, timeout behavior, task-scope validation, HTTPS policy, and why raw secrets never belong in provider logs.

## Local execution and action firewall — Ishu, Jethin, Shubhangi

Learn the action schema, target/version revalidation, field-type checks, private-capability resolution, expiry/use limits, visual freshness check, risky form semantics, allow-once confirmation, navigation invalidation, blocked actions, and privacy receipts. Prepare to demonstrate both block and allow paths.

## Visual perception and redaction — Divyam, Maan, Shreya

Learn why Canvas/WebGL/PDF-like surfaces are opaque to DOM extraction, how local Tesseract OCR works, OCR confidence and bounding boxes, opaque-region binding, screenshot hashing, on-device masks, cold versus warm OCR cost, and why this MVP claims controlled OCR coverage rather than general computer vision.

## Testing, evaluation, and evidence — Ishu, Shubhangi, Shreya

Learn the unit tests, clean-profile Chrome E2E harness, mock-provider canaries, adversarial task test, cross-origin capability test, 1k–20k page benchmark, all five SIH metrics, release gates, and every stated limitation. Anyone quoting a number should know exactly which fixture produced it.

## Packaging, setup, and presentation recovery — Jethin, Maan, Shubhangi

Learn unpacked-extension installation, local server startup, endpoint configuration, `npm test`, `npm run evaluate`, `npm run release`, checksum verification, Chrome reload requirements, offline fallback, and the recovery steps in `DEMO.md`.

## Shared minimum knowledge for all six

Everyone must be able to answer these five questions in under 30 seconds each:

1. What leaves the device? Only the minimized safe task/context after the final local egress inspection; screenshots and raw private values remain local.
2. What stops a harmful action? A strict action schema, task-scope check, fresh target/version validation, semantic risk rules, and local confirmation.
3. What happens after navigation? Visual state and pending confirmation are cleared; an origin change rotates the task scope and capabilities.
4. What is genuinely measured? The five criteria listed in `SIH-EVALUATION.md`, on synthetic/local fixtures with limitations stated.
5. What is not finished as a production product? Broad real-world PII/vision benchmarks, Firefox packaging, privileged browser surfaces, enterprise administration, and third-party security review.
