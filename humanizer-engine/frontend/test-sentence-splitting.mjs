/**
 * Test sentence-by-sentence processing for fixed engines.
 * Verifies that abbreviations, decimals, URLs, etc. are NOT incorrectly split.
 */

const API_URL = 'http://localhost:3000/api/humanize';

// Text specifically designed to trip up broken sentence splitting:
// - Abbreviations: Dr., Mr., e.g., i.e., Fig., etc.
// - Decimals: 3.14, 0.53, $2.50
// - Titles with periods followed by uppercase
const TEST_TEXT = `Dr. Smith examined the results carefully. The experiment showed a p-value of 0.053, which is not statistically significant. For example, Fig. 2 demonstrates how the control group performed vs. the treatment group. The average score was 3.14 out of 5.0 points. Mr. Johnson noted that the U.S. federal guidelines require a threshold of 0.05 for significance. In other words, the study did not meet the standard criteria established by the National Institutes of Health.

The patient, Mrs. Davis, reported improvement after approximately 2.5 weeks of treatment. Her blood pressure dropped from 145.3 to 128.7 mmHg, i.e., a significant reduction. The attending physician, Prof. Williams, recommended continuing the regimen for at least 3.0 additional months. This aligns with recommendations from the World Health Organization.`;

const ENGINES = ['ghost_mini_v1_2', 'omega', 'nuru', 'ghost_mini', 'ghost_pro', 'ninja'];

async function testEngine(engine) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEST_TEXT,
        engine,
        strength: 'medium',
        tone: 'academic',
        strict_meaning: true,
        enable_post_processing: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`❌ ${engine}: HTTP ${res.status} - ${errText.substring(0, 200)}`);
      return;
    }

    const data = await res.json();

    if (data.error) {
      console.log(`❌ ${engine}: API Error - ${data.error}`);
      return;
    }

    if (!data.humanized || data.humanized.trim().length === 0) {
      console.log(`❌ ${engine}: Empty output`);
      return;
    }

    const output = data.humanized;
    
    // Check for decimal preservation — the CRITICAL test
    const decimals = ['0.053', '3.14', '5.0', '0.05', '2.5', '145.3', '128.7', '3.0'];
    const lostDecimals = decimals.filter(d => !output.includes(d));

    const inputWords = TEST_TEXT.split(/\s+/).length;
    const outputWords = output.split(/\s+/).length;

    if (lostDecimals.length > 0) {
      console.log(`❌ ${engine}: Decimals LOST: ${lostDecimals.join(', ')}`);
    } else {
      console.log(`✅ ${engine}: All decimals preserved`);
    }
    
    console.log(`   Input: ${inputWords} words | Output: ${outputWords} words`);
    console.log(`   Preview: ${output.substring(0, 300)}...`);
    console.log();
  } catch (e) {
    console.log(`❌ ${engine}: ${e.message}\n`);
  }
}

async function main() {
  console.log('=== SENTENCE SPLITTING TEST ===');
  console.log(`Testing with abbreviations, decimals, and tricky periods\n`);
  
  for (const engine of ENGINES) {
    await testEngine(engine);
  }
}

main();
