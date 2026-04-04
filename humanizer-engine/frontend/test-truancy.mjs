import { pipeline } from './lib/humara/engine.js';

const text = `Null and Alternative Hypotheses Related to Truancy. The hypotheses below are presented in null and alternative pairs related to demographic variables and truancy rates. H\u2080\u2081: There is no statistically significant difference in truancy rates when accounting for student gender. H\u2081\u2081: There is a statistically significant difference in truancy rates when accounting for student gender. H\u2080\u2082: There is no statistically significant relationship between parental involvement and truancy rates. H\u2081\u2082: There is a statistically significant relationship between parental involvement and truancy rates. The mean truancy rate was compared across the analysis sample using a paired-sample t-test (Marshall, n.d.). Each pair of hypotheses was tested to determine whether demographic variables produced a measurable effect on truancy. The data analysis involved examination of mean differences, independent and dependent groups, and determination of statistical significance at the p less than .05 level.`;

console.log('=== INPUT ===');
console.log(text);
console.log('\n=== OUTPUT ===');
const result = pipeline(text, 'academic', 6);
console.log(result);

// Check preservation
console.log('\n=== ACADEMIC TERM CHECK ===');
const checkTerms = ['hypothesis', 'hypotheses', 'truancy', 'null', 'alternative', 'significant', 'difference', 'parental', 'analysis', 'mean', 'variables', 'independent', 'dependent', 'statistical'];
for (const term of checkTerms) {
  const inInput = text.toLowerCase().includes(term);
  const inOutput = result.toLowerCase().includes(term);
  const status = inInput && inOutput ? 'PASS' : inInput && !inOutput ? 'FAIL' : 'N/A';
  if (status === 'FAIL') console.log(`  ${status}: "${term}" was in input but missing from output`);
}

const hasSubscripts = /[\u2080-\u2089]/.test(result);
console.log(`  Subscripts preserved: ${hasSubscripts ? 'PASS' : 'FAIL'}`);

// Check for BAD synonyms
const badWords = ['hooky', 'psychoanalysis', 'nada', 'zilch', 'mating', 'copulate', 'mingy', 'supposition', 'surmisal', 'maternal'];
for (const bad of badWords) {
  if (result.toLowerCase().includes(bad)) {
    console.log(`  BAD SYNONYM FOUND: "${bad}"`);
  }
}
console.log('  No bad synonyms: PASS');
