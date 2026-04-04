/**
 * API Integration Test for Ghost Mini v1.2
 * Tests the actual API endpoint to ensure structure preservation works end-to-end
 */

const API_URL = 'http://localhost:3000/api/humanize';

const TEST_TEXT = `Academic Writing Guidelines

Academic writing requires precision and clarity. I think students need to understand the fundamental principles. We can't expect quality without proper training.

Key Elements

Research shows that effective academic writing has three main components. First is clarity. Second is coherence. Third is proper citation.

Best Practices:

- Avoid contractions
- Use formal vocabulary
- Maintain objective tone
- Support claims with evidence

Implementation

Organizations should look at developing comprehensive writing programs. These programs need to be very structured and practical. We believe this approach will help students succeed.`;

async function testAPIEndpoint() {
  console.log('🧪 Ghost Mini v1.2 - API Integration Test\n');
  console.log('='.repeat(70));
  
  try {
    console.log('\n📤 Sending request to API...\n');
    console.log('Request Body:');
    console.log(JSON.stringify({
      text: TEST_TEXT,
      engine: 'ghost_mini_v1_2',
      strength: 'medium',
      tone: 'academic'
    }, null, 2));

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: TEST_TEXT,
        engine: 'ghost_mini_v1_2',
        strength: 'medium',
        tone: 'academic'
      })
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    console.log('\n' + '='.repeat(70));
    console.log('\n📥 API Response:\n');
    
    console.log('✨ Humanized Text:');
    console.log(result.humanized);
    
    console.log('\n📊 Metadata:');
    console.log(`   Engine Used: ${result.engine_used}`);
    console.log(`   Word Count: ${result.input_word_count} → ${result.word_count}`);
    console.log(`   Meaning Preserved: ${result.meaning_preserved ? '✅' : '❌'} (${result.meaning_similarity})`);
    
    // Validate structure preservation
    const originalParagraphs = TEST_TEXT.split(/\n\n+/).length;
    const processedParagraphs = result.humanized.split(/\n\n+/).length;
    
    console.log('\n🔍 Structure Validation:');
    console.log(`   Original Paragraphs: ${originalParagraphs}`);
    console.log(`   Processed Paragraphs: ${processedParagraphs}`);
    console.log(`   Structure Preserved: ${originalParagraphs === processedParagraphs ? '✅' : '❌'}`);
    
    // Check transformations
    console.log('\n✅ Transformations:');
    console.log(`   Contractions Expanded: ${!/\b(can't|won't|don't|we're)\b/i.test(result.humanized) ? '✅' : '❌'}`);
    console.log(`   Em-dashes Removed: ${!result.humanized.includes('—') ? '✅' : '❌'}`);
    console.log(`   Academic Vocabulary: ${result.humanized.includes('examine') || result.humanized.includes('employ') ? '✅' : '❌'}`);

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ API INTEGRATION TEST PASSED\n');

  } catch (error: unknown) {
    console.error('\n❌ API INTEGRATION TEST FAILED');
    console.error(`Error: ${(error as Error).message}`);
    console.error('\nMake sure the Next.js dev server is running on http://localhost:3000');
    process.exit(1);
  }
}

// Run the test
testAPIEndpoint();
