# Project status

Status: demo-ready for SIH 26171 as of 5 September 2026.

## Verified deliverables

- Chrome and Firefox Manifest V3 builds with structured page perception, local PII policy, random task capabilities, strict egress inspection, browser actions, confirmations, and receipts.
- Bundled local OCR with a visible on-device redaction preview and pixel-fresh visual action checks.
- OpenAI-compatible local planner server with extension-origin filtering, optional bearer authentication, and bounded HTTPS upstream forwarding.
- Unit, policy, server, clean-profile Chrome E2E, adversarial, large-page, and UI-journey verification.
- Generated report covering all five SIH criteria with limitations beside each measurement.
- Separate root-manifest Chrome, Firefox, and source packages with SHA-256 verification; Firefox package passes Mozilla `web-ext` with zero errors.
- Six-minute demo script, one-command local demo startup, team knowledge map, and versioned release archive.

## Latest verified evidence

- `npm test`: pass.
- `npm run evaluate`: all release gates pass.
- Worst warm structured-context p95: see the generated evaluation summary for the current machine run.
- Minimum context reduction for 5,000+ generated nodes: 90.6%.
- Estimated privacy-graph size at 20,000 generated nodes: 4.02 MB.
- Visual fixture: 3/3 labelled Canvas targets recovered and every OCR-detected sensitive line masked.
- Real UI journey: private fill, verified-zero planner egress, visual masks, block and allow-once paths, secret clearing, receipt clearing, and settings persistence pass in a clean Chromium profile.
- Mozilla `web-ext` lint: zero errors and three warnings, all inside the bundled Tesseract runtime's use of the JavaScript `Function` constructor.
- GitHub Actions repeats extension tests, UI journeys, evaluation gates, release packaging, Firefox lint, and the team-hub production build on every push and pull request.

## Boundaries that must remain explicit

This is a defensible hackathon MVP, not a production security certification. Firefox is packaged and schema-linted but has not been runtime-tested on this machine. The team has not completed broad real-world PII/vision benchmarks, privileged browser surfaces, browser-store signing/review, enterprise administration, or an independent security review.
