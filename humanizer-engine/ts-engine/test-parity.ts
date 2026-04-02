/**
 * Test detector parity - TypeScript side
 * Produces JSON output for comparison with Python
 */

import { TextSignals } from "./src/multi-detector.js";

const testText = `
Furthermore, it is important to note that the comprehensive implementation 
of robust frameworks can significantly enhance the efficacy of multifaceted 
approaches. Moreover, the utilization of innovative methodologies necessitates 
a fundamental understanding of inherent limitations. Additionally, the trajectory 
of this discourse demonstrates the profound impact of leveraging paradigmatic shifts.
`.trim();

const signals = new TextSignals(testText);

console.log(`DEBUG: Word count: ${signals.wordCount}`);
console.log(`DEBUG: Sentence count: ${signals.sentenceCount}`);
console.log(`DEBUG: Sentences:`, signals.sentences);

const allSigs = signals.getAllSignals();

const criticalSignals = {
  ai_pattern_score: allSigs.ai_pattern_score,
  shannon_entropy: allSigs.shannon_entropy,
  readability_consistency: allSigs.readability_consistency,
  stylometric_score: allSigs.stylometric_score,
};

console.log("=" + "=".repeat(71));
console.log("TYPESCRIPT DETECTOR - Critical Signals");
console.log("=" + "=".repeat(71));
console.log(JSON.stringify(criticalSignals, null, 2));
console.log();

// Also print all signals for debugging
console.log("All Signals:");
for (const [key, val] of Object.entries(allSigs)) {
  console.log(`  ${key.padEnd(30)}: ${val.toFixed(1)}`);
}
