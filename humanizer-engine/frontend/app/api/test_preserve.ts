import { preserveInputStructure } from '../../lib/engine/structure-preserver';

const input = `Variable Descriptions

The second research question focused on the relationship between school-level cell phone restriction policies and standardized test scores. The independent variable was coded as a nominal dichotomy.

T-Test

To formally test whether students in restricted schools performed better, an independent-samples t-test was conducted. The test revealed no statistically significant difference.`;

const rewritten = `Cell phone restriction was coded as a nominal gap. This binary coding empowered for a straightforward comparison. The second inquiry zeroed in on the link between school-level cell phone restriction guidelines.

To formally test whether students in restricted schools performed better, an independent-samples t-test was conducted. The test revealed no statistically major difference.`;

const result = preserveInputStructure(input, rewritten);
console.log('=== OUTPUT ===');
console.log(JSON.stringify(result));
console.log('\n=== VISIBLE ===');
console.log(result);
console.log('\n=== LINE BREAKS ===');
const lines = result.split('\n');
for (let i = 0; i < lines.length; i++) {
  console.log(`  Line ${i}: ${JSON.stringify(lines[i])}`);
}
