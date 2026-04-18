/**
 * Test ALL humanizer engines with "Globalization from Space: North America"
 * Validates:
 *  1. All SSE phases emitted (init → stage → sentence → done)
 *  2. Output is generated for each engine
 *  3. AI scores BEFORE and AFTER humanization
 *  4. Meaning preservation
 */

const BASE = 'http://localhost:3000';

const INPUT_TEXT = `Globalization from Space: North America

Environmental Issue: Flint, Michigan
A satellite view of Flint, Michigan highlights the layout of a mid-sized American city shaped by its industrial legacy. The city gained international attention in 2014 when its drinking water became contaminated with lead after officials switched water sources to save costs. While the contamination itself cannot be directly seen from above, the surrounding industrial landscape and infrastructure help explain the roots of the crisis. The image shows a region with factories, highways, and aging neighborhoods all tied to decades of industrial development. This environmental issue is significant because it reflects how unequal access to safe water often affects marginalized populations. Flint demonstrates how human alteration of natural resources can have serious health consequences, and how environmental justice is a key theme in North America's geography.

Socio-Cultural Issue: San Diego–Tijuana Border
Zooming into the U.S.–Mexico border between San Diego, California, and Tijuana, Mexico reveals a sharp visual contrast. On the northern side, suburban neighborhoods with organized street grids extend inland from the Pacific. Directly across the border, dense and irregular housing patterns spread across Tijuana's hillsides. The border fence is clearly visible, running from the beach into the desert, dividing two nations yet linking them through migration, trade, and cultural exchange. This site illustrates the socio-cultural dimensions of globalization, where economic opportunity attracts migrants, but strict border controls create tensions and inequalities. From space, the contrast between these two cities emphasizes how globalization can simultaneously integrate economies while reinforcing political and cultural divisions.

Conclusion
Both Flint and the San Diego–Tijuana border show how landscapes reveal deeper stories of globalization. Flint represents environmental struggles tied to industry and inequality, while the border illustrates the social and cultural complexities of migration. Together, these sites highlight how geography connects environmental issues with human experiences in North America.`;

// All engines currently active in the UI
const ENGINES = [
  { id: 'ninja_4',       label: 'Stealth Pro' },
  { id: 'easy',          label: 'Stealth Quick' },
  { id: 'ozone',         label: 'Stealth Shield' },
  { id: 'ninja_1',       label: 'Stealth Ninja' },
  { id: 'humara_v3_3',   label: 'GPTZero Killer' },
  { id: 'oxygen',        label: 'GPTZero Shield' },
  { id: 'king',          label: 'Stealth King' },
  { id: 'nuru_v2',       label: 'Nuru Pure' },
  { id: 'ghost_pro_wiki',label: 'Academic Shield' },
  { id: 'ninja_3',       label: 'Deep Kill Alpha' },
  { id: 'ninja_2',       label: 'Deep Kill Beta' },
  { id: 'ninja_5',       label: 'Deep Kill Omega' },
  { id: 'ghost_trial_2', label: 'Deep Kill Ghost' },
];

const TIMEOUT_MS = 180_000; // 3 min per engine

// ── Get AI score from /api/detect ──
async function getAiScore(text) {
  try {
    const res = await fetch(`${BASE}/api/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.summary ?? null;
  } catch {
    return null;
  }
}

// ── Parse SSE stream (collect all events) ──
async function parseSSEStream(response) {
  const text = await response.text();
  const events = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try { events.push(JSON.parse(line.slice(6))); } catch {}
    }
  }
  return events;
}

// ── Analyze phases from SSE events ──
function analyzePhases(events) {
  const phases = {
    init: false,
    stages: [],
    sentenceCount: 0,
    done: false,
    error: null,
  };
  for (const e of events) {
    if (e.type === 'init') phases.init = true;
    else if (e.type === 'stage') phases.stages.push(e.stage || e.label || '(stage)');
    else if (e.type === 'sentence') phases.sentenceCount++;
    else if (e.type === 'done') phases.done = true;
    else if (e.type === 'error') phases.error = e.error || 'unknown error';
  }
  return phases;
}

// ── Test a single engine ──
async function testEngine(engineId, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(`${BASE}/api/humanize-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: INPUT_TEXT,
        engine: engineId,
        strength: 'medium',
        tone: 'academic',
        enable_post_processing: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { engineId, label, status: 'ERROR', error: `HTTP ${res.status}: ${errText.substring(0, 150)}`, elapsed };
    }

    const events = await parseSSEStream(res);
    const phases = analyzePhases(events);

    if (phases.error && !phases.done) {
      return { engineId, label, status: 'ERROR', error: phases.error, elapsed, phases };
    }

    const doneEvent = events.find(e => e.type === 'done');
    if (!doneEvent) {
      return { engineId, label, status: 'ERROR', error: 'No done event received', elapsed, phases };
    }

    const output = doneEvent.humanized || '';
    const wordCountIn = doneEvent.input_word_count ?? INPUT_TEXT.trim().split(/\s+/).length;
    const wordCountOut = doneEvent.word_count ?? output.trim().split(/\s+/).length;
    const meaningPreserved = doneEvent.meaning_preserved;
    const meaningSimilarity = doneEvent.meaning_similarity;

    // Get AI score for the output
    const outputScore = output.trim().length > 0 ? await getAiScore(output) : null;

    return {
      engineId,
      label,
      status: 'OK',
      elapsed,
      phases,
      output,
      wordCountIn,
      wordCountOut,
      meaningPreserved,
      meaningSimilarity,
      outputAiScore: outputScore,
    };
  } catch (err) {
    clearTimeout(timer);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (err.name === 'AbortError') {
      return { engineId, label, status: 'TIMEOUT', error: `Exceeded ${TIMEOUT_MS / 1000}s`, elapsed };
    }
    return { engineId, label, status: 'ERROR', error: err.message, elapsed };
  }
}

// ── Main ──
async function main() {
  const inputWords = INPUT_TEXT.trim().split(/\s+/).length;
  const inputParas = INPUT_TEXT.split(/\n\n+/).filter(p => p.trim()).length;

  console.log('\n' + '═'.repeat(90));
  console.log('  ENGINE TEST: Globalization from Space — All Engines');
  console.log('═'.repeat(90));
  console.log(`  Input: ${inputWords} words | ${inputParas} paragraphs | ${INPUT_TEXT.length} chars`);

  // ── Pre-flight: AI score the INPUT ──
  console.log('\n  [1/2] Detecting AI score of INPUT text...');
  const inputScore = await getAiScore(INPUT_TEXT);
  if (inputScore) {
    console.log(`  INPUT AI Score: ${inputScore.overall_ai_score}% AI  |  ${inputScore.overall_human_score}% Human  |  Verdict: ${inputScore.overall_verdict}`);
  } else {
    console.log('  INPUT AI Score: (detection failed)');
  }

  // ── Run all engines in parallel ──
  console.log(`\n  [2/2] Running ${ENGINES.length} engines in PARALLEL...\n`);
  const startAll = Date.now();
  const results = await Promise.all(ENGINES.map(({ id, label }) => testEngine(id, label)));
  const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(1);

  // ── Print results ──
  console.log('\n' + '═'.repeat(90));
  console.log('  RESULTS');
  console.log('═'.repeat(90));

  let passCount = 0;
  let errorCount = 0;

  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : r.status === 'TIMEOUT' ? '⏱️' : '❌';
    console.log(`\n${icon}  ${r.label.padEnd(20)} [${r.engineId}]  —  ${r.status}  —  ${r.elapsed}s`);

    if (r.status !== 'OK') {
      console.log(`     Error: ${r.error}`);
      errorCount++;
      // Still show phases if available
      if (r.phases) {
        const phaseStr = [
          r.phases.init ? 'init ✓' : 'init ✗',
          r.phases.stages.length ? `stages(${r.phases.stages.length}) ✓` : 'stages ✗',
          r.phases.sentenceCount ? `sentences(${r.phases.sentenceCount}) ✓` : 'sentences ✗',
          r.phases.done ? 'done ✓' : 'done ✗',
        ].join('  |  ');
        console.log(`     Phases: ${phaseStr}`);
      }
      continue;
    }

    passCount++;

    // Phases
    const phaseStr = [
      r.phases.init ? 'init ✓' : 'init ✗',
      r.phases.stages.length ? `stages(${r.phases.stages.length}) ✓` : 'stages ✗',
      r.phases.sentenceCount ? `sentences(${r.phases.sentenceCount}) ✓` : 'sentences ✗',
      r.phases.done ? 'done ✓' : 'done ✗',
    ].join('  |  ');
    console.log(`     Phases:  ${phaseStr}`);

    // Word counts
    console.log(`     Words:   ${r.wordCountIn} → ${r.wordCountOut}  |  Meaning: ${r.meaningPreserved ? '✓' : '✗'} (${(r.meaningSimilarity * 100).toFixed(0)}%)`);

    // AI Scores
    const afterAI = r.outputAiScore;
    const inputAI = inputScore?.overall_ai_score ?? '?';
    const outputAI = afterAI ? afterAI.overall_ai_score : '?';
    const verdict = afterAI ? afterAI.overall_verdict : '?';
    const reduction = (inputScore && afterAI)
      ? `${(inputScore.overall_ai_score - afterAI.overall_ai_score).toFixed(1)}% drop`
      : '';
    console.log(`     AI Score: ${inputAI}% → ${outputAI}%  (${verdict})  ${reduction}`);

    // Output preview
    const preview = r.output.replace(/\n+/g, ' ').substring(0, 180);
    console.log(`     Preview: ${preview}...`);
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(90));
  console.log(`  SUMMARY: ${passCount}/${ENGINES.length} passed, ${errorCount} failed — Total time: ${totalElapsed}s`);
  if (inputScore) {
    console.log(`  Input AI score: ${inputScore.overall_ai_score}%`);
  }
  console.log('═'.repeat(90));

  // ── Full outputs ──
  console.log('\n\n' + '─'.repeat(90));
  console.log('  FULL OUTPUTS');
  console.log('─'.repeat(90));
  for (const r of results) {
    if (r.status !== 'OK' || !r.output) continue;
    console.log(`\n${'━'.repeat(90)}`);
    console.log(`  [${r.label} — ${r.engineId}]  AI: ${inputScore?.overall_ai_score ?? '?'}% → ${r.outputAiScore?.overall_ai_score ?? '?'}%`);
    console.log('━'.repeat(90));
    console.log(r.output);
  }

  console.log('\n' + '═'.repeat(90));
  console.log('  ALL DONE');
  console.log('═'.repeat(90) + '\n');
}

main().catch(console.error);
