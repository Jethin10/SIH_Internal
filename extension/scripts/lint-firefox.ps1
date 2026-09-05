# Compatibility entry point; all platforms use the same Node implementation.
$ErrorActionPreference = "Stop"
node (Join-Path $PSScriptRoot "release.js") lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
