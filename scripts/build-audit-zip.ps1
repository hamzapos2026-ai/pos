# Build secret-free audit ZIP + git bundle + docs copy
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\build-audit-zip.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  $Root = (Get-Location).Path
}

$Stamp = Get-Date -Format "yyyyMMdd"
$OutDir = Join-Path $Root "audit-dist"
$Stage = Join-Path $OutDir "_stage"
$DocsOut = Join-Path $OutDir "AUDIT-DOCS"
$ZipPath = Join-Path $OutDir "aone-jewelry-pos-source-$Stamp.zip"
$BundlePath = Join-Path $OutDir "aone-jewelry-pos-git-$Stamp.bundle"

Write-Host "Root: $Root"
Write-Host "Output: $OutDir"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
if (Test-Path $DocsOut) { Remove-Item -Recurse -Force $DocsOut }
New-Item -ItemType Directory -Force -Path $DocsOut | Out-Null

$ExcludeDirNames = @(
  "node_modules", ".git", ".firebase", "dist", "dev-dist", "coverage",
  "audit-dist", ".cursor", ".vscode", ".idea", "uploads"
)

$ExcludeFilePatterns = @(
  "*.log", ".env", ".env.*", "*.pem", "*.p12", "*serviceAccount*.json",
  "credentials.json", "*-firebase-adminsdk-*.json", "shop-db.json"
)

function Test-ExcludedFile([string]$name) {
  if ($name -eq ".env.example") { return $false }
  if ($name -eq ".env") { return $true }
  foreach ($pat in $ExcludeFilePatterns) {
    if ($name -like $pat) { return $true }
  }
  return $false
}

function Copy-Filtered($src, $dest) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Get-ChildItem -LiteralPath $src -Force | ForEach-Object {
    if ($_.PSIsContainer) {
      if ($ExcludeDirNames -contains $_.Name) { return }
      Copy-Filtered $_.FullName (Join-Path $dest $_.Name)
    } else {
      if (Test-ExcludedFile $_.Name) {
        Write-Host "  skip secret/runtime: $($_.Name)"
        return
      }
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dest $_.Name) -Force
    }
  }
}

Write-Host "Copying source (filtered)..."
Copy-Filtered $Root (Join-Path $Stage "aone-jewelry-pos")

# Extra safety: remove any env files that slipped through except .env.example
Get-ChildItem -Path $Stage -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^\.env' -and $_.Name -ne '.env.example' } |
  ForEach-Object {
    Write-Host "  removing leaked env: $($_.FullName)"
    Remove-Item -LiteralPath $_.FullName -Force
  }

Write-Host "Creating ZIP..."
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $Stage "aone-jewelry-pos") -DestinationPath $ZipPath -Force

Write-Host "Creating git bundle..."
Push-Location $Root
try {
  git bundle create $BundlePath --all
  git bundle verify $BundlePath
} finally {
  Pop-Location
}

Write-Host "Copying audit docs..."
Copy-Item -Path (Join-Path $Root "docs\audit\*") -Destination $DocsOut -Recurse -Force
Copy-Item -Path (Join-Path $Root "README.md") -Destination (Join-Path $DocsOut "README.md") -Force
Copy-Item -Path (Join-Path $Root ".env.example") -Destination (Join-Path $DocsOut "env.example.txt") -Force
Copy-Item -Path (Join-Path $Root "package.json") -Destination (Join-Path $DocsOut "package.json") -Force

# Manifest
$manifest = @"
A One Jewelry POS — Audit package manifest
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Branch: $(git -C $Root branch --show-current)
Commit: $(git -C $Root rev-parse HEAD)
Remote: $(git -C $Root remote get-url origin 2>$null)

Contents:
- aone-jewelry-pos-source-$Stamp.zip  (source without secrets / node_modules)
- aone-jewelry-pos-git-$Stamp.bundle  (git history backup)
- AUDIT-DOCS/                         (formal audit markdown + README)

NOT included: .env, credentials, node_modules, dist, screen recording (add separately).
Screen recording: follow AUDIT-DOCS/09-SCREEN-RECORDING-CHECKLIST.md
"@
Set-Content -Path (Join-Path $OutDir "MANIFEST.txt") -Value $manifest -Encoding UTF8

Remove-Item -Recurse -Force $Stage

Write-Host ""
Write-Host "DONE. Share folder: $OutDir"
Write-Host "  ZIP:    $ZipPath"
Write-Host "  Bundle: $BundlePath"
Write-Host "  Docs:   $DocsOut"
Get-ChildItem $OutDir | Format-Table Name, Length, LastWriteTime
