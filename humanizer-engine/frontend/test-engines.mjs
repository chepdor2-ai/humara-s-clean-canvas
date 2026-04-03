/**
 * Test all three humanizer engines with sample text containing decimals,
 * percentages, dollar signs, and parenthetical content.
 */

const TEST_TEXT = `The coefficient on the advertising budget variable (CampaignBudget) represents the expected change in sales for each additional dollar spent on advertising, holding other variables constant. For example, if the coefficient is 2.5, this means that for every additional $1 spent on advertising, sales increase by $2.50 on average. This indicates a positive return on advertising investment, suggesting that higher spending is associated with increased sales.`;

const BASE_URL = "http://localhost:3000";

async function testEngine(engine, strength = "light") {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`ENGINE: ${engine.toUpperCase()} | STRENGTH: ${strength}`);
  console.log("=".repeat(70));

  try {
    const res = await fetch(`${BASE_URL}/api/humanize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: TEST_TEXT,
        engine,
        strength,
        tone: "neutral",
        strict_meaning: true,
        no_contractions: true,
        enable_post_processing: true,
      }),
    });

    if (!res.ok) {
      console.error(`HTTP ${res.status}: ${await res.text()}`);
      return;
    }

    const data = await res.json();

    console.log(`\nOUTPUT (${data.word_count} words):`);
    console.log(data.humanized);

    // Check preserved content
    console.log("\n--- PRESERVATION CHECKS ---");
    const checks = [
      { label: "Decimal 2.5", test: /\b2\.5\b/.test(data.humanized) },
      { label: "$1", test: /\$1\b/.test(data.humanized) },
      { label: "$2.50", test: /\$2\.50/.test(data.humanized) },
      { label: "(CampaignBudget)", test: /\(CampaignBudget\)/.test(data.humanized) || /CampaignBudget/.test(data.humanized) },
      { label: "No broken decimals", test: !/\b2\s*\.\s*5\b/.test(data.humanized.replace(/2\.5/g, "")) },
    ];

    for (const c of checks) {
      console.log(`  ${c.test ? "✓" : "✗"} ${c.label}`);
    }

    console.log(`\n--- SCORES ---`);
    console.log(`  Input AI:  ${data.input_detector_results?.overall ?? "?"}%`);
    console.log(`  Output AI: ${data.output_detector_results?.overall ?? "?"}%`);
    console.log(`  Meaning:   ${data.meaning_similarity ?? "?"} (preserved: ${data.meaning_preserved})`);

  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

async function main() {
  console.log("TEST TEXT:");
  console.log(TEST_TEXT);
  console.log(`\nWord count: ${TEST_TEXT.split(/\s+/).length}`);
  
  // Test all three engines on light strength
  await testEngine("ghost_mini", "light");
  await testEngine("ghost_pro", "light");
  await testEngine("ninja", "light");

  console.log("\n\nDONE.");
}

main().catch(console.error);
