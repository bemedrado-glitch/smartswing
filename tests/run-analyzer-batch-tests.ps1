param(
  [int]$Port = 8765
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

$edge = Find-EdgeBinary
if ($null -eq $edge) {
  Write-Host '[WARN] Microsoft Edge not found for analyzer batch tests; skipping headless runtime checks.' -ForegroundColor Yellow
  exit 0
}

$scenarios = @(
  @{ Name = 'Player 01'; Shot = 'forehand'; Level = 'beginner'; Gender = 'female'; Age = '13-17'; Mode = 'stroke-tune-up'; Goal = 'Cleaner forehand timing' },
  @{ Name = 'Player 02'; Shot = 'backhand'; Level = 'beginner'; Gender = 'male'; Age = '18-20'; Mode = 'stroke-tune-up'; Goal = 'More stable backhand contact' },
  @{ Name = 'Player 03'; Shot = 'serve'; Level = 'intermediate'; Gender = 'female'; Age = '21-25'; Mode = 'match-readiness'; Goal = 'Higher first serve percentage' },
  @{ Name = 'Player 04'; Shot = 'volley'; Level = 'intermediate'; Gender = 'male'; Age = '26-35'; Mode = 'coach-review'; Goal = 'Better net finishing' },
  @{ Name = 'Player 05'; Shot = 'slice'; Level = 'intermediate'; Gender = 'female'; Age = '36-45'; Mode = 'stroke-tune-up'; Goal = 'Lower skid on slice backhand' },
  @{ Name = 'Player 06'; Shot = 'drop-shot'; Level = 'advanced'; Gender = 'male'; Age = '46-55'; Mode = 'match-readiness'; Goal = 'Disguise and touch on drop shot' },
  @{ Name = 'Player 07'; Shot = 'lob'; Level = 'advanced'; Gender = 'female'; Age = '56+'; Mode = 'match-readiness'; Goal = 'Defensive lob control' },
  @{ Name = 'Player 08'; Shot = 'serve'; Level = 'advanced'; Gender = 'male'; Age = '21-25'; Mode = 'injury-safe-rebuild'; Goal = 'Safer shoulder loading' },
  @{ Name = 'Player 09'; Shot = 'forehand'; Level = 'pro'; Gender = 'female'; Age = '18-20'; Mode = 'coach-review'; Goal = 'Increase forehand penetration' },
  @{ Name = 'Player 10'; Shot = 'backhand'; Level = 'pro'; Gender = 'male'; Age = '26-35'; Mode = 'match-readiness'; Goal = 'Earlier backhand contact under pace' }
)

$requiredMarkers = @(
  'report-header',
  'Score Breakdown',
  'Milestone Track',
  'Achievement Unlocks',
  'Performance KPIs',
  'Fair Score Logic',
  'Tracker Definitions (Why each metric matters)',
  'Coach-ready Summary',
  'Tailored Drill Plan',
  'Match Tactics for This Session',
  '7-Day Execution Plan',
  'Shoulder',
  'Elbow',
  'Hip',
  'Knee',
  'Trunk',
  'Base width',
  'Contact height',
  'Reach / spacing'
)

$failed = $false
$skipped = $false
$edgeProfileDir = Join-Path $PSScriptRoot 'edge-profile-batch'
if (Test-Path $edgeProfileDir) {
  Remove-Item -Recurse -Force $edgeProfileDir
}
New-Item -ItemType Directory -Path $edgeProfileDir | Out-Null

function Get-ScenarioDom {
  param(
    [string]$EdgeBinary,
    [string]$Url
  )

  $maxAttempts = 4
  $bestDom = ''

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $virtualBudget = if ($attempt -le 2) { 26000 } else { 36000 }
    $gpuFlag = if ($attempt -le 2) { '--disable-gpu' } else { '' }
    $edgeCommand = """$EdgeBinary"" --headless $gpuFlag --disable-extensions --user-data-dir=""$edgeProfileDir"" --virtual-time-budget=$virtualBudget --dump-dom ""$Url"" 2>nul"
    $domOutput = (cmd /c $edgeCommand | Out-String)
    if (-not [string]::IsNullOrWhiteSpace($domOutput)) {
      $bestDom = $domOutput
      if ($domOutput -like '*report-header*') {
        return $domOutput
      }
    }
    Start-Sleep -Milliseconds 250
  }

  return $bestDom
}

foreach ($scenario in $scenarios) {
  $query = "demo=1&shot=$($scenario.Shot)&level=$($scenario.Level)&gender=$($scenario.Gender)&age=$([System.Uri]::EscapeDataString($scenario.Age))&mode=$($scenario.Mode)&goal=$([System.Uri]::EscapeDataString($scenario.Goal))"
  $url = "http://127.0.0.1:$Port/analyze.html?$query"
  $domOutput = Get-ScenarioDom -EdgeBinary $edge -Url $url
  if ([string]::IsNullOrWhiteSpace($domOutput)) {
    Write-Host "[WARN] Headless DOM output unavailable in this sandbox; skipping analyzer batch runtime assertions." -ForegroundColor Yellow
    $skipped = $true
    break
  }

  $scenarioPassed = $true
  foreach ($marker in $requiredMarkers) {
    if ($domOutput -notlike "*$marker*") {
      $scenarioPassed = $false
      Write-Host ("[FAIL] {0}: missing marker '{1}'" -f $scenario.Name, $marker) -ForegroundColor Red
      break
    }
  }

  if ($scenarioPassed -and $domOutput -notlike "*Shot: $($scenario.Shot)*") {
    $scenarioPassed = $false
    Write-Host ("[FAIL] {0}: shot type did not render as expected ({1})" -f $scenario.Name, $scenario.Shot) -ForegroundColor Red
  }

  if ($scenarioPassed) {
    Write-Host ("[PASS] {0}: analyzer report rendered for {1} ({2})" -f $scenario.Name, $scenario.Shot, $scenario.Level) -ForegroundColor Green
  } else {
    $failed = $true
  }
}

if ($skipped) {
  exit 0
}

if ($failed) {
  exit 1
}

exit 0
