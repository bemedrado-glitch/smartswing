param(
  [int]$Port = 8765
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$validShots = @('forehand', 'backhand', 'serve', 'volley', 'slice', 'drop-shot', 'lob', 'return')
$validLevels = @('beginner', 'intermediate', 'advanced', 'pro')

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
  @{ Name = 'Player 10'; Shot = 'backhand'; Level = 'pro'; Gender = 'male'; Age = '26-35'; Mode = 'match-readiness'; Goal = 'Earlier backhand contact under pace' },
  @{ Name = 'Player 11'; Shot = 'forehand'; Level = 'beginner'; Gender = 'male'; Age = '13-17'; Mode = 'confidence-build'; Goal = 'Cleaner spacing on forehand' },
  @{ Name = 'Player 12'; Shot = 'serve'; Level = 'beginner'; Gender = 'female'; Age = '18-20'; Mode = 'stroke-tune-up'; Goal = 'More reliable toss height' },
  @{ Name = 'Player 13'; Shot = 'return'; Level = 'intermediate'; Gender = 'male'; Age = '21-25'; Mode = 'match-readiness'; Goal = 'Faster first move on return' },
  @{ Name = 'Player 14'; Shot = 'backhand'; Level = 'intermediate'; Gender = 'female'; Age = '26-35'; Mode = 'coach-review'; Goal = 'Earlier shoulder turn on backhand' },
  @{ Name = 'Player 15'; Shot = 'volley'; Level = 'advanced'; Gender = 'female'; Age = '36-45'; Mode = 'match-readiness'; Goal = 'Stronger first volley control' },
  @{ Name = 'Player 16'; Shot = 'serve'; Level = 'advanced'; Gender = 'male'; Age = '46-55'; Mode = 'coach-review'; Goal = 'Cleaner leg drive timing' },
  @{ Name = 'Player 17'; Shot = 'slice'; Level = 'advanced'; Gender = 'male'; Age = '26-35'; Mode = 'defensive-reset'; Goal = 'More depth on slice backhand' },
  @{ Name = 'Player 18'; Shot = 'lob'; Level = 'intermediate'; Gender = 'female'; Age = '21-25'; Mode = 'defensive-reset'; Goal = 'Higher safety margin on lob' },
  @{ Name = 'Player 19'; Shot = 'drop-shot'; Level = 'pro'; Gender = 'female'; Age = '21-25'; Mode = 'coach-review'; Goal = 'Hide drop shot off same prep' },
  @{ Name = 'Player 20'; Shot = 'return'; Level = 'pro'; Gender = 'male'; Age = '18-20'; Mode = 'match-readiness'; Goal = 'Aggressive compact return under pace' }
)

$failed = $false

if ($scenarios.Count -ne 20) {
  Write-Host ("[FAIL] Expected 20 player scenarios but found {0}" -f $scenarios.Count) -ForegroundColor Red
  exit 1
}

$uniqueNames = $scenarios.Name | Sort-Object -Unique
if ($uniqueNames.Count -ne 20) {
  Write-Host '[FAIL] Player scenario names must be unique.' -ForegroundColor Red
  exit 1
}

foreach ($shot in $validShots) {
  if (-not ($scenarios.Shot -contains $shot)) {
    Write-Host ("[FAIL] Scenario coverage missing shot type '{0}'" -f $shot) -ForegroundColor Red
    exit 1
  }
}

foreach ($level in $validLevels) {
  if (-not ($scenarios.Level -contains $level)) {
    Write-Host ("[FAIL] Scenario coverage missing level '{0}'" -f $level) -ForegroundColor Red
    exit 1
  }
}

foreach ($scenario in $scenarios) {
  if ($validShots -notcontains $scenario.Shot) {
    Write-Host ("[FAIL] {0}: unsupported shot '{1}'" -f $scenario.Name, $scenario.Shot) -ForegroundColor Red
    $failed = $true
    continue
  }

  if ($validLevels -notcontains $scenario.Level) {
    Write-Host ("[FAIL] {0}: unsupported level '{1}'" -f $scenario.Name, $scenario.Level) -ForegroundColor Red
    $failed = $true
    continue
  }

  $query = "demo=1&shot=$($scenario.Shot)&level=$($scenario.Level)&gender=$($scenario.Gender)&age=$([System.Uri]::EscapeDataString($scenario.Age))&mode=$($scenario.Mode)&goal=$([System.Uri]::EscapeDataString($scenario.Goal))"
  $url = "http://127.0.0.1:$Port/analyze.html?$query"

  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ne 200) {
      Write-Host ("[FAIL] {0}: analyzer route returned HTTP {1}" -f $scenario.Name, $response.StatusCode) -ForegroundColor Red
      $failed = $true
      continue
    }

    $content = $response.Content
    $hasCoreAnalyzerShell = $content -like '*Professional Tennis Biomechanics Analysis*' -and
      $content -like '*Quick Read*' -and
      $content -like '*Tailored Drill Plan*' -and
      $content -like '*Coach-ready Summary*'

    if (-not $hasCoreAnalyzerShell) {
      Write-Host ("[FAIL] {0}: analyzer shell missing required report sections" -f $scenario.Name) -ForegroundColor Red
      $failed = $true
      continue
    }

    Write-Host ("[PASS] {0}: analyzer route accepted scenario for {1} ({2})" -f $scenario.Name, $scenario.Shot, $scenario.Level) -ForegroundColor Green
  } catch {
    Write-Host ("[FAIL] {0}: analyzer request failed - {1}" -f $scenario.Name, $_.Exception.Message) -ForegroundColor Red
    $failed = $true
  }
}

if ($failed) {
  exit 1
}

exit 0
