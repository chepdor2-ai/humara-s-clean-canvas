/**
 * Test: Paragraph Preservation
 * Sends multi-paragraph text to the humanize-stream API and verifies
 * paragraph breaks (\n\n) are preserved in the output.
 */

const TEST_INPUT = `Artificial intelligence has transformed many industries over the past decade. Machine learning algorithms can now process vast amounts of data and identify patterns that would be impossible for humans to detect. These advances have led to significant improvements in healthcare, finance, and transportation.

However, the rapid development of AI also raises important ethical concerns. Questions about bias in training data, accountability for automated decisions, and the potential displacement of human workers must be addressed. Policymakers and researchers are working together to develop frameworks that ensure AI is deployed responsibly.

Education systems must also adapt to prepare students for an AI-driven economy. Critical thinking, creativity, and emotional intelligence are skills that will become increasingly valuable as routine cognitive tasks are automated. Schools and universities should integrate AI literacy into their curricula to help students understand both the capabilities and limitations of these technologies.`;

const ENGINES = ['oxygen', 'nuru_v2', 'easy', 'king', 'ghost_pro_wiki', 'ninja_1'];

async function testEngine(engine) {
  const startTime = Date.now();
  try {
    const res = await fetch('http://localhost:3000/api/humanize-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEST_INPUT,
        engine,
        strength: 'medium',
        tone: 'academic',
        enable_post_processing: true,
      }),
    });

    if (!res.ok) {
      console.log(`  [${engine}] ❌ HTTP ${res.status}`);
      return { engine, pass: false, reason: `HTTP ${res.status}` };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalHumanized = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'done') {
            finalHumanized = event.humanized;
          }
        } catch {}
      }
    }

    if (!finalHumanized) {
      console.log(`  [${engine}] ❌ No 'done' event received`);
      return { engine, pass: false, reason: 'No done event' };
    }

    const inputParas = TEST_INPUT.split(/\n\s*\n/).filter(p => p.trim());
    const outputParas = finalHumanized.split(/\n\s*\n/).filter(p => p.trim());
    const elapsed = Date.now() - startTime;

    if (outputParas.length >= inputParas.length) {
      console.log(`  [${engine}] ✅ PASS — ${inputParas.length} input paragraphs → ${outputParas.length} output paragraphs (${elapsed}ms)`);
      return { engine, pass: true, inputParas: inputParas.length, outputParas: outputParas.length };
    } else {
      console.log(`  [${engine}] ❌ FAIL — ${inputParas.length} input paragraphs → ${outputParas.length} output paragraphs (${elapsed}ms)`);
      console.log(`    Output preview: "${finalHumanized.slice(0, 200)}..."`);
      return { engine, pass: false, inputParas: inputParas.length, outputParas: outputParas.length };
    }
  } catch (err) {
    console.log(`  [${engine}] ❌ Error: ${err.message}`);
    return { engine, pass: false, reason: err.message };
  }
}

async function main() {
  console.log('=== Paragraph Preservation Test ===');
  console.log(`Input: ${TEST_INPUT.split(/\n\s*\n/).filter(p => p.trim()).length} paragraphs\n`);

  // Test just the first engine quickly for validation
  const engine = process.argv[2] || 'oxygen';
  if (engine === 'all') {
    for (const eng of ENGINES) {
      await testEngine(eng);
    }
  } else {
    await testEngine(engine);
  }
}

main().catch(console.error);
