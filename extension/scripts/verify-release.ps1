$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$extensionRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Split-Path -Parent $extensionRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
$releaseStem = "StrawHats_Privacy_Gateway_v$($manifest.version)"
$artifacts = @(
  @{ Path = Join-Path $outputRoot "$releaseStem-Chrome.zip"; Browser = "chrome" },
  @{ Path = Join-Path $outputRoot "$releaseStem-Firefox.xpi"; Browser = "firefox" },
  @{ Path = Join-Path $outputRoot "$releaseStem-Source.zip"; Browser = "source" }
)
function Get-Sha256([string]$path) {
  $stream = [System.IO.File]::OpenRead($path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try { return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "") }
  finally { $stream.Dispose(); $sha256.Dispose() }
}
foreach ($artifact in $artifacts) {
  if (!(Test-Path -LiteralPath $artifact.Path)) { throw "Missing release artifact: $($artifact.Path)" }
  $archive = [System.IO.Compression.ZipFile]::OpenRead($artifact.Path)
  try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
    if ($entries -notcontains "manifest.json") { throw "$($artifact.Browser) archive has no root manifest.json" }
    if ($entries -notcontains "background/service-worker.js") { throw "$($artifact.Browser) archive has no background implementation" }
    if ($entries -notcontains "vendor/lang/eng.traineddata.gz") { throw "$($artifact.Browser) archive has no local OCR language data" }
    $manifestEntry = $archive.GetEntry("manifest.json")
    $reader = New-Object System.IO.StreamReader($manifestEntry.Open())
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($artifact.Browser -eq "chrome" -and !$manifest.side_panel) { throw "Chrome manifest is missing side_panel" }
    if ($artifact.Browser -eq "firefox" -and !$manifest.sidebar_action) { throw "Firefox manifest is missing sidebar_action" }
  } finally { $archive.Dispose() }
  Write-Output "Verified $($artifact.Browser): $($artifact.Path)"
}
$checksumPath = Join-Path $outputRoot "$releaseStem-SHA256SUMS.txt"
if (!(Test-Path -LiteralPath $checksumPath)) { throw "Missing checksum manifest" }
$checksumLines = Get-Content -LiteralPath $checksumPath
foreach ($artifact in $artifacts) {
  $name = [System.IO.Path]::GetFileName($artifact.Path)
  $line = $checksumLines | Where-Object { $_ -match [regex]::Escape($name) } | Select-Object -First 1
  if (!$line) { throw "Missing checksum for $name" }
  $expected = $line.Split(" ")[0]
  $actual = Get-Sha256 $artifact.Path
  if ($expected -ne $actual) { throw "Checksum mismatch for $name" }
}
Write-Output "All release checksums match."
