# Development and verification

## Supported environment

Use Node 22 LTS (>=22.13, <23), npm, and the checked-in lockfile. On a Mac with nvm: `nvm install && nvm use`, then `npm ci && npm run setup:browsers`. Browser downloads are cached outside the project. The tests use temporary profiles, never a personal browser profile. On Linux, install required system browser libraries with `npx playwright install --with-deps chromium`.

Regular Chrome can load the extension manually through `chrome://extensions`. Automated extension loading requires the pinned Playwright browser or a `CHROME_PATH` pointing to Chromium/Chrome for Testing. The project intentionally does not silently fall back to regular Chrome, which would produce a misleading content-script failure.

Run `npm test`, `npm run test:ui`, `npm run evaluate`, `npm run release`, `npm run verify:release`, and `npm run lint:firefox`. Node 25 on the current Mac triggers SIGBUS inside the Mozilla linter; Node 22 succeeds. If changing your shell's Node version is inconvenient, `npm exec --yes --package=node@22 -- node scripts/release.js lint` runs just the lint command with Node 22.

## Firefox runtime

Run `npm run release && npm run test:firefox`. Selenium Manager supplies a stable Firefox and matching geckodriver if no `FIREFOX_PATH` is set. The test installs the actual XPI temporarily, loads the extension panel, and exercises safe-context extraction, private fill, local OCR masks, structured and visual confirmation choices, and session cleanup. The test enables browser-chrome automation only in its temporary profile to open the privileged panel URL. It does not modify your normal Firefox installation or profile. Results identify the exact browser version in `artifacts/firefox-runtime.json`.

## Contextual privacy corpus

`npm run test:privacy` evaluates `tests/pii-contextual.json` and writes `artifacts/pii-contextual.json`. These 47 manually authored, synthetic cases include English/Hindi context, grouped and labelled international phone numbers, multiple/repeated entities, harmless numbers, and text representing OCR mistakes. Entity occurrences are compared as a multiset and must be fully recovered; partial matches do not count as true positives. Supported cases gate the test. Every known miss and false positive remains in the total precision/recall, even when it is a documented limitation.

This is separate from the 1,254 generated regression cases. It is development data, not representative field data or a claim of real-world accuracy. The OCR-error inputs test the recognizer on corrupted text, not the OCR engine's measured accuracy.

All 47 development cases now pass. The detector normalizes Devanagari digits without changing source offsets, accepts lowercase/fragmented PAN and OCR-spaced email text, repairs at most two OCR phone ambiguities under a strong phone label, recognizes selected contextual person/address/health labels, propagates a contextual value to repeated occurrences, and suppresses phone-shaped values under explicit public-count language. Broad free-text NER remains outside the deterministic safety path.

## Independent privacy corpus

`npm run test:privacy:independent` evaluates the checked-in `tests/pii-independent.json` snapshot and writes detailed results to `artifacts/pii-independent.json`. The snapshot contains 99 mapped labelled entities and 20 negative documents from the independently authored, Apache-2.0 `gretelai/synthetic_pii_finance_multilingual` test split, pinned at revision `7b844d16738527a04264f50214cb426a4cea0897`. Rows 0–499 were used to understand source conventions; the frozen evaluation selection scans rows 1000–1999 and therefore excludes that source-development window.

Run `npm run import:privacy:independent` only when intentionally refreshing the fixture. The importer checks the upstream revision and stops if it changed, uses fixed label quotas, and records source row/index provenance. Normal tests have no network dependency. The current held-out result is 92/99 (92.9%) exact type-and-value recall, with all 20 source-negative documents clean (100%). Address and phone recall are complete on this subset; the remaining misses are concentrated in ambiguous person labels, a bracketed email, a numeric passport value, and card formats outside the project's validation scope. The command gates conservative frozen baselines so later changes cannot silently reduce them.

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

A real hosted/local model run awaits provider configuration. Representative real-world PII/OCR datasets, whole-browser CPU/memory measurements on a second machine, and the presentation-laptop rehearsal are still needed. The external Gretel evaluation is independent but synthetic. The CI matrix is configuration until its branch is pushed and GitHub executes it; local Mac results do not prove Windows/Linux results for this branch.
