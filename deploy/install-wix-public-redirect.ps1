param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey,

  [Parameter(Mandatory = $true)]
  [string]$SiteId
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "wix-public-site-redirect.js"
if (!(Test-Path $scriptPath)) {
  throw "Redirect script not found: $scriptPath"
}

$scriptContents = Get-Content $scriptPath -Raw
$headers = @{
  Authorization = $ApiKey
  "wix-site-id" = $SiteId
  "Content-Type" = "application/json"
}

$existing = Invoke-RestMethod -Method Get -Uri "https://www.wixapis.com/embeds/v1/custom-embeds" -Headers $headers
$match = $existing.customEmbeds | Where-Object { $_.name -eq "SmartSwing Public Site Redirect" } | Select-Object -First 1

$payload = @{
  customEmbed = @{
    name = "SmartSwing Public Site Redirect"
    enabled = $true
    loadOnce = $false
    position = "HEAD"
    embedData = @{
      html = "<script>`n$scriptContents`n</script>"
      category = "ESSENTIAL"
    }
  }
} | ConvertTo-Json -Depth 10

if ($match) {
  $id = $match.id
  Invoke-RestMethod -Method Put -Uri "https://www.wixapis.com/embeds/v1/custom-embeds/$id" -Headers $headers -Body $payload | Out-Null
  Write-Output "UPDATED:$id"
} else {
  $created = Invoke-RestMethod -Method Post -Uri "https://www.wixapis.com/embeds/v1/custom-embeds" -Headers $headers -Body $payload
  Write-Output "CREATED:$($created.customEmbed.id)"
}
