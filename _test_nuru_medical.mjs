// Test Nuru engine on full medical AI paper — target: 0% AI, natural readability
const text = `The Impact of Artificial Intelligence on Modern Healthcare Systems

Abstract
Artificial Intelligence (AI) has significantly transformed healthcare systems globally, improving diagnostic accuracy, operational efficiency, and patient outcomes. Recent estimates indicate that AI adoption in healthcare has increased by approximately 38.5% between 2020 and 2025, driven by advancements in machine learning algorithms and data availability (Topol, 2019). This paper evaluates the quantitative and qualitative impacts of AI, highlighting its benefits, limitations, and future potential.

1. Introduction
Healthcare systems worldwide face mounting pressures from aging populations, chronic disease burdens, and resource constraints. AI technologies have emerged as a transformative solution, offering the potential to address these challenges through data-driven insights and automated processes. According to a 2023 report by Accenture, AI applications in healthcare could generate up to $150 billion in annual savings for the United States healthcare economy by 2026 (Accenture, 2020). This paper examines the multifaceted impact of AI on diagnostic processes, treatment planning, operational efficiency, and ethical considerations within modern healthcare systems.

2. AI in Diagnostic Processes
The application of AI in diagnostics has demonstrated remarkable improvements in both speed and accuracy. A landmark study by Esteva et al. (2017) found that a deep learning algorithm could classify skin cancer with an accuracy of 94.6%, comparable to board-certified dermatologists. Similarly, AI-powered imaging tools have reduced diagnostic errors in radiology by approximately 25-30% (Rajkomar et al., 2019). Key diagnostic applications include:
- Radiology: AI algorithms analyze medical images, detecting anomalies that human radiologists might overlook.
- Pathology: Machine learning models identify cancerous cells with precision rates exceeding 95%.
- Cardiology: AI systems predict cardiac events up to 24 hours in advance with a sensitivity of 87%.
These advancements collectively contribute to earlier disease detection, improved treatment outcomes, and reduced healthcare costs.

3. Treatment Planning and Personalized Medicine
AI's capacity for processing vast datasets enables highly personalized treatment planning. Precision medicine platforms, powered by AI, analyze genomic data, patient history, and real-time physiological metrics to recommend individualized therapeutic strategies. Clinical trials incorporating AI-assisted treatment planning have reported a 15.2% improvement in patient recovery rates (Topol, 2019). Moreover, AI-driven drug discovery has reduced the average drug development timeline from 12 years to approximately 7 years, representing a significant reduction of 41.7%.

4. Operational Efficiency
Beyond clinical applications, AI substantially improves healthcare operational efficiency. Predictive analytics tools optimize hospital bed management, reducing patient wait times by an average of 18.3%. Administrative automation, including AI-powered billing systems and appointment scheduling, has decreased administrative costs by 30-35% in pilot programs across multiple healthcare institutions (Accenture, 2020). Hospital readmission rates have also declined by 12.8 days on average when AI-based discharge planning systems are implemented.

5. Ethical Considerations and Limitations
Despite its promise, AI in healthcare raises significant ethical and practical concerns. Algorithmic bias remains a critical issue, with studies showing that AI models trained predominantly on data from specific demographic groups exhibit reduced accuracy for underrepresented populations, with error rates up to 35% higher (Rajkomar et al., 2019). Data privacy concerns, regulatory compliance, and the potential displacement of healthcare workers further complicate widespread AI adoption. The lack of transparency in many AI decision-making processes, often described as the "black box" problem, poses challenges for clinical accountability and patient trust.

6. Conclusion
Artificial Intelligence presents both extraordinary opportunities and significant challenges for modern healthcare systems. The quantitative evidence demonstrates substantial improvements in diagnostic accuracy, treatment efficacy, and operational efficiency, with projected economic benefits reaching $187.9 billion globally by 2030. However, addressing ethical concerns, ensuring equitable access, and maintaining human oversight remain paramount to responsible AI integration in healthcare. Future research should focus on developing transparent, bias-free AI systems that complement rather than replace human clinical judgment, ensuring that technological advancement serves the fundamental goal of improved patient care for all populations.`;

console.log('Testing Nuru v2 on medical AI paper...\n');
console.log('Input length:', text.length, 'chars\n');

try {
  const resp = await fetch('http://localhost:3000/api/humanize-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, engine: 'nuru_v2', strength: 'medium', tone: 'academic' }),
    signal: AbortSignal.timeout(300000),
  });

  if (!resp.ok) {
    console.error('HTTP Error:', resp.status, resp.statusText);
    const body = await resp.text();
    console.error('Response:', body.slice(0, 500));
    process.exit(1);
  }

  const body = await resp.text();
  const lines = body.split('\n').filter(l => l.trim());
  
  const doneLine = lines.find(l => l.includes('"type":"done"'));
  const errorLine = lines.find(l => l.includes('"type":"error"'));
  
  if (errorLine) {
    const err = JSON.parse(errorLine.replace(/^data:\s*/, ''));
    console.error('Engine error:', err.error || err.message);
    process.exit(1);
  }

  if (!doneLine) {
    console.error('No done event received. Last 5 lines:');
    lines.slice(-5).forEach(l => console.error(' ', l));
    process.exit(1);
  }

  const d = JSON.parse(doneLine.replace(/^data:\s*/, ''));
  const output = d.humanized;

  console.log('='.repeat(70));
  console.log('OUTPUT:');
  console.log('='.repeat(70));
  console.log(output);
  console.log('='.repeat(70));
  console.log('\nOutput length:', output.length, 'chars\n');

  // Content preservation checks
  const checks = [
    ['38.5%', output.includes('38.5%')],
    ['94.6%', output.includes('94.6%')],
    ['$150 billion', output.includes('150 billion') || output.includes('$150')],
    ['15.2%', output.includes('15.2%')],
    ['12.8 days', output.includes('12.8')],
    ['35% higher', output.includes('35%')],
    ['$187.9 billion', output.includes('187.9') || output.includes('$187')],
    ['25-30%', output.includes('25') && output.includes('30')],
    ['(Topol, 2019)', output.toLowerCase().includes('topol')],
    ['(Esteva', output.toLowerCase().includes('esteva')],
    ['(Rajkomar', output.toLowerCase().includes('rajkomar')],
    ['(Accenture, 2020)', output.toLowerCase().includes('accenture')],
    ['No "utilize"', !/(utilize|utilise)/i.test(output)],
    ['No "leverage"', !/\bleverage\b/i.test(output)],
    ['No "furthermore"', !/\bfurthermore\b/i.test(output)],
    ['No "moreover"', !/\bmoreover\b/i.test(output)],
    ['No "additionally"', !/\badditionally\b/i.test(output)],
    ['No "transformative"', !/\btransformative\b/i.test(output)],
    ['No "multifaceted"', !/\bmultifaceted\b/i.test(output)],
    ['No "pivotal"', !/\bpivotal\b/i.test(output)],
    ['No "robust"', !/\brobust\b/i.test(output)],
    ['No "comprehensive"', !/\bcomprehensive\b/i.test(output)],
    ['No "delve"', !/\bdelve\b/i.test(output)],
    ['No "paramount"', !/\bparamount\b/i.test(output)],
    ['No "underscore"', !/\bunderscore/i.test(output)],
    ['Has section headers', output.includes('Introduction') || output.includes('introduction')],
    ['Has bullet points', output.includes('-') || output.includes('•')],
    ['No double periods', !output.includes('..')],
    ['No empty sentences', !/\.\s{0,2}\./g.test(output)],
  ];

  console.log('--- CONTENT & QUALITY CHECKS ---');
  let pass = 0;
  let total = checks.length;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
  }

  const score = Math.round((pass / total) * 100);
  console.log(`\n  Score: ${pass}/${total} (${score}%)`);

  if (score >= 90) {
    console.log('\n✅ PASS — Output looks good! Submit to AI detector to verify 0% score.');
  } else {
    console.log('\n⚠️  NEEDS IMPROVEMENT — Check failing items above.');
  }

} catch (e) {
  console.error('FETCH ERROR:', e.message);
  process.exit(1);
}
