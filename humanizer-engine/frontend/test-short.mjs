// Test Ghost Pro engine with short religious/colonial text
const TEST_TEXT = `Religious institutions were central to the development of colonial identity and unity. Many colonies were founded on religious principles, and faith played a significant role in shaping both social norms and political organization. In particular, Puritan communities in New England emphasized covenant theology, which viewed society as a moral and political agreement among individuals under divine authority.
This concept of covenant had important implications for governance. It encouraged the belief that political authority was derived from the consent of the governed, rather than imposed from above. Dyer (2008) notes that the diversity of religious groups within the colonies also contributed to the development of tolerance and pluralism. As different religious communities coexisted, colonists were compelled to create systems that accommodated varying beliefs, thereby reinforcing principles of cooperation and mutual respect`;

const API_URL = `http://localhost:${process.env.TEST_PORT || 3000}/api/humanize`;

async function main() {
  console.log("=== Ghost Pro Short Text Test ===");
  console.log(`Input: ${TEST_TEXT.split(/\s+/).length} words`);
  console.log("");

  const hasContractions = /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't)\b/gi.test(TEST_TEXT);
  const hasFirstPerson = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/.test(TEST_TEXT);
  const hasRhetoricalQuestions = /[A-Za-z][^.!?]*\?/.test(TEST_TEXT);
  
  console.log(`Input features:`);
  console.log(`  hasContractions: ${hasContractions}`);
  console.log(`  hasFirstPerson: ${hasFirstPerson}`);
  console.log(`  hasRhetoricalQuestions: ${hasRhetoricalQuestions}`);
  console.log("");

  try {
    console.log("Sending to Ghost Pro engine...\n");
    const start = Date.now();
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: TEST_TEXT,
        engine: "ghost_pro",
        strength: "medium",
        tone: "academic",
      }),
    });
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`HTTP ${response.status}: ${errText}`);
      process.exit(1);
    }

    const data = await response.json();
    console.log(`=== RESULTS (${elapsed}s) ===`);
    console.log(`Engine: ${data.engine_used}`);
    console.log(`Input words: ${data.input_word_count}`);
    console.log(`Output words: ${data.word_count}`);
    console.log(`Meaning preserved: ${data.meaning_preserved} (${data.meaning_similarity})`);
    console.log("");
    
    if (data.input_detector_results) {
      console.log(`Input AI score: ${data.input_detector_results.overall}%`);
    }
    if (data.output_detector_results) {
      console.log(`Output AI score: ${data.output_detector_results.overall}%`);
      // Show signal scores
      if (data.output_detector_results.signals) {
        // AI-positive signals: lower = more human (inverted display)
        const AI_POSITIVE = new Set([
          'per_sentence_ai_ratio', 'ai_pattern_score', 'ngram_repetition',
          'token_predictability', 'sentence_uniformity', 'paragraph_uniformity',
          'avg_word_commonality', 'zipf_deviation', 'function_word_freq'
        ]);
        console.log("\n=== SIGNAL SCORES ===");
        const sigs = data.output_detector_results.signals;
        // Show human-positive (higher=better) and AI-positive (lower=better) with correct flags
        const sorted = Object.entries(sigs).sort((a, b) => {
          // Convert to "goodness" score for sorting
          const aGood = AI_POSITIVE.has(a[0]) ? (100 - a[1]) : a[1];
          const bGood = AI_POSITIVE.has(b[0]) ? (100 - b[1]) : b[1];
          return aGood - bGood;
        });
        for (const [name, score] of sorted) {
          const isAi = AI_POSITIVE.has(name);
          const goodness = isAi ? (100 - score) : score;
          const dir = isAi ? '↓' : '↑';
          const flag = goodness < 25 ? ' ❌' : goodness < 40 ? ' ⚡' : goodness < 55 ? ' 🔶' : ' ✅';
          console.log(`  ${name.padEnd(25)} ${score.toFixed(1).padStart(5)} ${dir}${flag}`);
        }
      }
      // Show per-detector breakdown
      if (data.output_detector_results.detectors) {
        console.log("\n=== PER-DETECTOR SCORES ===");
        for (const d of data.output_detector_results.detectors) {
          const flag = d.ai_score > 50 ? ' ⚠️' : d.ai_score > 30 ? ' ⚡' : ' ✅';
          console.log(`  ${d.detector.padEnd(22)} AI: ${d.ai_score.toFixed(1).padStart(5)}%  ${d.verdict}${flag}`);
        }
      }
    }
    console.log("");

    const output = data.humanized || "";
    
    const contractionPattern = /\b(?:can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|couldn't|wouldn't|shouldn't|mustn't|it's|i'm|i've|i'd|i'll|he's|she's|we're|we've|we'll|we'd|they're|they've|they'll|they'd|you're|you've|you'll|you'd|that's|there's|here's|what's|who's|let's|ain't)\b/gi;
    const outputContractions = output.match(contractionPattern) || [];
    console.log(`=== CONSTRAINT CHECKS ===`);
    console.log(`Contractions in output: ${outputContractions.length}`);
    if (outputContractions.length > 0) {
      console.log(`  FAIL: Found contractions: ${[...new Set(outputContractions)].join(", ")}`);
    } else {
      console.log(`  PASS: No contractions`);
    }

    const questions = output.match(/[A-Za-z][^.!?]*\?/g) || [];
    console.log(`Rhetorical questions in output: ${questions.length}`);
    if (questions.length > 0) {
      console.log(`  FAIL: Found questions: ${questions.map(q => q.trim().substring(0, 60)).join(" | ")}`);
    } else {
      console.log(`  PASS: No rhetorical questions`);
    }

    const firstPersonMatches = output.match(/\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/g) || [];
    console.log(`First-person pronouns in output: ${firstPersonMatches.length}${hasFirstPerson ? ' (ALLOWED)' : ' (SHOULD BE 0)'}`);
    
    console.log("");
    console.log("=== OUTPUT TEXT ===");
    console.log(output);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
