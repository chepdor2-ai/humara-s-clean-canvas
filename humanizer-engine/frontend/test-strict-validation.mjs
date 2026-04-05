// Strict validation test - ensures all outputs meet zero-AI requirements
// Tests: no contractions, no first-person (unless in input), no AI markers

const TEST_INPUT_NO_FIRST_PERSON = `The marketing department achieved record Q4 results through strategic campaign optimization. The team implemented data-driven targeting across digital channels, resulting in a 45% increase in qualified leads. Customer engagement metrics showed sustained improvement throughout the quarter.`;

const TEST_INPUT_WITH_FIRST_PERSON = `I believe our marketing department achieved record Q4 results. We implemented data-driven targeting across digital channels. My team and I worked closely to optimize our campaigns.`;

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

function checkContractions(text) {
  const contractions = [
    "don't", "doesn't", "didn't", "won't", "wouldn't", "shouldn't", "couldn't",
    "can't", "cannot", "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't",
    "hadn't", "I'm", "I've", "I'll", "I'd", "you're", "you've", "you'll", "you'd",
    "he's", "she's", "it's", "we're", "we've", "we'll", "we'd", "they're",
    "they've", "they'll", "they'd", "that's", "what's", "who's", "where's",
    "when's", "why's", "how's", "there's", "here's", "let's"
  ];
  
  const found = [];
  const lowerText = text.toLowerCase();
  for (const contraction of contractions) {
    if (lowerText.includes(contraction.toLowerCase())) {
      found.push(contraction);
    }
  }
  return found;
}

function checkFirstPerson(text) {
  const firstPersonWords = text.match(/\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/gi);
  return firstPersonWords || [];
}

function checkAIMarkers(text) {
  const aiMarkers = [
    /\b(furthermore|moreover|additionally|in addition|consequently|thus|hence|therefore)\b/gi,
    /\b(notably|significantly|substantially|considerably)\b/gi,
    /\b(it is important to note|it should be noted|it is worth noting)\b/gi,
    /\b(in terms of|with respect to|in relation to|with regard to)\b/gi,
    /\b(utilize|utilization|implement|implementation|demonstrate|facilitate)\b/gi,
    /\b(optimal|optimally|subsequent to|prior to)\b/gi,
    /\bIt is (clear|evident|apparent|obvious) that\b/gi,
    /\bDue to the fact that\b/gi,
    /\bIn order to\b/gi,
    /\bFor the purpose of\b/gi,
  ];
  
  const found = [];
  for (const pattern of aiMarkers) {
    const matches = text.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  return found;
}

async function testEngine(engine, inputText, allowFirstPerson) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`Testing: ${engine.toUpperCase()}`);
  console.log(`Input has first-person: ${allowFirstPerson}`);
  console.log('═'.repeat(80));
  
  try {
    const response = await fetch('http://localhost:3000/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: inputText,
        engine: engine,
        strength: 'strong', // Use strong to get maximum anti-AI processing
        tone: 'academic',
        strict_meaning: true,
        enable_post_processing: true
      })
    });

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}`);
      return { engine, success: false, error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    const humanized = result.humanized || result.text;

    // Strict validation
    const contractions = checkContractions(humanized);
    const firstPerson = checkFirstPerson(humanized);
    const aiMarkers = checkAIMarkers(humanized);

    const checks = {
      noContractions: {
        pass: contractions.length === 0,
        detail: contractions.length === 0 ? 'None found' : `Found: ${contractions.join(', ')}`
      },
      noFirstPerson: {
        pass: allowFirstPerson || firstPerson.length === 0,
        detail: allowFirstPerson 
          ? `Allowed (input had first-person)` 
          : (firstPerson.length === 0 ? 'None found' : `Found: ${firstPerson.slice(0, 5).join(', ')}${firstPerson.length > 5 ? '...' : ''}`)
      },
      noAIMarkers: {
        pass: aiMarkers.length < 3, // Allow up to 2 markers
        detail: aiMarkers.length === 0 ? 'None found' : `Found ${aiMarkers.length}: ${aiMarkers.slice(0, 3).join(', ')}${aiMarkers.length > 3 ? '...' : ''}`
      },
      meaningPreserved: {
        pass: humanized.length > inputText.length * 0.6 && humanized.length < inputText.length * 1.8,
        detail: `Length ratio: ${(humanized.length / inputText.length).toFixed(2)}x`
      }
    };

    const allPassed = Object.values(checks).every(c => c.pass);

    console.log(`\n✓ Response received (${humanized.length} chars)\n`);
    console.log(`Validation Results:`);
    
    for (const [checkName, check] of Object.entries(checks)) {
      console.log(`  ${check.pass ? '✅' : '❌'} ${checkName}: ${check.detail}`);
    }

    if (!allPassed) {
      console.log('\n⚠️  OUTPUT SAMPLE:');
      console.log(humanized.slice(0, 300) + '...\n');
    } else {
      console.log('\n✅ ALL CHECKS PASSED\n');
    }

    return { 
      engine, 
      success: allPassed, 
      checks,
      contractionsFound: contractions.length,
      firstPersonFound: firstPerson.length,
      aiMarkersFound: aiMarkers.length
    };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return { engine, success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n🚀 STRICT ZERO-AI VALIDATION TEST\n');
  console.log('Requirements:');
  console.log('  - ZERO contractions');
  console.log('  - ZERO first-person (unless in input)');
  console.log('  - Minimal AI markers');
  console.log('  - Natural, human-like output\n');
  
  console.log('\n' + '═'.repeat(80));
  console.log('TEST SET 1: NO FIRST-PERSON INPUT');
  console.log('═'.repeat(80));
  
  const results1 = [];
  for (const engine of ENGINES) {
    const result = await testEngine(engine, TEST_INPUT_NO_FIRST_PERSON, false);
    results1.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n\n' + '═'.repeat(80));
  console.log('TEST SET 2: WITH FIRST-PERSON INPUT');
  console.log('═'.repeat(80));
  
  const results2 = [];
  for (const engine of ENGINES) {
    const result = await testEngine(engine, TEST_INPUT_WITH_FIRST_PERSON, true);
    results2.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Final summary
  console.log('\n\n' + '═'.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('═'.repeat(80));
  
  const allResults = [...results1, ...results2];
  const passed = allResults.filter(r => r.success);
  const failed = allResults.filter(r => !r.success);
  
  console.log(`\n✅ Passed: ${passed.length}/${allResults.length} (${((passed.length/allResults.length)*100).toFixed(1)}%)`);
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}/${allResults.length}`);
    failed.forEach(r => {
      console.log(`   - ${r.engine}: ${r.error || 'validation failed'}`);
      if (r.checks) {
        const failedChecks = Object.entries(r.checks)
          .filter(([_, check]) => !check.pass)
          .map(([name, check]) => `${name} (${check.detail})`);
        if (failedChecks.length > 0) {
          console.log(`     Issues: ${failedChecks.join('; ')}`);
        }
      }
    });
  }
  
  // Statistics
  const totalContractionViolations = allResults.reduce((sum, r) => sum + (r.contractionsFound || 0), 0);
  const totalFirstPersonViolations = results1.reduce((sum, r) => sum + (r.firstPersonFound || 0), 0); // Only count test set 1
  const totalAIMarkers = allResults.reduce((sum, r) => sum + (r.aiMarkersFound || 0), 0);
  
  console.log(`\n📊 Statistics:`);
  console.log(`   Total contraction violations: ${totalContractionViolations}`);
  console.log(`   Total first-person violations: ${totalFirstPersonViolations} (from no-first-person inputs)`);
  console.log(`   Total AI markers found: ${totalAIMarkers}`);
  
  console.log('\n' + '═'.repeat(80));
  
  if (failed.length === 0) {
    console.log('✨ ALL ENGINES PASSED! Ready for zero-AI deployment.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some validations failed. Review above output.\n');
    process.exit(1);
  }
}

runAllTests().catch(console.error);
