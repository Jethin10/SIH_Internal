# General browser agent handoff

Latest update: see **Amazon shopping follow-up** at the end of this file. The new Enter/search, document-readiness, Gemini schema, and session-key fallback fixes are tested. The live browser is waiting at Amazon sign-in; real cart and delivery completion are still unverified. All personal data and provider keys are held only in the demo browser session. The current interactive runner is `node tests/run-web-agent.js --keep` (tool session 1310); do not close it while the user signs in.

Updated 2026-09-05, approximately 13:14 Asia/Calcutta. Work resumed at the user's request. The requested product is unfinished. Continue implementation from this working tree.

## Latest continuation, read first

- Added `tests/run-agent-shopping.js`, `npm run test:agent`, `test:agent:live`, and `demo:agent`. A multi-page synthetic store is embedded in the runner. Deterministic planner successfully completes click product, select size 9, add to cart, private email fill, done in about 1.3 seconds. Evidence: `extension/artifacts/agent-shopping-harness.json` and `agent-shopping.png`. This is execution evidence, not live reasoning success.
- `demo:agent` opens a headed disposable Chromium instance with the real panel and Gemini Settings. It leaves all planning to the configured model. User said they can configure Gemini. A follow-up question asks whether they have saved settings, pending at this update. Interactive process session 76781 was left open intentionally for them. It predates the latest focus and fingerprint fixes; restarting loads those but loses the disposable session key. Avoid interrupting user setup without explaining this.
- Live OpenRouter attempts failed: free router first requested disabled vision; second clicked then returned empty content; explicit Gemma model returned 429; NVIDIA model repeatedly chose select then hit 429. No live-shopping success is claimed. Last NVIDIA test process session 17860 may still be timing out. No credential values were printed.
- Added bounded document readiness acknowledgments in `assertSessionBoundary`, recoverable disabled-vision results, and repeated-identical-action stopping after three previous repetitions. Made `back` available to research tasks. Popup panel active-tab lookup now finds an ordinary browser window's active HTTP tab.
- Added href/target/type/form action/method/target to content fingerprints, observes navigation-related attributes, and processes the live target before action validation.
- `npm test` passed after readiness and focus changes, before the final repeated-action/fingerprint changes. `npm run test:agent` passed again after those final changes. Re-run adversarial E2E for fingerprint changes before final completion.
- Added `extension/AGENT-DEMO.md` with Gemini setup and the exact judge rehearsal task. Read it for current launcher usage. Earlier sections below describe the initial session and are historical where this update supersedes them.

## User goal and priorities

The user clarified that the demo is fine, but the product must behave like Perplexity/Comet or a Gemini browser agent: give it a natural-language task, let it find websites and perform multiple steps autonomously, with this project's local privacy gateway between browser observations, the model, and execution. It must support general web tasks, not just flights or a scripted privacy demo. They explicitly allow using an open-source project if helpful.

Windows Google Chrome is the highest priority. macOS is optional later. Firefox is not a priority. They want implementation and working evidence, not another proposal or a request to start. Keep this handoff updated as work proceeds.

## Workspace and existing work

- Actual repository path is `C:\SIH'`, with a literal apostrophe. The environment sometimes renders it as `C:\SIH&apos;`.
- Extension app is `C:\SIH'\extension`. Manifest V3, vanilla JS, local DOM/PII graph, capability aliases, local action firewall, offline OCR, OpenAI-compatible planner client.
- This workspace was already dirty. Preserve prior work. No commits, pushes, or branch changes were made in this session.
- Pre-existing modifications: `extension/LIVE-AGENT.md`, `extension/artifacts/pii-contextual.json`, `extension/artifacts/product-ui.png`, `extension/background/service-worker.js`, `extension/scripts/capture-product-ui.js`, `extension/sidepanel/app.js`.
- Pre-existing untracked files: `extension/artifacts/flight-live.json`, `extension/artifacts/flight-live.png`, `extension/artifacts/provider-live.json`, `extension/tests/run-flight-live.js`.
- Original supplied conversation: `C:\Users\jethi\.codex\attachments\6e1856f4-654e-4915-a2e2-de04174ebf62\pasted-text.txt`. It is partly corrupted but readable. User's latest clarification overrides its demo-first framing.

## Implemented in this session

### Demo launcher

Extended `extension/scripts/capture-product-ui.js` with `--demo`, `--auto`, and `--smoke`. Added package commands `demo:60`, `demo:60:auto`, and `test:demo`.

It starts local servers on free ports, opens a disposable headed Chromium profile, seeds a synthetic email and local planner, warms OCR, and places the extension panel in a separate popup next to the fixture. Automatic mode paces inspect, private fill, block synthetic order, allow one synthetic order, and OCR across approximately 45 seconds. Smoke mode omits pauses and exits. Manual/auto mode keeps the browser until it closes or Ctrl+C.

Created `extension/DEMO-60.md` and generated `extension/artifacts/demo-60.json`. This proves the privacy workflow, not autonomous model reasoning. The automated browser is bundled Chromium, NOT verified installed Google Chrome. Installed Chrome instructions are in the document. The document's final general-task paragraph is now stale: it describes the first URL-only navigation implementation, before the broader search changes below.

### General-agent groundwork

`extension/lib/action-policy.js`:

- Added validated `navigate` and `search_web` action schemas.
- Navigation requires HTTP(S), no URL credentials, length below 2000. Search requires nonempty query up to 500 characters.

`extension/background/service-worker.js`:

- Planner prompt now describes general web work and `navigate`/`search_web`; removed flight-specific suggestion wording.
- `search_web` opens Google search in the controlled tab. `navigate` allows an HTTPS homepage or exact URL supplied in the task. Deep links still use observed clickable page controls.
- Navigation/search are checked against local domain policy, PII detection, capability-token patterns, profile values, page egress inventory, and task private values before the URL is opened.
- Navigation clears cached vision and requests document/capability rebinding.
- `activeTabId(true)`, used by task start, can open a Google homepage from a non-HTTP page and wait for a content-script response. Ordinary inspect still requires an HTTP page.
- Broadened intermediate fill/click task verbs for shop, book, order, reserve, apply, register, complete, schedule. Existing consequential-action confirmation remains.
- Existing dirty code already contained planner compaction to approximately 10k serialized characters, visible-control ranking, Groq response options, and bounded 429 retries. Those were preserved.

`extension/content/content-script.js`:

- Form presence no longer makes every field fill require confirmation. Implicit submission risk is limited to click/press.
- Ordinary GET search forms identified by search/q controls can submit without confirmation if form text lacks high-risk terms.
- Anchor clicks with non-self targets are redirected to `_self` so the agent continues on the destination. JavaScript-created popups are NOT handled yet.

`extension/sidepanel/app.js` and `index.html`:

- Added Google Gemini preset with endpoint `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`. Model ID intentionally blank for the user to supply a model available in their account.
- Endpoint verified against Google's official https://ai.google.dev/gemini-api/docs/openai documentation. No model availability or rate-limit claims were assumed.
- General task placeholder now uses shopping; flight section renamed to an example task.

Tests:

- Added `extension/tests/navigation.test.js` and included it in `npm test`. Covers URL schema and task-scope decisions, not actual browser navigation.
- Updated old action-policy expectation that all navigate actions were unsupported.
- Added crowded-page ranking/budget assertions to planner-egress tests. Budget still counts JS string length, not UTF-8 bytes; this is not a strict byte/token guarantee.

## Verification actually completed

1. `npm run test:demo` passed on Windows before the later general-agent changes. Headed bundled Chromium opened. Synthetic email filled; egress became VERIFIED 0; blocked orders remained 0; allow-once produced 1; masked OCR preview appeared. Timed action portion was 1.314 seconds without narration pauses, after OCR warmup. Do not call that a real model or Google Chrome pass.
2. After all current code edits, `npm test` PASSED, including navigation tests, existing unit/policy/server tests, packaging tests, and adversarial browser E2E. Last process session 50434 exited 0 and is finished.
3. Adversarial E2E reported 100% visual mask coverage on its synthetic fixture, 43 receipts, cross-origin capability blocking, local confirmation paths, and verified_zero egress. These are fixture-specific results.
4. No multi-step shopping/research journey or live provider run was performed in this session. No actual microphone, macOS, Firefox runtime, or installed Chrome runtime test was performed.
5. Runtime is Node 25.6.1, while package engines requests Node 22.13.x through <23. Existing tests ran successfully; do not say runtime compatibility is fully established.
6. Chromium emitted sandbox/network-service diagnostic messages on startup but completed the journeys. Do not disable sandbox as a workaround.

## Next work, in order

1. Finish general-agent reliability instead of spending more time on the demo. Review the incomplete paths below and add focused fixes.
2. Build a realistic multi-page synthetic shopping/research E2E using the real extension and its panel controls. Cover navigate, link navigation, form fill/select, cart state, private alias fill, and pause for consequential submit. Assert results on the page and assert outbound request bodies contain no seeded private values or screenshots. A deterministic mock planner can validate execution first, but label it a harness test.
3. Run the same journey with a real configured model, then one public live read-only task that requires discovery and multiple observations. A real provider key exists as environment variable `OPENROUTER_API_KEY` on this host. Only its NAME was inspected, not its value. Use it through environment/configuration without printing or writing it into files. No Groq/Gemini/upstream variables were present. The prior `run-provider.js` and `run-flight-live.js` show test setup patterns. Don't claim arbitrary-web reliability based on one successful task.
4. Verify actual Windows Chrome support. `scripts/browser-runtime.js` currently chooses Playwright Chromium or `CHROME_PATH`; stock Chrome cannot use the extension sideload test flags. Use an appropriate Chrome for Testing build or manual unpacked install in installed Chrome, and report the exact browser tested. Avoid modifying the personal Chrome profile.
5. Update `DEMO-60.md`, `LIVE-AGENT.md`, and status docs to match final behavior and evidence. Keep `HANDOFF.md` current. Package only after final changes are tested.

## Concrete unresolved findings from independent read-only review

A completed subagent, Ramanujan / `01a07079-8eb7-71c0-b95f-bdafde1cb74e`, reviewed failure points. It made no edits and has no ongoing work.

- **Document rebind acknowledges nothing.** `assertSessionBoundary` clears `needsRebind` and changes origin before settings/task/value registration has proven successful. `sendAllFrames` filters failed frames. Require top-frame acknowledgments, bounded readiness retries, and only mark bound after successful sync. Initial task setup has the same general weakness. See service-worker functions `assertSessionBoundary`, `sendAllFrames`, `prepareTaskPrivacy`, `startTask`.
- **Link/form versions omit destinations.** `content-script.js` content hash excludes href, target, form action/method, and input type. Mutation observer attributeFilter also excludes these. A destination can change after observation without advancing expectedVersion. Include action-relevant attributes in hashing/observation and check live target state before execution. Validate domain policy before link/form navigation, not only after it has already happened.
- **JavaScript-created tabs are not adopted.** The `_self` anchor fix covers ordinary links, not `window.open`. Consider correlating `webNavigation.onCreatedNavigationTarget` with the authorized action and transferring the controlled session after domain validation. Keep panel state and cancellation correct.
- **Task scope remains regex-based.** Added shopping verbs solve only part of the problem. Read-only research still rejects `back`, and many natural phrasings may not match. Improve intermediate-action authorization without bypassing the local consequential-action firewall. Existing dangerous-task-scope tests must remain meaningful.
- **Search-form exemption needs a focused test.** It is currently based on GET method, search/q input, and absence of high-risk form text. Verify both an ordinary search and an actual consequential form. Generic POST searches still ask for confirmation.

Other known gaps: repeat/no-progress handling is only a prompt instruction; completion can still be asserted by the model without a structured success verifier; content clicks/keyboard events may not work on sites requiring trusted events; service-worker restart persistence is not implemented; provider retries can be slow; context budget counts characters and may omit important controls. Prioritize observed failures from the new multi-step tests.

## Boundaries and working conventions

User authorized browser-agent implementation and testing, including reusing open-source code if useful. No open-source dependency was added in this session. The existing architecture was retained because it already routes every proposed action through the gateway.

Keep routine browsing autonomous. Preserve meaningful local control for consequential actions and capability isolation. Do not silently turn the synthetic demo's automatic Allow once click into a real-web auto-approval policy. The latest user request does not supply authorization for actual purchases or outbound messages during testing.

Use PowerShell-safe literal paths for the apostrophe in the repository name. No background browser or test process from this session is intentionally left running. The subagent is complete. The current dirty tree is the handoff; no patch cherry-picking is needed.
# Amazon shopping follow-up — 2026-09-05 (latest state)

This section supersedes older verification/status notes below.

- User priority remains Windows Chrome, autonomous Amazon shopping with local privacy mediation, and a fast judges' demo.
- Fixed Enter activation for native buttons/links and risk-gated implicit form submission. Added Amazon-style search submission to the shopping E2E.
- Added readiness checks for interactive documents while third-party resources remain loading, and retries during document replacement.
- Planner context preserves product controls/variants and priced results ahead of crowded navigation. Gemini receives per-action JSON schemas.
- Added fallback API keys in Settings, restricted to browser-session secret storage. Requests try the next key on 401/403/429; secrets are excluded from persistent public settings and model context. Keys and the user's personal profile must never go into this file, Git, or release evidence.
- Gemini 2.5 Flash returned HTTP 404 for the new account. Gemini 3.6 responded but timed out on a later run. Gemini 3.1 Flash Lite passed a provider probe and drives real Amazon searches and product navigation.
- Live Amazon has reached product pages but previously restarted search instead of completing cart addition. The last retest stopped at Amazon sign-in. The user has been asked to sign in in the open demo browser. Do not claim a verified live cart/order/address completion without page evidence.
- Synthetic shopping E2E passes search, Enter, product selection, variant selection, cart addition, and local capability fills for name/email/phone/address, with no order submitted. Outbound payloads are asserted free of those seeded values and images.
- Final `npm test`, `npm run test:agent`, `npm run test:demo`, release generation and release verification passed. A test fixture initially assumed exactly two chat messages; shopping instructions now stay within the existing system message to preserve that contract. These runs use bundled Chromium 145 on Windows, not installed Google Chrome.
- User supplied an incomplete delivery address. Never invent the building/flat, postal code, city/state components, or login credentials. The live test is in an isolated browser session.
- Branch is codex/voice-live-agent, PR #2. This follow-up builds on 00994e4. Existing untracked live captures stay local; check Git history for the publication commit.
