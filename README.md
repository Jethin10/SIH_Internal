# StrawHats SIH 26171

This repository contains the StrawHats Privacy Gateway browser extension, its offline demo and evaluation suite, plus the internal team knowledge hub.

## Judge demo

Use Node **22 LTS** (22.13 or newer in the 22.x line). `.nvmrc` is provided; with nvm installed, run `nvm install` and `nvm use` from this directory. The Mozilla linter can crash under Node 25 on macOS.

```sh
cd extension
npm ci
npm run setup:browsers
npm run demo
```

Keep that terminal open, then follow [extension/DEMO.md](extension/DEMO.md). The command starts an offline OpenAI-compatible planner at `http://127.0.0.1:8787` and a synthetic checkout at `http://127.0.0.1:8765`. No provider key or internet connection is needed for the demo.

## Verify the project

```sh
cd extension
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

cd ../strawhats-team-hub
npm ci
npm run build
```

The extension CI matrix is configured for Windows, macOS, and Linux. Browser tests use the pinned Playwright Chromium; regular Chrome is still supported for manually loading the extension, but no longer supports the automated side-loading flags. Firefox runtime checks use Selenium Manager to download a browser and driver into its test cache. Current measured results and their limits are in [extension/artifacts/EVALUATION-SUMMARY.md](extension/artifacts/EVALUATION-SUMMARY.md). See [extension/DEVELOPMENT.md](extension/DEVELOPMENT.md) for provider verification and platform details.

## Main folders

- `extension/` contains the Chrome and Firefox privacy gateway, local planner, tests, evidence, and release scripts.
- `strawhats-team-hub/` contains the React/Vinext team knowledge map.
- The root architecture document, presentations, and release archives preserve supporting project material.

This is a hackathon prototype, not a production security certification. Read [extension/README.md](extension/README.md), [extension/SECURITY.md](extension/SECURITY.md), and [extension/PRIVACY.md](extension/PRIVACY.md) before reuse or distribution.
