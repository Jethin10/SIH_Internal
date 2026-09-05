$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$extensionRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Split-Path -Parent $extensionRoot
$chromeManifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
$firefoxManifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.firefox.json") | ConvertFrom-Json
if ($chromeManifest.version -ne $firefoxManifest.version) { throw "Chrome and Firefox manifest versions do not match" }
$releaseStem = "StrawHats_Privacy_Gateway_v$($chromeManifest.version)"
$chromePath = Join-Path $outputRoot "$releaseStem-Chrome.zip"
$firefoxPath = Join-Path $outputRoot "$releaseStem-Firefox.xpi"
$sourcePath = Join-Path $outputRoot "$releaseStem-Source.zip"
$checksumPath = Join-Path $outputRoot "$releaseStem-SHA256SUMS.txt"
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("strawhats-release-" + [guid]::NewGuid().ToString("N"))
$runtimeDirectories = @("background", "content", "lib", "sidepanel", "visual", "vendor")
$sourceFiles = @("manifest.json", "manifest.firefox.json", "README.md", "ARCHITECTURE-COVERAGE.md", "SIH-EVALUATION.md", "DEMO.md", "TEAM-RESPONSIBILITIES.md", "PROJECT-STATUS.md", "PRIVACY.md", "SECURITY.md", "THIRD-PARTY-NOTICES.md", "package.json", ".gitignore")
$sourceDirectories = @("background", "content", "lib", "sidepanel", "visual", "server", "artifacts", "vendor", "tests", "scripts", ".github")
function Copy-ReleaseTree([string]$target, [string[]]$files, [string[]]$directories) {
  New-Item -ItemType Directory -Force $target | Out-Null
  foreach ($file in $files) { Copy-Item (Join-Path $extensionRoot $file) (Join-Path $target $file) }
  foreach ($directory in $directories) { Copy-Item (Join-Path $extensionRoot $directory) (Join-Path $target $directory) -Recurse }
}
function New-Zip([string]$source, [string]$destination) {
  if (Test-Path $destination) { Remove-Item -LiteralPath $destination -Force }
  $archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) {
      $entryName = $file.FullName.Substring($source.Length).TrimStart("\").Replace("\", "/")
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $archive.Dispose() }
}
function Get-Sha256([string]$path) {
  $stream = [System.IO.File]::OpenRead($path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try { return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "") }
  finally { $stream.Dispose(); $sha256.Dispose() }
}
try {
  $chromeStage = Join-Path $stage "chrome"
  Copy-ReleaseTree $chromeStage @("manifest.json", "PRIVACY.md", "SECURITY.md", "THIRD-PARTY-NOTICES.md") $runtimeDirectories
  Remove-Item -LiteralPath (Join-Path $chromeStage "background\firefox-adapter.js") -Force
  Remove-Item -LiteralPath (Join-Path $chromeStage "background\firefox-page.html") -Force
  New-Zip $chromeStage $chromePath
  $firefoxStage = Join-Path $stage "firefox"
  Copy-ReleaseTree $firefoxStage @("manifest.firefox.json", "PRIVACY.md", "SECURITY.md", "THIRD-PARTY-NOTICES.md") $runtimeDirectories
  Move-Item -LiteralPath (Join-Path $firefoxStage "manifest.firefox.json") -Destination (Join-Path $firefoxStage "manifest.json")
  Remove-Item -LiteralPath (Join-Path $firefoxStage "background\chrome-adapter.js") -Force
  New-Zip $firefoxStage $firefoxPath
  $sourceStage = Join-Path $stage "source"
  Copy-ReleaseTree $sourceStage $sourceFiles $sourceDirectories
  New-Zip $sourceStage $sourcePath
  $lines = foreach ($path in @($chromePath, $firefoxPath, $sourcePath)) {
    $hash = Get-Sha256 $path
    "$hash  $([System.IO.Path]::GetFileName($path))"
  }
  Set-Content -LiteralPath $checksumPath -Value $lines -Encoding ascii
  & (Join-Path $PSScriptRoot "verify-release.ps1")
  Write-Output "Release artifacts written to $outputRoot"
} finally {
  if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
