/**
 * Direct test with the EXACT text used by the API test.
 */

import { ghostMiniV1_2 } from './lib/engine/ghost-mini-v1-2.js';
import { unifiedSentenceProcess } from './lib/sentence-processor.js';
import { fixCapitalization } from './lib/engine/shared-dictionaries.js';
import { deduplicateRepeatedPhrases } from './lib/engine/premium-deep-clean.js';
import { structuralPostProcess } from './lib/engine/structural-post-processor.js';
import { preserveInputStructure } from './lib/engine/structure-preserver.js';
import { expandContractions } from './lib/humanize-transforms.js';
import { removeEmDashes } from './lib/engine/v13-shared-techniques.js';

const testText = `Dr. Smith examined the results carefully. The experiment showed a p-value of 0.053, which is not statistically significant. For example, Fig. 2 demonstrates how the control group performed vs. the treatment group. The average score was 3.14 out of 5.0 points. Mr. Johnson noted that the U.S. federal guidelines require a threshold of 0.05 for significance. In other words, the study did not meet the standard criteria established by the National Institutes of Health.

The patient, Mrs. Davis, reported improvement after approximately 2.5 weeks of treatment. Her blood pressure dropped from 145.3 to 128.7 mmHg, i.e., a significant reduction. The attending physician, Prof. Williams, recommended continuing the regimen for at least 3.0 additional months. This aligns with recommendations from the World Health Organization.`;

function check(label: string, text: string) {
  const decimals = ['0.053', '3.14', '5.0', '0.05', '2.5', '145.3', '128.7', '3.0'];
  const lost = decimals.filter(d => !text.includes(d));
  if (lost.length > 0) {
    console.log(`❌ ${label}: LOST ${lost.join(', ')}`);
    console.log(`   Preview: ${text.substring(0, 400)}`);
  } else {
    console.log(`✅ ${label}: All decimals preserved`);
  }
}

console.log('=== Full pipeline with EXACT API test text ===\n');

let result = ghostMiniV1_2(testText);
check('1. ghostMiniV1_2 engine', result);

result = unifiedSentenceProcess(result, false, 50);
check('2. + unifiedSentenceProcess', result);

result = fixCapitalization(result, testText);
check('3. + fixCapitalization', result);

result = deduplicateRepeatedPhrases(result);
check('4. + deduplicateRepeatedPhrases', result);

result = structuralPostProcess(result);
check('5. + structuralPostProcess', result);

result = preserveInputStructure(testText, result);
check('6. + preserveInputStructure', result);

result = expandContractions(result);
check('7. + expandContractions', result);

result = removeEmDashes(result);
check('8. + removeEmDashes', result);

console.log('\nFinal output:', result);
