/**
 * Debug test for AntiPangram and Nuru engines
 * Run: npx tsx tests/test-engines-debug.ts
 */

const TEST_TEXT = `1. Introduction
Contemporary vernacular speech is full of hesitation regarding objective moral truth, and as moral relativism tends to make questions of ethics in law, politics and popular policy answers to subjective preference. Such a change undermines the integrity of the policymaking process by depriving it of any common morality. In answer to this, Natural Law presents a strong alternative in terms of basing morality on universal principles based on human nature and rationality and insists that there are objective standards that can govern individuals and institutions. This degradation can be seen in the arguments involving euthanasia, economic justice, and religious freedom, which often do not have a common yardstick upon which to agree. However, modern thought still testifies to the applicability of Natural Law, and Crowe (2019) associates law with moral principles, Murphy (2001) with practical rationality, and Finnis (2011) with the basis of morality in basic human goods. In this respect, the work of John Lawrence Hill After the Natural Law is an attempt at reinstating the classical way of thinking the world as a basis of contemporary moral and political thought. This paper has maintained that Hill does manage to revive the Natural Law as a plausible construct though his narrative needs more in-depth interaction with the Reformed traditions and current policy realities.
2. Overview of Hill's Argument
The After the Natural Law by John Lawrence Hill is an attempt to prove the fact that the classical tradition of Natural Law is still necessary in the contemporary moral reasoning. He maintains that modern cynicism about objective morality has resulted in the creation of an ethical environment that is inconsistent, which requires the revival of values that are based on human nature and available to humans through reason. At the center of his argument is that moral truths are objective and they are based on the intrinsic human goods which include life, knowledge, and social harmony. This is in keeping with the description of basic goods given by Finnis (2011) and the defense of objective morality given by George (1999) as rational and universal as opposed to subjective. Hill also highlights practical rationality, which Murphy (2001) also believes is based on rational thought on the flourishing of human beings. His model is also an indication of the New Natural Law school, which emphasizes the use of reason and basic goods in moral thinking (Lee and Angier, 2019). By this synthesis, Hill offers Natural Law as a rational and acceptable support of legal and political order.
3. Evaluation of the Book Critically.
One of the strongest arguments that Hill succeeds in defending Natural Law is its philosophical rigor in the form of the objective morality in a relativistic cultural environment. He bases ethics on human nature and rationality to provide a convincing alternative that fits the modern Natural Law research (Crowe, 2019). His discussion of ideas resembling those of Finnis (2011) and Murphy (2001) adds more strength to the work showing that the Natural Law theory remains relevant nowadays. There are weaknesses associated with the book, however. It does not focus much on the Reformed philosophers like Calvin and Luther who played a critical role in shaping covenantal governance in the political analysis. Also, the method by Hill is very abstract and it has little applicability with regard to real-life policy problems. This is especially objectionable considering what moral psychology has to say, which lays stress on the significance of how people actually deliberate over ethical choices (Tiberius, 2023). Consequently, philosophically compelling, the work would be more involved with empirical and policy-related aspects of ethics.`;

function computeWordChange(original: string, humanized: string): number {
  const origWords = original.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 0);
  const humWords = humanized.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 0);
  if (origWords.length === 0) return 100;
  let changed = 0;
  const maxLen = Math.max(origWords.length, humWords.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= origWords.length || i >= humWords.length || origWords[i] !== humWords[i]) changed++;
  }
  return Math.round((changed / maxLen) * 100);
}

function splitToSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
}

async function main() {
  console.log("=== ENGINE DEBUG TEST ===\n");
  console.log("Input text length:", TEST_TEXT.length, "chars");
  console.log("Input word count:", TEST_TEXT.split(/\s+/).length, "words\n");

  // Test AntiPangram
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TESTING: AntiPangram Engine");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  try {
    const { antiPangramHumanize } = await import('../frontend/lib/engine/antipangram/index');
    const apgResult = antiPangramHumanize(TEST_TEXT, { strength: 'strong', tone: 'academic' });
    
    console.log("AntiPangram Output:");
    console.log("─".repeat(60));
    console.log(apgResult.humanized);
    console.log("─".repeat(60));
    console.log(`\n📊 OVERALL CHANGE RATIO: ${(apgResult.changeRatio * 100).toFixed(1)}%`);
    console.log(`📊 Forensic score: ${apgResult.forensicBefore.overallAiScore} → ${apgResult.forensicAfter.overallAiScore}`);
    console.log(`📊 Transforms applied: ${apgResult.transformsApplied.length}`);
    
    // Per-sentence change analysis
    const origSents = splitToSentences(TEST_TEXT);
    const humSents = splitToSentences(apgResult.humanized);
    console.log(`\n📋 PER-SENTENCE CHANGE (AntiPangram):`);
    const minLen = Math.min(origSents.length, humSents.length);
    let belowTarget = 0;
    for (let i = 0; i < minLen; i++) {
      const pct = computeWordChange(origSents[i], humSents[i]);
      const status = pct >= 40 ? '✅' : '❌';
      if (pct < 40) belowTarget++;
      console.log(`  ${status} Sent ${i+1}: ${pct}% change`);
    }
    console.log(`  → ${belowTarget}/${minLen} sentences below 40% target`);
    console.log();
  } catch (err) {
    console.error("AntiPangram FAILED:", err);
  }

  // Test Nuru
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TESTING: Nuru Engine");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  try {
    const { nuruHumanize } = await import('../frontend/lib/engine/nuru-humanizer');
    const nuruResult = nuruHumanize(TEST_TEXT, 'strong', 'academic');
    
    console.log("Nuru Output:");
    console.log("─".repeat(60));
    console.log(nuruResult);
    console.log("─".repeat(60));

    // Overall change ratio
    const overallChange = computeWordChange(TEST_TEXT, nuruResult);
    console.log(`\n📊 OVERALL CHANGE RATIO: ${overallChange}%`);

    // Per-sentence change analysis
    const origSents = splitToSentences(TEST_TEXT);
    const humSents = splitToSentences(nuruResult);
    console.log(`\n📋 PER-SENTENCE CHANGE (Nuru):`);
    const minLen = Math.min(origSents.length, humSents.length);
    let belowTarget = 0;
    for (let i = 0; i < minLen; i++) {
      const pct = computeWordChange(origSents[i], humSents[i]);
      const status = pct >= 70 ? '✅' : '❌';
      if (pct < 70) belowTarget++;
      console.log(`  ${status} Sent ${i+1}: ${pct}% change | "${humSents[i].substring(0, 60)}..."`);
    }
    console.log(`  → ${belowTarget}/${minLen} sentences below 70% target`);
    console.log();
  } catch (err) {
    console.error("Nuru FAILED:", err);
  }
}

main().catch(console.error);
