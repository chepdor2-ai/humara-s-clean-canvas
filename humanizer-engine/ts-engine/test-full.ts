/**
 * Full end-to-end detector test
 */

import { MultiDetector } from "./src/multi-detector.js";

const testText = `
Furthermore, it is important to note that the comprehensive implementation 
of robust frameworks can significantly enhance the efficacy of multifaceted 
approaches. Moreover, the utilization of innovative methodologies necessitates 
a fundamental understanding of inherent limitations. Additionally, the trajectory 
of this discourse demonstrates the profound impact of leveraging paradigmatic shifts.
`.trim();

const detector = new MultiDetector();
const result = await detector.analyze(testText);

console.log("=" + "=".repeat(71));
console.log("TYPESCRIPT FULL DETECTOR TEST");
console.log("=" + "=".repeat(71));
console.log();

// Top 5 detectors
const topDetectors = result.detectors
  .sort((a: any, b: any) => b.ai_score - a.ai_score)
  .slice(0, 5);

console.log("Top 5 Detector Scores:");
for (const d of topDetectors) {
  console.log(`  ${d.detector.padEnd(25)}: ${d.ai_score.toFixed(1)}% AI`);
}
console.log();
console.log(`Overall: ${result.summary.overall_ai_score.toFixed(1)}% AI (${result.summary.overall_verdict})`);
console.log();

// Critical signals for verification
const critical = {
  ai_pattern_score: result.signals.ai_pattern_score,
  shannon_entropy: result.signals.shannon_entropy,
  readability_consistency: result.signals.readability_consistency,
  stylometric_score: result.signals.stylometric_score,
};
console.log("Critical Signals:");
console.log(JSON.stringify(critical, null, 2));
