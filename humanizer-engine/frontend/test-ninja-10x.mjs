// Test Ninja (LLM Humanizer) 10 times with the healthcare text
const text = `One policy that is particularly important is healthcare access, especially policies aimed at expanding affordable healthcare services to underserved populations. Policies aimed at improving healthcare access are vital for creating a more equitable society, where everyone has an equal opportunity to lead a healthy life. These policies not only affect those directly served by the healthcare system, but they have far-reaching effects on communities, economies, and overall societal well-being.

A key aspect of healthcare policies is their potential to improve efficiency within the healthcare system. Through collaboration, standardized approaches, and ongoing assessments, healthcare policies can optimize resource allocation while maintaining the quality of care. Efficiency in healthcare reduces waiting times, ensures optimal resource usage, and enhances patient outcomes, leading to a healthier population. The introduction of electronic health records and data-driven approaches exemplify how policies can modernize healthcare delivery, ensuring both efficiency and accessibility.

Healthcare policies also play a pivotal role in addressing disparities in healthcare access. Vulnerable populations, including racial and ethnic minorities, low-income communities, and rural areas, face significant barriers to receiving quality healthcare. Implementing inclusive policies, such as expanding insurance coverage and increasing funding for community health centers, can bridge these gaps. By ensuring equitable healthcare access, governments can foster social cohesion and reduce the long-term economic burden of untreated illnesses.`;

const API_URL = "http://localhost:3000/api/humanize";
const results = [];

async function runTest(runNumber) {
  const start = Date.now();
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        engine: "ninja",
        strength: "medium",
      }),
    });
    const data = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const output = data.humanized || data.humanizedText;
    if (output) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`RUN ${runNumber} (${elapsed}s) | AI: ${data.output_detector_results?.overall ?? "?"}% | Meaning: ${data.meaning_similarity?.toFixed(2) ?? "?"} | Words: ${data.word_count ?? "?"}`);
      console.log(`${"=".repeat(80)}`);
      console.log(output);
      
      // Check for known corruption patterns
      const issues = [];
      if (/\b(\w+)\s+\1\b/i.test(output)) {
        const matches = output.match(/\b(\w+)\s+\1\b/gi);
        issues.push(`Repeated words: ${matches?.join(", ")}`);
      }
      if (/\bquislingism\b/i.test(output)) issues.push("quislingism found");
      if (/\bto entry\b/i.test(output)) issues.push("'to entry' found");
      if (/\bto availability\b/i.test(output)) issues.push("'to availability' found");
      if (/\bhow much\b.*\bmatters\b/i.test(output)) issues.push("'how much...matters' found");
      if (/\bHealthcare care\b/.test(output)) issues.push("'Healthcare care' found");
      if (issues.length > 0) {
        console.log(`\n⚠️  ISSUES: ${issues.join("; ")}`);
      } else {
        console.log(`\n✅ No corruption detected`);
      }
      results.push({ run: runNumber, ai: data.output_detector_results?.overall, meaning: data.meaning_similarity, words: data.word_count, issues });
    } else {
      console.log(`\nRUN ${runNumber} FAILED (${elapsed}s): ${data.error || "no output field"}`);
      results.push({ run: runNumber, ai: null, meaning: null, words: null, issues: ["FAILED"] });
    }
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nRUN ${runNumber} ERROR (${elapsed}s): ${err.message}`);
    results.push({ run: runNumber, ai: null, meaning: null, words: null, issues: ["ERROR: " + err.message] });
  }
}

async function main() {
  console.log("Testing Ninja engine 10 times with healthcare text...\n");
  for (let i = 1; i <= 10; i++) {
    console.log(`\nStarting run ${i}/10...`);
    await runTest(i);
  }
  console.log(`\n${"=".repeat(80)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(80)}`);
  const ais = results.filter(r => r.ai != null).map(r => r.ai);
  const means = results.filter(r => r.meaning != null).map(r => r.meaning);
  const words = results.filter(r => r.words != null).map(r => r.words);
  const issueCount = results.filter(r => r.issues.length > 0).length;
  console.log(`AI scores: ${ais.map(a => a.toFixed(1)).join(", ")} | Avg: ${(ais.reduce((a,b)=>a+b,0)/ais.length).toFixed(1)}%`);
  console.log(`Meaning:   ${means.map(m => m.toFixed(2)).join(", ")} | Avg: ${(means.reduce((a,b)=>a+b,0)/means.length).toFixed(2)}`);
  console.log(`Words:     ${words.join(", ")} | Input: 214`);
  console.log(`Issues:    ${issueCount}/${results.length} runs had issues`);
  for (const r of results) {
    if (r.issues.length > 0) console.log(`  Run ${r.run}: ${r.issues.join("; ")}`);
  }
}

main();
