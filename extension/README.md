# StrawHats Privacy Gateway

Hackathon-ready Chrome and Firefox Manifest V3 prototype for SIH 26171. It is a generic browser privacy layer that mediates what an AI browser agent can see and do.

## What is implemented

- Push-to-talk task input with transcript review, permission-error recovery, and optional spoken completion status.
- OpenAI-compatible provider presets for OpenRouter, Groq, OpenAI, custom endpoints, and the offline planner. Add your own key later.
- A live Google Flights demo launcher with route/date validation and automatic model-driven search in its new tab.
- Configurable 10/30/50-step agent runs, cancellation checks after model responses, and product comparison and security sections in the panel.

See [LIVE-AGENT.md](LIVE-AGENT.md) for provider setup, voice data use, and the live flight demonstration. Live cloud inference and microphone capture require verification with your own key and device.

- Generic DOM, form, ARIA, open Shadow DOM, dynamic-page, and permitted iframe perception on HTTP and HTTPS pages.
- An in-memory incremental privacy graph with semantic element IDs, content hashes, versions, mutation batching, and immediate flushes at egress and execution boundaries.
- Capturing `input` and `change` listeners so user-entered values cannot bypass graph updates.
- Local deterministic detection for email, Indian phone, PAN, checksum-valid Aadhaar, UPI, payment cards, IFSC, passport, voter ID, JWT, IPv4, password/secret fields, and user-profile values.
- Task relevance and `KEEP`, `TOKENIZE`, `DROP`, and `BLOCK` disclosure decisions.
- Cryptographically random 96-bit, task-scoped private aliases with origin isolation, destination-field checks, expiry, action constraints, and use limits.
- A final outbound check against the complete sensitive-value inventory that blocks known raw private values or recognizer-detectable PII before a provider request.
- A strict action schema. Arbitrary JavaScript, arbitrary URLs, unknown fields, missing versions, and unsupported keys are rejected.
- Generic click, fill, select, press, focus, scroll, wait, history-back, and link-navigation behavior.
- A local firewall with target and version revalidation, disabled/type checks, form-semantic risk checks, and allow-once confirmation for high-risk actions.
- Local action receipts shown in the side panel.
- Fully local Tesseract OCR for opaque Canvas, WebGL, video, embedded document, and similar visible regions, plus a locally generated screenshot preview with detected sensitive lines visibly masked.
- Visual actions restricted to OCR text inside known opaque regions, with page-epoch and exact visible-pixel freshness checks before execution and again after confirmation.
- Navigation-boundary enforcement that discards stale context, visual observations, pending confirmations, and private capabilities when the page origin changes.
- An included OpenAI-compatible local planner server for an internet-free demo, with optional authenticated upstream proxy mode, extension-origin checks, HTTPS enforcement, strict request limits, and timeouts.
- Separate root-manifest Chrome and Firefox packages, a Firefox background-page/side-bar adapter, reproducible checksums, archive verification, and Mozilla `web-ext` linting.
- Session-only storage for provider API keys and the private profile. Persistent extension storage contains only the alias seed, endpoint, model name, and non-sensitive preferences.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this `extension` directory.
5. Reload pages that were already open.
6. Click the extension action to open the side panel.

## Install in Firefox

1. Run `npm run release`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `StrawHats_Privacy_Gateway_v1.0.0-Firefox.xpi`.
4. Open the extension from Firefox's sidebar.

Temporary loading is suitable for the hackathon. Normal distribution requires Mozilla signing.

The in-extension fallback planner handles direct click, search, scrolling, history-back, and saved-profile fill commands. For the included server, run `npm run server`, set the endpoint to `http://127.0.0.1:8787/v1/chat/completions`, model to `local-demo`, and leave the key blank. If `UPSTREAM_ENDPOINT` is configured, set `PLANNER_TOKEN` and enter that same token as the extension API key. The server rejects non-HTTPS upstreams except loopback URLs. An HTTPS OpenAI-compatible endpoint can also be used directly. The API key and private profile last only for the current browser session.

For the offline judge demo, run `npm run demo`. It starts the planner on port 8787 and the synthetic checkout fixture on port 8765. Follow [DEMO.md](DEMO.md) for the tested six-minute sequence.

## Verify

Use Node 22 LTS and run the suite from this directory on macOS, Windows, or Linux:

```sh
npm ci
npm run setup:browsers
npm test
npm run test:ui
npm run test:provider:harness
npm run evaluate
npm run release
npm run verify:release
npm run lint:firefox
npm run test:firefox
```

`run-e2e.js` starts a clean temporary Chromium profile, loads the unpacked extension, serves the fixture, exercises the real content script and service worker, then closes the browser. `npm run test:ui` drives the actual side-panel controls and captures `artifacts/product-ui.png`. The shared browser resolver uses pinned Playwright Chromium on Intel/Apple Silicon Macs, Windows, and Linux. `CHROME_PATH` may override it with an absolute Chromium or Chrome for Testing executable path; regular Chrome does not support automated extension side-loading. Missing browsers fail promptly before local servers start.

Release, checksum verification, and Firefox lint now use Node scripts. `RELEASE_DIR` optionally selects another artifact output directory. Firefox runtime testing requires a release package and downloads Firefox/geckodriver to Selenium's cache when needed; `FIREFOX_PATH` can select an installed executable. See [DEVELOPMENT.md](DEVELOPMENT.md) for setup, privacy challenge results, and real-model verification.

The end-to-end test covers local secret storage, structured extraction, PII redaction, private-capability filling, user-input freshness, visual OCR and masking, browser actions, incremental mutations, high-risk block and allow-once paths, form-semantic risk detection, strict egress, adversarial task scope, cross-origin isolation, and audit receipt retrieval. `npm run evaluate` produces the five SIH evaluation criteria and all release gates in `artifacts/`. PII evidence keeps the generated regression, hand-authored contextual development corpus, and independently authored Gretel test subset as separate measurements.

For presentation day, use [DEMO.md](DEMO.md), [SIH-EVALUATION.md](SIH-EVALUATION.md), and [TEAM-RESPONSIBILITIES.md](TEAM-RESPONSIBILITIES.md).

## Honest boundaries

Chrome blocks ordinary extension access to browser-internal pages, closed shadow roots, some sandboxed frames, browser-owned PDF viewers, and privileged surfaces. The extension fails without context on those pages instead of sending raw pixels to a cloud model.

The architecture document deliberately places WebMCP, a multilingual local NER model, browser-level accessibility-tree access, typed visual control detection, changed-region OCR, stateless-provider delta transport, remote-desktop support, and enterprise administration beyond the SIH MVP. Those items remain future work and are listed precisely in [ARCHITECTURE-COVERAGE.md](ARCHITECTURE-COVERAGE.md).

No PII detector or OCR engine has perfect recall. The code now enforces the mechanisms the prototype can honestly prove, but it should not be represented as a production security boundary against a compromised browser or operating system.

See [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) before distribution.
