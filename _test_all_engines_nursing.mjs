// Test all UI-visible engines with AI in Nursing text
// Checks: sentence preservation, paragraph structure, no merging/splitting, output quality

const TEST_TEXT = `Artificial Intelligence in Nursing

Artificial Intelligence (AI) is rapidly transforming the healthcare sector, and nursing is one of the most impacted professions. AI refers to computer systems designed to perform tasks that typically require human intelligence, such as decision-making, pattern recognition, and learning from data. In nursing, AI is being integrated into clinical practice, administration, education, and patient care to enhance efficiency, accuracy, and outcomes. As healthcare systems face increasing pressure from growing populations, chronic diseases, and workforce shortages, AI offers innovative solutions that can support nurses in delivering high-quality care.

One of the most significant contributions of AI in nursing is in clinical decision support. AI-powered systems can analyze vast amounts of patient data, including medical histories, lab results, and real-time vital signs, to assist nurses in making informed decisions. These systems help identify early warning signs of patient deterioration, predict potential complications, and recommend appropriate interventions. For example, predictive analytics tools can alert nurses to patients at risk of sepsis or cardiac arrest, enabling timely intervention and improving survival rates. This reduces the burden on nurses and enhances patient safety by minimizing human error.

AI also plays a crucial role in improving patient monitoring and care delivery. Wearable devices and smart monitoring systems collect continuous health data, which AI algorithms analyze to detect abnormalities. Nurses can remotely monitor patients, especially those with chronic conditions, without requiring constant physical presence. This is particularly beneficial in home-based care and telehealth services, where nurses can provide support and guidance from a distance. Additionally, robotic technologies are being used to assist with routine tasks such as medication delivery, lifting patients, and sanitizing hospital environments. These innovations reduce physical strain on nurses and allow them to focus more on direct patient interaction.`;

const ENGINES = [
  'easy',           // Swift
  'ninja_1',        // Ninja
  'antipangram',    // Pangram
  'humara_v3_3',    // Humarin
  'oxygen',         // Oxygen
  'king',           // King
  'nuru_v2',        // Nuru
  'ghost_pro_wiki', // Ghost
  'ninja_2',        // Beta
  'ninja_5',        // Omega
  'ghost_trial_2',  // Specter
  'phantom',        // Phantom
];

const ENGINE_NAMES = {
  'easy': 'Swift', 'ninja_1': 'Ninja', 'antipangram': 'Pangram',
  'humara_v3_3': 'Humarin', 'oxygen': 'Oxygen', 'king': 'King',
  'nuru_v2': 'Nuru', 'ghost_pro_wiki': 'Ghost', 'ninja_2': 'Beta',
  'ninja_5': 'Omega', 'ghost_trial_2': 'Specter', 'phantom': 'Phantom',
};

// Count sentences in text (split by paragraph, then by sentence-ending punctuation)
function countSentences(text) {
  const paras = text.split(/\n\s*\n/).filter(p => p.trim());
  let total = 0;
  for (const para of paras) {
    const trimmed = para.trim();
    // Skip title-like lines (<=3 words, no ending punctuation)
    const words = trimmed.split(/\s+/);
    if (words.length <= 5 && !/[.!?]$/.test(trimmed)) {
      total += 1; // count as 1 unit
      continue;
    }
    // Split sentences on . ! ? followed by space or end
    const sents = trimmed.match(/[^.!?]*[.!?]+/g) || [trimmed];
    total += sents.length;
  }
  return total;
}

function countParagraphs(text) {
  return text.split(/\n\s*\n/).filter(p => p.trim()).length;
}

// Check for common AI words
function countAIWords(text) {
  const AI_PATTERNS = [
    /\bdelve\b/gi, /\bfurthermore\b/gi, /\bmoreover\b/gi,
    /\bnevertheless\b/gi, /\bnotwithstanding\b/gi, /\bholistic\b/gi,
    /\bpivotal\b/gi, /\bfacilitate\b/gi, /\bleverage\b/gi,
    /\btapestry\b/gi, /\blandscape\b/gi, /\brealm\b/gi,
    /\bin conclusion\b/gi, /\bin summary\b/gi, /\bit is worth noting\b/gi,
    /\bit is important to note\b/gi, /\bplays a crucial role\b/gi,
    /\bplays a vital role\b/gi, /\bplays an important role\b/gi,
    /\bhas become increasingly\b/gi, /\bcannot be overstated\b/gi,
    /\bunderscores\b/gi, /\bcommencing\b/gi, /\bcomprehensive\b/gi,
    /\bmultifaceted\b/gi, /\bmeticulous\b/gi, /\bnuanced\b/gi,
    /\bseamless\b/gi, /\bparadigm\b/gi, /\bsynergy\b/gi,
    /\brobust\b/gi, /\benhance\b/gi, /\boptimize\b/gi,
  ];
  const found = [];
  for (const pat of AI_PATTERNS) {
    const matches = text.match(pat);
    if (matches) found.push(...matches);
  }
  return found;
}

// Check sentence merging/splitting
function checkSentenceStructure(original, output) {
  const origParas = original.split(/\n\s*\n/).filter(p => p.trim());
  const outParas = output.split(/\n\s*\n/).filter(p => p.trim());
  
  const issues = [];
  
  // Check paragraph count
  if (outParas.length !== origParas.length) {
    issues.push(`Para count: ${origParas.length} → ${outParas.length}`);
  }
  
  // Check sentence count per paragraph
  for (let i = 0; i < Math.min(origParas.length, outParas.length); i++) {
    const origTrimmed = origParas[i].trim();
    const outTrimmed = outParas[i].trim();
    
    // Skip title paragraphs
    if (origTrimmed.split(/\s+/).length <= 5 && !/[.!?]$/.test(origTrimmed)) continue;
    
    const origSents = origTrimmed.match(/[^.!?]*[.!?]+/g) || [origTrimmed];
    const outSents = outTrimmed.match(/[^.!?]*[.!?]+/g) || [outTrimmed];
    
    if (origSents.length !== outSents.length) {
      issues.push(`Para ${i+1}: ${origSents.length} sents → ${outSents.length} sents`);
    }
  }
  
  return issues;
}

async function testEngine(engineId) {
  const name = ENGINE_NAMES[engineId];
  const body = {
    text: TEST_TEXT,
    engine: engineId,
    strength: 'medium',
    tone: 'academic',
    strict_meaning: true,
    enable_post_processing: true,
    humanization_rate: 0.8,
  };
  
  // Add engine-specific params
  if (engineId === 'easy') body.easy_sentence_by_sentence = true;
  if (engineId === 'oxygen') {
    body.oxygen_sentence_by_sentence = true;
    body.oxygen_min_change_ratio = 0.3;
    body.oxygen_max_retries = 5;
  }
  
  try {
    const start = Date.now();
    const res = await fetch('http://localhost:3000/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    if (!res.ok) {
      const errText = await res.text();
      return { engineId, name, error: `HTTP ${res.status}: ${errText.substring(0, 200)}`, elapsed };
    }
    
    const data = await res.json();
    const output = data.humanized || data.result || data.humanizedText || '';
    
    if (!output || output.trim().length < 50) {
      return { engineId, name, error: 'Empty or too short output', elapsed };
    }
    
    const origParaCount = countParagraphs(TEST_TEXT);
    const outParaCount = countParagraphs(output);
    const origSentCount = countSentences(TEST_TEXT);
    const outSentCount = countSentences(output);
    const aiWords = countAIWords(output);
    const structIssues = checkSentenceStructure(TEST_TEXT, output);
    
    return {
      engineId, name, elapsed,
      output,
      origParaCount, outParaCount,
      origSentCount, outSentCount,
      aiWords,
      structIssues,
      outputLength: output.length,
    };
  } catch (err) {
    return { engineId, name, error: err.message };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('TESTING ALL ENGINES — AI in Nursing Text');
  console.log('='.repeat(80));
  
  const origParas = countParagraphs(TEST_TEXT);
  const origSents = countSentences(TEST_TEXT);
  console.log(`\nInput: ${origParas} paragraphs, ${origSents} sentence units, ${TEST_TEXT.length} chars\n`);
  
  const results = [];
  
  for (const engineId of ENGINES) {
    const name = ENGINE_NAMES[engineId];
    process.stdout.write(`Testing ${name} (${engineId})... `);
    const result = await testEngine(engineId);
    
    if (result.error) {
      console.log(`❌ ERROR: ${result.error} (${result.elapsed || '?'}s)`);
    } else {
      const paraOk = result.outParaCount === result.origParaCount ? '✅' : '❌';
      const sentOk = result.outSentCount === result.origSentCount ? '✅' : '⚠️';
      const aiOk = result.aiWords.length === 0 ? '✅' : `⚠️(${result.aiWords.length})`;
      console.log(`${result.elapsed}s | Para ${paraOk} ${result.origParaCount}→${result.outParaCount} | Sent ${sentOk} ${result.origSentCount}→${result.outSentCount} | AI ${aiOk} | ${result.outputLength} chars`);
      
      if (result.structIssues.length > 0) {
        console.log(`  Structure issues: ${result.structIssues.join(', ')}`);
      }
      if (result.aiWords.length > 0) {
        console.log(`  AI words found: ${[...new Set(result.aiWords.map(w => w.toLowerCase()))].join(', ')}`);
      }
    }
    
    results.push(result);
  }
  
  // Print full outputs
  console.log('\n' + '='.repeat(80));
  console.log('FULL OUTPUTS');
  console.log('='.repeat(80));
  
  for (const r of results) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`ENGINE: ${r.name} (${r.engineId})`);
    console.log('─'.repeat(60));
    if (r.error) {
      console.log(`ERROR: ${r.error}`);
    } else {
      console.log(r.output);
    }
  }
}

main().catch(console.error);
