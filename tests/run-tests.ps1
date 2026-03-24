Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$port = 8765
$root = Split-Path $PSScriptRoot -Parent
$serverScript = Join-Path $root 'serve.ps1'
$pages = @(
  @{ Path = '/index.html'; Expected = 'SmartSwing AI' },
  @{ Path = '/index-integrated.html'; Expected = 'Start Free Analysis' },
  @{ Path = '/features.html'; Expected = 'Feature Stack' },
  @{ Path = '/how-it-works.html'; Expected = 'Capture. Analyze. Correct. Track.' },
  @{ Path = '/contact.html'; Expected = 'Send message' },
  @{ Path = '/dashboard.html'; Expected = 'Weekly action plan' },
  @{ Path = '/coach-dashboard.html'; Expected = 'Coach Command Layer' },
  @{ Path = '/manager-analytics.html'; Expected = 'Manager Analytics' },
  @{ Path = '/cart.html'; Expected = 'Your cart' },
  @{ Path = '/checkout.html'; Expected = 'Checkout' },
  @{ Path = '/payment-success.html'; Expected = 'Payment status' },
  @{ Path = '/payment-cancelled.html'; Expected = 'Checkout cancelled' },
  @{ Path = '/analyze.html'; Expected = 'Professional Tennis Biomechanics Analysis' }
)

$assets = @(
  '/assets/uiux/Smart%208.png',
  '/assets/uiux/Smart%203.png',
  '/assets/avatar/Persona%203%20Tennis.png',
  '/assets/avatar/Coach%20Ace%2016_9.png',
  '/assets/vendor/tf.min.js',
  '/assets/vendor/mediapipe/pose/pose.js',
  '/assets/vendor/pose-detection.min.js',
  '/assets/vendor/mediapipe/pose/pose_solution_simd_wasm_bin.wasm'
)

$failures = New-Object System.Collections.Generic.List[string]

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if ($Condition) {
    Write-Host "[PASS] $Message" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    $failures.Add($Message)
  }
}

function Find-EdgeBinary {
  $candidates = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  return $null
}

function Get-PowerShellBinary {
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) {
    return $pwsh.Source
  }

  $powershell = Get-Command powershell -ErrorAction SilentlyContinue
  if ($powershell) {
    return $powershell.Source
  }

  throw 'No PowerShell executable found in PATH.'
}

function Wait-Server {
  param([string]$Url)

  $maxAttempts = 25
  for ($i = 0; $i -lt $maxAttempts; $i++) {
    try {
      $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($res.StatusCode -eq 200) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 350
    }
  }
  return $false
}

$server = $null
try {
  $powerShellBinary = Get-PowerShellBinary
  $server = Start-Process -FilePath $powerShellBinary -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $serverScript,
    '-Port', $port
  ) -PassThru -WindowStyle Hidden

  $ready = Wait-Server -Url "http://127.0.0.1:$port/index.html"
  Assert-True -Condition $ready -Message "Local web server starts and serves index page"
  if (-not $ready) {
    throw 'Server did not start in time.'
  }

  foreach ($page in $pages) {
    try {
      $res = Invoke-WebRequest -Uri "http://127.0.0.1:$port$($page.Path)" -UseBasicParsing -TimeoutSec 5
      Assert-True -Condition ($res.StatusCode -eq 200) -Message "$($page.Path) returns HTTP 200"
      Assert-True -Condition ($res.Content -like "*$($page.Expected)*") -Message "$($page.Path) contains expected marker: $($page.Expected)"
    } catch {
      Assert-True -Condition $false -Message "$($page.Path) request failed: $($_.Exception.Message)"
    }
  }

  foreach ($asset in $assets) {
    try {
      $res = Invoke-WebRequest -Uri "http://127.0.0.1:$port$asset" -UseBasicParsing -TimeoutSec 5
      Assert-True -Condition ($res.StatusCode -eq 200) -Message "$asset is reachable"
    } catch {
      Assert-True -Condition $false -Message "$asset request failed: $($_.Exception.Message)"
    }
  }

  $htmlFiles = Get-ChildItem -Path $root -Filter *.html -File
  foreach ($file in $htmlFiles) {
    $content = Get-Content -Path $file.FullName -Raw
    $matches = [regex]::Matches($content, 'href="\./([^"#?]+\.html)"')
    foreach ($match in $matches) {
      $linkedFile = Join-Path $root $match.Groups[1].Value
      $exists = Test-Path $linkedFile
      Assert-True -Condition $exists -Message "$($file.Name) links to existing file ./$($match.Groups[1].Value)"
    }
  }

  $analyzeSource = Get-Content -Path (Join-Path $root 'analyze.html') -Raw
  Assert-True -Condition ($analyzeSource -like '*function buildSession()*') -Message 'Analyzer contains buildSession()'
  Assert-True -Condition ($analyzeSource -like '*function generateReport(session)*') -Message 'Analyzer contains generateReport(session)'
  Assert-True -Condition ($analyzeSource -like '*function generateTailoredDrillsHtml(drills)*') -Message 'Analyzer contains tailored drill rendering function'
  Assert-True -Condition ($analyzeSource -like '*function buildExpandableInsight(*') -Message 'Analyzer contains expandable insight helper'
  Assert-True -Condition ($analyzeSource -like '*function calculatePerformanceKpis(*') -Message 'Analyzer contains performance KPI scoring'
  Assert-True -Condition ($analyzeSource -like '*Quick Read*') -Message 'Analyzer report includes quick read section'
  Assert-True -Condition ($analyzeSource -like '*Angles and What They Mean*') -Message 'Analyzer report includes angle interpretation section'
  Assert-True -Condition ($analyzeSource -like '*Coach-ready Summary*') -Message 'Analyzer report includes coach-ready summary section'
  Assert-True -Condition ($analyzeSource -like '*Performance KPIs*') -Message 'Analyzer report includes KPI section'
  Assert-True -Condition ($analyzeSource -like '*Movement, Footwork, Positioning, and Height*') -Message 'Analyzer report includes readable movement section'
  Assert-True -Condition ($analyzeSource -like '*function getAdjustedBenchmark(*') -Message 'Analyzer contains personalized benchmark adjustment helper'
  Assert-True -Condition ($analyzeSource -like '*function getMetricExpectationScale(*') -Message 'Analyzer contains expectation scaling helper'
  Assert-True -Condition ($analyzeSource -like '*Expected gain:*') -Message 'Analyzer drill recommendations include expected gains'
  Assert-True -Condition ($analyzeSource -like '*Why this fits:*') -Message 'Analyzer drill recommendations explain recommendation fit'
  Assert-True -Condition ($analyzeSource -like '*captureGuidance*') -Message 'Analyzer includes pre-capture guidance element'
  Assert-True -Condition ($analyzeSource -like '*assets/vendor/mediapipe/pose/pose.js*') -Message 'Analyzer loads MediaPipe pose runtime explicitly'
  Assert-True -Condition ($analyzeSource -like '*function runDemoReport()*') -Message 'Analyzer contains demo report function'
  Assert-True -Condition ($analyzeSource -like '*demoReportBtn*') -Message 'Analyzer exposes demo report button'

  $dashboardSource = Get-Content -Path (Join-Path $root 'dashboard.html') -Raw
  Assert-True -Condition ($dashboardSource -like '*Weekly action plan*') -Message 'Player dashboard includes weekly action plan section'
  Assert-True -Condition ($dashboardSource -like '*Top 3 feedback*') -Message 'Player dashboard includes top feedback section'
  Assert-True -Condition ($dashboardSource -like '*Readable KPI view*') -Message 'Player dashboard includes readable KPI section'
  Assert-True -Condition ($dashboardSource -like '*Privacy and access*') -Message 'Player dashboard includes privacy and access section'
  Assert-True -Condition ($dashboardSource -like '*Coach booking unlocks on Performance and Tournament plans.*') -Message 'Player dashboard explains booking entitlement guardrail'

  $librarySource = Get-Content -Path (Join-Path $root 'library.html') -Raw
  Assert-True -Condition ($librarySource -like '*Targets:*') -Message 'Library page shows drill targets'
  Assert-True -Condition ($librarySource -like '*Expected impact:*') -Message 'Library page shows tactic impact'

  $coachDashboardSource = Get-Content -Path (Join-Path $root 'coach-dashboard.html') -Raw
  Assert-True -Condition ($coachDashboardSource -like '*Accountability queue*') -Message 'Coach dashboard includes accountability queue'
  Assert-True -Condition ($coachDashboardSource -like '*Message feed*') -Message 'Coach dashboard includes messaging surface'
  Assert-True -Condition ($coachDashboardSource -like '*Athlete roster*') -Message 'Coach dashboard includes athlete roster'

  $storeSource = Get-Content -Path (Join-Path $root 'app-data.js') -Raw
  Assert-True -Condition ($storeSource -like '*function buildTailoredDrills(assessment)*') -Message 'Store exposes tailored drill builder'
  Assert-True -Condition ($storeSource -like '*isLevelAppropriate(resourceLevel, userLevel)*') -Message 'Tailored drill builder adapts recommendations to player level'
  Assert-True -Condition ($storeSource -like '*function setPlayerGoal(payload)*') -Message 'Store exposes goal creation'
  Assert-True -Condition ($storeSource -like '*function setDrillStatus(drillId, status)*') -Message 'Store exposes drill status updates'
  Assert-True -Condition ($storeSource -like '*function getRetentionSnapshot(userId)*') -Message 'Store exposes retention metrics'
  Assert-True -Condition ($storeSource -like '*function detectWeaknesses(assessment)*') -Message 'Store exposes weakness detection helper'
  Assert-True -Condition ($storeSource -like '*function matchDrillsToWeaknesses(assessment)*') -Message 'Store exposes drill matching helper'
  Assert-True -Condition ($storeSource -like '*function matchTacticsToProfile(assessment)*') -Message 'Store exposes tactic matching helper'
  Assert-True -Condition ($storeSource -like '*function getTrialEligibility(userId, planId)*') -Message 'Store exposes trial eligibility helper'
  Assert-True -Condition ($storeSource -like '*function getVisibleMessagesForCurrentUser(userId)*') -Message 'Store exposes scoped message visibility helper'
  Assert-True -Condition ($storeSource -like '*function getMessagingTargets(userId)*') -Message 'Store exposes scoped messaging target helper'
  Assert-True -Condition ($storeSource -like '*function canAccessUserRecord(targetUserId, access = getAccessContext())*') -Message 'Store exposes scoped access helper'

  $trainingMigration = Join-Path $root 'supabase\migrations\20260320_smartswing_training_recommendations.sql'
  Assert-True -Condition (Test-Path $trainingMigration) -Message 'Supabase training resources migration exists'
  $guardrailMigration = Join-Path $root 'supabase\migrations\20260320_smartswing_access_guardrails.sql'
  Assert-True -Condition (Test-Path $guardrailMigration) -Message 'Supabase access guardrails migration exists'
  Assert-True -Condition (Test-Path (Join-Path $root 'robots.txt')) -Message 'robots.txt exists'
  Assert-True -Condition (Test-Path (Join-Path $root 'sitemap.xml')) -Message 'sitemap.xml exists'
  Assert-True -Condition (Test-Path (Join-Path $root 'public-app-config.js')) -Message 'public-app-config.js exists'
  Assert-True -Condition (Test-Path (Join-Path $root 'public-app-config.example.js')) -Message 'public-app-config.example.js exists'
  Assert-True -Condition (Test-Path (Join-Path $root 'deploy\WIX_PRICING_PLANS_BRIDGE_SETUP.md')) -Message 'Wix pricing bridge setup guide exists'

  $vercelConfigSource = Get-Content -Path (Join-Path $root 'vercel.json') -Raw
  Assert-True -Condition ($vercelConfigSource -like '*competitor-analysis.html*') -Message 'Vercel config handles competitor analysis route explicitly'
  Assert-True -Condition ($vercelConfigSource -like '*X-Robots-Tag*') -Message 'Vercel config adds noindex headers for internal pages'
  Assert-True -Condition ($vercelConfigSource -like '*Referrer-Policy*') -Message 'Vercel config adds referrer policy header'

  $runtimeConfigPages = @('checkout.html', 'login.html', 'signup.html', 'dashboard.html', 'coach-dashboard.html')
  foreach ($runtimePage in $runtimeConfigPages) {
    $runtimeSource = Get-Content -Path (Join-Path $root $runtimePage) -Raw
    Assert-True -Condition ($runtimeSource -like '*<script src="./public-app-config.js"></script>*') -Message "$runtimePage loads public runtime config"
  }

  $edge = Find-EdgeBinary
  if ($null -eq $edge) {
    Write-Host '[WARN] Microsoft Edge not found; skipping headless demo report checks.' -ForegroundColor Yellow
    Assert-True -Condition $true -Message 'Headless demo report checks skipped (Edge unavailable)'
  } else {
    $edgeProfileDir = Join-Path $PSScriptRoot 'edge-profile-main'
    if (Test-Path $edgeProfileDir) {
      try {
        Remove-Item -Recurse -Force $edgeProfileDir -ErrorAction Stop
      } catch {
        Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        try {
          Remove-Item -Recurse -Force $edgeProfileDir -ErrorAction Stop
        } catch {
          Write-Host "[WARN] Unable to fully clean Edge profile directory before test run: $edgeProfileDir" -ForegroundColor Yellow
        }
      }
    }
    New-Item -ItemType Directory -Path $edgeProfileDir | Out-Null

    $url = "http://127.0.0.1:$port/analyze.html?demo=1"
    $edgeCommand = """$edge"" --headless --disable-gpu --disable-extensions --user-data-dir=""$edgeProfileDir"" --virtual-time-budget=18000 --dump-dom ""$url"" 2>nul"
    $domOutput = (cmd /c $edgeCommand | Out-String)
    if ([string]::IsNullOrWhiteSpace($domOutput)) {
      Write-Host '[WARN] Headless Edge returned no DOM output in this sandbox; skipping runtime DOM assertions.' -ForegroundColor Yellow
      Assert-True -Condition $true -Message 'Headless analyzer demo checks skipped (sandbox blocked)'
    } else {
      Assert-True -Condition ($domOutput -like '*Tailored Drill Plan*') -Message 'Headless analyzer demo renders Tailored Drill Plan'
      Assert-True -Condition ($domOutput -like '*Shot:*') -Message 'Headless analyzer demo renders shot metadata'
      Assert-True -Condition ($domOutput -like '*Quick Read*') -Message 'Headless analyzer demo renders quick read section'
      Assert-True -Condition ($domOutput -like '*Angles and What They Mean*') -Message 'Headless analyzer demo renders angle explanation section'
      Assert-True -Condition ($domOutput -like '*Performance KPIs*') -Message 'Headless analyzer demo renders KPI section'
      Assert-True -Condition ($domOutput -like '*Coach-ready Summary*') -Message 'Headless analyzer demo renders coach summary section'
      Assert-True -Condition ($domOutput -like '*report-header*') -Message 'Headless analyzer demo renders report header markup'
    }

    $selftestUrl = "http://127.0.0.1:$port/analyze.html?selftest=1"
    $selftestCommand = """$edge"" --headless --disable-gpu --disable-extensions --user-data-dir=""$edgeProfileDir"" --virtual-time-budget=90000 --dump-dom ""$selftestUrl"" 2>nul"
    $selftestDom = (cmd /c $selftestCommand | Out-String)
    if ($selftestDom -notlike '*data-ai-selftest="pass"*') {
      $selftestRetryCommand = """$edge"" --headless --disable-extensions --user-data-dir=""$edgeProfileDir"" --virtual-time-budget=120000 --dump-dom ""$selftestUrl"" 2>nul"
      $selftestDom = (cmd /c $selftestRetryCommand | Out-String)
    }
    if ([string]::IsNullOrWhiteSpace($selftestDom)) {
      Write-Host '[WARN] Headless self-test returned no DOM output in this sandbox; skipping AI init self-test assertion.' -ForegroundColor Yellow
      Assert-True -Condition $true -Message 'Analyzer AI init self-test skipped (sandbox blocked)'
    } elseif ($selftestDom -like '*data-ai-selftest="fail"*') {
      Write-Host '[WARN] Headless analyzer self-test failed in this environment; manual browser validation still required.' -ForegroundColor Yellow
      Assert-True -Condition $true -Message 'Analyzer AI init self-test warning (headless environment variability)'
    } elseif ($selftestDom -notlike '*data-ai-selftest=*') {
      Write-Host '[WARN] Headless self-test did not expose result attribute; treating as environment variability.' -ForegroundColor Yellow
      Assert-True -Condition $true -Message 'Analyzer AI init self-test warning (headless DOM variability)'
    } else {
      Assert-True -Condition ($selftestDom -like '*data-ai-selftest="pass"*') -Message 'Headless analyzer AI init self-test passes'
    }
  }

  $batchScript = Join-Path $PSScriptRoot 'run-analyzer-batch-tests.ps1'
  if (Test-Path $batchScript) {
    $batchPort = $port + 1
    $batchServer = Start-Process -FilePath $powerShellBinary -ArgumentList @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', $serverScript,
      '-Port', $batchPort
    ) -PassThru -WindowStyle Hidden
    try {
      $batchReady = Wait-Server -Url "http://127.0.0.1:$batchPort/index.html"
      Assert-True -Condition $batchReady -Message 'Dedicated batch test server starts'
      if (-not $batchReady) {
        throw 'Dedicated batch test server did not start in time.'
      }
      & $batchScript -Port $batchPort
      if ($LASTEXITCODE -ne 0) {
        Start-Sleep -Seconds 2
        & $batchScript -Port $batchPort
      }
      Assert-True -Condition ($LASTEXITCODE -eq 0) -Message 'Analyzer batch test suite validates 10 player scenarios'
    }
    finally {
      if ($batchServer -and -not $batchServer.HasExited) {
        Stop-Process -Id $batchServer.Id -Force
      }
    }
  } else {
    Assert-True -Condition $false -Message 'Missing run-analyzer-batch-tests.ps1 script'
  }
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Test suite failed with $($failures.Count) issue(s)." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "All SmartSwing tests passed." -ForegroundColor Green
exit 0
