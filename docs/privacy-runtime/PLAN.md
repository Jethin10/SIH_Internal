# Privacy runtime pivot

Updated 2026-09-09. This is the authoritative implementation plan for the user's explicit pivot. Read PROGRESS.md next. Historical demo instructions in HANDOFF.md remain useful for reproducing the old agent, but no longer define the product direction.

## Product contract

### Tomorrow's hackathon demo, clarified by the user

The immediate deliverable is a runnable general-purpose Browser Use agent behind this privacy layer. The user opens it, enters a natural-language browsing task, and watches an ordinary browser perform the task. The agent sees sanitized observations; private values remain locally usable through capabilities. Preserve normal page appearance. This must be real Browser Use planning, not a hardcoded task script relabelled as Browser Use.

Prioritize a complete vertical slice for the demo before broad module relocation or encrypted persistence. Keep secrets session-only for this slice. General navigation, search/read, shopping/cart, and private form fill are the representative verification workflows. Pause clearly for login/CAPTCHA, missing information, and consequential confirmation. Arbitrary websites/tasks are a product direction, not an overnight reliability claim.

Demo implementation order: strict protocol and observation-bound actions; restricted Browser Use planner with no browser connection; local authenticated bridge and core-owned model transport; panel agent selection and launcher; synthetic and live read-only verification. Existing local policy/execution functions may remain in their current files if every new agent path goes through them. Phase 3's deeper extraction and encrypted persistence are follow-up work, not prerequisites that delay a safe runnable demo. Missing perception coverage and raw-data bypasses remain release blockers.

Build an agent-agnostic local privacy runtime. Browser Use is the first external agent adapter. Keep the current agent as a selectable legacy demo and fallback. Extract existing modules incrementally; do not replace the application wholesale.

The trusted local runtime owns page observation, PII detection, tokenization, vault operations, disclosure policy, action authorization, destination checks, local confirmation, and audit receipts. The extension supplies browser observation/execution and the privacy dashboard. The user sees the ordinary page, including their own private values. Sanitization changes an agent observation, never the user's rendered page.

An external agent receives only a versioned sanitized observation and returns a proposed action. It receives no raw DOM, raw accessibility tree, screenshots, cookies, storage, credentials, raw task, vault mapping, debugger address, or unrestricted browser handle. Locally resolving a capability into an authorized website field is allowed. Sending that value to an agent or its model is not.

Detection is fallible. The existing independent synthetic corpus reports 42/99 exact entity recall. A passing known-secret check is not proof that arbitrary text contains no personal information. Unsupported, incomplete, or uncertain observations must be withheld in strict mode. Do not claim universal zero-PII protection from regex/OCR or from request counters.

## Resume procedure

1. Read PROGRESS.md and ARCHITECTURE.md. Run `git status --short` and inspect existing changes before editing.
2. Work on the first unfinished task below whose prerequisites are complete. Read its named functions and tests. Keep unrelated user changes.
3. Add an adversarial regression for a privacy boundary before changing that boundary. Use synthetic secrets only.
4. Run the task's focused checks, then the required regression suite. Record exact commands, outcomes, environment, and unresolved failures in PROGRESS.md immediately.
5. Mark a task complete only when its acceptance criteria pass. Record the next file/function and next command before ending work. Another model must not need this chat.
6. Preserve the demo launchers. Do not push, merge, publish, or overwrite release archives as part of this migration. The remote branch has diverged from main; reconcile only as a separate deliberate step.

## Target boundaries

`normal browser -> trusted browser adapter -> privacy core -> sanitized observation -> agent adapter -> proposed action -> privacy core firewall -> trusted browser adapter`

The dashboard receives a separate local view. Never serialize a dashboard object into agent traffic. Provider authentication belongs to the local transport; credentials are allowed only in the intended provider's authentication header. The external-agent transport has separate authentication and never receives provider keys as observation data.

Logical modules may initially live under `extension/lib/` so existing browser packaging includes them. Browser-independent modules must have no Chrome, DOM, provider SDK, or Browser Use imports. Existing global/CommonJS dual exports are an acceptable migration mechanism.

## Phase 0: inspection and durable decisions

- Map active local source, GitHub branches/PRs, docs, tests, packages, and old generated artifacts. Record inspected scope rather than claiming every account repository was audited.
- Inspect Browser Use source at a fixed revision, including state collection, tools, screenshots, secondary models, telemetry, history, and cloud sync.
- Record preserved modules, extraction seams, existing limitations, and prerequisites below.
- Done when ARCHITECTURE.md contains evidence paths and PROGRESS.md identifies the first code task. No application code before these documents.

## Phase 1: extract the existing egress boundary

Prerequisite: phase 0.

1. Extract reusable outbound inspection from `background/service-worker.js` into `lib/privacy-egress.js`. Reuse `lib/pii.js`; do not create another detector. Inspect complete serialized request bodies, nested strings, known profile/graph secrets, provider keys, and fallback keys. Use fixed error codes without echoing secrets. Keep task aliases intact.
2. Make both existing context inspection and the final provider request use the extracted module. Add `redirect: "error"` to the provider fetch so a checked request cannot silently change destination.
3. Load the module in Chrome and Firefox. Retain legacy `assertEgressSafe` as a compatibility wrapper while callers migrate.
4. Add tests for nested leaks, encoded values, capability aliases, unknown secrets detected by PII rules, provider keys, and rejected redirects. Confirm existing planner/history/OCR tests still pass.
5. Run `npm test` and `npm run test:agent` from extension. Record any pre-existing failures separately.

Done when the existing demo uses the extracted boundary in a real browser test. This phase alone does not constitute an external-agent sandbox or a complete privacy core.

## Phase 2: define the agent-independent protocol

Prerequisite: phase 1.

Create `lib/agent-protocol.js` with a strict allowlist and a matching JSON schema. Freeze protocol version 1. Use the existing action schema from `lib/action-policy.js`.

- Request: protocolVersion, sessionId, observationId, safeTask, page identity, allowed element records, capability descriptors, minimized action results, supported actions. All strings pass core inspection. No arbitrary nested passthrough objects.
- Response: protocolVersion, sessionId, observationId, one proposed action. Reject unknown fields, oversized messages, image/data URLs, raw HTML, tool calls, scripts, unsupported actions, and mismatched identifiers.
- Keep DOM element mappings, vault values, raw previews, OCR pixels, and full audit logs on the core side. Expose opaque target IDs with versions, never CSS/XPath or CDP node handles.
- Bind proposals to the session, document, frame, observation, and target version. Replayed, expired, cross-frame, and cross-origin proposals fail closed.
- Serialize once, inspect that exact serialization, and send those same bytes. Apply a UTF-8 byte limit including all metadata, not JavaScript character counts.

Tests: roundtrip valid observations and every action; reject additional properties, stale session/observation, unknown targets, UTF-8 overflow, raw DOM/screenshots, and nested secret injection. Swap two fake planner adapters without changing privacy code.

## Phase 3: move privacy ownership out of the coordinator

Prerequisite: phase 2.

Extract cohesive functions, with existing behavior tests, from content-script.js and service-worker.js. Keep browser calls behind injected adapters.

1. Separate sanitized observations from local diagnostics in `collectContext` and `buildContext`. Require top-frame acknowledgement and explicit frame coverage. Missing or pending scans cannot produce a strict-mode external observation.
2. Put task/profile registration and capability policy behind a privacy-core API. Stop broadcasting full settings, including provider keys, to every content script. Give each frame only its authorized minimum.
3. Put action validation, task scope, freshness, destination policy, confirmation state, and capability resolution behind one `proposeAction` path. Route legacy and external adapters through it.
4. Validate observed link/form destinations before execution, including `formaction`, `formtarget`, redirects where enforceable, and navigation transitions. Check popup adoption and back navigation. A post-navigation check alone is insufficient.
5. Replace cryptographic-token fallback to Math.random with an explicit failure if a secure RNG is unavailable. Add vault clear/revoke lifecycle tests.
6. Implement encrypted persistence only if persistence is required: AES-GCM with unique nonce, authenticated context, and a key protected by a local OS-backed service or explicit unlock secret. Never store the decryption key beside ciphertext. Session-only memory is not encrypted storage. Document the remaining plaintext lifetime during authorized use.

Tests: frame isolation, scan incompleteness, cancellation/restart, stale confirmations, token expiry/use limits, wrong semantic field, malicious destination changes, unchanged user-visible text/layout, private fill only at the intended site. Keep existing synthetic shopping and OCR journeys passing.

## Phase 4: Browser Use integration without raw-browser access

Prerequisites: phases 2 and 3. Pin and test an exact Browser Use release/revision. Initial inspected revision is recorded in ARCHITECTURE.md; it is not yet an installed dependency.

Do not hand stock `Agent.run()` a real browser, personal profile, CDP URL, or raw `BrowserSession`. `use_vision=False` and `sensitive_data` alone do not satisfy this contract.

First implement a narrow feasibility test under `adapters/browser-use/`: use Browser Use's planning/message/action facilities against a synthetic sanitized observation and a tools registry containing only privacy-runtime actions. Determine whether a supported planning-only seam exists in the pinned revision. If not, maintain a small explicit adapter/subclass with tests, or a sanitized virtual session. Do not silently fall back to native browser observation.

The adapter must request observations and propose actions through the versioned interface. Its tool registry has no evaluate, raw DOM, screenshot, cookies, downloads, filesystem, shell, HTTP fetching, or direct browser actions. One action per observation avoids stale multi-action plans. Browser Use state/history contains sanitized data only.

Run the adapter as a separate local process. Prefer an authenticated extension-initiated loopback bridge with strict Host/Origin checks, size limits, request expiry, cancellation, and per-session pairing. Evaluate native messaging if loopback exposes unnecessary attack surface. Agents must not have the browser's debugging capability. A process running as the same unrestricted OS user is not a hostile-code sandbox; document and test any stronger isolation claim separately.

Disable telemetry, cloud session sync, conversation recording, GIF/screenshot capture, file-based agent memory, judge/extraction side models, and plugin tools before initialization. Verify destinations with captured network requests, not flags alone. Keep credentials in the core-owned transport where feasible; all auxiliary model calls must traverse the same inspection boundary.

Acceptance: actual pinned Browser Use produces actions in a synthetic real-browser journey through the extension; malicious raw-state requests fail before capture; no raw fixture values/images/cookies appear in adapter inputs, model requests, logs, files, or telemetry. A fake Browser Use adapter test is not integration evidence.

## Phase 5: dashboard and demo selection

Prerequisite: phase 4.

Add an agent selector with Browser Use and Legacy demo. Keep provider/model selection separate from agent selection. The dashboard shows what the agent received, withheld content counts, adapter connection, pending approvals, and sanitized receipts. Avoid displaying raw local secrets unless an explicit local reveal is required.

Preserve the normal browser view. Test that observation causes no changes to page text, input values, layout, focus, or scroll. Intentional approved actions may change the page. Disable or replace browser-vendor speech recognition in strict mode because its audio upload happens before transcript sanitization.

Acceptance: start, cancel, disconnect/reconnect, block, and allow-once work through UI. Legacy launcher still works. No private data appears in exported evidence.

## Phase 6: adversarial integration and release evidence

Prerequisites: all prior phases.

Use a multi-page local store with synthetic name, email, phone, address, password, tokens in URLs/attributes, iframe secrets, and canvas PII. Test navigation, search, product selection, private fill, and blocked order followed by explicit local allow-once on the fixture. Capture outbound payloads at the adapter and provider boundaries.

Add injection pages requesting raw DOM, screenshots, storage, arbitrary fetch, and secret exfiltration through URLs and form destinations. Cover errors, retries, secondary models, logs, and reconnects. Test fresh observations after same-origin document replacement and cross-origin navigation. Verify unchanged user presentation before actions.

Run the supported Node version, focused protocol/core/adapter tests, full extension suite, real-browser integration, and build/package checks to a temporary release directory. Record exact Python, Browser Use, browser, Node, and OS versions. Only then rehearse an authorized read-only public task with a configured model. Report deterministic harness success separately from real-model success.

Done when a second adapter can use the same contract, Browser Use has no raw browser path, the legacy demo passes, and the documented claims match measured evidence. Update README, PRIVACY, SECURITY, PROJECT-STATUS, and architecture coverage. Old presentations and archives remain historical until separately regenerated.
