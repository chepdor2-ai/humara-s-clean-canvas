/**
 * Test ALL humanizer engines against an academic criminology text.
 * Uses the /api/humanize-stream endpoint to get detection scores.
 * Reports: output text, AI detection score, word count, elapsed time.
 * Ranks engines by final AI score (lowest = best).
 */

const INPUT = `Models of Institutional Control

Correctional institutions rely on different models of institutional control to maintain order and achieve their goals. According to Stojkovic and Lovell (2025), three major models include the control model, responsibility model, and consensual model, originally conceptualized by DiIulio (1987). Each model reflects a distinct approach to managing inmates and balancing security with rehabilitation.

The control model emphasizes strict authority, discipline, and surveillance within correctional institutions. In this model, correctional officers maintain order through rigid enforcement of rules and the use of punishment when necessary. The primary goal is to ensure safety and prevent disorder. This approach is effective in maintaining immediate control, especially in high-risk environments where security concerns are critical. However, the control model often limits opportunities for rehabilitation, as it creates a rigid and restrictive environment that may increase tension between inmates and staff. As a result, while order is maintained, long-term behavioral change is less likely to occur (Stojkovic & Lovell, 2025).

In contrast, the responsibility model focuses on encouraging inmates to take accountability for their behavior and actively participate in their own rehabilitation. This model promotes educational programs, vocational training, and counseling services aimed at preparing inmates for reintegration into society. Research shows that access to education and employment training in prison significantly reduces recidivism by improving post-release opportunities and life skills (Dewey et al., 2024). Compared to the control model, the responsibility model is more effective in supporting long-term behavioral change, although it requires substantial institutional resources and staff involvement. Its success also depends on the willingness of inmates to engage in available programs.`;

const ENGINES = [
  { id: 'nuru_v2',       label: 'Nuru 2.0',       mode: 'stream' },
  { id: 'antipangram',   label: 'AntiPangram',    mode: 'stream' },
  { id: 'easy',          label: 'Swift (Easy)',   mode: 'stream' },
  { id: 'oxygen',        label: 'Oxygen',         mode: 'stream' },
  { id: 'ninja_1',       label: 'Ninja 1',        mode: 'stream' },
  { id: 'ninja_2',       label: 'Beta (Ninja 2)', mode: 'stream' },
  { id: 'ninja_3',       label: 'Alpha (Ninja 3)',mode: 'stream' },
  { id: 'ninja_5',       label: 'Omega (Ninja 5)',mode: 'stream' },
  { id: 'ghost_trial_2', label: 'Specter',        mode: 'stream' },
  { id: 'ghost_pro_wiki',label: 'Ghost Pro Wiki', mode: 'stream' },
  { id: 'humara_v3_3',   label: 'Humarin V3',     mode: 'stream' },
  { id: 'king',          label: 'King',           mode: 'stream' },
  { id: 'phantom',       label: 'Phantom',        mode: 'stream' },
  { id: 'ai_analysis',   label: 'AI Analysis',    mode: 'stream' },
];

const PORT = 3000;
const TIMEOUT_MS = 180_000; // 3 min per engine

const inputWords = INPUT.split(/\s+/).filter(Boolean).length;

async function testStreamEngine(engineId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(`http://localhost:${PORT}/api/humanize-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: INPUT,
        engine: engineId,
        strength: 'strong',
        tone: 'academic',
        enable_post_processing: true,
        strict_meaning: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      clearTimeout(timer);
      const errText = await res.text().catch(() => '');
      return { status: 'ERROR', error: `HTTP ${res.status}: ${errText.slice(0, 150)}`, elapsed: '?' };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let finalData = null;
    const stages = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'done') finalData = ev;
          if (ev.type === 'stage') stages.push(ev.stage);
        } catch {}
      }
    }

    clearTimeout(timer);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!finalData?.humanized) {
      return { status: 'ERROR', error: 'No done event received', elapsed };
    }

    const output = finalData.humanized;
    const outWords = output.split(/\s+/).filter(Boolean).length;
    // done event uses output_detector_results / input_detector_results
    const aiScore = finalData.output_detector_results?.overall
      ?? finalData.detection?.overall
      ?? finalData.detection?.output?.overall
      ?? null;
    const inputScore = finalData.input_detector_results?.overall
      ?? finalData.detection?.input?.overall
      ?? null;

    return {
      status: 'OK',
      output,
      outWords,
      aiScore,
      inputScore,
      stages: stages.slice(0, 6),
      elapsed,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { status: 'TIMEOUT', error: `Exceeded ${TIMEOUT_MS / 1000}s`, elapsed: (TIMEOUT_MS / 1000).toString() };
    }
    return { status: 'ERROR', error: err.message, elapsed: '?' };
  }
}

function bar(score) {
  if (score === null) return '  N/A ';
  const filled = Math.round(score / 5);
  return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + `] ${score.toFixed(1)}%`;
}

async function main() {
  console.log('\n' + '═'.repeat(90));
  console.log('  INSTITUTIONAL CONTROL TEXT — ALL ENGINE TEST');
  console.log(`  Input: ${inputWords} words | Tone: academic | Strength: strong`);
  console.log('═'.repeat(90) + '\n');

  const results = [];

  for (const eng of ENGINES) {
    process.stdout.write(`  Testing ${eng.label.padEnd(20)} ...`);
    const r = await testStreamEngine(eng.id);
    results.push({ ...eng, ...r });

    if (r.status !== 'OK') {
      console.log(` ${r.status}: ${r.error}`);
    } else {
      const scoreStr = r.aiScore !== null ? `${r.aiScore.toFixed(1)}%` : 'N/A';
      console.log(` OK (${r.elapsed}s) | AI score: ${scoreStr} | Words: ${inputWords}→${r.outWords}`);
    }
  }

  // ── Ranking ──────────────────────────────────────────────────────────────
  const ranked = results
    .filter(r => r.status === 'OK' && r.aiScore !== null)
    .sort((a, b) => a.aiScore - b.aiScore);

  console.log('\n' + '═'.repeat(90));
  console.log('  RANKING (lowest AI score = best)');
  console.log('═'.repeat(90));
  ranked.forEach((r, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${r.label.padEnd(22)} ${bar(r.aiScore)}  (${r.elapsed}s)`);
  });

  // ── Full outputs for top-3 ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('  TOP 3 OUTPUTS');
  console.log('═'.repeat(90));
  for (const r of ranked.slice(0, 3)) {
    console.log(`\n${'─'.repeat(90)}`);
    console.log(`  ENGINE: ${r.label} | AI score: ${r.aiScore?.toFixed(1)}% | Time: ${r.elapsed}s`);
    console.log(`  Stages: ${r.stages?.join(' → ')}`);
    console.log('─'.repeat(90));
    console.log(r.output);
  }

  // ── Full outputs for all OK results ──────────────────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('  ALL OUTPUTS');
  console.log('═'.repeat(90));
  for (const r of results) {
    console.log(`\n${'─'.repeat(90)}`);
    console.log(`  ENGINE: ${r.label} (${r.id})`);
    if (r.status !== 'OK') {
      console.log(`  ${r.status}: ${r.error}`);
      continue;
    }
    console.log(`  AI score: ${r.aiScore?.toFixed(1) ?? 'N/A'}%  |  Words: ${inputWords}→${r.outWords}  |  Time: ${r.elapsed}s`);
    console.log(`  Stages: ${r.stages?.join(' → ')}`);
    console.log('─'.repeat(90));
    console.log(r.output);
  }

  console.log('\n' + '═'.repeat(90));
  console.log('  TEST COMPLETE');
  console.log('═'.repeat(90) + '\n');
}

main().catch(console.error);
