// Test all humanizer engines with the problematic academic text
// Validates: proper noun preservation, no filler injection, heading preservation

const TEST_INPUT = `Psychological Foundations of Leadership
Part 1: Leadership Case Problem A - Suzanne Expects Results

I. Introduction
Suzanne, the Chief Marketing Officer (CMO) of a mid-sized technology company, is known for her high expectations and results-driven approach. Under her leadership, the marketing department has consistently exceeded quarterly targets and launched several successful campaigns. However, recent feedback from her team suggests that while they respect her competence, some feel micromanaged and undervalued.

II. The Challenge
Hank, a senior marketing manager who reports directly to Suzanne, has noticed declining morale among team members. Several talented marketers have mentioned considering other opportunities, citing lack of autonomy and recognition as primary concerns.`;

const ENGINES = [
  'ghost_mini',
  'ghost_mini_v1_2', 
  'ghost_pro',
  'fast_v11',
  'humara',
  'humara_v1_3',
  'nuru',
  'omega'
];

async function testEngine(engine) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`Testing: ${engine.toUpperCase()}`);
  console.log('═'.repeat(80));
  
  try {
    const response = await fetch('http://localhost:3000/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEST_INPUT,
        engine: engine,
        strength: 'medium',
        tone: 'academic',
        strict_meaning: true,
        enable_post_processing: true
      })
    });

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      const errorText = await response.text();
      console.error(errorText.slice(0, 500));
      return { engine, success: false, error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    const humanized = result.humanized || result.text;

    // Validation checks
    const checks = {
      properNouns: {
        pass: humanized.includes('Suzanne') && humanized.includes('Hank'),
        detail: `Suzanne: ${humanized.includes('Suzanne')}, Hank: ${humanized.includes('Hank')}`
      },
      noFillerInjection: {
        pass: !humanized.includes('which few would dispute') && 
              !humanized.includes('and the data reflects this'),
        detail: 'No filler phrases detected'
      },
      headingPreserved: {
        pass: humanized.includes('I. Introduction') || humanized.includes('I. introduction'),
        detail: `Has "I. Introduction": ${humanized.includes('I. Introduction') || humanized.includes('I. introduction')}`
      },
      noTitleMerge: {
        pass: !humanized.toLowerCase().includes('psychological foundations of leadership part 1: leadership case problem a - suzanne expects results. i. introduction'),
        detail: 'Title not merged into body'
      },
      meaningPreserved: {
        pass: humanized.includes('CMO') || humanized.includes('Chief Marketing Officer'),
        detail: 'Key terms preserved'
      }
    };

    const allPassed = Object.values(checks).every(c => c.pass);

    console.log('\n✓ Response received');
    console.log(`Original length: ${TEST_INPUT.length} chars`);
    console.log(`Humanized length: ${humanized.length} chars`);
    console.log(`\nValidation Results:`);
    
    for (const [checkName, check] of Object.entries(checks)) {
      console.log(`  ${check.pass ? '✅' : '❌'} ${checkName}: ${check.detail}`);
    }

    if (!allPassed) {
      console.log('\n⚠️  OUTPUT PREVIEW (first 500 chars):');
      console.log(humanized.slice(0, 500));
      console.log('...\n');
    } else {
      console.log('\n✅ ALL CHECKS PASSED\n');
    }

    return { 
      engine, 
      success: allPassed, 
      checks,
      output: humanized.slice(0, 200) 
    };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return { engine, success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n🚀 Starting comprehensive humanizer validation\n');
  console.log(`Testing ${ENGINES.length} engines against academic text with known bugs\n`);
  
  const results = [];
  
  for (const engine of ENGINES) {
    const result = await testEngine(engine);
    results.push(result);
    
    // Brief pause between engines
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n\n' + '═'.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('═'.repeat(80));
  
  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ Passed: ${passed.length}/${results.length}`);
  if (passed.length > 0) {
    passed.forEach(r => console.log(`   - ${r.engine}`));
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}/${results.length}`);
    failed.forEach(r => {
      console.log(`   - ${r.engine}: ${r.error || 'validation failed'}`);
      if (r.checks) {
        const failedChecks = Object.entries(r.checks)
          .filter(([_, check]) => !check.pass)
          .map(([name, _]) => name);
        console.log(`     Failed checks: ${failedChecks.join(', ')}`);
      }
    });
  }
  
  console.log('\n' + '═'.repeat(80));
  
  if (failed.length === 0) {
    console.log('✨ All engines validated successfully! Ready for deployment.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some engines failed validation. Review above output.\n');
    process.exit(1);
  }
}

runAllTests().catch(console.error);
