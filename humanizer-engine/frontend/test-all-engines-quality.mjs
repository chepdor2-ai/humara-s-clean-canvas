/**
 * Test ALL engines with the spurious correlations text.
 * Reports: word change %, meaning preservation, AI-sounding phrases, flow quality.
 */

const TEXT = `Discussion 7 – Spurious Correlations

For this discussion, I chose the chart comparing "Per capita cheese consumption" with the "Number of people who died by becoming tangled in their bedsheets." At first glance, the chart shows a striking correlation, suggesting that as cheese consumption increases, so do deaths from bedsheet entanglement.

One could argue for a causative link by suggesting that higher cheese consumption before bedtime might influence sleep quality. For instance, eating cheese late at night could cause indigestion or vivid dreams, leading to restless sleep and greater movement during the night. This increased movement might raise the likelihood of becoming entangled in bedsheets, providing a seemingly plausible connection between cheese consumption and bedsheet-related deaths.

However, the more logical interpretation is that this is a spurious correlation rather than a true causal relationship. There is no scientific evidence supporting a direct link between eating cheese and fatal bedsheet accidents. Instead, both variables may simply trend upward or downward over the same period due to unrelated factors, such as population changes, dietary shifts, or coincidental fluctuations. This highlights the importance of remembering that correlation does not imply causation, a foundational principle in statistics. Without experimental or observational evidence that isolates cheese consumption as a contributing factor, the relationship shown in the chart should be considered purely coincidental.

In summary, while it is possible to imagine scenarios that connect the two variables, the chart exemplifies a spurious correlation where two unrelated trends happen to align. Recognizing this distinction is critical in statistical reasoning to avoid false conclusions.`;

const ENGINES = [
  'easy',
  'oxygen',
  'omega',
  'nuru',
  'humara_v1_3',
  'ghost_mini',
  'ghost_mini_v1_2',
  'ghost_pro',
  'ninja',
  'undetectable',
  'fast_v11',
  'humara',
];

// Common AI-detection flag words/phrases
const AI_PHRASES = [
  /\bdelve\b/i, /\bmoreover\b/i, /\bfurthermore\b/i, /\bin conclusion\b/i,
  /\bit is worth noting\b/i, /\bit is important to note\b/i, /\blandscape\b/i,
  /\beverchanging\b/i, /\bever-changing\b/i, /\bfostering?\b/i,
  /\bpivotal\b/i, /\bseamless(?:ly)?\b/i, /\bunderscores?\b/i,
  /\btapestry\b/i, /\bparadigm\b/i, /\bholistic\b/i,
  /\bleverag(?:e|ing)\b/i, /\bfacilitat(?:e|ing|es)\b/i,
  /\bmultifaceted\b/i, /\bmitigat(?:e|ing)\b/i, /\butiliz(?:e|ing|ation)\b/i,
  /\bnotwithstanding\b/i, /\bnevertheless\b/i, /\bcommenc(?:e|ing)\b/i,
  /\boptimal\b/i, /\benhance[ds]?\b/i, /\brobust\b/i,
  /\bcomprehensive\b/i, /\bsophisticated\b/i, /\bdemonstrates?\b/i,
  /\bexemplif(?:y|ies)\b/i, /\bsignificant(?:ly)?\b/i,
  /\bfundamental(?:ly)?\b/i, /\bcrucial(?:ly)?\b/i,
  /\bplay(?:s)? a (?:crucial|vital|pivotal|key|significant|important) role\b/i,
];

// Key meaning concepts that must be preserved
const MEANING_CHECKS = [
  /cheese/i,
  /bedsheet|bed\s*sheet/i,
  /correlation/i,
  /caus(?:ation|ative|al)/i,
  /spurious/i,
  /coinciden/i,
  /statistic/i,
  /sleep|dream|indigestion/i,
  /population|dietary/i,
];

function wordChangePercent(original, output) {
  const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
  const outWords = output.toLowerCase().split(/\s+/).filter(Boolean);
  const len = Math.max(origWords.length, outWords.length);
  if (len === 0) return 0;
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (!origWords[i] || !outWords[i] || origWords[i] !== outWords[i]) changed++;
  }
  return Math.round((changed / len) * 100);
}

function findAIPhrases(text) {
  const found = [];
  for (const re of AI_PHRASES) {
    const m = text.match(new RegExp(re, 'gi'));
    if (m) found.push(...m);
  }
  return [...new Set(found)];
}

function meaningScore(text) {
  let passed = 0;
  const missing = [];
  for (const re of MEANING_CHECKS) {
    if (re.test(text)) {
      passed++;
    } else {
      missing.push(re.source);
    }
  }
  return { score: passed, total: MEANING_CHECKS.length, pct: Math.round((passed / MEANING_CHECKS.length) * 100), missing };
}

function checkCapitalization(text) {
  const issues = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sent of sentences) {
    // Check for random mid-sentence capitals
    const words = sent.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (/^[A-Z][a-z]/.test(w) && !['I', 'AI'].includes(w) && !/^[A-Z][a-z]*[A-Z]/.test(w)) {
        // Check if it's likely NOT a proper noun (not in the original text as capitalized)
        const lower = w.toLowerCase();
        const commonWords = ['the', 'this', 'that', 'which', 'where', 'when', 'while', 'however', 'therefore', 'furthermore', 'moreover', 'instead', 'although', 'because', 'since', 'both', 'these', 'those', 'each', 'every', 'some', 'many', 'much', 'more', 'most', 'such', 'other', 'another', 'higher', 'lower', 'greater', 'increased', 'without', 'rather', 'providing', 'leading', 'suggesting', 'including', 'recognizing', 'eating'];
        if (commonWords.includes(lower)) {
          issues.push(w);
        }
      }
    }
  }
  return issues;
}

async function testEngine(engineId) {
  const start = Date.now();
  try {
    const res = await fetch('http://localhost:3000/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEXT,
        engine: engineId,
        strength: 'medium',
        tone: 'academic',
        strict_meaning: true,
        no_contractions: true,
        enable_post_processing: true,
      }),
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!res.ok) {
      const err = await res.text();
      return { engine: engineId, error: `HTTP ${res.status}: ${err.substring(0, 200)}`, elapsed };
    }

    const data = await res.json();
    if (data.error) {
      return { engine: engineId, error: data.error, elapsed };
    }

    const humanized = data.humanized || '';
    if (!humanized || humanized.length < 50) {
      return { engine: engineId, error: `Empty/short output (${humanized.length} chars)`, elapsed };
    }

    const changePct = wordChangePercent(TEXT, humanized);
    const aiPhrases = findAIPhrases(humanized);
    const meaning = meaningScore(humanized);
    const capIssues = checkCapitalization(humanized);
    const aiScore = data.output_detector_results?.overall ?? '?';
    const meaningPreserved = data.meaning_preserved;
    const similarity = data.meaning_similarity;

    return {
      engine: engineId,
      elapsed,
      changePct,
      aiPhrases,
      aiPhrasesCount: aiPhrases.length,
      meaning,
      capIssues,
      capIssuesCount: capIssues.length,
      aiScore,
      meaningPreserved,
      similarity,
      inputWords: data.input_word_count,
      outputWords: data.word_count,
      humanized,
    };
  } catch (e) {
    return { engine: engineId, error: e.message, elapsed: ((Date.now() - start) / 1000).toFixed(1) };
  }
}

async function main() {
  console.log('='.repeat(90));
  console.log('ALL-ENGINE QUALITY TEST — Spurious Correlations Text');
  console.log('='.repeat(90));
  console.log(`Input: ${TEXT.split(/\s+/).length} words\n`);

  const results = [];

  for (const eng of ENGINES) {
    process.stdout.write(`Testing ${eng.padEnd(18)}... `);
    const r = await testEngine(eng);
    if (r.error) {
      console.log(`ERROR: ${r.error} (${r.elapsed}s)`);
    } else {
      const status = r.changePct >= 40 && r.aiPhrasesCount <= 3 && r.meaning.pct >= 70 && r.capIssuesCount <= 2 ? 'PASS' : 'FAIL';
      console.log(`${status} | ${r.elapsed}s | change:${r.changePct}% | AI-words:${r.aiPhrasesCount} | meaning:${r.meaning.pct}% | caps:${r.capIssuesCount} | detector:${r.aiScore}`);
    }
    results.push(r);
  }

  console.log('\n' + '='.repeat(90));
  console.log('DETAILED RESULTS');
  console.log('='.repeat(90));

  for (const r of results) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`ENGINE: ${r.engine}`);
    console.log(`${'─'.repeat(80)}`);

    if (r.error) {
      console.log(`  ERROR: ${r.error}`);
      continue;
    }

    console.log(`  Time: ${r.elapsed}s | Words: ${r.inputWords} → ${r.outputWords}`);
    console.log(`  Word change: ${r.changePct}% ${r.changePct >= 40 ? '✓' : '✗ (need ≥40%)'}`);
    console.log(`  AI detector score: ${r.aiScore} ${r.aiScore <= 30 ? '✓' : '⚠'}`);
    console.log(`  Meaning preserved: ${r.meaningPreserved} (similarity: ${r.similarity})`);
    console.log(`  Meaning concepts: ${r.meaning.score}/${r.meaning.total} (${r.meaning.pct}%) ${r.meaning.pct >= 70 ? '✓' : '✗'}`);
    if (r.meaning.missing.length > 0) {
      console.log(`    Missing: ${r.meaning.missing.join(', ')}`);
    }
    console.log(`  AI-flagged phrases (${r.aiPhrasesCount}): ${r.aiPhrases.length > 0 ? r.aiPhrases.join(', ') : 'none'}`);
    console.log(`  Cap issues (${r.capIssuesCount}): ${r.capIssues.length > 0 ? r.capIssues.join(', ') : 'none'}`);
    console.log(`\n  OUTPUT:\n  ${r.humanized.replace(/\n/g, '\n  ')}`);
  }

  // Summary table
  console.log('\n' + '='.repeat(90));
  console.log('SUMMARY');
  console.log('='.repeat(90));
  const passing = results.filter(r => !r.error && r.changePct >= 40 && r.aiPhrasesCount <= 3 && r.meaning.pct >= 70 && r.capIssuesCount <= 2);
  const failing = results.filter(r => !r.error && !(r.changePct >= 40 && r.aiPhrasesCount <= 3 && r.meaning.pct >= 70 && r.capIssuesCount <= 2));
  const errored = results.filter(r => r.error);
  console.log(`  PASS: ${passing.length} | FAIL: ${failing.length} | ERROR: ${errored.length}`);
  if (failing.length > 0) {
    console.log(`  Failing: ${failing.map(r => r.engine).join(', ')}`);
  }
  if (errored.length > 0) {
    console.log(`  Errored: ${errored.map(r => r.engine).join(', ')}`);
  }
}

main().catch(console.error);
