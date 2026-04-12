$body = @{
    text = "Health education is a profession of educating people about health. Areas of health education encompass environmental health, physical health, social health, emotional health, intellectual health, and spiritual health, as well as sexual and reproductive health education. Health education can be defined as the principle by which individuals and groups of people learn to behave in a manner conducive to the promotion, maintenance, or restoration of health. However, as there are multiple definitions of health, there are also multiple definitions of health education. In America, the Joint Committee on Health Education and Promotion Terminology of 2001 defined health education as any combination of planned learning experiences based on sound theories that provide individuals, groups, and communities the opportunity to acquire information and the skills needed to make quality health decisions.

The World Health Organization defined health education as comprising of consciously constructed opportunities for learning involving some form of communication designed to improve health literacy, including improving knowledge and developing life skills which are conducive to individual and community health. Health education teaches about physical, mental, emotional, and social health topics. It motivates students to improve and maintain their health, prevent disease, and reduce risky behaviors. Health education curricula and instruction help students learn skills they will use to make healthy choices throughout their lifetime.

Comprehensive health education contributes to the academic success of young people. Research has shown that health and education are closely linked and that educated individuals generally lead longer healthier lives. Students who are physically active and eat well tend to perform better academically. Schools provide an ideal setting for health education because they reach large numbers of children and adolescents. Effective school health programs can have lasting positive effects on students health behaviors and academic outcomes well into adulthood."
    engine = "ghost_pro_wiki"
    strength = "medium"
} | ConvertTo-Json -Depth 3

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/humanize" -Method Post -Body $body -ContentType "application/json"

Write-Host "=== RAW RESPONSE TYPE ==="
Write-Host $response.GetType().FullName
Write-Host ""
Write-Host "=== RAW RESPONSE ==="
$response | ConvertTo-Json -Depth 5 | Write-Host
