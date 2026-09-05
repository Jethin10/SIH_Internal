$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$extensionRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Split-Path -Parent $extensionRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
$xpi = Join-Path $outputRoot "StrawHats_Privacy_Gateway_v$($manifest.version)-Firefox.xpi"
if (!(Test-Path -LiteralPath $xpi)) { throw "Firefox package is missing; run npm run release first" }
$lintRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("strawhats-firefox-lint-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $lintRoot -Force | Out-Null
try {
  [System.IO.Compression.ZipFile]::ExtractToDirectory($xpi, $lintRoot)
  npx --yes web-ext@10.6.0 lint --source-dir $lintRoot
  if ($LASTEXITCODE -ne 0) { throw "Mozilla web-ext lint failed" }
} finally {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $resolved = [System.IO.Path]::GetFullPath($lintRoot)
  if ($resolved.StartsWith($tempRoot) -and [System.IO.Path]::GetFileName($resolved).StartsWith("strawhats-firefox-lint-")) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
