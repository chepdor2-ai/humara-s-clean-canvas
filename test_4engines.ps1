$testText = "The geographic and political landscape of Washington, D.C., has undergone extensive transformation since its founding in 1790. Originally designated as the seat of the federal government, the city has experienced dramatic demographic, economic, and spatial restructuring over the past two centuries. This paper examines the forces that have shaped Washington, D.C., from a planned capital city into a complex urban environment characterised by stark socioeconomic disparities."

$engines = @("oxygen", "nuru_v2", "humara_v3_3", "ghost_pro_wiki")
$engineNames = @{ "oxygen" = "Humara 2.0"; "nuru_v2" = "Nuru 2.0"; "humara_v3_3" = "Humara 2.4"; "ghost_pro_wiki" = "Wikipedia" }

foreach ($eng in $engines) {
  $name = $engineNames[$eng]
  Write-Output "`n=== Testing $name ($eng) ==="
  
  $body = @{
    text = $testText
    engine = $eng
    strength = "medium"
  } | ConvertTo-Json -Depth 3

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/humanize-stream" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 120
    $sw.Stop()
    
    $events = $response.Content -split "`n" | Where-Object { $_ -match '^data: ' }
    $lastDataEvent = $events | Select-Object -Last 1
    if ($lastDataEvent) {
      $json = $lastDataEvent -replace '^data: ',''
      $parsed = $json | ConvertFrom-Json
      if ($parsed.text) {
        $words = ($parsed.text -split '\s+').Count
        Write-Output "  STATUS: $($response.StatusCode) | TIME: $($sw.Elapsed.TotalSeconds.ToString('F1'))s | WORDS: $words"
        Write-Output "  FIRST 200: $($parsed.text.Substring(0, [Math]::Min(200, $parsed.text.Length)))..."
      } elseif ($parsed.humanized) {
        $words = ($parsed.humanized -split '\s+').Count
        Write-Output "  STATUS: $($response.StatusCode) | TIME: $($sw.Elapsed.TotalSeconds.ToString('F1'))s | WORDS: $words"
        Write-Output "  FIRST 200: $($parsed.humanized.Substring(0, [Math]::Min(200, $parsed.humanized.Length)))..."
      } else {
        Write-Output "  STATUS: $($response.StatusCode) | TIME: $($sw.Elapsed.TotalSeconds.ToString('F1'))s | NO TEXT"
      }
    }
  } catch {
    $sw.Stop()
    Write-Output "  ERROR after $($sw.Elapsed.TotalSeconds.ToString('F1'))s: $_"
  }
}

Write-Output "`n=== ALL TESTS COMPLETE ==="
