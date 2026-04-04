/**
 * Humara v2 Test — Content Protection + Expanded Dictionaries
 * Tests: financial text with $figures, percentages, citations, brackets, etc.
 */

import { humaraHumanize } from './lib/humara';

const financialText = `The financial planning process begins with a comprehensive assessment of [Client Name]'s current financial position. This includes a detailed review of income sources, existing assets, liabilities, and monthly expenditure patterns. The client currently earns $500,000 annually, with a primary mortgage balance of $100,000 and $3,500 in monthly expenses. According to recent studies (Antonius et al., 2024), effective financial planning requires a holistic approach that encompasses both short-term budgeting and long-term wealth accumulation strategies.

The recommended investment strategy allocates 20% of annual income to diversified portfolios. This translates to approximately $100,000 per year, or $8,333 per month. Research by Colmenares (2023) demonstrates that a balanced portfolio with a 60/40 equity-to-bond ratio has historically yielded returns of 6.5% per annum, significantly outperforming savings accounts that offer merely 0.5% to 1.5% interest rates.

Furthermore, it is crucial to establish an emergency fund equivalent to six months of living expenses, which amounts to approximately $21,000. This fund serves as a financial safety net, mitigating the impact of unforeseen circumstances such as medical emergencies, job loss, or major home repairs. The evidence suggests that households without adequate emergency reserves are 2.5 times more likely to experience financial hardship (Smith & Johnson, 2022).

In conclusion, the overarching objective of this financial plan is to leverage existing assets, optimize tax efficiency, and build a robust portfolio that generates sustainable long-term returns. By implementing these strategies, [Client Name] can expect to accumulate approximately $2,500,000 in retirement savings by age 65, assuming an average annual return of 7.2% and consistent contributions.`;

const scientificText = `Climate Change represents one of the most pressing challenges of the 21st century. The Intergovernmental Panel on Climate Change (IPCC) reported that global temperatures have risen by approximately 1.1°C since pre-industrial levels. This increase is predominantly attributed to anthropogenic greenhouse gas emissions, with CO₂ concentrations reaching 421 parts per million (ppm) in 2023. Moreover, the rate of sea-level rise has accelerated to 3.6 mm per year, a figure that has doubled since the 1990s.

Renewable energy adoption has grown at an unprecedented rate, with solar and wind capacity increasing by 45% globally between 2020 and 2023. The cost of photovoltaic cells has decreased by 89% over the past decade, making solar energy the cheapest source of electricity in many regions. Nevertheless, fossil fuels still account for approximately 80% of global primary energy consumption.`;

function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  HUMARA v2 TEST — Content Protection + Expanded Dict');
  console.log('═══════════════════════════════════════════════════════');

  // Test 1: Financial text - medium strength
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│  TEST 1: Financial Text (Medium)        │');
  console.log('└─────────────────────────────────────────┘');
  const financialResult = humaraHumanize(financialText, { strength: 'medium' });
  console.log('\n--- OUTPUT ---');
  console.log(financialResult);

  // Verify protections
  console.log('\n--- PROTECTION CHECKS ---');
  const checks = [
    { label: '$500,000', test: financialResult.includes('$500,000') },
    { label: '$100,000', test: financialResult.includes('$100,000') },
    { label: '$3,500', test: financialResult.includes('$3,500') },
    { label: '$8,333', test: financialResult.includes('$8,333') },
    { label: '$21,000', test: financialResult.includes('$21,000') },
    { label: '$2,500,000', test: financialResult.includes('$2,500,000') },
    { label: '20%', test: financialResult.includes('20%') },
    { label: '6.5%', test: financialResult.includes('6.5%') },
    { label: '0.5%', test: financialResult.includes('0.5%') },
    { label: '1.5%', test: financialResult.includes('1.5%') },
    { label: '7.2%', test: financialResult.includes('7.2%') },
    { label: '2.5 times', test: financialResult.includes('2.5') },
    { label: '60/40', test: financialResult.includes('60') && financialResult.includes('40') },
    { label: '[Client Name]', test: financialResult.includes('[Client Name]') },
    { label: '(Antonius et al., 2024)', test: financialResult.includes('(Antonius et al., 2024)') },
    { label: '(Smith & Johnson, 2022)', test: financialResult.includes('(Smith & Johnson, 2022)') },
    { label: 'Colmenares (2023)', test: financialResult.includes('2023') },
    { label: 'No contractions', test: !/(don't|can't|won't|wouldn't|shouldn't|couldn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|doesn't|didn't|it's|that's|there's)/i.test(financialResult) },
    { label: 'No first person', test: !/\b(I|me|my|mine|myself)\b/.test(financialResult) },
  ];

  let passCount = 0;
  for (const check of checks) {
    const status = check.test ? '✅' : '❌';
    if (check.test) passCount++;
    console.log(`  ${status} ${check.label}`);
  }
  console.log(`\n  Score: ${passCount}/${checks.length} checks passed`);

  // Test 2: Scientific text
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│  TEST 2: Scientific Text (Heavy)        │');
  console.log('└─────────────────────────────────────────┘');
  const sciResult = humaraHumanize(scientificText, { strength: 'heavy' });
  console.log('\n--- OUTPUT ---');
  console.log(sciResult);

  const sciChecks = [
    { label: '1.1°C or 1.1', test: sciResult.includes('1.1') },
    { label: 'CO₂', test: sciResult.includes('CO₂') },
    { label: '421', test: sciResult.includes('421') },
    { label: '3.6 mm', test: sciResult.includes('3.6') },
    { label: '45%', test: sciResult.includes('45%') },
    { label: '89%', test: sciResult.includes('89%') },
    { label: '80%', test: sciResult.includes('80%') },
    { label: 'IPCC preserved', test: sciResult.includes('IPCC') },
    { label: 'No contractions', test: !/(don't|can't|won't|it's|that's)/i.test(sciResult) },
  ];

  let sciPass = 0;
  for (const check of sciChecks) {
    const status = check.test ? '✅' : '❌';
    if (check.test) sciPass++;
    console.log(`  ${status} ${check.label}`);
  }
  console.log(`\n  Score: ${sciPass}/${sciChecks.length} checks passed`);

  // Test 3: Sentence count preservation
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│  TEST 3: Sentence Count Preservation    │');
  console.log('└─────────────────────────────────────────┘');
  const simpleText = 'Artificial Intelligence has the potential to revolutionize healthcare. Moreover, it is crucial to understand the ethical implications. The evidence suggests that AI-driven diagnostics can improve accuracy by 35%. This demonstrates the importance of integrating technology with clinical expertise.';
  const simpleResult = humaraHumanize(simpleText, { strength: 'heavy' });
  
  const inputSentences = simpleText.split(/(?<=[.!?])\s+/).length;
  const outputSentences = simpleResult.split(/(?<=[.!?])\s+/).length;
  
  console.log(`  Input sentences:  ${inputSentences}`);
  console.log(`  Output sentences: ${outputSentences}`);
  console.log(`  ${inputSentences === outputSentences ? '✅' : '❌'} Sentence count ${inputSentences === outputSentences ? 'PRESERVED' : 'CHANGED'}`);
  console.log(`\n  Output: ${simpleResult}`);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL TESTS COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
}

runTests();
