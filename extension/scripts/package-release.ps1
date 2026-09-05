# Compatibility entry point; all platforms use the same Node implementation.
$ErrorActionPreference = "Stop"
node (Join-Path $PSScriptRoot "release.js") package
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
