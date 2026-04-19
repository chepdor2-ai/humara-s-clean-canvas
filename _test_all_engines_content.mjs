// Comprehensive content preservation test for ALL engines
// Uses a shorter but structured text to keep processing time reasonable

const input = `Climate Change and Global Policy

Climate change represents one of the most pressing challenges facing the modern world. Rising global temperatures have led to more frequent extreme weather events, including hurricanes, droughts, and flooding. Scientists warn that without immediate action, these effects will intensify over the coming decades.

International Cooperation

International cooperation is essential for addressing climate change effectively. The Paris Agreement, signed by 196 nations in 2015, established a framework for reducing greenhouse gas emissions. However, implementation has been uneven, with developed nations often failing to meet their commitments while developing countries lack the resources for rapid transition.

Economic Implications

The economic implications of climate change are substantial and far-reaching. Agricultural productivity has declined in many regions due to shifting weather patterns. Coastal cities face billions of dollars in potential damage from rising sea levels. Yet the transition to renewable energy also presents significant economic opportunities, including job creation and technological innovation.`;

const inputParas = input.split(/\n\s*\n/).filter(p => p.trim());
const inputSentCount = inputParas.reduce((sum, p) => {
  const body = p.replace(/\n/g, ' ').trim();
  const sents = body.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
  return sum + Math.max(1, sents.length);
}, 0);

console.log(`Input: ${inputParas.length} paragraphs, ~${inputSentCount} sentences, ${input.split(/\s+/).length} words\n`);

// All engines to test (priority engines first)
const engines = [
  'nuru_v2',       // Nuru — heavy post-processing (user priority)
  'antipangram',   // Pangram/AntiPangram (user priority)
  'easy',          // Swift
  'oxygen',        // Oxygen
  'ninja_3',       // Ninja 3
  'ghost_pro_wiki', // Ghost Pro
  'humara_v3_3',   // Humara V3
  'omega',         // Omega
];

async function testEngine(engine) {
  const url = 'http://localhost:3000/api/humanize-stream';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5min timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input, engine, strength: 'medium', tone: 'academic' }),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeout);
      return { engine, error: `HTTP ${response.status}` };
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
            if (data.type === 'done') finalResult = data;
          } catch {}
        }
      }
    }
    clearTimeout(timeout);

    if (!finalResult?.humanized) return { engine, error: 'No result' };

    const output = finalResult.humanized;
    const outputParas = output.split(/\n\s*\n/).filter(p => p.trim());
    const outputSentences = outputParas.reduce((sum, p) => {
      const body = p.replace(/\n/g, ' ').trim();
      const sents = body.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
      return sum + Math.max(1, sents.length);
    }, 0);

    return {
      engine,
      paragraphs: outputParas.length,
      sentences: outputSentences,
      words: output.split(/\s+/).length,
      paraOk: outputParas.length >= inputParas.length,
      sentOk: outputSentences >= inputSentCount * 0.80,
    };
  } catch (e) {
    clearTimeout(timeout);
    return { engine, error: e.name === 'AbortError' ? 'TIMEOUT (5min)' : e.message };
  }
}

async function main() {
  const results = [];
  
  for (const engine of engines) {
    process.stdout.write(`Testing ${engine}...`);
    const start = Date.now();
    const result = await testEngine(engine);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    if (result.error) {
      console.log(` ${result.error} (${elapsed}s)`);
    } else {
      const paraStatus = result.paraOk ? '✓' : '✗';
      const sentStatus = result.sentOk ? '✓' : '✗';
      console.log(` ${paraStatus} paras:${result.paragraphs}/${inputParas.length} ${sentStatus} sents:${result.sentences}/${inputSentCount} words:${result.words} (${elapsed}s)`);
    }
    results.push({ ...result, elapsed });
  }

  console.log('\n══════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════');
  console.log(`Expected: ${inputParas.length} paragraphs, ${inputSentCount} sentences\n`);
  
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.engine.padEnd(16)} ERROR: ${r.error}`);
    } else {
      const status = (r.paraOk && r.sentOk) ? '✓ PASS' : '✗ FAIL';
      console.log(`  ${r.engine.padEnd(16)} ${status}  paras:${r.paragraphs}/${inputParas.length}  sents:${r.sentences}/${inputSentCount}  words:${r.words}  (${r.elapsed}s)`);
    }
  }
}

main().catch(console.error);
