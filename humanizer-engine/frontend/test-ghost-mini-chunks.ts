/**
 * Ghost Mini Chunk Size Test
 * Tests 1-sentence, 2-sentence, and 3-sentence chunk processing
 * against all 22 detectors to find optimal chunk size.
 */

import { ghostMiniV1_2 } from './lib/engine/ghost-mini-v1-2';
import { getDetector } from './lib/engine/multi-detector';

// ── Test Texts ──
const TEST_TEXTS: { title: string; text: string }[] = [
  {
    title: "1. AI Impact on Society",
    text: `Artificial Intelligence (AI) has rapidly transformed modern society, influencing industries, economies, and everyday human interactions in profound ways. Over the past decade, AI has moved from being a theoretical concept to a practical tool integrated into daily life. From virtual assistants and recommendation systems to self-driving cars and predictive analytics, AI continues to reshape how people live and work. While its benefits are undeniable, AI also presents challenges that society must address carefully.

One of the most significant advantages of AI is its ability to increase efficiency and productivity. Machines powered by AI can process vast amounts of data at speeds far beyond human capability. This allows businesses to make quicker and more accurate decisions. In healthcare, AI has improved diagnostic accuracy by analyzing medical images and patient data, enabling early detection of diseases. Similarly, in industries such as finance and manufacturing, AI automates repetitive tasks, reducing human error and operational costs.

Despite these benefits, AI raises concerns about employment and job displacement. Automation has replaced many routine jobs, particularly in manufacturing and administrative roles. While AI creates new job opportunities in fields such as data science and software development, not all workers have the skills required to transition into these roles. This creates a gap that can lead to economic inequality if not properly addressed through education and reskilling programs.

Another critical issue associated with AI is ethics. AI systems rely on data, and if that data is biased, the outcomes produced by these systems may also be biased. This can result in unfair treatment in areas such as hiring, lending, and law enforcement. Additionally, concerns about privacy have emerged as AI systems collect and analyze large amounts of personal data. Ensuring transparency, accountability, and fairness in AI systems is therefore essential.

In conclusion, AI has significantly impacted society by enhancing efficiency and innovation, but it also introduces challenges related to employment and ethics. Balancing technological advancement with responsible implementation is crucial. Governments, organizations, and individuals must work together to ensure that AI benefits society as a whole while minimizing its risks.`
  },
  {
    title: "2. Climate Change",
    text: `Climate change is one of the most urgent global issues facing humanity today, affecting ecosystems, economies, and human life. Scientific evidence clearly shows that global temperatures are rising due to increased greenhouse gas emissions, largely caused by human activities such as burning fossil fuels, deforestation, and industrial processes. The consequences of climate change are becoming more visible, making it necessary for immediate and collective action.

One of the most noticeable effects of climate change is the increase in extreme weather events. Hurricanes, floods, droughts, and heatwaves have become more frequent and severe. These events not only cause destruction to infrastructure but also disrupt food production and water supply, leading to humanitarian crises. Vulnerable communities, especially in developing countries, are often the most affected, highlighting the inequality in climate change impacts.

Addressing climate change requires strong action from governments. Policies aimed at reducing carbon emissions, such as transitioning to renewable energy sources like solar and wind, are essential. International cooperation is also necessary, as climate change is a global problem that cannot be solved by one country alone. Agreements that encourage countries to reduce emissions and adopt sustainable practices play a crucial role.

Individuals also have a responsibility to contribute to environmental sustainability. Small actions, such as reducing energy consumption, recycling, and supporting eco-friendly products, can collectively make a significant difference. Public awareness and education are key to encouraging responsible behavior and long-term change.

In conclusion, climate change is a global challenge that requires urgent action from all levels of society. By combining government policies with individual efforts, it is possible to mitigate its effects and protect the environment for future generations.`
  },
  {
    title: "3. Education in Modern Society",
    text: `Education is a fundamental component of societal development and individual growth. It provides people with the knowledge and skills needed to navigate the complexities of modern life. In an increasingly competitive and rapidly changing world, education has become more important than ever, shaping not only personal success but also national development.

One of the key roles of education is to develop critical thinking skills. It enables individuals to analyze information, solve problems, and make informed decisions. Education also fosters creativity and innovation, which are essential for progress in fields such as science, technology, and business. A well-educated population contributes to advancements that improve quality of life.

In addition to personal development, education plays a significant role in economic growth. A skilled workforce is essential for productivity and competitiveness in the global market. Countries that invest in education often experience higher levels of economic development, as educated individuals are better equipped to contribute to various industries.

Education also promotes social equality by providing opportunities for individuals from different backgrounds. Access to quality education can help reduce poverty and bridge social gaps. However, challenges such as unequal access and limited resources still exist, particularly in developing regions.

In conclusion, education is a powerful tool that benefits both individuals and society. Ensuring equal access to quality education is essential for creating a prosperous and inclusive future.`
  },
  {
    title: "4. Social Media and Youth",
    text: `Social media has become an integral part of modern life, particularly for young people. Platforms such as Instagram, TikTok, and Facebook allow users to connect, share information, and express themselves. While social media offers many benefits, it also presents challenges that can impact the well-being of youth.

One positive aspect of social media is its ability to connect people across distances. It allows young individuals to maintain relationships and build new ones. Social media also provides access to educational content and opportunities for learning new skills, making it a valuable tool for personal development.

However, excessive use of social media can have negative effects on mental health. Constant exposure to idealized images and lifestyles can lead to feelings of inadequacy and low self-esteem. Additionally, social media addiction can reduce productivity and interfere with daily activities.

Cyberbullying is another significant concern. The anonymity provided by online platforms can encourage harmful behavior, affecting the mental health of victims. Addressing these issues requires awareness, education, and responsible use of technology.

In conclusion, social media has both positive and negative impacts on youth. Promoting responsible usage and creating supportive online environments are essential for maximizing its benefits.`
  }
];

// ── Split text into sentence chunks ──
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end
  return text.match(/[^.!?]+[.!?]+(?:\s|$)/g)?.map(s => s.trim()).filter(s => s.length > 0) || [text];
}

function chunkSentences(sentences: string[], chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(' '));
  }
  return chunks;
}

// ── Process text paragraph-by-paragraph with chunk size ──
function processWithChunkSize(fullText: string, chunkSize: number): string {
  const paragraphs = fullText.split(/\n\s*\n/).filter(p => p.trim());
  const processed = paragraphs.map(para => {
    const trimmed = para.trim();
    // If it looks like a title (short, no period), pass through
    if (trimmed.split(/\s+/).length <= 10 && !trimmed.endsWith('.')) {
      return ghostMiniV1_2(trimmed);
    }
    // Split into sentences, chunk, process each chunk
    const sentences = splitIntoSentences(trimmed);
    const chunks = chunkSentences(sentences, chunkSize);
    const processedChunks = chunks.map(chunk => {
      return ghostMiniV1_2(chunk);
    });
    return processedChunks.join(' ');
  });
  return processed.join('\n\n');
}

// ── Score text with all 22 detectors ──
function scoreText(text: string, showSignals = false): { detectors: Record<string, number>; avg: number; max: number; zeros: number; signals?: Record<string, number> } {
  const detector = getDetector();
  const result = detector.analyze(text);
  const scores: Record<string, number> = {};
  let sum = 0;
  let max = 0;
  let zeros = 0;
  for (const d of result.detectors) {
    const name = d.detector.toLowerCase().replace(/ /g, '_');
    scores[name] = d.ai_score;
    sum += d.ai_score;
    if (d.ai_score > max) max = d.ai_score;
    if (d.ai_score === 0) zeros++;
  }
  const avg = result.detectors.length > 0 ? sum / result.detectors.length : 0;
  if (showSignals) {
    return { detectors: scores, avg: Math.round(avg * 10) / 10, max: Math.round(max * 10) / 10, zeros, signals: result.signals };
  }
  return { detectors: scores, avg: Math.round(avg * 10) / 10, max: Math.round(max * 10) / 10, zeros };
}

// ── Main test runner ──
function runTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  GHOST MINI — Signal Diagnostic + Chunk Comparison');
  console.log('  Target: 15/22 detectors at 0%');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Signal diagnostic on essay 1
  const essay1 = TEST_TEXTS[0];
  console.log('── SIGNAL DIAGNOSTIC (Essay 1) ──\n');
  
  const inputScore = scoreText(essay1.text, true);
  console.log('  INPUT signals:');
  if (inputScore.signals) {
    const sorted = Object.entries(inputScore.signals).sort((a, b) => b[1] - a[1]);
    for (const [name, val] of sorted) {
      const bar = '█'.repeat(Math.round(val / 5));
      console.log(`    ${name.padEnd(28)} ${String(Math.round(val * 10) / 10).padStart(6)} ${bar}`);
    }
  }
  console.log(`  INPUT score: avg=${inputScore.avg}%, max=${inputScore.max}%\n`);

  const humanized1 = ghostMiniV1_2(essay1.text);
  const outputScore = scoreText(humanized1, true);
  console.log('  OUTPUT signals (after Ghost Mini):');
  if (outputScore.signals) {
    const sorted = Object.entries(outputScore.signals).sort((a, b) => b[1] - a[1]);
    for (const [name, val] of sorted) {
      const bar = '█'.repeat(Math.round(val / 5));
      const inputVal = inputScore.signals?.[name] ?? 0;
      const delta = val - inputVal;
      const arrow = delta > 2 ? '↑' : delta < -2 ? '↓' : '→';
      console.log(`    ${name.padEnd(28)} ${String(Math.round(val * 10) / 10).padStart(6)} ${arrow} ${bar}`);
    }
  }
  console.log(`  OUTPUT score: avg=${outputScore.avg}%, max=${outputScore.max}%, zeros=${outputScore.zeros}/22`);
  console.log(`  Preview: "${humanized1.substring(0, 200).replace(/\n/g, ' ')}..."\n`);

  // Per-detector scores
  console.log('  Per-detector:');
  const sorted = Object.entries(outputScore.detectors).sort((a, b) => b[1] - a[1]);
  for (const [name, val] of sorted) {
    const status = val === 0 ? '✓ 0%' : `${val}%`;
    console.log(`    ${name.padEnd(24)} ${status}`);
  }

  // Chunk comparison (all 4 essays)
  const chunkSizes = [1, 2, 3];
  const allResults: Record<number, { title: string; avg: number; max: number; zeros: number; detectors: Record<string, number> }[]> = {};
  for (const chunk of chunkSizes) allResults[chunk] = [];

  console.log('\n\n── CHUNK SIZE COMPARISON (all 4 essays) ──\n');

  for (const chunkSize of chunkSizes) {
    console.log(`  --- Chunk ${chunkSize} ---`);
    for (const { title, text } of TEST_TEXTS) {
      let humanized: string;
      if (chunkSize === 1) {
        humanized = ghostMiniV1_2(text);
      } else {
        humanized = processWithChunkSize(text, chunkSize);
      }
      const score = scoreText(humanized);
      allResults[chunkSize].push({ title, ...score });
      console.log(`    ${title}: avg=${score.avg}% max=${score.max}% zeros=${score.zeros}/22`);
    }
    const overallAvg = allResults[chunkSize].reduce((s, r) => s + r.avg, 0) / allResults[chunkSize].length;
    const overallMax = Math.max(...allResults[chunkSize].map(r => r.max));
    const totalZeros = allResults[chunkSize].reduce((s, r) => s + r.zeros, 0);
    console.log(`    OVERALL: avg=${overallAvg.toFixed(1)}% max=${overallMax}% zeros=${totalZeros}/${4*22}\n`);
  }

  const avgByChunk = chunkSizes.map(c => ({
    chunk: c,
    avg: allResults[c].reduce((s, r) => s + r.avg, 0) / allResults[c].length,
    zeros: allResults[c].reduce((s, r) => s + r.zeros, 0),
  }));
  avgByChunk.sort((a, b) => a.avg - b.avg);
  console.log(`  BEST: chunk=${avgByChunk[0].chunk} avg=${avgByChunk[0].avg.toFixed(1)}% zeros=${avgByChunk[0].zeros}/${4*22}`);
  console.log(`  Target (15/22 zeros per essay): ${avgByChunk[0].zeros >= 60 ? 'MET ✓' : 'NOT MET ✗'}\n`);

  // Show per-detector for worst essay at best chunk
  const bestChunk = avgByChunk[0].chunk;
  const worstEssay = allResults[bestChunk].reduce((w, r) => r.zeros < w.zeros ? r : w, allResults[bestChunk][0]);
  console.log(`  WORST ESSAY at chunk=${bestChunk}: "${worstEssay.title}" (zeros=${worstEssay.zeros}/22)`);
  const wSorted = Object.entries(worstEssay.detectors).sort((a, b) => b[1] - a[1]);
  for (const [name, val] of wSorted) {
    console.log(`    ${name.padEnd(24)} ${val === 0 ? '✓ 0%' : val + '%'}`);
  }
}

runTest();
