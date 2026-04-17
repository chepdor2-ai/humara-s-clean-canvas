/**
 * Quick test: just the engines that were bloating (easy, ozone, king, humara_v3_3)
 */
const TEST_TEXT = `transformational and empowering leadership are consistently associated with enhanced engagement, innovation, and organisational productivity. leaders who articulate a clear vision, demonstrate authenticity, and distribute decision-making authority help employees internalise organisational goals, resulting in higher levels of motivation and discretionary effort (helalat et al., 2025, p. 334). xuan (2025, p. 55) found that such leaders foster psychological ownership by encouraging participation in problem-solving and recognising individual contributions, which strengthens organisational commitment. empowering leadership also correlates with improved team adaptability and learning agility, both of which are essential in volatile, hybrid work environments. moreover, when leaders demonstrate empathy and authenticity, they cultivate trust, which promotes retention and strengthens employees' sense of belonging. collectively, these behaviours drive alignment between individual and organisational objectives, generating a culture of performance and innovation that is both sustainable and ethically grounded.`;

const ENGINES = ['easy', 'ozone', 'king', 'humara_v3_3'];

async function testEngine(engine) {
  const start = Date.now();
  const res = await fetch('http://localhost:3000/api/humanize-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: TEST_TEXT, engine, strength: 'medium', tone: 'academic', strict_meaning: false, enable_post_processing: true }),
  });
  if (!res.ok) { console.log(`  ${engine}: HTTP ${res.status}`); return; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
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
        if (event.type === 'done') { result = event; await reader.cancel(); break; }
        if (event.type === 'error') { console.log(`  ${engine}: ERROR: ${event.error}`); return; }
      } catch {}
    }
    if (result) break;
  }
  if (!result?.humanized) { console.log(`  ${engine}: No result`); return; }
  const outWords = result.humanized.trim().split(/\s+/).length;
  const inWords = TEST_TEXT.trim().split(/\s+/).length;
  const ratio = (outWords / inWords).toFixed(2);
  const status = outWords > inWords * 2 ? '❌ BLOAT' : '✅ OK';
  console.log(`  ${engine}: ${outWords} words (${ratio}x) ${status} | ${Date.now() - start}ms`);
  console.log(`    Preview: "${result.humanized.slice(0, 150)}..."`);
}

async function main() {
  const inWords = TEST_TEXT.trim().split(/\s+/).length;
  console.log(`Input: ${inWords} words\n`);
  for (const e of ENGINES) {
    console.log(`▸ ${e}...`);
    await testEngine(e);
  }
}
main();
