/**
 * Test all humanizer engines with the user's sample text.
 * Checks: sentence structure, word count, capitalization, paragraph structure.
 * Usage: node test-all-engines-anim.mjs
 */

const TEST_TEXT = `transformational and empowering leadership are consistently associated with enhanced engagement, innovation, and organisational productivity. leaders who articulate a clear vision, demonstrate authenticity, and distribute decision-making authority help employees internalise organisational goals, resulting in higher levels of motivation and discretionary effort (helalat et al., 2025, p. 334). xuan (2025, p. 55) found that such leaders foster psychological ownership by encouraging participation in problem-solving and recognising individual contributions, which strengthens organisational commitment. empowering leadership also correlates with improved team adaptability and learning agility, both of which are essential in volatile, hybrid work environments. moreover, when leaders demonstrate empathy and authenticity, they cultivate trust, which promotes retention and strengthens employees' sense of belonging. collectively, these behaviours drive alignment between individual and organisational objectives, generating a culture of performance and innovation that is both sustainable and ethically grounded.`;

const BASE = 'http://localhost:3000';

const ENGINES = [
  'ninja_4', 'easy', 'ozone', 'ninja_1',           // Stealth Mode
  'humara_v3_3', 'oxygen', 'king', 'nuru_v2', 'ghost_pro_wiki',  // Anti GPTZero
  'ninja_3', 'ninja_2', 'ninja_5', 'ghost_trial_2', // Deep Signal Kill
];

async function testEngine(engine) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/humanize-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEST_TEXT,
        engine,
        strength: 'medium',
        tone: 'academic',
        strict_meaning: false,
        enable_post_processing: true,
      }),
    });

    if (!res.ok) {
      return { engine, error: `HTTP ${res.status}`, ms: Date.now() - start };
    }

    // Read SSE stream
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
          if (event.type === 'done') {
            result = event;
            await reader.cancel();
            break;
          }
          if (event.type === 'error') {
            return { engine, error: event.error, ms: Date.now() - start };
          }
        } catch {}
      }
      if (result) break;
    }

    if (!result || !result.humanized) {
      return { engine, error: 'No result received', ms: Date.now() - start };
    }

    const text = result.humanized;
    const wordCount = text.trim().split(/\s+/).length;
    const inputWordCount = TEST_TEXT.trim().split(/\s+/).length;
    const ratio = (wordCount / inputWordCount).toFixed(2);

    // Sentence structure checks
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    const uncapitalized = sentences.filter(s => /^[a-z]/.test(s.trim()));
    const hasProperEndings = sentences.every(s => /[.!?]$/.test(s.trim()));
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

    return {
      engine,
      ms: Date.now() - start,
      inputWords: inputWordCount,
      outputWords: wordCount,
      ratio,
      sentences: sentences.length,
      uncapitalized: uncapitalized.length,
      uncapitalizedExamples: uncapitalized.slice(0, 3).map(s => s.slice(0, 60)),
      properEndings: hasProperEndings,
      paragraphs: paragraphs.length,
      preview: text.slice(0, 200) + (text.length > 200 ? '…' : ''),
      meaning: result.meaning_similarity,
    };
  } catch (err) {
    return { engine, error: err.message, ms: Date.now() - start };
  }
}

async function main() {
  console.log(`\n=== Testing ${ENGINES.length} engines ===`);
  console.log(`Input: ${TEST_TEXT.trim().split(/\s+/).length} words\n`);

  for (const engine of ENGINES) {
    console.log(`▸ Testing ${engine}...`);
    const r = await testEngine(engine);

    if (r.error) {
      console.log(`  ✗ ERROR: ${r.error} (${r.ms}ms)\n`);
      continue;
    }

    const warnings = [];
    if (r.outputWords > r.inputWords * 3) warnings.push(`⚠ BLOAT: ${r.ratio}x expansion`);
    if (r.uncapitalized > 0) warnings.push(`⚠ ${r.uncapitalized} uncapitalized sentence(s)`);
    if (!r.properEndings) warnings.push('⚠ Missing sentence-ending punctuation');

    console.log(`  ✓ ${r.outputWords} words (${r.ratio}x) | ${r.sentences} sentences | ${r.paragraphs} paragraph(s) | meaning: ${(r.meaning * 100).toFixed(0)}% | ${r.ms}ms`);
    if (warnings.length) console.log(`  ${warnings.join(' | ')}`);
    if (r.uncapitalizedExamples?.length) {
      r.uncapitalizedExamples.forEach(ex => console.log(`    → "${ex}..."`));
    }
    console.log(`  Preview: "${r.preview}"\n`);
  }
}

main();
