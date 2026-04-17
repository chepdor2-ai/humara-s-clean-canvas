#!/usr/bin/env node

/**
 * Test with actual complex text (Kenya Wikipedia passage)
 * This is the text that was showing 4.61x bloat previously
 */

const API_URL = 'http://localhost:3000/api/humanize-stream';

const complexText = `Research methodology
This section describes the game plan used to collect the information.

Historical context
Historically, especially qualitative techniques were employed.

Participants reported improvements significantly. The study involved diverse demographic groups. Research showed positive outcomes overall.

Analysis framework
The framework had multiple components and stages. Each stage required careful planning and execution.

Results interpretation
The findings suggest important conclusions about the phenomenon studied.`;

async function testComplexHumanization() {
  console.log('🔍 Testing Complex Text Humanization\n');
  console.log('Input text:');
  console.log(complexText);
  console.log('\n' + '='.repeat(70) + '\n');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'oxygen',
        text: complexText,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
            const finalOutput = json.humanized;
            
            console.log('✅ Final Output:');
            console.log(finalOutput);
            console.log('\n' + '='.repeat(70) + '\n');

            // Metrics
            const inputWords = complexText.split(/\s+/).filter(Boolean).length;
            const outputWords = finalOutput.split(/\s+/).filter(Boolean).length;
            const bloatRatio = (outputWords / inputWords).toFixed(2);
            const inputChars = complexText.length;
            const outputChars = finalOutput.length;

            console.log('📊 Metrics:');
            console.log(`  Input words: ${inputWords} chars: ${inputChars}`);
            console.log(`  Output words: ${outputWords} chars: ${outputChars}`);
            console.log(`  Word bloat ratio: ${bloatRatio}x`);
            console.log(`  Char bloat ratio: ${(outputChars / inputChars).toFixed(2)}x`);

            // Paragraph count
            const inputParas = complexText.split('\n\n').filter(p => p.trim()).length;
            const outputParas = finalOutput.split('\n\n').filter(p => p.trim()).length;
            console.log(`\n📋 Paragraph Count:`);
            console.log(`  Input: ${inputParas} paras`);
            console.log(`  Output: ${outputParas} paras`);
            console.log(`  Status: ${inputParas === outputParas ? '✓ MATCH' : '✗ MISMATCH'}`);

            // Heading preservation
            const headings = ['Research methodology', 'Historical context', 'Analysis framework', 'Results interpretation'];
            const preservedHeadings = headings.filter(h => finalOutput.includes(h)).length;
            console.log(`\n📝 Heading Preservation: ${preservedHeadings}/${headings.length}`);
            for (const heading of headings) {
              console.log(`  ${finalOutput.includes(heading) ? '✓' : '✗'} "${heading}"`);
            }

            // Check for merged headings (heading + body on same line)
            const lines = finalOutput.split('\n').filter(l => l.trim());
            console.log(`\n🔗 Checking for merged heading+body:`);
            let mergedCount = 0;
            for (let i = 0; i < lines.length - 1; i++) {
              const currentLine = lines[i].trim();
              // Check if this line looks like heading + body merged
              if (currentLine.includes('research') && currentLine.length > 80 && !currentLine.endsWith('.')) {
                console.log(`  ⚠️ Line ${i+1} possibly merged: "${currentLine.slice(0, 80)}..."`);
                mergedCount++;
              }
            }
            if (mergedCount === 0) {
              console.log('  ✓ No merged heading+body detected');
            }

            // Duplication check
            const sentences = finalOutput.match(/[^.!?]*[.!?]+/g) || [];
            const phraseFreq = {};
            for (const sent of sentences) {
              const key = sent.trim().slice(0, 40);
              phraseFreq[key] = (phraseFreq[key] || 0) + 1;
            }

            console.log(`\n📌 Duplication Analysis:`);
            const dups = Object.entries(phraseFreq)
              .filter(([, count]) => count > 1)
              .sort((a, b) => b[1] - a[1]);
            
            if (dups.length === 0) {
              console.log('  ✓ No duplicated sentences');
            } else {
              console.log(`  Found ${dups.length} duplicated phrase patterns:`);
              for (const [phrase, count] of dups.slice(0, 5)) {
                console.log(`    ${count}x: "${phrase.replace(/\n/g, ' ')}..."`);
              }
            }

            // Summary
            console.log('\n' + '='.repeat(70));
            console.log('✅ SUMMARY:');
            if (bloatRatio <= 1.2 && preservedHeadings === headings.length && dups.length === 0) {
              console.log('  ✓ All issues RESOLVED - bloat eliminated, headings preserved, no duplication');
            } else if (bloatRatio > 3 || preservedHeadings < 2) {
              console.log('  ✗ Critical issues remain');
            } else {
              console.log('  ⚠️ Partial improvement - some issues remain');
            }

            process.exit(0);
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    setTimeout(() => {
      console.error('❌ Timeout');
      process.exit(1);
    }, 5000);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testComplexHumanization();
