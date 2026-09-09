# Migration progress

Updated 2026-09-09 (late evening IST). Read PLAN.md for requirements and phase acceptance criteria, ARCHITECTURE.md for the inspection map. Session entries are newest-first; the phase table is the current truth.

## Phase status

| Phase | State | Evidence |
| --- | --- | --- |
| 0: inspection and plan | Complete within documented scope | ARCHITECTURE.md; local source, GitHub branches/PRs, upstream Browser Use revision inspected |
| 1: shared egress core | Complete | `extension/lib/privacy-egress.js` used by both context aggregation and final provider-body inspection; provider fetch uses `redirect: "error"`; `privacy-egress.test.js`, `planner-egress.test.js` |
| 2: versioned protocol | Complete as implementation; independent review pending | `extension/lib/agent-protocol.js` (protocol v1), `adapters/browser-use/observation.schema.json` + `action.schema.json` (must match JS core — asserted in test), `agent-protocol.test.js`, `browser-use-bridge.test.js` |
| 3: privacy ownership | Partial | SYNC_SETTINGS strips provider keys + agent token (userProfile still broadcast to all frames); top-frame/incomplete-scan gate on the Browser Use path; `taskAllowsAction` same-origin navigate scope with tests; Browser Use path routed through one client (`browser-use-client.plan`); secure-RNG failure already explicit (`randomAliasId` throws); encrypted persistence explicitly deferred (session-only) |
| 4: Browser Use adapter | Complete for the demo slice — synthetic journey PASS and full real-site journey PASS (read-only); broader hardening (traffic capture, second adapter) remains post-demo | `adapters/browser-use/bridge.py` (pinned `browser-use==0.13.10`), `extension/lib/browser-use-client.js`, `extension/scripts/browser-use-bridge.js`, `extension/scripts/browser-use-demo.js`, `extension/tests/run-live-site.js`; `artifacts/browser-use-shopping-harness.json`, `artifacts/live-site-run.json` |
| 5: dashboard selection | Partial | Panel agent selector (legacy / browser-use), `AGENT_OBSERVATION` viewer, receipts, confirmations, session-clear. Missing: withheld-content counts, adapter connection status, export-audit verification |
| 6: integration/release evidence | Not started (unit + adversarial suites aside) | Historical passes do not count as migration evidence |

## What works right now (user-visible)

- `npm run demo:browser-use` opens a disposable Chromium with the extension loaded and the panel in a popup window. Pick agent `browser-use` (pre-paired by the launcher), enter provider model + key in Settings, open any site in the main window, type a task, Run task (Ctrl+Enter works). The agent plans via real Browser Use on sanitized observations, fills private values from local capability tokens, and every action passes the local firewall. The user sees the normal page.
- Proven end-to-end on the synthetic store through the real pinned Browser Use planner: search → results → product → size 9 → cart → four private capability fills → stops before order (`artifacts/browser-use-shopping-harness.json`: `ok:true, privateEmailFilled:true, orderNotSubmitted:true`).
- Proven on the real public web (Wikipedia, live Gemini `gemini-3.6-flash`): full read-only journey PASS — 5 planning steps (fill → click → press → visual_scan → done), navigation boundary reset with capability discard, local OCR scan, and the correct article first sentence returned (`artifacts/live-site-run.json`: `ok:true, steps:5`). Earlier partial runs had also confirmed out-of-scope navigate blocking and 503 retry recovery.
- PII detector: 88/99 independent exact recall, 1.0 clean-negative rate, 100% synthetic corpus, plus additive libphonenumber-js international recall (see session 3c).

## Session log

### Session 3c — libphonenumber-js additive phone recall (2026-09-09, late)

- **Scope (user-approved Part A, strictly additive):** integrate `libphonenumber-js` for international phone recall; existing PHONE rules untouched; benchmark numbers must not drop. Parts B (Presidio-style registry restructure) and C (transformers.js NER toggle) were declined for now.
- Vendored `libphonenumber-js@1.11.19` max-metadata UMD bundle to `extension/lib/vendor/libphonenumber.js` (238 KB; sourceMappingURL comment stripped). Loads as global `libphonenumber` in content scripts/workers and via `require()` in Node — one file, four wiring points: `manifest.json` + `manifest.firefox.json` content_scripts, `service-worker.js` importScripts, `firefox-page.html`.
- `lib/pii.js` gained a soft-failing loader (`libphonenumberActive()` exposed for tests) and an additive candidate stage after `addContextualMatches`: **pass 1** (no default country) accepts only `+country-code` spans that also contain a formatting separator — self-identifying international numbers (`Ship to +31 20 555 0190`, `(+44) 123-456-7890`, extensions `x1234`), while unbroken machine runs like EDIFACT `+3723305085` are rejected; **pass 2** (`IN` default) adds cued Indian landlines (`Call 080-4123-4567`) gated by a validated 32-case cue regex. New candidates never overlap existing spans (priority 6 ties NANP so the fuller `+code` span wins by length; cued pass 4). Inputs >20k chars skip the stage (matcher is ~linear, measured 33 ms @ 116k chars).
- Verification: new `tests/pii-libphonenumber.test.js` (wiring-loud, additive positives, 16 strict negatives, redaction) added to the `npm test` chain. **No regression:** independent fixture stays 88/99 with clean-negative **1.0 / 0 negative FPs** (an initial EDIFACT `+3723305085` FP was caught by the fixture and killed with the separator gate), pii-eval 1000/1000 fp 0, contextual 36/36 exact, full `npm test` (26 commands incl. Playwright e2e) exit 0.
- Pre-existing baseline FPs documented, out of additive scope: bare `[6-9]\d{9}` runs (`Order #9876543210`) and labelled `call … at` with ≤4 filler words (`call the restaurant at 080-4123-4567`) were detected before this change too (verified against an edits-reversed baseline copy that reproduces 88/99 exactly).

### Session 3b — live-site verification + PII detection (2026-09-09, evening)

- **Full live-site journey: PASS.** `node tests/run-live-site.js` with Gemini `gemini-3.6-flash`: 5 real Browser Use planning steps on Wikipedia (fill → click → press → visual_scan → done), boundary reset on navigation, local OCR scan, correct article first sentence in TASK_DONE. Report: `ok:true, steps:5`. This closes the last unproven link of the demo slice.
- Two harness fixes were needed first: (1) default model updated from the retired `gemini-2.5-flash` to `gemini-3.6-flash`; (2) `exposeFunction` re-registration after `panel.reload()` threw "already registered" — Playwright bindings survive reloads, so only the in-page listener is re-registered now.
- A second Gemini key hit free-tier 429 (`generate_content_free_tier_requests`, 20 req/min) — burned by earlier debugging. The extension's 429 retry respects `retry-after` and falls back to rotating `fallbackApiKeys`, so brief windows self-heal within a task. Demo guidance: pace tasks, or set fallback keys in panel Settings.
- The first chat key (exhausted) and this key both passed through chat — both must be rotated after the demo.

### Session 3 — PII detection (2026-09-09)

Baseline on the independent Gretel corpus (`tests/pii-independent.json`, exact type-and-value span matching): **42/99 (42.4%)**, misses concentrated in ADDRESS (19/20), PERSON (21/25), PHONE (9/15). Structured formats (IP, PAN, IFSC, UPI, AADHAAR, VOTER_ID) were already perfect.

End state: **88/99 (88.9%)**, clean-negative rate **1.0** (zero findings on the 20 PII-free documents), synthetic corpus 100% precision/recall with 0 false positives. Per type: ADDRESS 18/20, PERSON 20/25, PHONE 14/15, PASSPORT 7/8, CARD 7/8, EMAIL 14/15, IP 8/8.

Changes in `extension/lib/pii.js`:
- Cue-validated contextual matches now carry `labelledOverride` — the cue, not the India-specific format, is the validator (this alone unblocked most labelled phones/passports/cards).
- Phones: extended cue list (contact-us/call-at verb forms), flexible `(+44)`-style prefixes, extension capture (`x3930`), length gate on base digits, NANP/toll-free cue-less shapes, repeat-copy priority demotion.
- Passport cue accepts whitespace/quote separators with a JS digit gate.
- Card cue tolerates intervening words ("Credit Card Number for Payment:").
- Street addresses: ~40 more suffix words, comma after house number, digit-bearing city/ZIP tails (up to 4) with capital-start and label-word lookaheads, same-line whitespace only (killed the `"1780\n- Street"` false match), no-capitalized-word-after-suffix guard (killed the `"9, 10 Trail Runner"` false match that had broken the shopping journey).
- Cue-gated address variant (requires digits or a suffix word, rejects letterless IPv4-like values).
- PERSON cues `Name/Contact/Seller/Buyer/Paid-to/between/Sincerely` with middle-initial support; line-greeting rule with a blocklist.
- Bracketed-email spans demoted below plain spans (plain detections win overlaps).
- `inspectSerialized` errors carry a safe source tag for known values and a masked type+fragment detail for RAW_PII — diagnosability without echoing secrets.

New tests: `tests/egress-inventory.test.js` (inventory tracks only withheld values; label false positives no longer block clean pages). Baselines raised in `tests/pii-independent.test.js`: recall ≥ 0.80, clean-negative ≥ 0.90, per-type floors (ADDRESS 18, PERSON 20, PHONE 14, PASSPORT 7, CARD 7, EMAIL 14, IP exact).

The 11 remaining misses are structurally unsafe to chase with regex: bare numeric "names", city+country without shape, possessive mid-sentence names, no-cue Italian address blocks, a Luhn-invalid "card", a source-truncated `"1-8"`, a cue-less bare 9-digit passport, a markdown-bracket span artifact (the plain email IS detected), and a span artifact where the full 4-token name IS captured (`"Roy Napoleone Lucrezia Terragni"` vs entity `"Roy"`).

### Session 2 — live-model compatibility and real-site runs (2026-09-09)

- Bridge RULES hardened after live models misbehaved: exactly one action per step, mandatory `expectedVersion`, exact gateway field names (a model sent `text` instead of `value` and batched two actions).
- Timeouts for slow/free-tier models: provider timeout 30s → 150s on the bridge path only; test-harness forward timeout 45s → 140s.
- Live single-step proof via OpenRouter (`nex-agi/nex-n2.5-pro:free`): a real model returned a schema-valid one-action `fill` through bridge `/prepare` → provider → `/complete` (HTTP 200).
- Full live journey on free-tier OpenRouter: blocked by upstream 429 rate limits and >140s queue timeouts — integration evidence, not a code defect. Conclusion recorded: demo on the user's Gemini key, not free-tier OpenRouter.
- Built `extension/tests/run-live-site.js` (read-only Wikipedia task: search → open article → report first sentence → stop). Gemini key passed via process env only, never written to disk.
- Provider 404 diagnosed: `gemini-2.5-flash` is retired for new keys; `gemini-3.6-flash` verified working (HTTP 200).
- Found and fixed a real redaction-gap bug on the live page: `buildContext` inventoried the raw value of every sensitive record, so one ADDRESS false positive on public link text (`"a referendum"`) blocked every outbound request. `egressInventoryFor` now inventories only withheld (tokenized/dropped) values and flagged labels.
- Policy call implemented: same-origin deep-link `navigate` allowed (equivalent to following a locally checked link); cross-origin stays blocked. Covered in `navigation.test.js`.
- Transient 5xx now retried (2s/4s backoff with `PLANNER_WAIT`); 503 recovery observed live.
- `visual_scan` capture failures (inactive tab) are non-fatal: blocked receipt + replan instead of killing the task.
- Harness fixed to the real demo layout (panel in its own popup window so the target tab stays active for visible-tab capture) and to re-register listeners after `panel.reload()`.
- Stray bridge/test-Chrome processes killed; all probe scripts lived in TEMP and were removed.

### Session 1 — pivot, inspection, egress, protocol, adapter, synthetic proof (2026-09-09)

- Wrote the authoritative pivot plan (PLAN.md), inspection map (ARCHITECTURE.md), and this progress file before changing application code.
- Extracted `lib/privacy-egress.js` (nested/escaped/URL-encoded/profile/provider/fallback secret rejection, fixed error codes); wired it into context aggregation and the final provider-body inspection; added `redirect: "error"`; removed the global fetch override; fixed the Firefox background page's missing action-risk script (Firefox runtime itself not exercised).
- Built protocol v1 (`lib/agent-protocol.js` + JSON schemas) and the restricted Browser Use adapter: pinned `browser-use==0.13.10` in `.venv-browser-use`, loopback bridge with per-session pairing tokens, core-owned model transport, no `BrowserSession`/browser handle/telemetry in the adapter process (`browser_session = None`, telemetry env flags off, audit hook denying sockets/subprocess, no access log).
- Panel agent selector (legacy / browser-use) with `AGENT_OBSERVATION` viewer; legacy launcher preserved as fallback.
- Full synthetic shopping journey through the real Browser Use planner: PASS. Full `npm test`: PASS.

## Validation evidence (exact commands, run from `extension/` unless noted)

- `npm exec --yes --package=node@22 -c 'npm test'` → exit 0 (Node 22.23.2; host default is Node 25.6.1). Includes unit, policy, OCR, packaging, and the real-extension adversarial browser suite. Chain now also runs `tests/pii-libphonenumber.test.js`.
- `node tests/pii-independent.test.js` → exit 0: tp 88, fn 11, recall 0.8889, cleanNegativeRate 1.0.
- `node tests/pii-eval.js` → 1000/1000 tp, fp 0.
- `node tests/pii-contextual.test.js`, `privacy-egress.test.js`, `planner-egress.test.js`, `egress-inventory.test.js`, `agent-protocol.test.js`, `navigation.test.js` → all pass.
- `node tests/browser-use-bridge.test.js` → PASS (auth, Origin/host, JS/Python schema match, native planner roundtrip, replay + cancellation + binding).
- `node tests/run-agent-shopping.js --browser-use` → PASS (`ok:true`, `agent:browser-use/0.13.10`, `privateEmailFilled:true`, `orderNotSubmitted:true`).
- `node tests/run-live-site.js` with `GEMINI_API_KEY` (env-only) + `AGENT_MODEL=gemini-3.6-flash` → **PASS: full journey, 5 steps, TASK_DONE with correct article first sentence** (`artifacts/live-site-run.json`: `ok:true`). Run of record for the demo slice.
- `git diff --check` → PASS (only pre-existing CRLF warnings).
- Environment: Windows, Chromium 145.0.7632.6, Python 3.11.15 host with `.venv-browser-use` (`browser-use==0.13.10`), Gemini `gemini-3.6-flash` for live runs.

## Known limitations (do not claim otherwise)

- The detector is deterministic rules: 88/99 on one independent corpus, unknown formats can slip. Strict mode withholds what it cannot verify; it does not promise zero-PII.
- Known-value matching keeps its 3-character minimum; arbitrary encodings of unknown secrets are out of scope.
- `userProfile` is still broadcast to every frame via SYNC_SETTINGS (provider keys and the agent token are stripped). Per-frame minimization is open Phase 3 work.
- Session-only secrets: profile and provider keys live in `chrome.storage.session` plaintext during use. No encrypted persistence by design decision for the demo slice.
- Voice input is disabled on the Browser Use path (browser speech services sit outside the privacy boundary).
- Firefox loads the modules but its runtime was never exercised.
- Telemetry-off and history-containment are true by construction (flags, no browser handle, audit hook) but have no captured-traffic proof yet.
- No second adapter process exists yet; agent-agnosticism is proven at the protocol level (fake-adapter swap test) and by the bridge contract.
- Free-tier OpenRouter is unsuitable for the demo (rate limits, queues). The Gemini key the user pasted in chat was never written to the repo (verified by scan) but must be rotated after the demo since chat is not a secret store.

## Remaining work

### Before the demo (must)

1. ~~**One clean full live-site run.**~~ **DONE (session 3b):** `ok:true, steps:5` on Wikipedia with `gemini-3.6-flash`; artifact `extension/artifacts/live-site-run.json`. Remaining risk is only quota pacing (20 req/min free tier).
2. **Manual panel rehearsal** with `npm run demo:browser-use`: enter model + key in the panel's own Settings (never chat/files), run a read-only task first, then the private-fill flow. Verify confirmations (Allow once), Stop, and the legacy fallback selector.
3. **Rotate the Gemini keys** after the demo (both appeared in chat). Then clear the session (`CLEAR_PRIVATE_SESSION` / Clear session button).
4. **Do not commit/push as demo prep.** 40 dirty/untracked paths on `codex/voice-live-agent`; the remote branch has diverged from main. Reconcile deliberately, separately.

### After the demo (plan remainder, in priority order)

- **Phase 3:** minimize SYNC_SETTINGS to per-frame minimums; extract collectContext/buildContext gates, capability policy, and a single `proposeAction` path behind a privacy-core API (browser calls behind injected adapters); destination-validation migration tests (formaction/formtarget/redirects/popup/back-nav); document secret plaintext lifetime if persistence stays session-only.
- **Phase 4:** captured-traffic proof that telemetry/cloud-sync/screenshots stay off; explicit history/state containment test; a second (even minimal) adapter process on the same protocol; optional native-messaging evaluation.
- **Phase 5:** withheld-content counts, adapter connection status, and export-audit verification in the panel; document the strict-mode voice policy.
- **Phase 6:** multi-page adversarial store (password, URL/attribute tokens, iframe secrets, canvas PII) + injection pages (raw DOM/screenshot/storage/fetch exfiltration); release packaging to a temp dir with recorded versions; README/PRIVACY/SECURITY/PROJECT-STATUS updates.
- **Firefox:** exercise the runtime at least once (loading is fixed; behavior unproven).
- **PII:** Part A (libphonenumber-js international recall) landed in session 3c; floors remain frozen in `tests/pii-independent.test.js`. The 11 documented misses are accepted limitations, not a backlog. Parts B/C (registry restructure, NER toggle) stay declined unless the user asks.

## Demo runbook (tomorrow)

1. `npm run setup:browser-use` once (needs `uv`; reuses `.venv-browser-use`).
2. `npm run demo:browser-use` → disposable Chromium opens; the panel pops out beside it, pre-paired to the bridge.
3. Panel Settings: agent `browser-use` (endpoint/token prefilled), provider preset endpoint for Gemini, model `gemini-3.6-flash`, paste a fresh key, Save settings. Key stays in browser-session storage; the bridge process never receives it.
4. In the main window open the target site and keep that tab active. Type the task, Run task (Ctrl+Enter). Suggested order: read-only lookup → private form fill. Consequential actions pause for Allow-once; Stop always available; login/CAPTCHA/missing-info pause by design.
5. If Browser Use stalls, the legacy agent in the selector is the fallback; the task text is unchanged.
6. Afterwards: Clear session in the panel, close the launcher (kills the bridge), rotate the key.

## Git state

- Branch `codex/voice-live-agent`, HEAD `9074e9c`. ~40 modified/untracked paths; no commits made by agent sessions; nothing pushed, fetched, or merged during this work.
- Live artifacts (`*-live.json/png`, `browser-use-shopping-harness.json/png`) are untracked. Personal-site screenshots may contain private data — never publish them as evidence. Release archives were not regenerated.
