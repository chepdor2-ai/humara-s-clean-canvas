/**
 * Smoke-test the full pure-TS humanization chain on the user's
 * population-health reference passage, exercising every phase in order:
 *
 *   profilePaper  →  deriveHumanizationPlan  →  sentenceFlowPolish
 *   →  injectHumanImperfections  (final transformation)
 *
 * Verifies:
 *   • Minimum iterations (≥10 for Nuru / AntiPangram / universal).
 *   • Flow-polish no longer mangles naturally-transitional sentences.
 *   • Human imperfections inject em-dash asides, oxford-comma drops,
 *     "in order to" collapse, and connector softening without breaking
 *     grammar, citations, or meaning.
 *
 * Run: npx tsx scripts/test-imperfections.ts
 */

import { profilePaper, summarizeProfile } from "../lib/engine/paper-profiler";
import { deriveHumanizationPlan, summarizePlan } from "../lib/engine/paper-strategy-selector";
import { sentenceFlowPolish } from "../lib/engine/sentence-flow-polish";
import { injectHumanImperfections } from "../lib/engine/human-imperfections";

const POPULATION_HEALTH_TEXT = `Population health, however, is a relatively new term and does not yet have an agreed-upon definition. Whether population health refers to a concept of health or a field of study of health determinants is not clear, and there is debate, often heated, about whether population health and public health are identical or different. In addition, discussions of population health use many terms, such as outcomes, disparities, determinants, and risk factors. These terms are often used imprecisely, particularly when different disciplines, such as medicine, epidemiology, economics, and sociology, are involved. Although these are sometimes merely minor semantic differences, the meanings are often unclear and cause significant miscommunication.

For example, a colleague and I have vigorously debated whether measures like community smoking rates are health outcomes, health determinants, risk factors, or even "intermediate health outcomes." Similarly, the terms inequality, inequity, and disparity are sometimes used interchangeably. In addition, I include a few core methodological and statistical terms, which are used often enough to make clarification helpful to those not doing research.

The purpose of this article is to promote better understanding and communication among different stakeholders and disciplines working in the field of population health. It is not intended to be an extensive dictionary but, instead, a concise compilation of terms and concepts useful to public and private policymakers, beginning graduate students in population/public health and related fields, and scholars from other fields. It also is not intended to be prescriptive or constraining but to stimulate discussion and debate where differences remain.

Language, particularly American English, continues to evolve, both leading and following what becomes contemporary use. This article intends to identify simultaneously both areas of actual or potential agreement and those for which more debate is needed and/or likely. The "struggle" among competing ideas and the words we use to represent them is not at the margin of policy debate.`;

function header(title: string) {
  console.log("\n" + "═".repeat(76));
  console.log(" " + title);
  console.log("═".repeat(76));
}

function section(label: string) {
  console.log("\n── " + label + " ──");
}

function shortSentences(text: string, max = 2): string[] {
  return text.split(/\n\s*\n/).map((p, i) => {
    const sents = p.trim().split(/(?<=[.!?])\s+/).slice(0, max);
    return `    P${i}: ${sents.join(" ")}${sents.length < p.split(/(?<=[.!?])\s+/).length ? " …" : ""}`;
  });
}

function runFor(profileName: "balanced" | "quality" | "undetectability") {
  header(`PROFILE: ${profileName.toUpperCase()}`);

  section("1. PaperProfile");
  const profile = profilePaper(POPULATION_HEALTH_TEXT);
  console.log(summarizeProfile(profile));
  console.log(`  words=${profile.totalWords} | paragraphs=${profile.totalParagraphs} | sentences=${profile.totalSentences}`);
  console.log(`  hasCitations=${profile.hasCitations} | hasFirstPerson=${profile.hasFirstPerson}`);

  section("2. Per-paragraph AI metrics");
  for (const m of profile.paragraphMetrics) {
    console.log(`  P${m.index}: composite=${m.compositeAiScore}  burstCV=${m.burstinessCV.toFixed(2)}  ttr=${m.lexicalDiversity.toFixed(2)}  aiVocab=${(m.aiVocabDensity * 100).toFixed(1)}%  connector=${m.connectorDensity.toFixed(2)}`);
  }

  section("3. HumanizationPlan");
  const plan = deriveHumanizationPlan(profile, profileName, "strong");
  console.log(summarizePlan(plan));
  console.log(`  nuru=${plan.nuruIterations} (≥10 ${plan.nuruIterations >= 10}) | antiPangram=${plan.antiPangramIterations} (≥10 ${plan.antiPangramIterations >= 10}) | universal=${plan.universalCleaningPasses} (≥10 ${plan.universalCleaningPasses >= 10})`);
  console.log(`  polish=${plan.polishIterations} | flow=${plan.flowPolishIterations} | cycles=${plan.maxAdaptiveCycles}`);
  console.log(`  perParagraphIntensity: ${plan.perParagraphIntensity.map((x) => (x * 100).toFixed(0) + "%").join(", ")}`);

  section("4. Flow polish (before)");
  shortSentences(POPULATION_HEALTH_TEXT).forEach((l) => console.log(l));
  const flowed = sentenceFlowPolish(POPULATION_HEALTH_TEXT, { profile, plan });
  section("4. Flow polish (after)");
  shortSentences(flowed.text).forEach((l) => console.log(l));
  console.log(`  iterations=${flowed.iterationsRun}, techniques=[${flowed.techniquesApplied.join(", ")}]`);

  section("5. Human imperfections");
  const imp = injectHumanImperfections(flowed.text, { profile, plan, enableLexical: true });
  console.log(`  injectedCount=${imp.injectedCount} | perParagraph=[${imp.perParagraphCounts.join(", ")}]`);
  section("5. Final output (imperfections applied)");
  shortSentences(imp.text, 3).forEach((l) => console.log(l));
}

console.log("Population-health passage — full pure-TS chain smoke test");
console.log(`Input: ${POPULATION_HEALTH_TEXT.split(/\s+/).length} words, ${POPULATION_HEALTH_TEXT.split(/\n\s*\n/).length} paragraphs\n`);

runFor("balanced");
runFor("quality");
runFor("undetectability");

console.log("\n✓ Done.\n");
