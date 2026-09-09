param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'StrawHats'),
  [switch]$NoShortcut
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot
$version = (Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'package.json') | ConvertFrom-Json).version
$destination = [IO.Path]::GetFullPath((Join-Path $InstallRoot $version))
New-Item -ItemType Directory -Force -Path $destination | Out-Null

# Only copy distributable inputs. Never copy local browser profiles, environment
# files, Python environments, caches or node_modules from a developer checkout.
if ([IO.Path]::GetFullPath($sourceRoot) -ne $destination) {
  $files = @('package.json', 'README.md', 'Start.cmd', 'Setup.cmd')
  $files += Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'scripts') -File | ForEach-Object { 'scripts/' + $_.Name }
  foreach ($tree in @('adapters/browser-use', 'extension/background', 'extension/content', 'extension/lib', 'extension/sidepanel', 'extension/visual', 'extension/vendor', 'extension/scripts', 'extension/server')) {
    $files += Get-ChildItem -LiteralPath (Join-Path $sourceRoot $tree) -File -Recurse | Where-Object { $_.FullName -notmatch '[\\/]__pycache__[\\/]' } | ForEach-Object { $_.FullName.Substring($sourceRoot.Length + 1) }
  }
  $files += @('extension/package.json', 'extension/package-lock.json', 'extension/manifest.json', 'extension/manifest.firefox.json', 'extension/PRIVACY.md', 'extension/SECURITY.md', 'extension/THIRD-PARTY-NOTICES.md')
  foreach ($relative in $files) {
    $target = Join-Path $destination $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $target -Force
  }
}

$runtime = Join-Path $destination '.runtime'
$nodeDir = Join-Path $runtime 'node'
$nodeExe = Join-Path $nodeDir 'node.exe'
$nodeVersion = '22.23.2'
if (-not (Test-Path -LiteralPath $nodeExe)) {
  if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This release supports Windows x64. Use the source setup on other architectures.' }
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  $archiveName = "node-v$nodeVersion-win-x64.zip"
  $baseUrl = "https://nodejs.org/dist/v$nodeVersion"
  Write-Host "Downloading private Node $nodeVersion runtime..."
  $archive = Join-Path $runtime $archiveName
  Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$archiveName" -OutFile $archive
  $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt").Content
  $line = ($checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $archiveName") })
  if (-not $line -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne ($line.Trim() -split '\s+')[0]) { throw 'Node download checksum mismatch. Rerun setup.' }
  Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force
  $extractedNode = [IO.Path]::GetFullPath((Join-Path $runtime "node-v$nodeVersion-win-x64"))
  if (-not $extractedNode.StartsWith([IO.Path]::GetFullPath($runtime) + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid runtime destination' }
  Move-Item -LiteralPath $extractedNode -Destination $nodeDir
  Remove-Item -LiteralPath $archive
}
$env:PATH = "$nodeDir;$env:PATH"
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Install uv from https://docs.astral.sh/uv/getting-started/installation/ then rerun Setup.cmd.' }
  & winget install --id astral-sh.uv --exact --source winget --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw 'uv installation failed. Install uv and rerun setup.' }
  $env:PATH = "$nodeDir;" + [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'uv is not on PATH yet. Close this window and rerun Setup.cmd.' }
Push-Location $destination
try {
  & "$nodeDir\npm.cmd" --prefix extension ci --omit=dev
  if ($LASTEXITCODE -ne 0) { throw 'JavaScript dependency installation failed.' }
  & $nodeExe extension/node_modules/playwright/cli.js install chromium
  if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }
  & $nodeExe extension/scripts/setup-browser-use.js
  if ($LASTEXITCODE -ne 0) { throw 'Browser Use installation failed.' }
} finally { Pop-Location }
if (-not $NoShortcut) {
  $shell = New-Object -ComObject WScript.Shell
  foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $shortcut = $shell.CreateShortcut((Join-Path $folder 'StrawHats.lnk'))
    $shortcut.TargetPath = Join-Path $destination 'Start.cmd'
    $shortcut.WorkingDirectory = $destination
    $shortcut.Description = 'Browser Use with local privacy controls'
    $shortcut.Save()
  }
}
Write-Host "Installed to $destination. Open StrawHats from the desktop or Start menu."
Write-Host 'Enter your provider key in the app Settings. Setup never asks for it.'
