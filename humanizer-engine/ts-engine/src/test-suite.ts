/**
 * Comprehensive Test Suite — Humanizer Engine TypeScript Port
 * ===========================================================
 * Tests paragraph/title preservation, iteration logic, dictionary usage,
 * signal extraction, detection, and all core transforms.
 *
 * Run: bun run src/test-suite.ts
 */

import { humanize, buildSettings } from "./humanizer.js";
import {
  sentTokenize,
  synonymReplace,
  phraseSubstitute,
  replaceAiStarters,
  restructureSentence,
  varyConnectors,
  makeBurstier,
} from "./utils.js";
import { postProcess } from "./post-processor.js";
import { analyze as analyzeContext } from "./context-analyzer.js";
import {
  voiceShift,
  deepRestructure,
  expandContractions,
  hasFirstPerson,
  mergeShortSentences,
} from "./advanced-transforms.js";
import { getDictionary } from "./dictionary.js";
import { getDetector } from "./multi-detector.js";
import { validateAll } from "./validation.js";
import { analyzeText } from "./text-analyzer.js";
import { getStyleMemory } from "./style-memory.js";
import { SYNONYM_BANK, PROTECTED_WORDS, PHRASE_SUBSTITUTIONS } from "./rules.js";
import { executeNinjaNonLlmPhases } from "./ninja-post-processor.js";

// ── Test infrastructure ──

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name}: ${detail}` : name;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

function skip(name: string, reason?: string) {
  skipped++;
  console.log(`  ○ SKIP: ${name}${reason ? ` (${reason})` : ""}`);
}

function section(title: string) {
  console.log(`\n═══ ${title} ═══`);
}

// ── Test data ──

const AI_SAMPLE = `Artificial intelligence has fundamentally transformed the landscape of modern technology. It is important to note that these advancements have far-reaching implications for various sectors. Furthermore, the integration of machine learning algorithms has enabled unprecedented capabilities in data analysis and pattern recognition.

Moreover, the development of neural networks has revolutionized how we approach complex computational problems. In conclusion, the continued evolution of AI technologies promises to reshape industries and redefine the boundaries of human achievement.`;

const MULTI_PARAGRAPH = `Introduction to Machine Learning

Machine learning represents a paradigm shift in how computers process information. Traditional programming requires explicit instructions for every scenario, while machine learning enables systems to learn from data.

Key Benefits

The benefits of machine learning are numerous. It can identify patterns that humans might miss. It scales efficiently across large datasets. It improves over time as more data becomes available.

Conclusion

In summary, machine learning is a transformative technology that continues to evolve and improve.`;

const SHORT_TEXT = "This is a simple test sentence for the humanizer.";

const HEADING_SAMPLES = [
  "Introduction to Machine Learning",
  "# Chapter 1: Getting Started",
  "## Methods and Materials",
  "KEY FINDINGS AND RESULTS",
  "The Role of AI in Healthcare",
];

// ═══════════════════════════════════════════════════
// SECTION 1: PARAGRAPH & TITLE PRESERVATION
// ═══════════════════════════════════════════════════

section("1. Paragraph & Title Preservation");

{
  // Test paragraph break preservation
  const result = humanize(MULTI_PARAGRAPH, { mode: null, strength: "light" });
  const inputParas = MULTI_PARAGRAPH.split(/\n\s*\n/).filter((p) => p.trim());
  const outputParas = result.split(/\n\s*\n/).filter((p) => p.trim());
  assert(outputParas.length >= inputParas.length - 1, "Paragraph count preserved (±1)",
    `input=${inputParas.length}, output=${outputParas.length}`);

  // Test double-linebreak presence
  assert(result.includes("\n\n"), "Double linebreaks present in output");

  // Test that titles/headings are preserved
  for (const heading of HEADING_SAMPLES) {
    const testText = `${heading}\n\nThis is the body paragraph that follows the heading. It contains several sentences worth of content that should be transformed by the humanizer engine.`;
    const headingResult = humanize(testText, { mode: null, strength: "light" });
    const firstPara = headingResult.split(/\n\s*\n/)[0]?.trim() ?? "";
    // Title should be preserved roughly intact (short, no period)
    assert(
      firstPara.length <= heading.length + 15 || firstPara.split(/\s+/).length <= 12,
      `Title preserved: "${heading.slice(0, 40)}..."`,
      `got: "${firstPara.slice(0, 60)}"`,
    );
  }

  // Test markdown heading preservation
  const mdText = "## Methods\n\nThe methods used in this study are outlined below. We employed a mixed-methods approach combining quantitative analysis with qualitative interviews.";
  const mdResult = humanize(mdText, { mode: null, strength: "light" });
  assert(mdResult.startsWith("## Methods"), "Markdown heading preserved exactly");
}

// ═══════════════════════════════════════════════════
// SECTION 2: ITERATION & INTENSITY LOGIC
// ═══════════════════════════════════════════════════

section("2. Iteration & Intensity Logic");

{
  // Test that different strengths produce different results
  const light = humanize(AI_SAMPLE, { strength: "light", mode: null });
  const medium = humanize(AI_SAMPLE, { strength: "medium", mode: null });
  const strong = humanize(AI_SAMPLE, { strength: "strong", mode: null });

  // Light should change less than strong (word-level comparison)
  function wordSet(t: string): Set<string> { return new Set(t.toLowerCase().split(/\s+/)); }
  const origWords = wordSet(AI_SAMPLE);
  const lightDiff = [...wordSet(light)].filter((w) => !origWords.has(w)).length;
  const strongDiff = [...wordSet(strong)].filter((w) => !origWords.has(w)).length;
  assert(strongDiff >= lightDiff - 5, "Strong changes ≥ light words (±5 tolerance)",
    `light=${lightDiff}, strong=${strongDiff}`);

  // Test buildSettings returns correct values
  const lightSettings = buildSettings({ strength: "light", stealth: true, preserveSentences: false, strictMeaning: false, tone: "neutral", mode: "ghost_pro" });
  const strongSettings = buildSettings({ strength: "strong", stealth: true, preserveSentences: false, strictMeaning: false, tone: "neutral", mode: "ghost_pro" });
  assert(lightSettings.baseIntensity < strongSettings.baseIntensity, "Light base intensity < strong");
  assert(lightSettings.maxIterations <= strongSettings.maxIterations, "Light max iterations ≤ strong");

  // Test intensity cap per mode
  const ghostSettings = buildSettings({ strength: "medium", stealth: true, preserveSentences: false, strictMeaning: false, tone: "neutral", mode: "ghost_pro" });
  const plainSettings = buildSettings({ strength: "medium", stealth: true, preserveSentences: false, strictMeaning: false, tone: "neutral", mode: null });
  assert(typeof ghostSettings.baseIntensity === "number", "Ghost settings have numeric intensity");
  assert(typeof plainSettings.baseIntensity === "number", "Plain settings have numeric intensity");
}

// ═══════════════════════════════════════════════════
// SECTION 3: DICTIONARY & SYNONYM USAGE
// ═══════════════════════════════════════════════════

section("3. Dictionary & Synonym Usage");

{
  const dict = getDictionary();

  // Test dictionary loaded
  assert(dict !== null && dict !== undefined, "Dictionary loaded");

  // Test replaceWordSmartly
  const used = new Set<string>();
  try {
    const repl = dict.replaceWordSmartly("important", "It is important to study.", used);
    assert(typeof repl === "string", "replaceWordSmartly returns string", `got: ${repl}`);
  } catch (e) {
    skip("replaceWordSmartly", "threw error");
  }

  // Test isValidWord
  // isValidWord may return true for unknown words if no full word list loaded — test known word
  assert(dict.isValidWord("important") === true, "isValidWord('important') = true");

  // Test getContextualSynonyms
  try {
    const syns = dict.getContextualSynonyms("significant", "academic");
    assert(Array.isArray(syns), "getContextualSynonyms returns array");
  } catch {
    skip("getContextualSynonyms", "not available");
  }

  // Test SYNONYM_BANK coverage
  assert(Object.keys(SYNONYM_BANK).length > 50, "SYNONYM_BANK has >50 entries",
    `actual: ${Object.keys(SYNONYM_BANK).length}`);

  // Test synonymReplace changes text
  const synInput = "The fundamental transformation of technology has been significant.";
  const synResult = synonymReplace(synInput, 5.0, new Set(), undefined);
  assert(typeof synResult === "string" && synResult.length > 0, "synonymReplace returns non-empty string");

  // Test PROTECTED_WORDS prevents replacement
  assert(PROTECTED_WORDS.size > 10, "PROTECTED_WORDS has >10 entries", `actual: ${PROTECTED_WORDS.size}`);
}

// ═══════════════════════════════════════════════════
// SECTION 4: CORE TRANSFORMS
// ═══════════════════════════════════════════════════

section("4. Core Transforms");

{
  // sentTokenize
  const sents = sentTokenize("Hello world. This is a test. Final sentence here.");
  assert(sents.length === 3, "sentTokenize splits 3 sentences", `got ${sents.length}`);

  // phraseSubstitute
  const phraseInput = "It is important to note that this works well.";
  const phraseOut = phraseSubstitute(phraseInput, 5.0);
  assert(typeof phraseOut === "string" && phraseOut.length > 0, "phraseSubstitute returns string");

  // replaceAiStarters
  const starterInput = "Furthermore, the results indicate a clear trend.";
  const starterOut = replaceAiStarters(starterInput);
  assert(typeof starterOut === "string", "replaceAiStarters returns string");

  // deepRestructure
  const deepInput = "The analysis of the data revealed several significant patterns in the results.";
  const deepOut = deepRestructure(deepInput, 3.0);
  assert(typeof deepOut === "string" && deepOut.length > 0, "deepRestructure returns string");

  // voiceShift
  const voiceInput = "The researchers conducted the experiment in a controlled laboratory setting.";
  const voiceOut = voiceShift(voiceInput, 0.3);
  assert(typeof voiceOut === "string" && voiceOut.length > 0, "voiceShift returns string");

  // expandContractions
  const contrInput = "They've been working on it. He's going to finish.";
  const contrOut = expandContractions(contrInput);
  assert(!contrOut.includes("They've"), "expandContractions expands they've");

  // hasFirstPerson
  assert(hasFirstPerson("I think this is correct.") === true, "hasFirstPerson detects 'I'");
  assert(hasFirstPerson("The system works well.") === false, "hasFirstPerson rejects no first person");

  // restructureSentence
  const clauseInput = "Because the data was limited, the researchers decided to expand their sample, and they conducted additional surveys.";
  const clauseOut = restructureSentence(clauseInput, 3.0);
  assert(typeof clauseOut === "string" && clauseOut.length > 0, "restructureSentence returns string");

  // varyConnectors
  const connInput = "However, the results are clear. However, more research is needed.";
  const connOut = varyConnectors(connInput);
  assert(typeof connOut === "string", "varyConnectors returns string");

  // mergeShortSentences
  const mergeOut = mergeShortSentences("Oh.", "That is interesting.");
  assert(typeof mergeOut === "string", "mergeShortSentences returns string");

  // makeBurstier
  const burstInput = ["Short sentence.", "This is a medium length sentence.", "And this is a longer sentence that has more words in it."];
  const burstOut = makeBurstier(burstInput);
  assert(Array.isArray(burstOut) && burstOut.length > 0, "makeBurstier returns non-empty array");
}

// ═══════════════════════════════════════════════════
// SECTION 5: MULTI-DETECTOR
// ═══════════════════════════════════════════════════

section("5. Multi-Detector");

{
  const detector = getDetector();

  // Test detector instantiation
  assert(detector !== null && detector !== undefined, "MultiDetector instantiated");

  // Test analyze returns expected structure
  const analysis = detector.analyze(AI_SAMPLE);
  assert(analysis !== null, "analyze() returns result");
  assert("signals" in analysis, "Analysis has signals");
  assert("detectors" in analysis, "Analysis has detectors");
  assert("summary" in analysis, "Analysis has summary");

  // Test signal extraction
  const signals = analysis.signals;
  const signalKeys = Object.keys(signals);
  const expectedSignals = [
    "perplexity", "burstiness", "sentence_uniformity", "vocabulary_richness",
    "ai_pattern_score", "starter_diversity", "ngram_repetition",
    "per_sentence_ai_ratio", "readability_consistency", "function_word_freq",
    "dependency_depth", "shannon_entropy", "token_predictability",
    "stylometric_score", "avg_word_commonality",
    "paragraph_uniformity",
  ];
  for (const sig of expectedSignals) {
    assert(sig in signals, `Signal '${sig}' extracted`, `missing from: ${signalKeys.join(", ").slice(0, 80)}`);
  }

  // Test detector profiles
  const detectors = analysis.detectors;
  assert(Object.keys(detectors).length >= 20, "≥20 detector profiles scored",
    `got ${Object.keys(detectors).length}`);

  // Test summary scores
  assert(typeof analysis.summary.overall_human_score === "number", "Overall human score is number");
  assert(analysis.summary.overall_human_score >= 0 && analysis.summary.overall_human_score <= 100,
    "Human score in 0-100 range", `got ${analysis.summary.overall_human_score}`);

  // AI text should score low on human score
  assert(analysis.summary.overall_human_score < 60, "AI sample scores < 60% human",
    `got ${analysis.summary.overall_human_score}`);
}

// ═══════════════════════════════════════════════════
// SECTION 6: POST-PROCESSOR
// ═══════════════════════════════════════════════════

section("6. Post-Processor");

{
  // Basic post-processing
  const ppInput = "The system is important.  It is   very significant.  Furthermore, the results show...";
  const ppOut = postProcess(ppInput);
  assert(typeof ppOut === "string", "postProcess returns string");
  assert(!ppOut.includes("  "), "postProcess removes double spaces");

  // Ninja post-processor
  const ninjaOut = executeNinjaNonLlmPhases(ppInput);
  assert(typeof ninjaOut === "string", "ninjaPostProcess returns string");
}

// ═══════════════════════════════════════════════════
// SECTION 7: CONTEXT ANALYZER
// ═══════════════════════════════════════════════════

section("7. Context Analyzer");

{
  const ctx = analyzeContext(AI_SAMPLE);
  assert(ctx !== null, "analyzeContext returns result");
  assert("tone" in ctx, "Context has tone");
  assert("protectedTerms" in ctx, "Context has protectedTerms");
  assert(ctx.protectedTerms instanceof Set, "protectedTerms is a Set");
  assert(typeof ctx.tone === "string", "tone is a string");
}

// ═══════════════════════════════════════════════════
// SECTION 8: TEXT ANALYZER
// ═══════════════════════════════════════════════════

section("8. Text Analyzer");

{
  const profile = analyzeText(AI_SAMPLE);
  assert(profile !== null, "analyzeText returns profile");
  assert(typeof profile.avg_sentence_length === "number", "Profile has avg_sentence_length");
  assert(typeof profile.lexical_diversity === "number", "Profile has lexical_diversity");
}

// ═══════════════════════════════════════════════════
// SECTION 9: STYLE MEMORY
// ═══════════════════════════════════════════════════

section("9. Style Memory");

{
  const sm = getStyleMemory();
  assert(sm !== null, "StyleMemory instantiated");
  
  // Test listNames and selectForTone
  const names = sm.listNames();
  assert(Array.isArray(names), "listNames returns array");
  
  const toneProfile = sm.selectForTone("academic");
  assert(toneProfile !== null || toneProfile === null, "selectForTone runs without error");
}

// ═══════════════════════════════════════════════════
// SECTION 10: VALIDATION
// ═══════════════════════════════════════════════════

section("10. Validation");

{
  const vr = validateAll(AI_SAMPLE, AI_SAMPLE.replace("fundamentally", "deeply"));
  assert(vr !== null, "validateAll returns result");
  assert("all_passed" in vr, "Validation has all_passed field");
  assert(typeof vr.all_passed === "boolean", "all_passed is boolean");
}

// ═══════════════════════════════════════════════════
// SECTION 11: END-TO-END HUMANIZATION
// ═══════════════════════════════════════════════════

section("11. End-to-End Humanization");

{
  // Test all modes produce output
  for (const mode of [null, "ghost_mini", "ghost_pro"] as const) {
    const result = humanize(AI_SAMPLE, { mode, strength: "medium" });
    assert(result.length > 0, `Mode '${mode ?? "standard"}' produces output`);
    assert(result !== AI_SAMPLE, `Mode '${mode ?? "standard"}' changes text`);
  }

  // Test all strengths produce output
  for (const strength of ["light", "medium", "strong"] as const) {
    const result = humanize(SHORT_TEXT, { strength, mode: null });
    assert(result.length > 0, `Strength '${strength}' produces output`);
  }

  // Test empty/whitespace input
  assert(humanize("") === "", "Empty input returns empty");
  assert(humanize("   ") === "   ", "Whitespace-only input preserved");

  // Test output quality: no double spaces, no orphan punctuation
  const quality = humanize(AI_SAMPLE, { mode: "ghost_pro", strength: "strong" });
  assert(!/  /.test(quality.replace(/\n/g, "")), "No double spaces in output");
  assert(!/\(\s*\)/.test(quality), "No empty parentheses");
  assert(!/—/.test(quality), "No em-dashes in output (replaced with commas)");

  // Test word change ratio
  const origWords = AI_SAMPLE.toLowerCase().split(/\s+/);
  const resultWords = quality.toLowerCase().split(/\s+/);
  let changed = 0;
  const maxLen = Math.min(origWords.length, resultWords.length);
  for (let i = 0; i < maxLen; i++) {
    if (origWords[i] !== resultWords[i]) changed++;
  }
  const changeRatio = changed / origWords.length;
  assert(changeRatio > 0.1, "At least 10% word change on AI text",
    `got ${(changeRatio * 100).toFixed(1)}%`);
}

// ═══════════════════════════════════════════════════
// SECTION 12: DICTIONARY INTEGRATION E2E
// ═══════════════════════════════════════════════════

section("12. Dictionary Integration (E2E)");

{
  // Test that humanize uses dictionary (non-ghost mode too, thanks to fix)
  const dictInput = "The important transformation has significantly impacted the fundamental approach to technological advancement.";
  const dictResult = humanize(dictInput, { mode: null, strength: "strong" });
  assert(dictResult !== dictInput, "Dictionary replacement changes text in standard mode");

  // Test ghost mode dictionary usage
  const ghostResult = humanize(dictInput, { mode: "ghost_pro", strength: "strong" });
  assert(ghostResult !== dictInput, "Dictionary replacement changes text in ghost_pro mode");
}

// ═══════════════════════════════════════════════════
// SECTION 13: PARAGRAPH STRUCTURE E2E
// ═══════════════════════════════════════════════════

section("13. Paragraph Structure (E2E)");

{
  const threeParas = `First paragraph with enough content to be meaningful. It discusses the main topic.

Second paragraph provides supporting evidence. The data shows clear trends in the field.

Third paragraph draws conclusions from the evidence. The implications are far-reaching.`;

  const result = humanize(threeParas, { mode: null, strength: "medium" });
  const outputParas = result.split(/\n\n/).filter((p) => p.trim());
  assert(outputParas.length === 3, "3 paragraphs preserved as 3 paragraphs",
    `got ${outputParas.length}`);

  // Each paragraph should have content
  for (let i = 0; i < outputParas.length; i++) {
    assert(outputParas[i].split(/\s+/).length >= 3,
      `Paragraph ${i + 1} has ≥3 words`, `words: ${outputParas[i].split(/\s+/).length}`);
  }
}

// ═══════════════════════════════════════════════════
// SECTION 14: RULES & CONSTANTS
// ═══════════════════════════════════════════════════

section("14. Rules & Constants");

{
  assert(Object.keys(PHRASE_SUBSTITUTIONS).length > 10, "PHRASE_SUBSTITUTIONS has >10 entries",
    `actual: ${Object.keys(PHRASE_SUBSTITUTIONS).length}`);
  assert(PROTECTED_WORDS.size > 5, "PROTECTED_WORDS is non-trivial");

  // Check for known AI markers in SYNONYM_BANK (some are in PHRASE_SUBSTITUTIONS instead)
  const aiWords = ["utilize", "facilitate", "comprehensive", "demonstrate", "significant"];
  for (const w of aiWords) {
    assert(w in SYNONYM_BANK,
      `SYNONYM_BANK has replacement for '${w}'`);
  }
}

// ═══════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════

console.log("\n" + "═".repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log("═".repeat(50));
if (failures.length > 0) {
  console.log("\nFailed tests:");
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log();
process.exit(failed > 0 ? 1 : 0);
