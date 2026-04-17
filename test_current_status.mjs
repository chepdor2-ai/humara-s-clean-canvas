#!/usr/bin/env node

/**
 * Test current status of humanization after recent fixes
 * - Check for text duplication
 * - Check for heading preservation
 * - Verify output structure
 */

const API_URL = 'http://localhost:3000/api/humanize-stream';

const testData = {
  engine: 'oxygen',
  text: `Research methodology
This section describes the game plan used to collect the information.

Historical context
Historically, especially qualitative techniques were employed.

Findings
Participants reported improvements significantly.`,
};

async function testHumanization() {
  console.log('🔍 Testing Humanization Status\n');
  console.log('Input text:');
  console.log(testData.text);
  console.log('\n' + '='.repeat(60) + '\n');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalOutput = '';
    let duplicationCount = 0;
    const seenSentences = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;

        try {
          const json = JSON.parse(line.slice(5));

          if (json.type === 'done') {
            finalOutput = json.humanized;
            console.log('✅ Final Output:');
            console.log(finalOutput);
            console.log('\n' + '='.repeat(60) + '\n');

            // Analyze output
            const inputWords = testData.text.split(/\s+/).filter(Boolean).length;
            const outputWords = finalOutput.split(/\s+/).filter(Boolean).length;
            const bloatRatio = (outputWords / inputWords).toFixed(2);

            console.log('📊 Metrics:');
            console.log(`  Input words: ${inputWords}`);
            console.log(`  Output words: ${outputWords}`);
            console.log(`  Bloat ratio: ${bloatRatio}x`);

            // Check for duplicated phrases
            const sentences = finalOutput.split(/[.!?]\s+/).filter(s => s.trim());
            for (const sent of sentences) {
              const key = sent.trim().slice(0, 30);
              seenSentences.set(key, (seenSentences.get(key) || 0) + 1);
            }

            let dups = 0;
            for (const [key, count] of seenSentences) {
              if (count > 1) {
                console.log(`  ⚠️ Duplicated ${count}x: "${key}..."`);
                dups = count - 1;
              }
            }

            if (dups === 0) {
              console.log('  ✓ No significant duplication detected');
            }

            // Check for heading preservation
            const headings = ['Research methodology', 'Historical context', 'Findings'];
            const preservedHeadings = headings.filter(h => 
              finalOutput.includes(h)
            ).length;

            console.log(`\n📝 Heading Preservation: ${preservedHeadings}/3`);
            for (const heading of headings) {
              if (finalOutput.includes(heading)) {
                console.log(`  ✓ "${heading}"`);
              } else {
                console.log(`  ✗ "${heading}" - MISSING`);
              }
            }

            // Check for heading merging (heading + body on same paragraph)
            const lines = finalOutput.split('\n').filter(l => l.trim());
            console.log(`\n📋 Output Structure (${lines.length} lines):`);
            for (let i = 0; i < Math.min(5, lines.length); i++) {
              const line = lines[i].slice(0, 70);
              console.log(`  ${i + 1}. ${line}${lines[i].length > 70 ? '...' : ''}`);
            }

            process.exit(0);
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    setTimeout(() => {
      console.error('❌ Timeout waiting for done event');
      process.exit(1);
    }, 5000);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testHumanization();
