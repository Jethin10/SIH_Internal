# Inspection and architecture map

Inspected 2026-09-09. Local checkout: `C:\SIH'`. HEAD: `9074e9ca4cc2a2434b356ba67ece109548683266`, branch `codex/voice-live-agent`.

## GitHub and inspection scope

Origin is https://github.com/Jethin10/SIH_Internal. GitHub PR 1 is merged; PR 2, "Run general browser tasks through the privacy gateway", is open. The remote compare reports the feature branch 6 commits ahead and 3 behind main. No fetch, merge, commit, or push was performed during inspection. Local remote refs can therefore be older than the API results.

Listed the account's available repositories and inspected SIH's root, branches, PR metadata/files, and issue listing. HackEyes' root/readme describes a hackathon tracker, not this runtime. Other account repositories were inventoried, not deeply code-audited. The task-relevant source is SIH_Internal. No claim of a complete security audit of the entire GitHub account is made.

Read the root README, existing HANDOFF, architecture material, extension manifests/package/CI, runtime paths, privacy/security/coverage/status/development material, provider server, packaging, and relevant policy/egress/OCR/agent tests. Inspected the team-hub page: it is a static learning/ownership map, not the privacy runtime. Vendor Tesseract bundles, old tmp copies, ZIP/XPI releases, presentation binaries, and rendered artifacts are historical/dependency material, not alternate implementation roots. They were inventoried rather than individually audited.

Pre-existing changes: HANDOFF.md modified; untracked flight-live and web-agent-live JSON/PNG artifacts and tests/run-flight-live.js. Preserve them. Existing personal-site screenshots may contain private data; do not publish them as migration evidence.

## Current runtime

| Area | Current ownership | Migration disposition |
| --- | --- | --- |
| `extension/lib/pii.js` | Deterministic/contextual detection, redaction, AliasVault, scope/expiry/use/field restrictions | Reuse as privacy core; do not duplicate in Python |
| `extension/content/content-script.js` | DOM/ARIA/open-shadow observation, incremental graph, local raw inventory, aliases, target mappings, execution and risk checks | Separate browser mechanics from core policy in small steps |
| `extension/background/service-worker.js` | Settings/secrets, task registration, frames, OCR coordination, context aggregation, egress, provider prompts/fetch, custom planning loop, confirmations, receipts | Main extraction seam; keep orchestration until covered replacements exist |
| `extension/background/agent-runtime.js` | Planner context ranking/budget, Groq tuning, flight URL | Legacy planner helpers; move general minimization to core later |
| `extension/background/runtime-overrides.js` | Actual Chrome entrypoint; overrides globals and fetch | Remove global transport coupling only after equivalent tests |
| `extension/lib/action-policy.js` | Action allowlist and response schema | Reuse for every agent |
| `extension/lib/action-risk.js`, `domain-policy.js` | Risk/approval and domain rules | Reuse and centralize in core proposal processing |
| `extension/visual/offscreen.js`, browser adapters | Bundled Tesseract and local PNG masking | Trusted local vision; pixels remain local |
| `extension/sidepanel/` | Task/provider settings, raw-local preview, safe context, approvals, receipts, voice | Thin local privacy dashboard; separate agent from model selection |
| `extension/server/server.js` | Deterministic OpenAI-compatible demo and optional upstream proxy | Preserve legacy demo; not currently an agent protocol server |
| `extension/tests/` | Unit, VM extraction tests, synthetic browsers, provider harnesses | Preserve; add protocol and bypass tests |
| `strawhats-team-hub/` | Static team knowledge application | Update product story after implementation |

Current flow: content-script vault redacts local graph -> background aggregates frames and OCR -> compact context and egress check -> OpenAI-compatible provider -> strict action schema -> task scope -> content-script target/version/capability/risk check -> local execution/confirmation.

`collectContext` returns safeContext beside localPreview and egressInventory. That combined object is trusted-local data and must never become an adapter response. `remotePlan` currently performs both context inspection and final body inspection. `planAction` chooses hosted or local custom planning; `runSession` owns the browser loop. These are different responsibilities despite sharing one file.

## Findings that affect the pivot

- AliasVault keeps plaintext values in Maps. Session storage keeps profile and provider keys. No application-level encrypted vault was identified. Random aliases are not encryption.
- Full settings are sent to frames by SYNC_SETTINGS. Core extraction should minimize this payload and retain provider keys exclusively in transport ownership.
- Frame collection catches missing frame errors and continues; graph completeness is reported but not a strict external-observation gate. A new external protocol must not inherit partial-observation success silently.
- Current context compaction passes `page`, `opaqueRegions`, and capability metadata largely through. Replace that with explicit protocol fields before external adapters.
- The egress check covers known values and recognizer patterns. It cannot discover arbitrary unknown secrets. The independent corpus recall is now 88/99 (was 42/99 at inspection); weak spots remain bare numbers-as-names, city+country without shape, possessives, and Luhn-invalid card-likes. See PROGRESS.md for the miss inventory.
- The provider fetch now rejects redirects (`redirect: "error"`); the optional server upstream already did.
- `runtime-overrides.js` changes provider request options by replacing global fetch after the worker prepares its body. Final-byte inspection belongs after any adapter/provider transformation.
- Structured and visual execution have valuable stale-state and confirmation checks. Preserve them. Link target mutation to `_self`, synthetic keyboard behavior, task regexes, popup handling, and destination checks need dedicated migration tests.
- Local OCR redacts a copy; the user page is not globally masked. Keep this property. All screenshots stay local in the initial external-agent contract, including masked screenshots.
- Voice recognition may send raw audio to a browser vendor before the extension sees a transcript. It cannot be presented as covered by the strict privacy boundary.
- Several docs reflect earlier demo verification; recorded historic test passes are not current migration evidence. The Firefox background page's missing action-risk script was fixed during migration, but the Firefox runtime itself has still never been exercised.

## Browser Use research

Inspected upstream main revision `2b1f9d377999a59fe7627c1a5aa88c12aa42e11f` through GitHub API on 2026-09-09. Pin a tested release before implementing against it.

Source: https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/agent/service.py

The agent constructor creates a BrowserSession when none is supplied. `_prepare_context` requests `get_browser_state_summary(include_screenshot=True)` even when the model's vision option is disabled. The service has telemetry, cloud-session events, optional file/history and secondary-model paths. A model-call filter alone does not stop raw collection or raw local agent state.

Sensitive-data documentation: https://docs.browser-use.com/open-source/examples/templates/sensitive-data

The documented sensitive-data mechanism is not an agent-isolation boundary. The integration decision is to reuse planning through a restricted adapter with sanitized state and core-owned execution. Stock browser ownership is incompatible with the requested raw-data boundary. Feasibility of a supported planning-only seam remains to be tested; no Browser Use integration is claimed yet.
