/**
 * Validation Post-Process Regression Tests
 *
 * Keeps capitalization cleanup checks close to the live validation layer.
 */

import assert from 'node:assert/strict';
import {
  fixMidSentenceCapitalization,
  validateAndRepairOutput,
} from './validation-post-process';

type TestCase = {
  name: string;
  run: () => void;
};

const PROJECT_RISK_INPUT = `Health and Time Availability as a Project Risk

During the initial and middle phases of this project, a serious illness was encountered that heavily affected the capability to adhere to the created timeline, with the unexpected and interesting risk associated with personal health and time management constraints affecting essential dimensions of the project.`;

const PROJECT_RISK_OUTPUT = `Health and Time Availability as a Project Risk

During the initial and middle phases of this Project, a serious illness was encountered that heavily affected the capability to adhere to the created timeline, with the unexpected and interesting Risk associated with personal health and Time management constraints affecting essential dimensions of the Project.`;

const PROJECT_RISK_CONTAMINATED_SOURCE = `Health and Time Availability as a Project Risk

During the initial and middle phases of this Project, a serious illness was encountered that heavily affected the capability to adhere to the created timeline, with the unexpected and interesting Risk associated with personal health and Time management constraints affecting essential dimensions of the Project across Multiple Submissions. This aligned with guidance from the World Health Organization and reporting standards in the Republic of Kenya.`;

const testCases: TestCase[] = [
  {
    name: 'lowercases stray mid-sentence title case while preserving heading text',
    run: () => {
      const fixed = fixMidSentenceCapitalization(PROJECT_RISK_OUTPUT, PROJECT_RISK_INPUT);

      assert.match(fixed, /^Health and Time Availability as a Project Risk/m);
      assert.match(fixed, /\bthis project\b/);
      assert.match(fixed, /\binteresting risk\b/);
      assert.match(fixed, /\bhealth and time management\b/);
      assert.doesNotMatch(fixed, /\bthis Project\b/);
      assert.doesNotMatch(fixed, /\binteresting Risk\b/);
      assert.doesNotMatch(fixed, /\bTime management\b/);
    },
  },
  {
    name: 'repairs contaminated source text without preserving fake proper nouns',
    run: () => {
      const fixed = fixMidSentenceCapitalization(
        PROJECT_RISK_CONTAMINATED_SOURCE,
        PROJECT_RISK_CONTAMINATED_SOURCE,
      );

      assert.match(fixed, /^Health and Time Availability as a Project Risk/m);
      assert.match(fixed, /\bthis project\b/);
      assert.match(fixed, /\binteresting risk\b/);
      assert.match(fixed, /\btime management\b/);
      assert.match(fixed, /\bmultiple submissions\b/);
      assert.match(fixed, /World Health Organization/);
      assert.match(fixed, /Republic of Kenya/);
      assert.doesNotMatch(fixed, /\bthis Project\b/);
      assert.doesNotMatch(fixed, /\binteresting Risk\b/);
      assert.doesNotMatch(fixed, /\bTime management\b/);
      assert.doesNotMatch(fixed, /\bMultiple Submissions\b/);
    },
  },
  {
    name: 'preserves citation-style surnames even when absent from the original input',
    run: () => {
      const fixed = fixMidSentenceCapitalization(
        'The policy shift widened access, Oketch & Rolleston (2007) argues, and Smith et al. later reached a similar conclusion.',
        'The policy shift widened access and later work reached a similar conclusion.',
      );

      assert.match(fixed, /Oketch & Rolleston \(2007\)/);
      assert.match(fixed, /Smith et al\./);
      assert.doesNotMatch(fixed, /oketch & rolleston/);
      assert.doesNotMatch(fixed, /smith et al\./);
    },
  },
  {
    name: 'validateAndRepairOutput reports the capitalization repair',
    run: () => {
      const result = validateAndRepairOutput(PROJECT_RISK_INPUT, PROJECT_RISK_OUTPUT, {
        autoRepair: true,
      });

      assert.equal(result.wasRepaired, true);
      assert.ok(result.repairs.includes('Fixed mid-sentence capitalization'));
      assert.match(result.text, /\bthis project\b/);
      assert.match(result.text, /\binteresting risk\b/);
    },
  },
];

export function runValidationPostProcessTests(): { passed: number; failed: number } {
  console.log('='.repeat(70));
  console.log('VALIDATION POST-PROCESS REGRESSION TESTS');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      testCase.run();
      console.log(`✅ ${testCase.name}`);
      passed++;
    } catch (error) {
      console.error(`❌ ${testCase.name}`);
      console.error(error instanceof Error ? error.message : error);
      failed++;
    }
  }

  console.log('');
  console.log(`Passed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);

  return { passed, failed };
}

if (typeof window === 'undefined') {
  const results = runValidationPostProcessTests();
  process.exit(results.failed > 0 ? 1 : 0);
}