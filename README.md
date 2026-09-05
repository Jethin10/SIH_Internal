# StrawHats SIH 26171

This repository contains the StrawHats Privacy Gateway browser extension, its offline demo and evaluation suite, plus the internal team knowledge hub.

## Judge demo

```powershell
cd extension
npm run demo
```

Keep that terminal open, then follow [extension/DEMO.md](extension/DEMO.md). The command starts an offline OpenAI-compatible planner at `http://127.0.0.1:8787` and a synthetic checkout at `http://127.0.0.1:8765`. No provider key or internet connection is needed for the demo.

## Verify the project

```powershell
cd extension
npm test
npm run test:ui
npm run evaluate
npm run release
npm run verify:release
npm run lint:firefox

cd ../strawhats-team-hub
npm ci
npm run build
```

GitHub Actions repeats these checks on every push and pull request. Current measured results and their limits are in [extension/artifacts/EVALUATION-SUMMARY.md](extension/artifacts/EVALUATION-SUMMARY.md).

## Main folders

- `extension/` contains the Chrome and Firefox privacy gateway, local planner, tests, evidence, and release scripts.
- `strawhats-team-hub/` contains the Next.js team knowledge map.
- `docs/` and `archives/` preserve supporting project material.

This is a hackathon prototype, not a production security certification. Read [extension/README.md](extension/README.md), [extension/SECURITY.md](extension/SECURITY.md), and [extension/PRIVACY.md](extension/PRIVACY.md) before reuse or distribution.
