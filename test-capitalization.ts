/**
 * Quick test for mid-sentence capitalization fix
 */
import { fixMidSentenceCapitalization, validateAndRepairOutput } from './humanizer-engine/frontend/lib/engine/validation-post-process';

const testInput = `Government Policy and Commitment

Government Policy has been one of the most influential factors in the expansion of Secondary Education in Kenya.

Since independence, successive governments have put first Training as a central part of national Development strategies (Republic of Kenya, 2005). Across The country, this Commitment can be seen in The formulation of policies aimed at increasing access, improving equity, and boosting The overall quality of Instruction.`;

const testOutput = `Government Policy and Commitment

Government Policy has been one of The most influential factors in The expansion of Secondary Education in Kenya.

Since independence, successive governments have put first Training as a central part of national Development strategies (Republic of Kenya, 2005). Across The country, this Commitment can be seen in The formulation of policies aimed at increasing access, improving equity, and boosting The overall quality of Instruction. Such policies have led to The establishment of more Secondary schools and a steady rise in student enrolment Over The years, Oketch & Rolleston (2007) argues that one major initiative was The Introduction of Free Day Secondary Teaching (FDSE) in 2008. Deeply reduced The cost burden on Parents. Students from low-income families who previously could not afford Secondary Education were given an opportunity to continue their studies.`;

console.log('=== BEFORE FIX ===');
console.log(testOutput);
console.log('\n=== AFTER FIX ===');
const fixed = fixMidSentenceCapitalization(testOutput, testInput);
console.log(fixed);

// Also test via validateAndRepairOutput
console.log('\n=== VIA VALIDATE AND REPAIR ===');
const result = validateAndRepairOutput(testInput, testOutput, { autoRepair: true });
console.log(result.text);
console.log('\nRepairs:', result.repairs);
console.log('Was repaired:', result.wasRepaired);
