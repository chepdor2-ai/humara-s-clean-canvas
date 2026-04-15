// Test ALL humanizer engines with Evaluation & Conclusion text
const text = `The evaluation of this project has focused not only on the design outcomes but also on the effectiveness of the research process, project management, and deliverables. The primary achievement was the completion of high-fidelity wireframes, refined through two rounds of user testing. These outputs demonstrated that a culturally sensitive and user-friendly digital funeral planning tool could be conceptualised in close collaboration with the Muslim community.

The questionnaire survey of 30 participants revealed that 68 per cent had prior funeral planning experience, while 32 per cent were first-time organisers. This insight led to the dual design approach: the checklist catered for novices who needed step-by-step guidance, while quick navigation options served experienced organisers seeking efficiency. Similarly, the interviews with six participants revealed three themes—emotional wellbeing, religious guidance, and communication—which were mapped directly onto the design. For example, religious guidance informed the inclusion of imam consultation, while communication challenges shaped the broadcast feature. These findings illustrate how research directly influenced design features, ensuring that the final wireframes were evidence-driven rather than speculative.

From a project management perspective, the 30-week project timeline provided both opportunities and challenges. The project log shows a structured progression, beginning with literature review and participant recruitment (Weeks 1–7), through to data collection (Weeks 8–12), analysis (Weeks 13–14), and design iterations (Weeks 15–26). Two rounds of usability testing (Weeks 19–24) marked the transition from concept to validated prototype. The final stages (Weeks 25–30) focused on refinements, report writing, and submission.

What went well was the disciplined application of an iterative lifecycle. Instead of adhering to a rigid waterfall model, the project incorporated flexibility, enabling findings from the questionnaire and interviews to be rapidly integrated into design features. The two testing rounds were particularly valuable: Round 1 identified problems with font size, bilingual labels, and button placement, while Round 2 confirmed that these refinements improved accessibility and usability. Maintaining a structured project log and risk register also ensured that risks such as recruitment challenges and data loss were anticipated and mitigated.

What could have been improved primarily relates to time and recruitment management. Recruitment proved more difficult than anticipated, and although a diverse participant group was eventually secured, this delayed the start of interviews. The project log shows that Weeks 5–7 were heavily consumed by outreach, which compressed the schedule for later stages. Similarly, while the 30-week plan was sufficient to complete wireframes, it did not allow for extended testing with larger groups or broader accessibility assessments (for example, testing with elderly users or those with limited digital literacy). A larger time buffer and earlier initiation of participant engagement would have reduced these pressures.

Another area for improvement was the need to balance breadth and depth of data. While surveys captured quantitative trends, interviews added richer narratives, but the small sample size meant some perspectives—such as those of funeral directors—were missing. Future work should expand the sample to triangulate findings across family members, religious leaders, and service providers.

Overall, the project successfully delivered its intended outcomes: high-fidelity wireframes that were tested, refined, and aligned with both user needs and cultural values. The process demonstrated the importance of combining empirical research with iterative design, supported by structured project management tools such as the Gantt chart, project log, and risk register. Although limited by time and recruitment challenges, the project established a strong foundation for future development.

The final prototypes are not a deployed product but rather a validated design concept. Next steps should involve developing an interactive prototype, conducting larger-scale usability testing, and engaging with funeral service providers for real-world integration. With these extensions, the platform has the potential to make a meaningful impact in supporting Muslim families during one of life's most difficult moments.`;

const ENGINES = [
  'nuru_v2',       // Nuru 2.0 — non-LLM stealth
  'oxygen',        // Humara 2.0 — GPTZero killer (needs king_server)
  'ozone',         // Humara 2.1 — ZeroGPT cleaner (external API)
  'easy',          // Humara 2.2 — Broad spectrum (external API)
  'humara_v3_3',   // Humara 2.4 — Triple fallback (needs king_server)
  'oxygen3',       // Humara 3.0 — Fine-tuned model (HF Space)
  'ghost_pro_wiki', // Wikipedia — Encyclopedic NPOV
];

const PORT = 3000;
const TIMEOUT = 120000; // 2 min per engine

async function testEngine(engine) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const start = Date.now();
    const res = await fetch(`http://localhost:${PORT}/api/humanize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        engine,
        strength: 'medium',
        enable_post_processing: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!res.ok) {
      const errText = await res.text();
      // Extract JSON error if embedded in HTML
      const jsonMatch = errText.match(/"message":"([^"]+)"/);
      const errMsg = jsonMatch ? jsonMatch[1] : errText.substring(0, 200);
      return { engine, status: 'ERROR', error: `HTTP ${res.status}: ${errMsg}`, elapsed };
    }

    const data = await res.json();
    const output = data.humanized || data.humanizedText || data.text || '';
    const wordCount = output.split(/\s+/).filter(Boolean).length;

    return {
      engine,
      status: 'OK',
      output,
      wordCount,
      inputWordCount: data.input_word_count,
      meaningPreserved: data.meaning_preserved,
      elapsed,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { engine, status: 'TIMEOUT', error: `Exceeded ${TIMEOUT / 1000}s`, elapsed: TIMEOUT / 1000 };
    }
    return { engine, status: 'ERROR', error: err.message, elapsed: '?' };
  }
}

async function main() {
  const inputWords = text.split(/\s+/).filter(Boolean).length;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  HUMANIZER ENGINE TEST — ${ENGINES.length} engines`);
  console.log(`  Input: ${inputWords} words, ${text.length} chars`);
  console.log(`${'='.repeat(80)}\n`);

  for (const engine of ENGINES) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`  ENGINE: ${engine}`);
    console.log(`${'─'.repeat(80)}`);

    const result = await testEngine(engine);

    if (result.status !== 'OK') {
      console.log(`  STATUS: ${result.status} (${result.elapsed}s)`);
      console.log(`  ERROR: ${result.error}`);
      continue;
    }

    console.log(`  STATUS: OK (${result.elapsed}s) | Words: ${result.inputWordCount} → ${result.wordCount} | Meaning: ${result.meaningPreserved}`);
    console.log(`\n${result.output}\n`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('  ALL TESTS COMPLETE');
  console.log(`${'='.repeat(80)}\n`);
}

main();
