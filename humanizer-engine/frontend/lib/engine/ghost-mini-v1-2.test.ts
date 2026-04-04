/**
 * Ghost Mini v1.2 Test Suite
 * Validates sentence-by-sentence processing and structure preservation
 */

import { ghostMiniV1_2, validateStructurePreservation } from './ghost-mini-v1-2';

// ── Test Cases ──

const TEST_CASES = [
  {
    name: 'Single paragraph',
    input: 'This is a test. It should work. The output should preserve structure.',
    expected: {
      paragraphCount: 1,
      minSentences: 3
    }
  },
  {
    name: 'Multiple paragraphs',
    input: 'First paragraph has content. It has multiple sentences.\n\nSecond paragraph is here. It also has content.',
    expected: {
      paragraphCount: 2,
      minSentences: 4
    }
  },
  {
    name: 'Blank lines preservation',
    input: 'Paragraph one.\n\n\n\nParagraph two with extra blank lines.',
    expected: {
      hasBlankLines: true,
      paragraphCount: 2
    }
  },
  {
    name: 'Title preservation',
    input: 'Introduction\n\nThis is the content of the introduction. It has multiple sentences.',
    expected: {
      paragraphCount: 2,
      firstIsTitle: true
    }
  },
  {
    name: 'Contraction expansion',
    input: "I don't think we can't fix this. It's important.",
    expected: {
      noContractions: true
    }
  },
  {
    name: 'Em-dash removal',
    input: 'This is important — very important. Another sentence follows.',
    expected: {
      noEmDashes: true
    }
  },
  {
    name: 'Academic formalization',
    input: 'I think we need to look at this big problem. We believe it is very important.',
    expected: {
      noFirstPerson: true,
      formalVerbs: true
    }
  },
  {
    name: 'Complex multi-paragraph document',
    input: `Leadership and Emotional Intelligence

Emotional intelligence has become a critical factor in modern leadership. Studies show that leaders with high EI are more effective.

Research indicates several key components. These include self-awareness and empathy. Leaders need to understand their emotions.

In conclusion, EI is essential. Organizations should prioritize it in their training programs.`,
    expected: {
      paragraphCount: 4,
      preservesStructure: true
    }
  }
];

// ── Test Runner ──

function runTests() {
  console.log('='.repeat(60));
  console.log('GHOST MINI v1.2 - STRUCTURE PRESERVATION TEST SUITE');
  console.log('='.repeat(60));
  console.log('');

  let passed = 0;
  let failed = 0;

  TEST_CASES.forEach((testCase, index) => {
    console.log(`\n[TEST ${index + 1}] ${testCase.name}`);
    console.log('-'.repeat(60));

    try {
      // Process the input
      const output = ghostMiniV1_2(testCase.input);

      // Validate structure preservation
      const validation = validateStructurePreservation(testCase.input, output);

      console.log('\n📝 INPUT:');
      console.log(testCase.input);
      console.log('\n✨ OUTPUT:');
      console.log(output);
      console.log('\n📊 VALIDATION:');
      console.log(`  Paragraph Count Match: ${validation.paragraphCountMatch ? '✅' : '❌'}`);
      console.log(`  Blank Lines Preserved: ${validation.blankLinesPreserved ? '✅' : '❌'}`);
      console.log(`  Original Paragraphs: ${validation.originalParagraphs}`);
      console.log(`  Processed Paragraphs: ${validation.processedParagraphs}`);

      // Run specific test expectations
      let testPassed = true;
      const failures: string[] = [];

      if (testCase.expected.paragraphCount !== undefined) {
        if (validation.processedParagraphs !== testCase.expected.paragraphCount) {
          testPassed = false;
          failures.push(`Expected ${testCase.expected.paragraphCount} paragraphs, got ${validation.processedParagraphs}`);
        }
      }

      if (testCase.expected.noContractions) {
        const contractionPattern = /\b(can't|won't|don't|doesn't|isn't|aren't|it's|that's|they're|we're|I'm)\b/i;
        if (contractionPattern.test(output)) {
          testPassed = false;
          failures.push('Output still contains contractions');
        }
      }

      if (testCase.expected.noEmDashes) {
        if (output.includes('—')) {
          testPassed = false;
          failures.push('Output still contains em-dashes');
        }
      }

      if (testCase.expected.preservesStructure) {
        if (!validation.paragraphCountMatch || !validation.blankLinesPreserved) {
          testPassed = false;
          failures.push('Structure not fully preserved');
        }
      }

      if (testPassed) {
        console.log('\n✅ TEST PASSED');
        passed++;
      } else {
        console.log('\n❌ TEST FAILED');
        failures.forEach(f => console.log(`   - ${f}`));
        failed++;
      }

    } catch (error) {
      console.log('\n❌ TEST FAILED WITH ERROR');
      console.log(`   ${error}`);
      failed++;
    }
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}/${TEST_CASES.length}`);
  console.log(`❌ Failed: ${failed}/${TEST_CASES.length}`);
  console.log(`📊 Success Rate: ${Math.round((passed / TEST_CASES.length) * 100)}%`);
  console.log('');

  return { passed, failed, total: TEST_CASES.length };
}

// ── Interactive Test with Sample Text ──

function testWithSampleText() {
  const sampleText = `Leadership Development in Modern Organizations

Leadership development has become increasingly important in today's fast-paced business environment. I think organizations need to prioritize this area. We can't ignore the impact of effective leadership on organizational success.

Research shows that emotional intelligence is a key component of leadership effectiveness. Leaders who utilize emotional intelligence can better understand their teams. They're able to make more informed decisions.

In my opinion, the following factors are essential:

- Self-awareness and reflection
- Empathy and understanding
- Strategic thinking abilities

Organizations should look at implementing comprehensive leadership programs. These programs need to be very practical and hands-on. We believe this approach will help develop future leaders more effectively.

Conclusion

Leadership development isn't just about training — it's about creating a culture that values continuous growth. Companies that don't invest in leadership development will find it hard to compete in the modern marketplace.`;

  console.log('\n' + '='.repeat(60));
  console.log('INTERACTIVE TEST - SAMPLE ACADEMIC TEXT');
  console.log('='.repeat(60));

  console.log('\n📝 ORIGINAL TEXT:');
  console.log(sampleText);

  const processed = ghostMiniV1_2(sampleText);

  console.log('\n✨ PROCESSED TEXT:');
  console.log(processed);

  const validation = validateStructurePreservation(sampleText, processed);

  console.log('\n📊 STRUCTURE VALIDATION:');
  console.log(`  Paragraph Count Match: ${validation.paragraphCountMatch ? '✅' : '❌'} (${validation.originalParagraphs} → ${validation.processedParagraphs})`);
  console.log(`  Blank Lines Preserved: ${validation.blankLinesPreserved ? '✅' : '❌'}`);

  console.log('\n🔍 TRANSFORMATIONS APPLIED:');
  console.log(`  ✅ Contractions expanded: ${!/\b(can't|won't|don't|isn't)\b/i.test(processed)}`);
  console.log(`  ✅ Em-dashes removed: ${!processed.includes('—')}`);
  console.log(`  ✅ First-person reduced: ${(sampleText.match(/\b(I think|We believe)\b/gi) || []).length > (processed.match(/\b(I think|We believe)\b/gi) || []).length}`);
  console.log(`  ✅ Academic formalization: ${processed.includes('examine') || processed.includes('consider')}`);
}

// ── Export for use in Node or Browser ──

if (typeof window === 'undefined') {
  // Node.js environment - run tests automatically
  const results = runTests();
  testWithSampleText();
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
} else {
  // Browser environment - export for manual testing
  console.log('Ghost Mini v1.2 test suite loaded. Call runTests() or testWithSampleText() to execute.');
}

export { runTests, testWithSampleText };
