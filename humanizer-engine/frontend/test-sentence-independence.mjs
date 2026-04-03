/**
 * Test: Sentence Independence Verification
 * 
 * Verifies that ALL humanizers (ghost_mini, ghost_pro, ninja):
 * 1. Process each sentence independently
 * 2. Return exactly the same number of sentences (1-in = 1-out)
 * 3. Preserve sentence order (no reordering)
 * 4. Preserve paragraph structure
 * 5. Do not introduce new sentences
 */

const API_URL = `http://localhost:${process.env.TEST_PORT || 3000}/api/humanize`;

// Robust sentence splitter — MUST match engine's content-protection.ts robustSentenceSplit
function robustSentenceSplit(text) {
  if (!text || !text.trim()) return [];

  const shields = new Map();
  let shieldIdx = 0;
  const shield = (match) => {
    const key = `\x00SH${shieldIdx++}\x00`;
    shields.set(key, match);
    return key;
  };

  let t = text;

  // Shield existing placeholders
  t = t.replace(/\u27E6[^\u27E7]*\u27E7/g, m => shield(m));

  // Shield ellipses
  t = t.replace(/\.{3}/g, m => shield(m));

  // Shield decimal numbers
  t = t.replace(/[+-]?\d+\.\d+/g, m => shield(m));

  // Shield ordinal-style section references
  t = t.replace(/\b\d+(?:\.\d+)+\b/g, m => shield(m));

  // Shield known abbreviations — MUST match engine's content-protection.ts ABBREVIATION_RE exactly
  const ABBREVIATION_RE = /(?:Dr|Mr|Mrs|Ms|Prof|Jr|Sr|vs|etc|e\.g|i\.e|al|St|Mt|Sgt|Lt|Gen|Gov|Inc|Corp|Ltd|Co|Ave|Blvd|Dept|Est|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fig|Eq|Vol|Ed|Rev|No|approx|est|min|max|avg)\./gi;
  t = t.replace(ABBREVIATION_RE, m => shield(m));

  // Shield single-letter initials
  t = t.replace(/\b[A-Z]\./g, m => shield(m));

  // Shield URLs
  t = t.replace(/https?:\/\/[^\s]+/gi, m => shield(m));
  t = t.replace(/www\.[^\s]+/gi, m => shield(m));

  // Split: sentence ends with .!? followed by whitespace and uppercase letter
  const sentenceRe = /([.!?]["'\u201D\u2019]?)\s+(?=[A-Z\u27E6])/g;
  const parts = [];
  let lastIdx = 0;

  let match;
  while ((match = sentenceRe.exec(t)) !== null) {
    const end = match.index + match[1].length;
    parts.push(t.slice(lastIdx, end));
    lastIdx = end;
    while (lastIdx < t.length && /\s/.test(t[lastIdx])) lastIdx++;
  }
  if (lastIdx < t.length) parts.push(t.slice(lastIdx));

  // Restore all shields
  return parts.map(s => {
    let r = s;
    for (const [key, val] of shields) {
      r = r.replaceAll(key, val);
    }
    return r.trim();
  }).filter(s => s.length > 0);
}

// Test input: 3 paragraphs with known sentence counts (5 + 5 + 5 = 15)
const testInput = `The industrial revolution began in Britain during the late 18th century. It transformed the way goods were produced and distributed across the world. Factories replaced small workshops, and mass production became the norm. Workers moved from rural areas to cities in search of employment. This migration led to rapid urbanization and significant social changes.

Education systems evolved alongside industrial growth. New schools were established to train workers for factory jobs. Literacy rates improved as governments recognized the need for an educated workforce. Technical colleges emerged to provide specialized training. The link between education and economic development became increasingly clear.

Environmental concerns were not a priority during the early stages of industrialization. Rivers and air became polluted as factories dumped waste without regulation. Public health suffered as a result of poor sanitation in crowded cities. It was not until the late 19th century that reform movements began to address these issues. Governments slowly introduced laws to protect both workers and the environment.`;

async function testEngine(engineName) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  TESTING ENGINE: ${engineName.toUpperCase()}`);
  console.log(`${"=".repeat(60)}\n`);

  // Count input structure
  const inputParagraphs = testInput.split(/\n\s*\n/).filter(p => p.trim());
  const inputSentenceCounts = inputParagraphs.map(p => robustSentenceSplit(p).length);
  const totalInputSentences = inputSentenceCounts.reduce((a, b) => a + b, 0);

  console.log(`Input: ${inputParagraphs.length} paragraphs, ${totalInputSentences} total sentences`);
  console.log(`Per-paragraph sentence counts: [${inputSentenceCounts.join(", ")}]`);
  console.log();

  // Extract input sentences in order
  const inputSentencesFlat = [];
  for (const para of inputParagraphs) {
    for (const sent of robustSentenceSplit(para)) {
      inputSentencesFlat.push(sent.trim());
    }
  }

  // Call API
  console.log(`Sending to ${engineName} engine via API...\n`);
  const start = Date.now();
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: testInput,
        engine: engineName,
        strength: "medium",
        tone: "academic",
      }),
    });
  } catch (err) {
    console.error(`  ERROR: Could not reach API at ${API_URL}`);
    console.error(`  Make sure the dev server is running (npm run dev)`);
    return { engine: engineName, passed: false, error: "API unreachable" };
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error(`  HTTP ${response.status}: ${errText}`);
    return { engine: engineName, passed: false, error: `HTTP ${response.status}` };
  }

  const data = await response.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const output = data.humanized || data.humanized_text || data.text || "";

  console.log(`Response received in ${elapsed}s (engine used: ${data.engine_used || engineName})`);
  console.log();

  // Count output structure
  const outputParagraphs = output.split(/\n\s*\n/).filter(p => p.trim());
  const outputSentenceCounts = outputParagraphs.map(p => robustSentenceSplit(p).length);
  const totalOutputSentences = outputSentenceCounts.reduce((a, b) => a + b, 0);

  console.log(`Output: ${outputParagraphs.length} paragraphs, ${totalOutputSentences} total sentences`);
  console.log(`Per-paragraph sentence counts: [${outputSentenceCounts.join(", ")}]`);
  console.log();

  // Extract output sentences in order
  const outputSentencesFlat = [];
  for (const para of outputParagraphs) {
    for (const sent of robustSentenceSplit(para)) {
      outputSentencesFlat.push(sent.trim());
    }
  }

  // ── TEST 1: Paragraph count preserved ──
  const test1 = inputParagraphs.length === outputParagraphs.length;
  console.log(`TEST 1 - Paragraph count preserved: ${test1 ? "PASS ✓" : "FAIL ✗"} (${inputParagraphs.length} → ${outputParagraphs.length})`);

  // ── TEST 2: Total sentence count preserved ──
  const test2 = totalInputSentences === totalOutputSentences;
  console.log(`TEST 2 - Sentence count preserved: ${test2 ? "PASS ✓" : "FAIL ✗"} (${totalInputSentences} → ${totalOutputSentences})`);

  // ── TEST 3: Per-paragraph sentence count preserved ──
  let test3 = true;
  for (let i = 0; i < Math.min(inputSentenceCounts.length, outputSentenceCounts.length); i++) {
    if (inputSentenceCounts[i] !== outputSentenceCounts[i]) {
      console.log(`  Para ${i + 1}: ${inputSentenceCounts[i]} → ${outputSentenceCounts[i]} (MISMATCH)`);
      test3 = false;
    }
  }
  console.log(`TEST 3 - Per-paragraph sentence counts match: ${test3 ? "PASS ✓" : "FAIL ✗"}`);

  // ── TEST 4: Sentence order preserved (keyword overlap check) ──
  let test4 = true;
  const minLen = Math.min(inputSentencesFlat.length, outputSentencesFlat.length);
  for (let i = 0; i < minLen; i++) {
    const inWords = new Set(inputSentencesFlat[i].toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length >= 4));
    const outWords = new Set(outputSentencesFlat[i].toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length >= 4));
    let overlap = 0;
    for (const w of inWords) {
      if (outWords.has(w)) overlap++;
    }
    const ratio = inWords.size > 0 ? overlap / inWords.size : 1;
    if (ratio < 0.20) {
      console.log(`  Sentence ${i + 1}: Low keyword overlap (${(ratio * 100).toFixed(0)}%) - possible reordering`);
      console.log(`    IN:  ${inputSentencesFlat[i].substring(0, 80)}...`);
      console.log(`    OUT: ${outputSentencesFlat[i].substring(0, 80)}...`);
      test4 = false;
    }
  }
  console.log(`TEST 4 - Sentence order preserved: ${test4 ? "PASS ✓" : "FAIL ✗"}`);

  // ── TEST 5: No introduced sentences (1-in = 1-out, strict) ──
  const test5 = totalOutputSentences === totalInputSentences;
  console.log(`TEST 5 - No introduced sentences (strict 1:1): ${test5 ? "PASS ✓" : "FAIL ✗"}`);

  // ── TEST 6: Each sentence was actually changed ──
  let changedCount = 0;
  for (let i = 0; i < minLen; i++) {
    if (inputSentencesFlat[i] !== outputSentencesFlat[i]) changedCount++;
  }
  const changeRatio = minLen > 0 ? changedCount / minLen : 0;
  console.log(`TEST 6 - Sentences changed: ${changedCount}/${minLen} (${(changeRatio * 100).toFixed(0)}%)`);

  // Sentence-by-sentence comparison
  console.log("\n--- Sentence-by-Sentence Comparison ---\n");
  for (let i = 0; i < minLen; i++) {
    const changed = inputSentencesFlat[i] !== outputSentencesFlat[i];
    console.log(`[${i + 1}] ${changed ? "CHANGED" : "SAME"}`);
    console.log(`  IN:  ${inputSentencesFlat[i]}`);
    console.log(`  OUT: ${outputSentencesFlat[i]}`);
    console.log();
  }

  const allPassed = test1 && test2 && test3 && test4 && test5;
  console.log(`--- ${engineName.toUpperCase()} RESULT: ${allPassed ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"} ---`);
  
  return { engine: engineName, passed: allPassed, test1, test2, test3, test4, test5, changeRatio };
}

// Run all engines
async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     SENTENCE INDEPENDENCE VERIFICATION TEST SUITE      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const engines = ["ghost_mini", "ghost_pro", "ninja"];
  const results = [];

  for (const engine of engines) {
    const result = await testEngine(engine);
    results.push(result);
  }

  // Final summary
  console.log("\n" + "=".repeat(60));
  console.log("  FINAL SUMMARY");
  console.log("=".repeat(60));
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.engine.padEnd(12)} ERROR: ${r.error}`);
    } else {
      console.log(`  ${r.engine.padEnd(12)} ${r.passed ? "PASS ✓" : "FAIL ✗"}  (${(r.changeRatio * 100).toFixed(0)}% sentences changed)`);
    }
  }
  const allEnginesPassed = results.every(r => r.passed);
  console.log(`\n  Overall: ${allEnginesPassed ? "ALL ENGINES PASSED ✓" : "SOME ENGINES FAILED ✗"}`);
}

main().catch(console.error);
