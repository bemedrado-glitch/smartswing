Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$distDir = Join-Path $root 'dist'
$staging = Join-Path $distDir 'smartswing-release'
$zipPath = Join-Path $distDir 'smartswing-release.zip'

if (Test-Path $staging) {
  Remove-Item -Recurse -Force $staging
}

New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

$includeFiles = @(
  '*.html',
  '*.js',
  '*.json',
  '*.css',
  '*.md',
  '*.sql'
)

foreach ($pattern in $includeFiles) {
  Get-ChildItem -Path $root -Filter $pattern -File | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $staging $_.Name) -Force
  }
}

$includeDirs = @('assets', 'tests', 'supabase')
foreach ($dir in $includeDirs) {
  $source = Join-Path $root $dir
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination (Join-Path $staging $dir) -Recurse -Force
  }
}

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
Write-Host "Release package created: $zipPath"
