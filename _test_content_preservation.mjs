// Test: Verify Swift (easy) engine preserves all paragraphs and sentences
const input = `Artificial Intelligence in Healthcare

The integration of artificial intelligence into healthcare systems has transformed the way medical professionals approach patient care. Machine learning algorithms now assist in diagnosing diseases with remarkable accuracy. These systems can analyze medical images, identify patterns in patient data, and provide treatment recommendations that complement human expertise.

Early Detection and Prevention

Early detection of diseases remains one of the most promising applications of AI in medicine. Neural networks trained on vast datasets can identify subtle indicators of cancer, cardiovascular disease, and neurological conditions before symptoms become apparent. This capability has the potential to save millions of lives annually by enabling proactive intervention rather than reactive treatment.

Challenges and Ethical Considerations

Despite these advances, significant challenges remain in implementing AI across healthcare settings. Data privacy concerns must be addressed as systems require access to sensitive patient information. Additionally, algorithmic bias presents a serious risk when training data does not adequately represent diverse patient populations. Healthcare providers must balance the efficiency gains of automation with the irreplaceable value of human judgment and empathy in patient interactions.

Future Directions

The future of AI in healthcare will likely involve more sophisticated natural language processing capabilities. These tools will enable better communication between patients and providers. Researchers continue to develop systems that can process unstructured clinical notes and extract meaningful insights for improved care coordination.`;

const expectedParagraphCount = input.split(/\n\s*\n/).filter(p => p.trim()).length;
const expectedSentences = input.split(/\n\s*\n/).filter(p => p.trim()).reduce((sum, p) => {
  const body = p.replace(/\n/g, ' ').trim();
  // Rough sentence count by splitting on period/question/exclamation
  const sents = body.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
  return sum + Math.max(1, sents.length);
}, 0);

console.log(`Input stats:`);
console.log(`  Paragraphs: ${expectedParagraphCount}`);
console.log(`  Approximate sentences: ${expectedSentences}`);
console.log(`  Word count: ${input.split(/\s+/).length}`);
console.log('');

async function testEngine(engine) {
  const url = 'http://localhost:3000/api/humanize-stream';
  const body = JSON.stringify({
    text: input,
    engine: engine,
    strength: 'medium',
    tone: 'academic'
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!response.ok) {
      console.log(`  [${engine}] HTTP ${response.status}: ${await response.text()}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'done') {
              finalResult = data;
            }
          } catch {}
        }
      }
    }

    if (!finalResult || !finalResult.humanized) {
      console.log(`  [${engine}] No final result received`);
      return;
    }

    const output = finalResult.humanized;
    const outputParas = output.split(/\n\s*\n/).filter(p => p.trim());
    const outputSentences = outputParas.reduce((sum, p) => {
      const body = p.replace(/\n/g, ' ').trim();
      const sents = body.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
      return sum + Math.max(1, sents.length);
    }, 0);
    const outputWords = output.split(/\s+/).length;

    const paraOk = outputParas.length >= expectedParagraphCount;
    const sentOk = outputSentences >= expectedSentences * 0.80;

    console.log(`  [${engine}] Output stats:`);
    console.log(`    Paragraphs: ${outputParas.length}/${expectedParagraphCount} ${paraOk ? '✓' : '✗ LOST PARAGRAPHS'}`);
    console.log(`    Sentences: ${outputSentences}/${expectedSentences} ${sentOk ? '✓' : '✗ LOST SENTENCES'}`);
    console.log(`    Words: ${outputWords} (input: ${input.split(/\s+/).length})`);
    
    if (!paraOk || !sentOk) {
      console.log(`    ⚠️  CONTENT LOSS DETECTED`);
      console.log(`    First 200 chars of output: ${output.slice(0, 200)}...`);
    } else {
      console.log(`    ✓ Content preserved`);
    }
  } catch (e) {
    console.log(`  [${engine}] Error: ${e.message}`);
  }
}

async function main() {
  console.log('Testing content preservation across engines...\n');
  
  // Test Swift (easy) engine first since that's the reported issue
  console.log('--- Swift (easy) ---');
  await testEngine('easy');
  console.log('');
  
  // Also test a few other engines for comparison
  console.log('--- Nuru ---');
  await testEngine('nuru');
  console.log('');
  
  console.log('--- Oxygen ---');
  await testEngine('oxygen');
  console.log('');

  console.log('Done.');
}

main().catch(console.error);
