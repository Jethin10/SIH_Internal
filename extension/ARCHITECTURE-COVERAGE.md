# Architecture coverage

This file maps the architecture document to the code that exists. It separates the SIH MVP from research and future-product work so the demo claims remain defensible.

## SIH MVP

| Requirement | Status | Evidence |
| --- | --- | --- |
| Chrome and Firefox Manifest V3 builds and generic website coverage | Implemented and packaged; Chrome runtime-tested, Firefox schema-linted | `manifest.json`, `manifest.firefox.json`, browser adapters |
| DOM, form, ARIA, open Shadow DOM, and permitted iframe perception | Implemented | `content/content-script.js`, `background/service-worker.js` |
| Incremental privacy graph, mutation tracking, IDs, hashes, versions | Implemented | `content/content-script.js` |
| Immediate pending-mutation flush before context or action use | Implemented | `content/content-script.js` |
| Deterministic PII and Indian identifier rules | Implemented subset suitable for MVP | `lib/pii.js` |
| User vault matching and blind private-value execution | Implemented | `lib/pii.js`, `content/content-script.js` |
| Random 96-bit, origin and task-scoped capabilities with field, action, expiry, and use checks | Implemented | `lib/pii.js`, `background/service-worker.js` |
| Task relevance and local disclosure policy | Implemented heuristic | `content/content-script.js` |
| Safe structured context and final egress barrier | Implemented | `content/content-script.js`, `background/service-worker.js` |
| Planner server | Implemented as a local OpenAI-compatible service with origin filtering, optional bearer authentication, HTTPS-only upstream forwarding, bounds, and timeouts | `server/server.js` |
| External model planning | Implemented through HTTPS OpenAI-compatible endpoints; localhost is supported without an API key | `background/service-worker.js` |
| Strict structured action output | Implemented and unit-tested | `lib/action-policy.js`, `tests/action-policy.test.js` |
| Local target, version, type, token, and risk validation | Implemented | `content/content-script.js` |
| Generic browser execution and feedback loop | Implemented | `background/service-worker.js`, `content/content-script.js` |
| Sensitive-action confirmation | Implemented and tested for block and allow once | `sidepanel`, `tests/cdp-smoke.js` |
| Audit/privacy receipt panel | Implemented | `sidepanel`, `GET_AUDIT` flow |
| Latency and context-size instrumentation | Implemented for scan, mutation, context build, and OCR | `content/content-script.js`, `background/service-worker.js` |
| One local visual fallback demonstration | Implemented and tested with Canvas OCR and a visibly masked local screenshot | `visual`, `tests/integration.html` |
| Five SIH evaluation criteria | Implemented as reproducible synthetic/local measurements with explicit limitations | `tests/run-evaluation.js`, `artifacts/` |

## Implemented defenses beyond the first prototype

- User edits update the graph even when the DOM `value` attribute does not change.
- A context request cannot read through the mutation debounce window.
- Mutation batches over the per-pass cap stay queued instead of disappearing.
- State-changing target actions require a positive `expectedVersion`.
- Planner output rejects unknown properties, unsupported keys, arbitrary scripts, and arbitrary navigation URLs.
- Page-derived aliases cannot be replayed into form fields.
- User/task aliases work only in matching semantic fields and expire after 30 minutes or three uses.
- Private profile data and provider credentials do not persist in `chrome.storage.local`.
- Submit controls receive high-risk treatment from form semantics even when labelled only "Continue".
- Visual OCR text outside opaque regions is not treated as a clickable visual control.
- OCR text containing detected private data is never exposed as a clickable visual target.
- Visual clicks compare the current viewport pixels with the locally OCR'd screenshot before execution.
- A top-frame navigation clears visual observations and pending confirmations; an origin change also rotates the task scope and private capabilities.
- Provider requests use the complete sensitive inventory, strict JSON parsing, a 30-second timeout, a 1 MB response limit, and JSON content-type enforcement.
- Browser-specific adapters keep Chrome offscreen/side-panel APIs out of the Firefox package; both archives have root manifests and verified checksums.
- Upstream planner mode requires a bearer token, rejects insecure non-loopback endpoints and redirects, and uses timing-safe token comparison.

## Deliberately not claimed

These architecture sections describe later research or product work, or capabilities Chrome extensions cannot expose cleanly:

| Item | Reason |
| --- | --- |
| WebMCP tool discovery | Emerging site-provided interface; DOM remains the primary path |
| Native browser accessibility tree | Content scripts can read ARIA-derived DOM semantics, not the full privileged AX tree |
| Multilingual ONNX NER and `PENDING` classification queue | Requires a measured model, tokenizer, worker budget, and accuracy benchmark |
| `MASK` and `GENERALIZE` policies | Current MVP uses the safer `TOKENIZE`, `DROP`, and `BLOCK` paths |
| True changed-region OCR and typed visual UI detection | Current fallback uses lazy full-viewport OCR, opaque-region restriction, and pixel freshness checks |
| Delta-only network protocol | The generic chat-completions API is stateless and receives compact snapshots each turn |
| Full remote desktop, Citrix, WebGL game, or scanned-PDF control | The architecture explicitly defers a complete remote-desktop vision system |
| Production credential service, enterprise RBAC, Redis, and object storage | Explicitly outside the SIH extension MVP |
| Signed browser-store publication | Requires external Chrome/Mozilla accounts and review; packages are prepared but not store-approved |
| Firefox runtime certification | Package passes Mozilla schema lint; this machine has no Firefox runtime, so the full Firefox journey remains externally unverified |
| Perfect PII recall or perfect OCR | The architecture itself excludes these guarantees |

## Verification commands

```powershell
npm test
npm run evaluate
npm run release
npm run verify:release
npm run lint:firefox
```

The browser test uses a clean profile. It does not depend on a previously loaded extension or an existing debug browser.
