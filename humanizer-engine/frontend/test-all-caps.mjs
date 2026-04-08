/**
 * Test ALL humanizer engines for capitalization issues.
 * Sends academic text with headings and checks output for mid-sentence caps.
 */

const API = "http://localhost:3000/api/humanize";

const TEST_TEXT = `Government Policy and Commitment

Government policy has been one of the most influential factors in the expansion of secondary education in Kenya. Since independence, successive governments have prioritized education as a central part of national development strategies (Republic of Kenya, 2005). Across the country, this commitment can be seen in the formulation of policies aimed at increasing access, improving equity, and boosting the overall quality of instruction. Such policies have led to the establishment of more secondary schools and a steady rise in student enrolment over the years, Oketch & Rolleston (2007) argues that one major initiative was the introduction of Free Day Secondary Education (FDSE) in 2008, which deeply reduced the cost burden on parents. Students from low-income families who previously could not afford secondary education were given an opportunity to continue their studies. Besides subsidizing tuition, the government has also invested heavily in infrastructure development, including classrooms and laboratories, to support the growing student population.

Demographic Pressures and Population Growth

Kenya has experienced rapid population growth since the mid-20th century. According to the Kenya National Bureau of Statistics (2019), the country population stood at approximately 47.6 million by the time of the last census. This demographic expansion has directly increased the demand for educational services at all levels. As more children reach school-going age, secondary schools face mounting pressure to absorb them, leading to higher enrolment figures.`;

// Common words that should NEVER be capitalized mid-sentence
const BAD_CAPS = [
  "The", "Education", "Training", "Development", "Population", "Growth",
  "Government", "Policy", "Country", "Schools", "Students", "Commitment",
  "Secondary", "Primary", "Instruction", "Infrastructure", "Demand",
  "Community", "Initiative", "Introduction", "Establishment", "Expansion",
  "Over", "Including", "Besides", "According", "Across",
];

// Words that SHOULD stay capitalized (proper nouns, abbreviations, sentence starters)
const MUST_CAPS = ["Kenya", "FDSE", "Republic", "Oketch", "Rolleston"];

function checkCaps(text, engineName) {
  const issues = [];
  const lines = text.split("\n").filter(l => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headings (short lines without ending punctuation)
    const words = trimmed.split(/\s+/);
    if (words.length <= 12 && !/[.!?:;]$/.test(trimmed)) continue;
    // Skip markdown headings
    if (/^#{1,6}\s/.test(trimmed)) continue;

    // Check each word mid-sentence
    for (let i = 1; i < words.length; i++) {
      const w = words[i].replace(/^[^a-zA-Z]*/, "").replace(/[^a-zA-Z]*$/, "");
      if (!w) continue;

      // Skip sentence-initial words (after . ! ? followed by space)
      const prevWord = words[i - 1] || "";
      if (/[.!?]$/.test(prevWord) || /[.!?]["'\)]$/.test(prevWord)) continue;

      // Check if it's a known bad capitalization
      if (BAD_CAPS.includes(w)) {
        // Get context
        const ctx = words.slice(Math.max(0, i - 2), i + 3).join(" ");
        issues.push({ word: w, context: ctx });
      }
    }
  }

  // Check proper nouns are preserved
  const missingProper = [];
  for (const pn of MUST_CAPS) {
    if (!text.includes(pn)) {
      missingProper.push(pn);
    }
  }

  return { issues, missingProper };
}

// Engines that don't need LLM (OpenAI key)
const NON_LLM_ENGINES = [
  "ghost_mini",
  "ghost_mini_v1_2",
  "fast_v11",
  "nuru",
  "humara",
];

// LLM engines (need OPENAI_API_KEY)
const LLM_ENGINES = [
  "ghost_pro",
  "ninja",
  "omega",
];

async function testEngine(engine, timeout = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: TEST_TEXT,
        engine,
        strength: "medium",
        tone: "academic",
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { engine, error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    const output = data.humanized || data.text || data.result || "";

    if (!output || typeof output !== 'string') {
      return { engine, error: `Empty/invalid output. Keys: ${Object.keys(data).join(',')}. Success: ${data.success}` };
    }

    const { issues, missingProper } = checkCaps(output, engine);
    return { engine, output, issues, missingProper };
  } catch (e) {
    clearTimeout(timer);
    return { engine, error: e.message };
  }
}

async function main() {
  console.log("=" .repeat(80));
  console.log("CAPITALIZATION TEST — ALL HUMANIZER ENGINES");
  console.log("=".repeat(80));
  console.log();

  // Test non-LLM first (fast, no API key needed)
  console.log("── Non-LLM Engines ──\n");
  for (const engine of NON_LLM_ENGINES) {
    process.stdout.write(`Testing ${engine}... `);
    const result = await testEngine(engine, 60000);

    if (result.error) {
      console.log(`ERROR: ${result.error}`);
      continue;
    }

    const capsCount = result.issues.length;
    const properMissing = result.missingProper.length;

    if (capsCount === 0 && properMissing === 0) {
      console.log(`PASS (0 cap issues, all proper nouns preserved)`);
    } else {
      console.log(`FAIL`);
      if (capsCount > 0) {
        console.log(`  ❌ ${capsCount} mid-sentence capitalization issues:`);
        for (const iss of result.issues.slice(0, 10)) {
          console.log(`     "${iss.word}" in: ...${iss.context}...`);
        }
        if (capsCount > 10) console.log(`     ... and ${capsCount - 10} more`);
      }
      if (properMissing > 0) {
        console.log(`  ❌ Missing proper nouns: ${result.missingProper.join(", ")}`);
      }
    }
    console.log();
  }

  // Test LLM engines (need OpenAI key, longer timeout)
  console.log("── LLM Engines ──\n");
  for (const engine of LLM_ENGINES) {
    process.stdout.write(`Testing ${engine}... `);
    const result = await testEngine(engine, 180000);

    if (result.error) {
      console.log(`ERROR: ${result.error}`);
      if (result.error.includes("API key") || result.error.includes("401") || result.error.includes("OPENAI")) {
        console.log(`  (Skipping — no OpenAI API key configured)`);
      }
      console.log();
      continue;
    }

    const capsCount = result.issues.length;
    const properMissing = result.missingProper.length;

    if (capsCount === 0 && properMissing === 0) {
      console.log(`PASS (0 cap issues, all proper nouns preserved)`);
    } else {
      console.log(`FAIL`);
      if (capsCount > 0) {
        console.log(`  ❌ ${capsCount} mid-sentence capitalization issues:`);
        for (const iss of result.issues.slice(0, 10)) {
          console.log(`     "${iss.word}" in: ...${iss.context}...`);
        }
        if (capsCount > 10) console.log(`     ... and ${capsCount - 10} more`);
      }
      if (properMissing > 0) {
        console.log(`  ❌ Missing proper nouns: ${result.missingProper.join(", ")}`);
      }
    }
    console.log();
  }

  // Test premium mode with ghost_mini (non-LLM base + premium wrapper)
  console.log("── Premium Mode ──\n");
  process.stdout.write(`Testing premium (ghost_pro base)... `);
  const premResult = await testEngine("ghost_pro", 180000);
  if (premResult.error) {
    console.log(`ERROR: ${premResult.error}`);
  } else {
    const capsCount = premResult.issues.length;
    const properMissing = premResult.missingProper.length;
    if (capsCount === 0 && properMissing === 0) {
      console.log(`PASS`);
    } else {
      console.log(`FAIL (${capsCount} cap issues, ${properMissing} missing proper)`);
      for (const iss of premResult.issues.slice(0, 5)) {
        console.log(`     "${iss.word}" in: ...${iss.context}...`);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("TEST COMPLETE");
  console.log("=".repeat(80));
}

main().catch(console.error);
