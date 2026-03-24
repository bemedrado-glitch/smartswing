param(
  [string]$RepoRoot = "C:\Users\bmedrado\Desktop\SmartSwing\_smartswing_repo",
  [string]$OutputDir = "C:\Users\bmedrado\Desktop\SmartSwing\wix-optimized-html"
)

$ErrorActionPreference = 'Stop'

$pages = @(
  'index.html',
  'features.html',
  'how-it-works.html',
  'pricing.html',
  'contact.html',
  'login.html',
  'signup.html',
  'settings.html',
  'analyze.html',
  'dashboard.html',
  'coach-dashboard.html',
  'manager-analytics.html',
  'library.html',
  'cart.html',
  'checkout.html',
  'review-all.html'
)

if (Test-Path $OutputDir) {
  Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Path $OutputDir | Out-Null

$appDataPath = Join-Path $RepoRoot 'app-data.js'
$appData = if (Test-Path $appDataPath) { Get-Content $appDataPath -Raw } else { '' }

foreach ($page in $pages) {
  $sourcePath = Join-Path $RepoRoot $page
  $content = Get-Content $sourcePath -Raw

  $content = $content -replace '<link rel="manifest" href="\./manifest\.json">\r?\n?', ''
  $content = $content -replace '\s*<script src="\./analytics\.js"></script>\r?\n?', "`r`n"
  $content = $content -replace '\s*<script defer src="/_vercel/insights/script\.js"></script>\r?\n?', "`r`n"
  $content = $content -replace '\s*<script src="\./pwa\.js"></script>\r?\n?', "`r`n"

  if ($content -match '<script src="\./app-data\.js"></script>') {
    $inlineScript = "<script>`r`n$appData`r`n</script>"
    $content = $content.Replace('<script src="./app-data.js"></script>', $inlineScript)
  }

  $content = $content -replace '\./assets/', 'https://smartswing-ai.vercel.app/assets/'

  Set-Content -Path (Join-Path $OutputDir $page) -Value $content -Encoding UTF8
}

@"
Wix-ready export notes

Folder: wix-optimized-html

What changed:
- asset URLs now point to https://smartswing-ai.vercel.app/assets/...
- app-data.js is inlined into interactive pages
- PWA and Vercel analytics scripts were removed
- manifest references were removed

Best use in Wix:
- create one Wix page per exported HTML file
- paste the corresponding page code into an HTML embed or custom code block
- if you want cross-page navigation inside Wix, replace local links like ./pricing.html with your Wix page URLs
"@ | Set-Content -Path (Join-Path $OutputDir 'README.txt') -Encoding UTF8

Get-ChildItem $OutputDir | Select-Object Name, Length
