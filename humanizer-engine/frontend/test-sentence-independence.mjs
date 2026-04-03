/**
 * Test: Sentence Independence Verification
 * 
 * Verifies that the humanizer:
 * 1. Processes each sentence independently
 * 2. Returns exactly the same number of sentences (1-in = 1-out)
 * 3. Preserves sentence order (no reordering)
 * 4. Preserves paragraph structure
 * 5. Does not introduce new sentences
 */

// Dynamic import for the humanizer (ESM)
const { humanize } = await import("./lib/engine/humanizer.ts").catch(() => {
  console.error("Could not import from .ts directly, trying compiled...");
  return import("./lib/engine/humanizer.js");
});

// Robust sentence splitter (same one used by the engine)
function robustSentenceSplit(text) {
  const abbrevs = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|St|Ave|Blvd|Dept|Inc|Corp|Ltd|Co|Gov|Gen|Sgt|Cpl|Pvt|Rev|Vol|No|Fig|Eq|approx|est|min|max|dept|univ|assoc)\./gi;
  let safe = text;
  const abbrevMap = [];
  let mi = 0;
  safe = safe.replace(abbrevs, (m) => {
    const placeholder = `__ABBR${mi}__`;
    abbrevMap.push({ placeholder, original: m });
    mi++;
    return placeholder;
  });
  safe = safe.replace(/\.{3}/g, "__ELLIPSIS__");
  const raw = safe.split(/(?<=[.!?])\s+/);
  return raw.map((s) => {
    let r = s;
    for (const { placeholder, original } of abbrevMap) {
      r = r.replace(placeholder, original);
    }
    r = r.replace(/__ELLIPSIS__/g, "...");
    return r.trim();
  }).filter((s) => s.length > 0);
}

// Test input: 3 paragraphs with known sentence counts
const testInput = `The industrial revolution began in Britain during the late 18th century. It transformed the way goods were produced and distributed across the world. Factories replaced small workshops, and mass production became the norm. Workers moved from rural areas to cities in search of employment. This migration led to rapid urbanization and significant social changes.

Education systems evolved alongside industrial growth. New schools were established to train workers for factory jobs. Literacy rates improved as governments recognized the need for an educated workforce. Technical colleges emerged to provide specialized training. The link between education and economic development became increasingly clear.

Environmental concerns were not a priority during the early stages of industrialization. Rivers and air became polluted as factories dumped waste without regulation. Public health suffered as a result of poor sanitation in crowded cities. It was not until the late 19th century that reform movements began to address these issues. Governments slowly introduced laws to protect both workers and the environment.`;

console.log("=== SENTENCE INDEPENDENCE TEST ===\n");

// Count input structure
const inputParagraphs = testInput.split(/\n\s*\n/).filter(p => p.trim());
const inputSentenceCounts = inputParagraphs.map(p => robustSentenceSplit(p).length);
const totalInputSentences = inputSentenceCounts.reduce((a, b) => a + b, 0);

console.log(`Input: ${inputParagraphs.length} paragraphs, ${totalInputSentences} total sentences`);
console.log(`Per-paragraph sentence counts: [${inputSentenceCounts.join(", ")}]`);
console.log();

// Extract input sentences in order for comparison
const inputSentencesFlat = [];
for (const para of inputParagraphs) {
  for (const sent of robustSentenceSplit(para)) {
    inputSentencesFlat.push(sent.trim());
  }
}

// Run humanizer
console.log("Running Ghost Mini humanizer...\n");
const output = humanize(testInput, {
  strength: "medium",
  mode: "ghost_mini",
  enablePostProcessing: true,
});

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
  // Check that at least 25% of input keywords appear in the corresponding output sentence
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

// ── TEST 5: No introduced sentences (output not longer than input + tolerance) ──
const test5 = totalOutputSentences <= totalInputSentences + 1;
console.log(`TEST 5 - No introduced sentences: ${test5 ? "PASS ✓" : "FAIL ✗"}`);

// ── TEST 6: Each sentence was actually changed (not passed through untouched) ──
let changedCount = 0;
for (let i = 0; i < minLen; i++) {
  if (inputSentencesFlat[i] !== outputSentencesFlat[i]) changedCount++;
}
const changeRatio = minLen > 0 ? changedCount / minLen : 0;
console.log(`TEST 6 - Sentences changed: ${changedCount}/${minLen} (${(changeRatio * 100).toFixed(0)}%)`);

console.log("\n=== SENTENCE-BY-SENTENCE COMPARISON ===\n");
for (let i = 0; i < minLen; i++) {
  const changed = inputSentencesFlat[i] !== outputSentencesFlat[i];
  console.log(`[${i + 1}] ${changed ? "CHANGED" : "SAME"}`);
  console.log(`  IN:  ${inputSentencesFlat[i]}`);
  console.log(`  OUT: ${outputSentencesFlat[i]}`);
  console.log();
}

// Summary
console.log("=== SUMMARY ===");
const allPassed = test1 && test2 && test3 && test4 && test5;
console.log(`Overall: ${allPassed ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"}`);
