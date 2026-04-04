import { pipeline } from './lib/humara/engine.js';

const text = `H\u2080\u2081: There is no statistically significant difference in truancy rates. H\u2081\u2081: There is a statistically significant difference in truancy rates. H\u2080\u2082: There is no statistically significant relationship between parental involvement and truancy rates.`;

console.log('=== INPUT ===');
console.log(text);
console.log('\n=== OUTPUT ===');
const result = pipeline(text, 'academic', 6);
console.log(result);

// Check if subscripts survived
const hasSubscripts = /[\u2080-\u2089]/.test(result);
console.log('\n=== SUBSCRIPT CHECK ===');
console.log('Subscripts preserved:', hasSubscripts);
