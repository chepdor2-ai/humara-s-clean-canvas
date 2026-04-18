/**
 * AntiPangram Engine — Validation Test Suite
 * =============================================
 * Tests the engine against known 100% AI texts and validates
 * they are transformed into forensic-profile-passing outputs.
 *
 * Run: npx tsx lib/engine/antipangram/test-antipangram.ts
 */

import { antiPangramHumanize, antiPangramSimple } from './index';
import { buildForensicProfile } from './pangram-forensics';

// ═══════════════════════════════════════════════════════════════════
// TEST TEXTS — These score 100% AI on Pangram
// ═══════════════════════════════════════════════════════════════════

const TEST_CASES: Array<{ name: string; text: string }> = [
  {
    name: 'CBT Psychology (3 paragraphs — original 100% AI)',
    text: `Cognitive Behavioral Therapy (CBT) is a structured and goal-oriented form of psychotherapy that focuses on the relationship between thoughts, emotions, and behaviors. It helps individuals recognize negative or unhelpful thinking patterns and replace them with healthier and more positive ways of thinking. CBT is widely used in the treatment of mental health conditions such as anxiety, depression, phobias, stress, and addiction because it addresses how thoughts influence feelings and actions. By understanding these connections, individuals can learn how to respond to challenges in a more balanced and productive way.

One of the major strengths of CBT is its practical and action-oriented approach. Unlike some therapies that focus mainly on past experiences, CBT concentrates more on present problems and finding effective solutions. It equips individuals with useful coping strategies and problem-solving skills that can be applied in everyday life. Through guided sessions, people learn how to manage stress, control emotional reactions, and improve decision-making, which contributes to better emotional regulation and mental well-being.

Research has shown that CBT significantly improves both functioning and quality of life for many people facing psychological difficulties. It is based on the idea that many emotional problems are caused by faulty ways of thinking and learned patterns of negative behavior. CBT teaches that these patterns can be changed, allowing individuals to develop healthier coping mechanisms and stronger self-control. As a result, people become more confident in managing their mental health and maintaining long-term emotional stability.`,
  },
  {
    name: 'Climate Change Essay',
    text: `Climate change represents one of the most significant challenges facing humanity in the modern era. The increasing concentration of greenhouse gases in the atmosphere, primarily driven by human activities such as burning fossil fuels and deforestation, has led to a steady rise in global temperatures. This phenomenon, commonly referred to as global warming, has far-reaching implications for ecosystems, weather patterns, and human societies across the globe. Understanding the causes and consequences of climate change is essential for developing effective strategies to mitigate its impact.

The environmental consequences of climate change are both diverse and severe. Rising temperatures have contributed to the melting of polar ice caps and glaciers, leading to significant increases in sea levels. This, in turn, threatens coastal communities and low-lying islands with flooding and erosion. Additionally, changing weather patterns have resulted in more frequent and intense extreme weather events, including hurricanes, droughts, and wildfires. These changes pose serious risks to biodiversity, agriculture, and water resources, further exacerbating the vulnerability of ecosystems and human populations.

Addressing climate change requires a coordinated global effort involving governments, businesses, and individuals. International agreements such as the Paris Agreement aim to limit global warming to well below 2 degrees Celsius above pre-industrial levels. Transitioning to renewable energy sources, improving energy efficiency, and promoting sustainable practices are key strategies for reducing carbon emissions. Furthermore, investing in climate adaptation measures and supporting vulnerable communities are essential components of a comprehensive response to this global crisis.`,
  },
  {
    name: 'Technology and Education',
    text: `Technology has fundamentally transformed the landscape of modern education, creating unprecedented opportunities for learning and knowledge sharing. The integration of digital tools into educational settings has revolutionized how students access information, interact with content, and collaborate with peers and instructors. From online learning platforms to interactive simulations, technology has expanded the boundaries of traditional classroom learning and made education more accessible to diverse populations around the world.

One of the most significant benefits of educational technology is its ability to personalize the learning experience. Adaptive learning systems use algorithms to analyze student performance and adjust content difficulty, pacing, and style to meet individual needs. This personalized approach allows students to learn at their own pace, revisit challenging concepts, and receive immediate feedback on their progress. Additionally, technology enables the creation of immersive learning environments through virtual reality and augmented reality, which can enhance engagement and deepen understanding of complex subjects.

However, the widespread adoption of technology in education also raises important concerns that must be carefully addressed. Issues related to digital equity, screen time, data privacy, and the potential for technology to replace meaningful human interaction are significant challenges facing educators and policymakers. Ensuring that all students have equal access to technology and the internet is crucial for preventing the widening of existing educational disparities. Furthermore, developing digital literacy skills and promoting responsible technology use are essential for preparing students to navigate an increasingly digital world.`,
  },
  {
    name: 'Short Academic Paragraph',
    text: `Artificial intelligence has emerged as a transformative force across multiple industries, fundamentally reshaping how organizations operate and deliver value. The integration of machine learning algorithms and natural language processing capabilities has enabled businesses to automate routine tasks, analyze vast datasets, and make data-driven decisions with unprecedented speed and accuracy. As a result, companies that effectively leverage AI technologies gain significant competitive advantages in their respective markets.`,
  },
  {
    name: 'Healthcare Topic',
    text: `The importance of mental health awareness has grown significantly in recent years, driven by increasing recognition of the profound impact that psychological well-being has on overall quality of life. Mental health conditions such as depression, anxiety, and post-traumatic stress disorder affect millions of people worldwide, yet stigma and lack of access to care continue to serve as major barriers to treatment. Promoting mental health literacy and creating supportive environments are essential steps toward addressing these challenges and ensuring that individuals receive the help they need.`,
  },
];

// ═══════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════

function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   AntiPangram Humanizer — Validation Test Suite           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TEST: ${testCase.name}`);
    console.log('═'.repeat(60));

    // Analyze original
    const originalForensic = buildForensicProfile(testCase.text);
    console.log(`\n📊 ORIGINAL FORENSIC PROFILE:`);
    console.log(`   AI Score:           ${originalForensic.overallAiScore}`);
    console.log(`   Burstiness CV:      ${originalForensic.sentenceLengthVariance.toFixed(3)}`);
    console.log(`   Connector Density:  ${originalForensic.connectorDensity.toFixed(3)}`);
    console.log(`   Parallel Score:     ${originalForensic.parallelStructureScore.toFixed(3)}`);
    console.log(`   Nominalization:     ${originalForensic.nominalizationDensity.toFixed(3)}`);
    console.log(`   Register Uniform:   ${originalForensic.registerConsistency.toFixed(3)}`);
    console.log(`   Starter Repetition: ${originalForensic.starterRepetition.toFixed(3)}`);
    console.log(`   Perplexity:         ${originalForensic.perplexityScore.toFixed(3)}`);

    // Run engine
    const result = antiPangramHumanize(testCase.text, { strength: 'strong' });

    console.log(`\n📊 HUMANIZED FORENSIC PROFILE:`);
    console.log(`   AI Score:           ${result.forensicAfter.overallAiScore} (was ${result.forensicBefore.overallAiScore})`);
    console.log(`   Burstiness CV:      ${result.forensicAfter.sentenceLengthVariance.toFixed(3)} (was ${result.forensicBefore.sentenceLengthVariance.toFixed(3)})`);
    console.log(`   Connector Density:  ${result.forensicAfter.connectorDensity.toFixed(3)} (was ${result.forensicBefore.connectorDensity.toFixed(3)})`);
    console.log(`   Parallel Score:     ${result.forensicAfter.parallelStructureScore.toFixed(3)} (was ${result.forensicBefore.parallelStructureScore.toFixed(3)})`);
    console.log(`   Starter Repetition: ${result.forensicAfter.starterRepetition.toFixed(3)} (was ${result.forensicBefore.starterRepetition.toFixed(3)})`);
    console.log(`   Change Ratio:       ${(result.changeRatio * 100).toFixed(1)}%`);
    console.log(`   Transforms:         ${result.transformsApplied.join(', ')}`);

    // Print humanized text
    console.log(`\n📝 HUMANIZED TEXT:`);
    console.log('─'.repeat(60));
    console.log(result.humanized);
    console.log('─'.repeat(60));

    // Quality checks
    const checks = [
      { name: 'AI Score ≤ 25', pass: result.forensicAfter.overallAiScore <= 25 },
      { name: 'Burstiness CV ≥ 0.30', pass: result.forensicAfter.sentenceLengthVariance >= 0.30 },
      { name: 'Connector Density ≤ 0.20', pass: result.forensicAfter.connectorDensity <= 0.20 },
      { name: 'Change Ratio ≥ 3%', pass: result.changeRatio >= 0.03 },
      { name: 'Not empty', pass: result.humanized.trim().length > 0 },
      { name: 'Preserves length (±40%)', pass: Math.abs(result.humanized.length - testCase.text.length) / testCase.text.length < 0.40 },
    ];

    console.log('\n✅ QUALITY CHECKS:');
    for (const check of checks) {
      const icon = check.pass ? '✅' : '❌';
      console.log(`   ${icon} ${check.name}`);
      if (check.pass) passed++;
      else failed++;
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
