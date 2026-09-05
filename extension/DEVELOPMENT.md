# Development and verification

## Supported environment

Use Node 22 LTS (>=22.13, <23), npm, and the checked-in lockfile. On a Mac with nvm: `nvm install && nvm use`, then `npm ci && npm run setup:browsers`. Browser downloads are cached outside the project. The tests use temporary profiles, never a personal browser profile. On Linux, install required system browser libraries with `npx playwright install --with-deps chromium`.

Regular Chrome can load the extension manually through `chrome://extensions`. Automated extension loading requires the pinned Playwright browser or a `CHROME_PATH` pointing to Chromium/Chrome for Testing. The project intentionally does not silently fall back to regular Chrome, which would produce a misleading content-script failure.

Run `npm test`, `npm run test:ui`, `npm run evaluate`, `npm run release`, `npm run verify:release`, and `npm run lint:firefox`. Node 25 on the current Mac triggers SIGBUS inside the Mozilla linter; Node 22 succeeds. If changing your shell's Node version is inconvenient, `npm exec --yes --package=node@22 -- node scripts/release.js lint` runs just the lint command with Node 22.

## Firefox runtime

Run `npm run release && npm run test:firefox`. Selenium Manager supplies a stable Firefox and matching geckodriver if no `FIREFOX_PATH` is set. The test installs the actual XPI temporarily, loads the extension panel, and exercises safe-context extraction, private fill, local OCR masks, structured and visual confirmation choices, and session cleanup. The test enables browser-chrome automation only in its temporary profile to open the privileged panel URL. It does not modify your normal Firefox installation or profile. Results identify the exact browser version in `artifacts/firefox-runtime.json`.

## Contextual privacy corpus

`npm run test:privacy` evaluates `tests/pii-contextual.json` and writes `artifacts/pii-contextual.json`. These 31 manually authored, synthetic cases include English/Hindi context, grouped phone numbers, multiple entities, harmless numbers, and text representing OCR mistakes. Entity values must be fully recovered; partial matches do not count as true positives. Supported cases gate the test. Every known miss and false positive remains in the total precision/recall, even when it is a documented limitation.

This is separate from the 1,254 generated regression cases. It is not independent, representative field data and is not a claim of real-world accuracy. The OCR-error inputs test the recognizer on corrupted text, not the OCR engine's measured accuracy. Future independently annotated data must not be used to tune the detector before reporting held-out scores.

Current gaps include non-ASCII digits, lowercase/fragmented PAN text, OCR-inserted spaces and letter/digit substitutions, unregistered free-text names, and phone-shaped public counts. Grouped ASCII phone numbers are now supported. Keep broad NER and aggressive OCR normalization out of the safety-critical path until their false positives and retained task utility are measured.

## Real-model verification

First run `npm run test:provider:harness`. This uses the deterministic local planner to verify the browser-to-provider test machinery. Its result is explicitly labelled `offline-harness-only` and is saved separately from real-model evidence.

For an actual model, configure these environment variables locally:

- `UPSTREAM_ENDPOINT`: the provider's complete OpenAI-compatible chat-completions URL, using HTTPS except for loopback endpoints.
- `UPSTREAM_MODEL`: a model available to your account or local model server.
- `UPSTREAM_API_KEY`: the provider credential, if required. Do not put it in a command saved to shell history or commit it to Git.

Then run `npm run test:provider`. It creates a short-lived authenticated loopback proxy and a synthetic email form, asks the real model to fill a vault capability, verifies the actual form value and completed receipt, and checks every outbound planner payload for the fixture's raw canaries and screenshots. It writes only aggregate evidence to `artifacts/provider-live.json`; credentials and payloads are not logged. The test makes real provider requests and may incur the provider's normal usage charges. The report separates complete task time from provider round-trip time (which still combines proxy, network, and inference).

Without endpoint/model configuration, the command exits with instructions. No successful real-model result should be claimed from the offline test. The normal CI job intentionally runs only the offline harness; live provider tests require separately configured credentials and a chosen model.

## Packaging

The portable Node release tool builds Chrome, Firefox, and source archives with root manifests and deterministic entry timestamps. It excludes the other browser's adapter from runtime packages, includes the tooling lockfile in the source archive, and checks SHA-256 values and required contents. Set `RELEASE_DIR` to build into a separate output directory. `tests/tooling.test.js` checks repeatable bytes, corruption rejection, executable overrides, and prompt exit when browser setup is missing.

## Remaining external evidence

A real hosted/local model run awaits provider configuration. Independent real-world PII/OCR datasets, whole-browser CPU/memory measurements on a second machine, and the presentation-laptop rehearsal are still needed. The CI matrix is configuration until its branch is pushed and GitHub executes it; local Mac results do not prove Windows/Linux results for this branch.
