/**
 * Humara Engine Test — Quick functional test
 */

import { humaraHumanize } from './lib/humara/index';

const testText = `Artificial intelligence plays a significant role in modern healthcare. Furthermore, it has the potential to revolutionize diagnostic accuracy. It is important to note that AI systems can analyze vast datasets more efficiently than human practitioners. However, the implementation of these technologies poses challenges related to data privacy. In conclusion, while AI offers transformative benefits, it is essential to address ethical concerns. Moreover, the interplay between technology and patient care requires nuanced understanding. Subsequently, healthcare organizations must navigate the complex landscape of regulatory compliance. Additionally, the multifaceted nature of medical decision-making demands a comprehensive approach to AI integration.`;

console.log('=== HUMARA ENGINE TEST ===\n');
console.log('INPUT:');
console.log(testText);
console.log('\n---\n');

// Test with different strengths
for (const strength of ['light', 'medium', 'heavy'] as const) {
  console.log(`OUTPUT (${strength}):`);
  const result = humaraHumanize(testText, { strength, tone: 'academic' });
  console.log(result);
  console.log();

  // Verify constraints
  const contractions = result.match(/\b(don't|can't|won't|isn't|aren't|wasn't|weren't|hasn't|haven't|doesn't|didn't|I'm|I've|I'll|we're|they're)\b/gi);
  const firstPerson = result.match(/\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/g);
  
  console.log(`  Contractions found: ${contractions ? contractions.join(', ') : 'NONE ✓'}`);
  console.log(`  First person found: ${firstPerson ? firstPerson.join(', ') : 'NONE ✓'}`);
  
  const inputSentences = (testText.match(/[^.!?]+[.!?]/g) || []).length;
  const outputSentences = (result.match(/[^.!?]+[.!?]/g) || []).length;
  console.log(`  Sentence count: ${inputSentences} → ${outputSentences} ${inputSentences === outputSentences ? '✓' : '✗ MISMATCH'}`);
  console.log();
}

console.log('=== TEST COMPLETE ===');
