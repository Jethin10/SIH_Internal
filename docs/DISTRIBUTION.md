# Distribution

## Windows setup

Download and extract `StrawHats-Windows.zip`, then run `Setup.cmd`. The installer copies application files to `%LOCALAPPDATA%\StrawHats\1.1.0`. It downloads Node 22.23.2 from nodejs.org and checks SHA-256 against the upstream checksum manifest. It installs uv through Windows Package Manager only if uv is missing, then installs the locked Python packages and Playwright Chromium. No API key is needed during setup.

Setup can be rerun after a failed download. It does not replace your system Node or use your personal Chrome profile. uv and its Python/browser download caches may be shared with other applications. Source setup also works on macOS and Linux; the installer targets Windows x64.

To uninstall, close StrawHats, delete its desktop/Start menu shortcuts, then delete `%LOCALAPPDATA%\StrawHats`. Shared uv, Python and Playwright caches remain. Delete those separately only if no other application uses them. Each new version installs in a separate folder.

## Build downloads

After `npm run setup`, run `npm test`, `npm run test:agent`, `npm run release` and `npm --prefix extension run verify:release`.

Output goes to `dist/`, or the directory selected by `RELEASE_DIR`:

- `StrawHats-Windows.zip`: setup scripts and complete runtime sources.
- `StrawHats_Privacy_Gateway_v1.1.0-Chrome.zip`: unpacked Chrome extension.
- `StrawHats_Privacy_Gateway_v1.1.0-Firefox.xpi`: unsigned Firefox test package.
- `StrawHats_Privacy_Gateway_v1.1.0-Source.zip`: complete agent source, adapter, tests and docs.
- `StrawHats_Privacy_Gateway_v1.1.0-SHA256SUMS.txt`: checksums for all four archives.

The packager uses explicit file lists, rejects symlinks, verifies required runtime files and checksums, and excludes credentials, browser profiles, dependency folders and live-site captures. Repeated builds from identical inputs produce identical bytes.

## Website download button

Use this URL after publishing the release:

```text
https://github.com/Jethin10/SIH_Internal/releases/latest/download/StrawHats-Windows.zip
```

Keep the asset name stable so the link follows the latest release. The website should say "Windows x64 · ZIP installer · internet required for first setup · bring your own model key". This is not a signed Windows executable. Chrome store and Mozilla signing are separate distribution work.

GitHub Actions verifies source changes on three operating systems. The manual release workflow builds packages and retains them as workflow artifacts; publishing a GitHub Release remains an explicit maintainer action.
