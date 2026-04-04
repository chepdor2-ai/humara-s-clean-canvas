/**
 * Quick test for V1.1 engine — run with:
 *   npx tsx test-v11.mjs
 * or start dev server and POST to /api/humanize with engine=fast_v11
 */

const AI_TEXT = `Artificial intelligence has become an increasingly important aspect of modern technology. It is important to note that AI systems leverage sophisticated algorithms to facilitate various tasks across multiple domains. Furthermore, these innovative solutions demonstrate a comprehensive approach to problem-solving that encompasses both technical and practical considerations.

In today's rapidly evolving digital landscape, organizations must navigate the complexities of implementing AI-driven methodologies. The utilization of machine learning paradigms plays a crucial role in optimizing operational efficiency. Moreover, the multifaceted nature of these technologies necessitates a holistic understanding of their implications.

Subsequently, it is essential to acknowledge that the trajectory of AI development underscores the paramount importance of ethical considerations. These fundamental principles serve as a cornerstone for responsible innovation. Nevertheless, the dynamic interplay between technological advancement and societal impact requires continuous scrutiny and evaluation.`;

async function test() {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  console.log(`Testing V1.1 engine at ${baseUrl}/api/humanize\n`);
  console.log('Input text (first 200 chars):');
  console.log(AI_TEXT.substring(0, 200) + '...\n');

  const res = await fetch(`${baseUrl}/api/humanize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: AI_TEXT,
      engine: 'fast_v11',
      strength: 'medium',
      tone: 'neutral',
    }),
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log('=== RESULT ===');
  console.log(`Engine: ${data.engine_used}`);
  console.log(`Input words: ${data.input_word_count}`);
  console.log(`Output words: ${data.word_count}`);
  console.log(`Meaning preserved: ${data.meaning_preserved} (${data.meaning_similarity})`);
  console.log(`\nInput AI score: ${data.input_detector_results?.overall}%`);
  console.log(`Output AI score: ${data.output_detector_results?.overall}%`);
  console.log(`\n--- Humanized Text ---`);
  console.log(data.humanized);
  console.log('\n--- Top 5 Detector Scores ---');
  const detectors = data.output_detector_results?.detectors || [];
  detectors.slice(0, 5).forEach((d) => {
    console.log(`  ${d.detector}: ${d.ai_score}% AI`);
  });
  console.log('\nDone!');
}

test().catch(console.error);
