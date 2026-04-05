/**
 * Test ALL humanizer engines × levels × tones.
 * Usage: node test-all-combos.mjs
 */

const BASE = 'http://localhost:3000/api/humanize';

const TEXT = `III. Purpose of the Study
A. Primary Purpose

The primary purpose of this study is to compare the effectiveness of traditional index cards and technology-based study tools on student learning and retention in college-level courses. By employing a controlled quasi-experimental design, the research aims to measure and analyze comprehension and recall performance following exposure to structured learning activities. The goal is to identify whether digital tools—such as mobile learning applications or flashcard software—offer superior benefits compared to traditional handwritten methods. Understanding these performance differences provides valuable insight into cognitive processes such as memory encoding, retrieval, and the effects of media on information processing. This focus aligns with cognitive load theory, which emphasizes the management of limited working memory capacity during learning (Sweller, 2011). Additionally, the findings will contribute to pedagogical practices by clarifying whether technological convenience translates into deeper learning or if traditional study aids still hold greater cognitive value. Ultimately, the study seeks to enhance academic outcomes by identifying the most effective methods for promoting durable learning and recall.

B. Secondary Purpose

The secondary purpose of this study is to examine students' attitudes, engagement levels, and motivation when using technology-based versus traditional study tools. Engagement is a multidimensional construct that encompasses emotional, cognitive, and behavioral participation in learning activities (Fredricks, Blumenfeld, & Paris, 2004). The study aims to determine how digital interfaces, interactivity, and immediate feedback features influence student motivation compared to the tactile and reflective nature of index cards. Understanding these affective responses is essential for educators designing study interventions that promote both persistence and enjoyment in learning. Furthermore, the study investigates whether a blended or hybrid approach—integrating both physical and digital study methods—can maximize engagement and performance. This exploration responds to recent educational research calling for more nuanced analyses of how different learning tools interact with learner preferences and contexts (Boroughani et al., 2023). Through this dual focus on engagement and outcomes, the study aspires to inform balanced strategies that enhance both cognitive and motivational dimensions of student learning.

C. Support from Literature

The rationale for this study is grounded in an extensive body of prior research that examines how study tools impact cognitive performance and learner engagement. Hung (2015) and Boroughani et al. (2023) highlight the growing significance of digital learning technologies in fostering autonomy and self-regulated study habits, making them strong candidates for examination in higher education. Conversely, Akbar et al. (2013) and Thakur (2023) provide compelling evidence supporting traditional study methods, demonstrating their effectiveness in facilitating deep processing and long-term retention. Traditional tools, such as index cards, are closely associated with handwriting-based learning, which has been linked to improved cognitive encoding and kinesthetic memory. On the other hand, digital tools promote accessibility and interactivity, offering advantages in scalability and instant feedback that traditional approaches lack (Xodabande et al., 2022). Synthesizing these perspectives provides a balanced framework for evaluating whether emerging digital tools truly outperform well-established physical methods. By integrating these empirical insights, this research contributes to a more comprehensive understanding of how learning tool design influences academic success and learner satisfaction.`;

const ENGINES = [
  'humara_v1_3',
  'ghost_mini',
  'ghost_mini_v1_2',
  'ghost_pro',
  'ninja',
  'undetectable',
  'fast_v11',
  'humara',
];

const LEVELS = ['light', 'medium', 'strong'];
const TONES = ['neutral', 'academic', 'professional', 'simple'];

// Quality checks
function checkOutput(humanized, engine, level, tone) {
  const issues = [];
  if (!humanized || typeof humanized !== 'string') {
    issues.push('OUTPUT MISSING OR NOT STRING');
    return issues;
  }
  if (humanized.trim().length < 50) issues.push(`OUTPUT TOO SHORT (${humanized.trim().length} chars)`);
  // Em-dash check
  if (/\u2014/.test(humanized)) issues.push(`CONTAINS EM-DASH (\u2014) — count: ${(humanized.match(/\u2014/g) || []).length}`);
  // Contraction check (exclude possessives like "study's", "functioning's")
  const contractions = (humanized.match(/\b\w+'(t|re|ve|ll|d|m)\b/gi) || []);
  if (contractions.length > 0) issues.push(`CONTRACTIONS: ${contractions.slice(0, 5).join(', ')}`);
  // Repeated words check (same word 3+ times in a row)
  if (/\b(\w+)\s+\1\s+\1\b/i.test(humanized)) issues.push('TRIPLE REPEATED WORD');
  // Broken sentences (sentence starting lowercase after period)
  const brokenStarts = humanized.match(/\.\s+[a-z]/g) || [];
  if (brokenStarts.length > 3) issues.push(`BROKEN CAPITALIZATION: ${brokenStarts.length} instances`);
  // Check citations preserved
  if (!humanized.includes('Sweller') && !humanized.includes('2011')) issues.push('CITATION LOST: Sweller (2011)');
  if (!humanized.includes('Fredricks') && !humanized.includes('2004')) issues.push('CITATION LOST: Fredricks (2004)');
  // Garbage/corrupted output
  if (/[^\x00-\x7F\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u00E9\u00E8\u00EA\u00EB\u00E0\u00E2\u00E4\u00F4\u00F6\u00FC\u00E7\u00F1]/.test(humanized)) {
    // Allow common accented chars but flag truly weird unicode
  }
  // Excessive filler starters
  const fillerStarts = (humanized.match(/^(Notably|Indeed|Moreover|Furthermore|In fact|Importantly|Significantly|Consequently|Accordingly|Essentially),?\s/gim) || []);
  if (fillerStarts.length > 5) issues.push(`EXCESSIVE FILLERS: ${fillerStarts.length} sentence starters`);
  return issues;
}

async function testCombo(engine, level, tone) {
  const label = `${engine}/${level}/${tone}`;
  try {
    const isPremium = engine === 'humara';
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEXT,
        engine,
        strength: level,
        tone,
        premium: isPremium,
        no_contractions: true,
        enable_post_processing: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { label, status: 'HTTP_ERROR', code: res.status, error: errText.slice(0, 200), issues: ['HTTP ERROR'] };
    }

    const json = await res.json();
    if (!json.success) {
      return { label, status: 'API_FAIL', error: json.error || 'unknown', issues: ['API RETURNED success=false'] };
    }

    const issues = checkOutput(json.humanized, engine, level, tone);
    return {
      label,
      status: issues.length === 0 ? 'PASS' : 'WARN',
      wordCount: json.word_count,
      inputWordCount: json.input_word_count,
      meaningPreserved: json.meaning_preserved,
      meaningSimilarity: json.meaning_similarity,
      outputScore: json.output_detector_results?.overall,
      issues,
      // First 200 chars of output for spot-checking
      preview: (json.humanized || '').slice(0, 200),
    };
  } catch (err) {
    return { label, status: 'CRASH', error: err.message, issues: ['EXCEPTION: ' + err.message] };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('HUMANIZER FULL MATRIX TEST');
  console.log(`${ENGINES.length} engines × ${LEVELS.length} levels × ${TONES.length} tones = ${ENGINES.length * LEVELS.length * TONES.length} combos`);
  console.log('='.repeat(80));

  const results = [];
  let done = 0;
  const total = ENGINES.length * LEVELS.length * TONES.length;

  // Run sequentially to avoid overwhelming the server
  for (const engine of ENGINES) {
    for (const level of LEVELS) {
      for (const tone of TONES) {
        done++;
        process.stdout.write(`\r[${done}/${total}] Testing ${engine}/${level}/${tone}...          `);
        const result = await testCombo(engine, level, tone);
        results.push(result);
      }
    }
  }

  console.log('\n\n');

  // Summary
  const passed = results.filter(r => r.status === 'PASS');
  const warned = results.filter(r => r.status === 'WARN');
  const failed = results.filter(r => r.status === 'HTTP_ERROR' || r.status === 'API_FAIL' || r.status === 'CRASH');

  console.log('='.repeat(80));
  console.log(`RESULTS: ${passed.length} PASS | ${warned.length} WARN | ${failed.length} FAIL  (out of ${total})`);
  console.log('='.repeat(80));

  // Print failures
  if (failed.length > 0) {
    console.log('\n--- FAILURES ---');
    for (const r of failed) {
      console.log(`  ✗ ${r.label}: ${r.status} — ${r.error}`);
    }
  }

  // Print warnings
  if (warned.length > 0) {
    console.log('\n--- WARNINGS ---');
    for (const r of warned) {
      console.log(`  ⚠ ${r.label}: ${r.issues.join(' | ')}`);
    }
  }

  // Print per-engine score summary
  console.log('\n--- PER-ENGINE DETECTOR SCORES (avg output_detector overall) ---');
  for (const engine of ENGINES) {
    const engineResults = results.filter(r => r.label.startsWith(engine + '/') && r.outputScore != null);
    if (engineResults.length === 0) {
      console.log(`  ${engine}: NO SCORES (all failed)`);
      continue;
    }
    const avgScore = engineResults.reduce((sum, r) => sum + r.outputScore, 0) / engineResults.length;
    const minScore = Math.min(...engineResults.map(r => r.outputScore));
    const maxScore = Math.max(...engineResults.map(r => r.outputScore));
    console.log(`  ${engine}: avg=${avgScore.toFixed(1)}% min=${minScore}% max=${maxScore}% (${engineResults.length} runs)`);
  }

  // Print passes count per engine
  console.log('\n--- CLEAN OUTPUT (no issues) PER ENGINE ---');
  for (const engine of ENGINES) {
    const engineResults = results.filter(r => r.label.startsWith(engine + '/'));
    const clean = engineResults.filter(r => r.status === 'PASS').length;
    console.log(`  ${engine}: ${clean}/${engineResults.length} clean`);
  }

  // If any failures, exit with error code
  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
