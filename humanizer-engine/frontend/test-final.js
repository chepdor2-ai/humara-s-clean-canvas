const http = require('http');

const text = `Null and Alternative Hypotheses Related to Truancy. The hypotheses below are presented in null and alternative pairs related to demographic variables and truancy rates. H\u2080\u2081: There is no statistically significant difference in truancy rates when accounting for student gender. H\u2081\u2081: There is a statistically significant difference in truancy rates when accounting for student gender. H\u2080\u2082: There is no statistically significant relationship between parental involvement and truancy rates. H\u2081\u2082: There is a statistically significant relationship between parental involvement and truancy rates. The mean truancy rate was compared across the analysis sample using a paired-sample t-test (Marshall, n.d.). Each pair of hypotheses was tested to determine whether demographic variables produced a measurable effect on truancy. The data analysis involved examination of mean differences, independent and dependent groups, and determination of statistical significance at the p less than .05 level.`;

const data = JSON.stringify({ text, engine: 'humara', strength: 'medium', tone: 'neutral' });
const options = {
  hostname: 'localhost', port: 3000, path: '/api/humanize', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
};

console.log('=== TESTING HUMARA ENGINE — TRUANCY PAPER ===\n');
const start = Date.now();
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const elapsed = Date.now() - start;
    const result = JSON.parse(body);
    const output = result.humanized;

    console.log('Status:', res.statusCode, '| Time:', elapsed, 'ms\n');
    console.log('=== INPUT ===');
    console.log(text);
    console.log('\n=== OUTPUT ===');
    console.log(output);

    // Academic term preservation checks
    console.log('\n=== ACADEMIC TERM CHECKS ===');
    const mustPreserve = [
      'hypothesis', 'hypotheses', 'null', 'alternative', 'truancy',
      'significant', 'difference', 'relationship', 'parental',
      'demographic', 'variables', 'analysis', 'mean', 'independent',
      'dependent', 'statistical', 'significance', 'data', 'pair', 'sample'
    ];
    let allPass = true;
    for (const term of mustPreserve) {
      const inInput = text.toLowerCase().includes(term);
      const inOutput = output.toLowerCase().includes(term);
      if (inInput && !inOutput) {
        console.log(`  FAIL: "${term}" missing from output`);
        allPass = false;
      }
    }
    if (allPass) console.log('  All academic terms preserved: PASS');

    // Subscript check
    const hasSubscripts = /[\u2080-\u2089]/.test(output);
    console.log(`  Subscripts preserved: ${hasSubscripts ? 'PASS' : 'FAIL'}`);

    // Citation check
    const hasCitation = output.includes('(Marshall, n.d.)');
    console.log(`  Citation preserved: ${hasCitation ? 'PASS' : 'FAIL'}`);

    // P-value check
    const hasPValue = output.includes('p less than .05') || output.includes('p less than.05');
    const pValueCorrect = output.includes('p less than .05');
    console.log(`  P-value notation: ${pValueCorrect ? 'PASS' : hasPValue ? 'PARTIAL (space issue)' : 'FAIL'}`);

    // Bad synonym check
    const badWords = ['hooky', 'psychoanalysis', 'nada', 'zilch', 'mating', 'copulate', 
                      'mingy', 'supposition', 'surmisal', 'maternal', 'bastardly'];
    const foundBad = badWords.filter(w => output.toLowerCase().includes(w));
    console.log(`  No bad synonyms: ${foundBad.length === 0 ? 'PASS' : 'FAIL — found: ' + foundBad.join(', ')}`);

    // Injected content check
    const injected = ['Nobody disputes', 'costs add up', 'What happens when', 'fall short'];
    const foundInjected = injected.filter(p => output.includes(p));
    console.log(`  No injected sentences: ${foundInjected.length === 0 ? 'PASS' : 'FAIL — found: ' + foundInjected.join(', ')}`);

    // Scores
    if (result.scores) {
      console.log('\n=== DETECTION SCORES ===');
      console.log(JSON.stringify(result.scores, null, 2));
    }
  });
});
req.on('error', (e) => console.log('Error:', e.message));
req.setTimeout(120000, () => { console.log('TIMEOUT'); req.destroy(); });
req.write(data);
req.end();
