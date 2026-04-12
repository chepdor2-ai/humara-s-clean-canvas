$text = @"
Tocqueville’s Contrast Between New England and Virginia and Its Implications for National Unity
Alexis de Tocqueville offers one of the most influential comparative analyses of early American colonial development by contrasting the New England and Virginian colonies. His discussion highlights how differences in origins, motivations, and social structures shaped distinct political cultures that would later influence the formation of the United States. Tocqueville (2000) emphasizes that New England was founded primarily by Puritans who migrated as families and communities seeking religious freedom and the opportunity to establish a morally ordered society. Their migration was not driven by economic desperation or imperial ambition alone but by a shared ideological vision rooted in religious covenant and communal responsibility. As a result, New England colonies developed institutions that encouraged participation, literacy, and self-governance, such as town meetings and local assemblies. These institutions fostered a culture of civic engagement and collective decision-making, which Tocqueville saw as foundational to American democracy.
In contrast, Virginia was established under markedly different circumstances. According to Tocqueville (2000), the Virginian colony emerged as a commercial enterprise organized by the Virginia Company, attracting settlers motivated largely by economic opportunity rather than religious ideals. The social structure that developed in Virginia reflected these priorities, with plantation agriculture dominating economic life and leading to the concentration of wealth and power in the hands of a relatively small elite class. This system relied heavily on labor hierarchies, including indentured servitude and later slavery, which reinforced social inequality. Unlike New England, where communities were relatively cohesive and egalitarian in structure, Virginia developed a stratified society with limited opportunities for widespread political participation. Governance in Virginia tended to be more centralized and influenced by elite interests, contrasting sharply with the decentralized and participatory governance of New England.
This contrast between the two regions reveals fundamentally different conceptions of liberty, authority, and social organization. In New England, liberty was closely tied to moral discipline and collective responsibility, reflecting Puritan beliefs about the necessity of maintaining a virtuous community. Political participation was seen as both a right and a duty, reinforcing democratic practices at the local level. In Virginia, however, liberty was often understood in more individualistic and economic terms, particularly for the elite class that controlled political power. The presence of entrenched social hierarchies limited the extent to which democratic ideals could be realized in practice. Tocqueville (2000) suggests that these differences were not merely historical accidents but deeply rooted in the initial conditions under which each colony was established.
The implications of these contrasting colonial experiences for the formation of a unified nation are significant. On one hand, the differences between New England and Virginia complicate the idea of national unity by introducing competing political traditions and values. The participatory, community-oriented model of New England coexisted uneasily with the hierarchical, elite-driven model of Virginia. These tensions would later manifest in debates over federalism, representation, and the balance of power between states and the central government. The divergent social and economic structures also contributed to differing priorities, particularly regarding issues such as slavery, economic policy, and political representation. In this sense, Tocqueville’s contrast highlights the challenges inherent in forging a cohesive national identity from colonies with fundamentally different foundations.
On the other hand, these differences also contributed to the development of a more complex and adaptable political system. The eventual formation of the United States required the integration of these diverse traditions into a single constitutional framework. This process resulted in a system that balances competing interests and accommodates regional diversity. The federal structure of the United States, for example, allows for both local autonomy and national governance, reflecting the need to reconcile differing colonial legacies. Tocqueville’s analysis suggests that the strength of American democracy lies in its ability to incorporate and manage these differences rather than eliminate them. The coexistence of contrasting traditions has contributed to the resilience and flexibility of the American political system.
Ultimately, Tocqueville’s comparison of New England and Virginia provides valuable insight into the origins of American political culture and the complexities of nation-building. The differences between these colonies underscore the challenges of creating a unified political community while also highlighting the potential for diversity to enrich democratic governance. By examining these contrasting foundations, we gain a deeper understanding of how historical experiences shape political institutions and national identity.
"@

$body = @{
  text = $text
  engine = 'oxygen'
  strength = 'medium'
  tone = 'academic'
  strict_meaning = $true
} | ConvertTo-Json -Depth 8

$response = Invoke-WebRequest -Uri 'http://localhost:3000/api/humanize-stream' -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 360
$lines = $response.Content -split "`n" | Where-Object { $_ -match '^data: ' }
$events = @()
foreach ($line in $lines) {
  $payload = $line -replace '^data: ',''
  try { $events += ($payload | ConvertFrom-Json) } catch {}
}

$stages = $events | Where-Object { $_.type -eq 'stage' } | Select-Object -ExpandProperty stage
$cycleStages = $stages | Where-Object { $_ -match '^Cycle\s+\d+/10$' }

Write-Output '=== Stage Summary ==='
Write-Output ("Total stage events: {0}" -f $stages.Count)
Write-Output ("Cycle stage events: {0}" -f $cycleStages.Count)
Write-Output ($cycleStages -join ', ')

# Collect per-cycle sentence snapshots
$cycleTexts = @{}
foreach ($evt in $events) {
  if ($evt.type -eq 'sentence' -and $evt.stage -match '^Cycle\s+\d+/10$') {
    if (-not $cycleTexts.ContainsKey($evt.stage)) { $cycleTexts[$evt.stage] = @() }
    $cycleTexts[$evt.stage] += [string]$evt.text
  }
}

Write-Output '=== Chaining Check (output evolves each cycle) ==='
for ($i = 2; $i -le 10; $i++) {
  $prev = "Cycle $($i-1)/10"
  $curr = "Cycle $i/10"
  if ($cycleTexts.ContainsKey($prev) -and $cycleTexts.ContainsKey($curr)) {
    $prevJoined = ($cycleTexts[$prev] -join ' ')
    $currJoined = ($cycleTexts[$curr] -join ' ')
    $changed = [int]($prevJoined -ne $currJoined)
    Write-Output ("{0} -> {1}: changed={2}" -f $prev, $curr, $changed)
  } else {
    Write-Output ("{0} -> {1}: missing cycle snapshot" -f $prev, $curr)
  }
}
