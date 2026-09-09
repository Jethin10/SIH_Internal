# Current project status

Updated 2026-09-09 for version 1.1.0.

## Product

StrawHats is a local privacy runtime for browser agents. Browser Use 0.13.10 is the first external planner. The extension provides observations, local tokenization, OCR and action execution. The Python planner uses a restricted gateway action registry with no browser session. Provider requests are inspected and sent by the extension.

The large content script and service worker still coordinate the browser. Shared detection, egress checks, protocol validation, domain/action rules, browser adapters and external planner client already live in separate modules. This release keeps those boundaries and avoids rewriting working execution code.

## Release changes

- Root setup and launch commands, plus Windows setup and shortcuts.
- Everyday launch starts with an empty task and profile. Shopping rehearsal stays separate.
- Complete source and Windows packages include the Python adapter and locked requirements.
- Generated vendor caches, temporary browser copies and old archives removed from the tracked tree. Original presentation and handoff notes moved under `docs/history/`.
- Main and the working branch reconciled. Multilingual regression cases retained alongside the newer phone library and false-positive guards.
- Profile, task text and registered private values withheld from foreign, opaque and unresolved child frames before message delivery. Content scripts replace profile settings so revoked fields cannot survive a settings refresh.

## Detection evidence

The independent Gretel subset has 99 positive spans and 20 clean documents. Current result is 89 exact matches, 10 misses, and no findings on clean documents. The contextual development fixture has 47 cases and no misses. The generated regression corpus has 1,000 positives and 254 negatives, all passing. Fixtures are synthetic and do not establish real-world recall.

Unknown names, addresses, encodings and OCR errors can escape detection. Strict checks reject known sensitive values and incomplete observations; they cannot prove that arbitrary text contains no unknown PII.

## Boundaries

Keys and profile values remain plaintext while needed in browser session storage and local memory. Random aliases are not encrypted persistence. The dedicated browser uses a temporary profile and removes it after normal shutdown; an OS crash can leave a temporary profile directory behind.

The adapter is not a hostile-code sandbox against another process running as the same OS user. Telemetry is disabled and the adapter has no browser handle, but comprehensive captured-traffic verification remains open. A second production planner adapter, encrypted persistence, broader module extraction and browser-store publication remain future work.

The existing live Wikipedia run is historical evidence from the preceding session. Release checks use synthetic fixtures and deterministic provider responses unless explicitly labelled live. Do not describe those checks as new live-model verification. Firefox support remains experimental until the current runtime is exercised.

See the [original intent and phase plan](privacy-runtime/PLAN.md), [migration log](privacy-runtime/PROGRESS.md), and [distribution instructions](DISTRIBUTION.md).
