# StrawHats

Type a browsing task. Browser Use plans the steps, and the local privacy gateway checks what it can see and do. Websites look and behave normally. Detected private values become opaque tokens; the browser resolves them locally when an allowed action needs them.

## Install on Windows

Download [StrawHats-Windows.zip](https://github.com/Jethin10/SIH_Internal/releases/latest/download/StrawHats-Windows.zip), extract it, then double-click **Setup.cmd**. Setup installs into your user folder and creates desktop and Start menu shortcuts. It downloads a private Node 22 runtime, Chromium, and the pinned Python planner. First installation needs internet access and several hundred MB of disk space. Windows x64 is the packaged target.

Open **StrawHats**, choose your provider in Settings, enter its model ID and your own API key, and save. Open a website in the main browser window, type your task in the privacy panel, then click **Run task** or press **Ctrl+Enter**. Use **Stop** to cancel. Consequential actions pause for confirmation.

The browser starts with a fresh profile. Keys, private profile values, logins and task state are session-only. Close the whole browser to end the session. The launcher terminal remains open while the app runs. This release uses a ZIP setup script, not a signed EXE or browser-store installer.

For an existing Chrome profile, load `extension/` using **chrome://extensions → Developer mode → Load unpacked**. The full Browser Use experience is easiest through the shortcut, which pairs the local planner automatically. Loading the extension alone does not start that planner.

## Run from source

Install Node **22.13 or newer in the 22.x line** and [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the repository root:

```sh
npm run setup
npm start
```

`npm start` opens the real agent with an empty task and profile. `npm run demo` starts the separate synthetic shopping rehearsal. For the legacy offline demo, run `npm --prefix extension run demo`.

## How privacy works

```text
Webpage → local detection and tokenization → sanitized observation
        → Browser Use proposal → local action checks → browser
```

The Python adapter has no browser session or debugging connection. The extension owns model transport, provider credentials, local OCR, private capabilities and execution. External observations use the versioned protocol in `extension/lib/agent-protocol.js`. The planner can be replaced without changing the detector.

Aliases are **tokenization, not encryption**. Private values remain in memory or browser session storage during use. Unknown PII can be missed. The current independent synthetic fixture measures **89/99 exact matches**, with no findings in its 20 clean documents. The separate generated regression corpus passes 1,000 positive cases and 254 negatives. These are test results, not a guarantee for arbitrary websites.

Read [privacy](extension/PRIVACY.md), [security](extension/SECURITY.md), and [current status](docs/STATUS.md). Login, CAPTCHA, inaccessible browser pages, model errors and unsupported actions can require user intervention. Browser Use voice input is disabled because browser speech services bypass local transcript filtering.

## Develop and verify

```sh
npm test
npm run test:agent
npm --prefix extension run test:ui
npm run release
npm --prefix extension run verify:release
```

The Browser Use journey uses the actual pinned Python planner with deterministic model responses on a local store. Live-model checks are separate and require a locally supplied key. See [development](extension/DEVELOPMENT.md) and [distribution](docs/DISTRIBUTION.md).

| Folder | Purpose |
| --- | --- |
| `extension/` | Browser integration, privacy core, panel, tests and legacy planner |
| `adapters/browser-use/` | Restricted Browser Use planner and protocol schemas |
| `scripts/` | Windows installation |
| `docs/` | Current status, distribution, original intent and historical notes |
| `strawhats-team-hub/` | Optional internal team website, not needed to run the agent |
| `dist/` | Generated release files, ignored by Git |

Generated caches, browser profiles and release archives do not belong in source control. Publish downloadable files through GitHub Releases. The [original plan](docs/privacy-runtime/PLAN.md) remains the design record; [current status](docs/STATUS.md) describes this release.
