param(
  [int]$Port = 5500
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$recordPath = Join-Path $root "record.json"
$listener = [System.Net.HttpListener]::new()
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "Serving $root at $prefix"
Write-Host "Press Ctrl+C to stop."

try {
  Start-Process $prefix | Out-Null
} catch {
}

function Get-ContentType([string]$path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".js"   { "application/javascript; charset=utf-8" }
    ".css"  { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".png"  { "image/png" }
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".gif"  { "image/gif" }
    ".svg"  { "image/svg+xml" }
    ".ico"  { "image/x-icon" }
    ".map"  { "application/json; charset=utf-8" }
    default { "application/octet-stream" }
  }
}

function Ensure-RecordFile {
  if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) {
    '{"tracks":{}}' | Set-Content -LiteralPath $recordPath -Encoding UTF8
  }
}

function Read-RecordObject {
  Ensure-RecordFile
  $raw = Get-Content -LiteralPath $recordPath -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @{ tracks = @{} }
  }
  try {
    return ($raw | ConvertFrom-Json -AsHashtable)
  } catch {
    return @{ tracks = @{} }
  }
}

function Write-JsonResponse($ctx, [int]$statusCode, $obj) {
  $json = $obj | ConvertTo-Json -Depth 8
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $statusCode
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.OutputStream.Close()
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $reqPath = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))

    if ($reqPath -eq "api/records") {
      if ($ctx.Request.HttpMethod -eq "GET") {
        $trackId = $ctx.Request.QueryString["trackId"]
        $db = Read-RecordObject
        if (-not $db.ContainsKey("tracks")) { $db["tracks"] = @{} }

        if ([string]::IsNullOrWhiteSpace($trackId)) {
          Write-JsonResponse $ctx 200 $db
          continue
        }

        $rows = @()
        if ($db["tracks"].ContainsKey($trackId)) { $rows = @($db["tracks"][$trackId]) }
        $top5 = $rows | Sort-Object totalTimeMs | Select-Object -First 5
        Write-JsonResponse $ctx 200 @{ trackId = $trackId; top5 = @($top5) }
        continue
      }

      if ($ctx.Request.HttpMethod -eq "POST") {
        $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
        $body = $reader.ReadToEnd()
        $reader.Close()

        $payload = $body | ConvertFrom-Json -AsHashtable
        $trackId = [string]$payload["trackId"]
        $player = [string]$payload["player"]
        $totalTimeMs = [double]$payload["totalTimeMs"]
        $bestLapMs = [double]$payload["bestLapMs"]

        $validTotal = -not ([double]::IsNaN($totalTimeMs) -or [double]::IsInfinity($totalTimeMs))
        if ([string]::IsNullOrWhiteSpace($trackId) -or [string]::IsNullOrWhiteSpace($player) -or -not $validTotal) {
          Write-JsonResponse $ctx 400 @{ ok = $false; error = "invalid payload" }
          continue
        }

        $db = Read-RecordObject
        if (-not $db.ContainsKey("tracks")) { $db["tracks"] = @{} }
        if (-not $db["tracks"].ContainsKey($trackId)) { $db["tracks"][$trackId] = @() }

        $entry = @{
          player = $player
          totalTimeMs = [math]::Round($totalTimeMs, 0)
          bestLapMs = if (-not ([double]::IsNaN($bestLapMs) -or [double]::IsInfinity($bestLapMs))) { [math]::Round($bestLapMs, 0) } else { 0 }
          createdAt = (Get-Date).ToString("s")
        }

        $rows = @($db["tracks"][$trackId]) + @($entry)
        $rows = $rows | Sort-Object totalTimeMs | Select-Object -First 300
        $db["tracks"][$trackId] = @($rows)
        ($db | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $recordPath -Encoding UTF8

        $top5 = $db["tracks"][$trackId] | Sort-Object totalTimeMs | Select-Object -First 5
        Write-JsonResponse $ctx 200 @{ ok = $true; trackId = $trackId; top5 = @($top5) }
        continue
      }

      Write-JsonResponse $ctx 405 @{ ok = $false; error = "method not allowed" }
      continue
    }

    if ([string]::IsNullOrWhiteSpace($reqPath)) { $reqPath = "index.html" }
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $reqPath))

    if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $ctx.Response.StatusCode = 403
      $ctx.Response.Close()
      continue
    }

    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
      $ctx.Response.Close()
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $ctx.Response.ContentType = Get-ContentType $fullPath
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
  } catch {
    try {
      $ctx.Response.StatusCode = 500
      $ctx.Response.Close()
    } catch {
    }
  }
}
