/**
 * Smoke-test the Paper Profiler + Strategy Selector + Flow Polish
 * on the user-provided sociology research-methods passage.
 *
 * Run with:
 *   npx tsx scripts/test-profiler.mts
 */

import { profilePaper, summarizeProfile } from "../lib/engine/paper-profiler";
import { deriveHumanizationPlan, summarizePlan } from "../lib/engine/paper-strategy-selector";
import { sentenceFlowPolish } from "../lib/engine/sentence-flow-polish";

const SOCIOLOGY_TEXT = `Sociologists use different approaches to study social life, but both quantitative and qualitative research follow systematic processes that aim to produce reliable knowledge. Quantitative research emphasizes measurement, objectivity, and statistical analysis, while qualitative research focuses on understanding meanings, experiences, and social relationships through descriptive data. Although their methods differ, both approaches contribute to a fuller understanding of human behavior and social structures.

In quantitative research, scholars typically follow a deductive process. This begins with selecting and defining a research problem, often inspired by social issues, theoretical debates, or gaps in existing knowledge. Researchers then review prior studies to build a foundation for their work and avoid repeating earlier mistakes. A hypothesis is often developed to predict relationships between variables, identifying independent variables as causes and dependent variables as outcomes (Babbie, 2021). Afterward, a research design is created, including identifying the unit of analysis and choosing methods such as surveys or secondary data analysis.

Data collection and analysis require careful sampling to ensure that findings represent the broader population. Researchers must also consider validity and reliability, ensuring that tools measure what they are intended to measure and produce consistent results. Once analyzed, findings are interpreted, conclusions are drawn, and limitations are acknowledged before results are shared for replication and further study. This structured process strengthens scientific credibility and allows sociology to examine patterns across groups rather than relying on individual cases.

Qualitative research, by contrast, often uses an inductive approach. Instead of testing hypotheses, researchers gather detailed observations, interviews, or texts to identify patterns and develop interpretations. This method provides deeper insight into lived experiences and social meanings that cannot easily be reduced to numbers. Together, quantitative and qualitative methods complement one another, combining statistical trends with rich contextual understanding to explain complex social realities.`;

function header(title: string) {
  console.log("\n" + "═".repeat(72));
  console.log(" " + title);
  console.log("═".repeat(72));
}

function section(label: string) {
  console.log("\n── " + label + " ──");
}

function runFor(profileName: "balanced" | "quality" | "undetectability") {
  header(`Profile: ${profileName.toUpperCase()}`);

  section("1. PaperProfile");
  const profile = profilePaper(SOCIOLOGY_TEXT);
  console.log(summarizeProfile(profile));
  console.log(`  words=${profile.totalWords}, paragraphs=${profile.totalParagraphs}, sentences=${profile.totalSentences}`);
  console.log(`  hasCitations=${profile.hasCitations}, hasHeadings=${profile.hasHeadings}, hasFirstPerson=${profile.hasFirstPerson}`);
  console.log(`  sections=${profile.sections.map((s) => `${s.kind}[${s.startParagraph}-${s.endParagraph}]`).join(", ")}`);

  section("2. Per-paragraph composite AI scores");
  for (const m of profile.paragraphMetrics) {
    console.log(
      `  P${m.index} (${m.sectionKind}): composite=${m.compositeAiScore} ` +
      `burstCV=${m.burstinessCV.toFixed(2)} ttr=${m.lexicalDiversity.toFixed(2)} ` +
      `aiVocab=${(m.aiVocabDensity * 100).toFixed(1)}% ` +
      `hedge=${(m.hedgingDensity * 100).toFixed(0)}% r3=${m.ruleOfThreeCount} ` +
      `connector=${m.connectorDensity.toFixed(2)}`,
    );
  }

  section("3. HumanizationPlan (strategy)");
  const plan = deriveHumanizationPlan(profile, profileName, "strong");
  console.log(summarizePlan(plan));
  console.log(`  reasoning: ${plan.reasoning.join(" | ")}`);
  console.log(`  nuru=${plan.nuruIterations} (≥10 ✓ ${plan.nuruIterations >= 10}) | antiPangram=${plan.antiPangramIterations} (≥10 ✓ ${plan.antiPangramIterations >= 10}) | universal=${plan.universalCleaningPasses} (≥10 ✓ ${plan.universalCleaningPasses >= 10})`);
  console.log(`  polish=${plan.polishIterations} | flow=${plan.flowPolishIterations} | adaptiveCycles=${plan.maxAdaptiveCycles}`);
  console.log(`  sections (${plan.sectionStrategies.length}): ${plan.sectionStrategies.map((s) => `${s.kind}@${(s.intensity * 100).toFixed(0)}%`).join(", ")}`);
  console.log(`  perParagraphIntensity: ${plan.perParagraphIntensity.map((i) => (i * 100).toFixed(0) + "%").join(", ")}`);

  section("4. Flow polish output (sentence-by-sentence)");
  const polished = sentenceFlowPolish(SOCIOLOGY_TEXT, { profile, plan });
  console.log(`  iterations=${polished.iterationsRun}, techniques=${polished.techniquesApplied.join(", ")}`);
  console.log("  — BEFORE —");
  SOCIOLOGY_TEXT.split(/\n\s*\n/).forEach((p, i) => {
    console.log(`    P${i}: ${p.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")} ...`);
  });
  console.log("  — AFTER —");
  polished.text.split(/\n\s*\n/).forEach((p, i) => {
    console.log(`    P${i}: ${p.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")} ...`);
  });
}

console.log("Running Paper Profiler + Strategy Selector + Flow Polish smoke test");
console.log("Input: sociology research-methods passage (4 paragraphs, ~450 words)");
runFor("balanced");
runFor("quality");
runFor("undetectability");
console.log("\n✓ Test complete.\n");
