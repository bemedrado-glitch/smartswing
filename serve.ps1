param(
  [int]$Port = 8000
)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$workspaceRoot = Split-Path $PSScriptRoot -Parent

Write-Host "SmartSwing AI serving at http://127.0.0.1:$Port/"

$contentTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType
  )

  $headers = @(
    "HTTP/1.1 $StatusCode $StatusText"
    "Content-Type: $ContentType"
    "Content-Length: $($Body.Length)"
    "Connection: close"
    ""
    ""
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
  $Stream.Flush()
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        $client.Close()
        continue
      }

      while ($reader.ReadLine()) { }

      $parts = $requestLine.Split(' ')
      $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
      $relativePath = [System.Uri]::UnescapeDataString($rawPath.Split('?')[0]).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = 'index.html'
      }

      $relativeFsPath = $relativePath -replace '/', '\'
      $localPath = Join-Path $PSScriptRoot $relativeFsPath
      if ((-not (Test-Path $localPath)) -or (Get-Item $localPath).PSIsContainer) {
        $localPath = Join-Path $workspaceRoot $relativeFsPath
      }

      if ((Test-Path $localPath) -and -not (Get-Item $localPath).PSIsContainer) {
        $extension = [System.IO.Path]::GetExtension($localPath).ToLowerInvariant()
        $contentType = if ($contentTypes.ContainsKey($extension)) { $contentTypes[$extension] } else { 'application/octet-stream' }
        $body = [System.IO.File]::ReadAllBytes($localPath)
        Send-Response -Stream $stream -StatusCode 200 -StatusText 'OK' -Body $body -ContentType $contentType
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        Send-Response -Stream $stream -StatusCode 404 -StatusText 'Not Found' -Body $body -ContentType 'text/plain; charset=utf-8'
      }
    } finally {
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
