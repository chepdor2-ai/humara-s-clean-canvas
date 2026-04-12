$text = "I. INTRODUCTION`n`nThe geographic and political landscape of Washington, D.C., has undergone extensive transformation since its founding in 1790. Originally designated as the seat of the federal government, the city has experienced dramatic demographic, economic, and spatial restructuring over the past two centuries. This paper examines the forces that have shaped Washington, D.C., from a planned capital city into a complex urban environment characterised by stark socioeconomic disparities. It explores the key mechanisms - including federal policy, suburbanisation, racial segregation, and economic restructuring - that have produced the contemporary urban form. The central argument posits that D.C.'s development has been driven by the interplay of federal authority, private capital, and racialised governance, which together have created a city of deep contradictions.`n`nII. CONCENTRATED POVERTY AND SUBURBANISATION`n`nThroughout the latter half of the twentieth century, Washington, D.C., became emblematic of a broader national trend: the concentration of poverty within inner-city areas alongside the rapid suburbanisation of wealthier, predominantly white populations. The post-World War II era saw significant federal investment in highway construction and suburban housing, which facilitated mass migration from urban centres to surrounding suburbs. In the case of D.C., this migration was profoundly shaped by racial dynamics. White flight from the city accelerated during the 1950s and 1960s, coinciding with the civil rights movement and increasing African-American political mobilization within the district. The resulting spatial divide between a predominantly Black inner city and largely white suburbs in Maryland and Virginia became one of the most visible expressions of racialized inequality in the United States. Federal disinvestment in urban areas, coupled with discriminatory housing policies such as redlining and restrictive covenants, further entrenched poverty within D.C.'s boundaries. Public housing developments, initially conceived as temporary relief measures during the New Deal, became long-term repositories for the urban poor, disproportionately affecting African-American communities. By the 1980s, neighborhoods in Southeast and Northeast D.C. exhibited extreme levels of poverty, unemployment, and social dislocation. These areas were often characterized by deteriorating infrastructure, limited access to quality education and healthcare, and heightened exposure to crime and violence.`n`nIII. POST-INDUSTRIAL URBANISM AND GENTRIFICATION`n`nThe late twentieth and early twenty-first centuries witnessed a notable reversal in some of these trends. Beginning in the 1990s, Washington, D.C., experienced a wave of gentrification that fundamentally altered many previously low-income neighborhoods. The influx of young professionals, attracted by proximity to federal employment, cultural amenities, and improving infrastructure, transformed areas such as Shaw, Columbia Heights, and the H Street Corridor. Property values surged, new commercial developments proliferated, and the demographic composition of these neighborhoods shifted markedly. However, gentrification in D.C. has been widely criticized for its role in displacing longstanding African-American residents and erasing the cultural fabric of historically Black neighborhoods. Scholars such as Hyra (2017) have argued that gentrification in D.C. represents a form of `"new urban renewal,`" in which market-driven redevelopment serves the interests of affluent newcomers at the expense of existing communities. The tension between development and displacement remains one of the defining features of contemporary Washington, D.C., raising important questions about equity, belonging, and the right to the city."

$body = @{
  text = $text
  engine = "ghost_pro_wiki"
  strength = 6
} | ConvertTo-Json -Depth 3

Write-Output "Sending request..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
  $response = Invoke-WebRequest -Uri "http://localhost:3000/api/humanize-stream" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 600
  $sw.Stop()
  Write-Output "STATUS: $($response.StatusCode) (took $($sw.Elapsed.TotalSeconds.ToString('F1'))s)"
  
  $events = $response.Content -split "`n" | Where-Object { $_ -match '^data: ' }
  $lastDataEvent = $events | Select-Object -Last 1
  if ($lastDataEvent) {
    $json = $lastDataEvent -replace '^data: ',''
    $parsed = $json | ConvertFrom-Json
    Write-Output "DONE: $($parsed.done)"
    if ($parsed.text) {
      $words = ($parsed.text -split '\s+').Count
      Write-Output "OUTPUT: $words words, $($parsed.text.Length) chars"
      Write-Output "---FULL OUTPUT---"
      Write-Output $parsed.text
      Write-Output "---END OUTPUT---"
    }
  }
} catch {
  $sw.Stop()
  Write-Output "ERROR after $($sw.Elapsed.TotalSeconds.ToString('F1'))s: $_"
}
