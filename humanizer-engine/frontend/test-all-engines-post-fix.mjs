// Test all humanizer engines after pipeline fixes
const TEST_TEXT = `1.1 Background and Context

Globalization has significantly increased the interdependence of economies, making international trade a central driver of economic growth and development. In this context, export diversification has emerged as a critical strategy for enhancing economic resilience and stability. Diversification allows countries to reduce dependence on a narrow range of export commodities, thereby minimizing exposure to external shocks such as price volatility and demand fluctuations. Empirical studies suggest that economies with more diversified export structures tend to experience more stable growth trajectories and improved economic performance (Agosin et al., 2012; Hesse, 2009). As a result, export diversification is widely recognized as a key component of sustainable economic development.

Beyond stability, export diversification plays a crucial role in promoting productivity growth and structural transformation. By expanding into new products and markets, countries can enhance technological capabilities, increase value addition, and improve competitiveness in the global economy. Diversified export structures also contribute to income stability by spreading risk across multiple sectors. The distinction between export concentration and diversification is therefore central to understanding development outcomes, as highly concentrated economies remain vulnerable to sector-specific shocks. Research indicates that diversification follows a non-linear pattern, where countries initially diversify before specializing at higher income levels, highlighting its importance in early development stages (Cadot et al., 2011; Giri et al., 2019).

However, many developing countries, particularly those rich in natural resources, face significant challenges in achieving export diversification. Resource-dependent economies often rely heavily on commodities such as oil, which can create structural vulnerabilities. The concept of the resource curse explains how abundant natural resources can paradoxically hinder economic development by weakening institutions, encouraging rent-seeking behavior, and reducing incentives for diversification (Sachs & Warner, 2001; Auty, 2001; Ross, 2015). This overreliance on resource exports can limit the growth of other productive sectors, thereby reinforcing economic concentration.

Closely related to the resource curse is the phenomenon of Dutch disease, which describes how resource booms can negatively affect other sectors of the economy. When a country experiences a surge in resource revenues, the resulting appreciation of the real exchange rate makes non-resource exports less competitive in international markets. This leads to a decline in manufacturing and agricultural sectors, further entrenching export concentration. The theoretical foundations of Dutch disease highlight the structural imbalances that arise from resource dependence, ultimately constraining diversification efforts (Corden & Neary, 1982; van der Ploeg, 2011).

In Sub-Saharan Africa, the challenge of export concentration is particularly pronounced, as many countries rely heavily on a limited number of primary commodities. Despite various policy efforts aimed at promoting diversification, progress has been uneven across the region. Structural constraints such as weak infrastructure, limited industrial capacity, and institutional challenges continue to hinder diversification efforts. Reports by the African Development Bank emphasize that many African economies remain vulnerable due to their dependence on commodity exports, underscoring the need for more effective diversification strategies (African Development Bank, 2003; Giri et al., 2019).

South Sudan represents a compelling case of extreme resource dependence within this broader regional context. Since gaining independence in 2011, the country has relied almost entirely on oil exports, which account for a substantial share of government revenue and foreign exchange earnings. This heavy dependence has exposed the economy to significant risks, including oil price volatility, fiscal instability, and underdevelopment of non-oil sectors. As a result, South Sudan has struggled to achieve meaningful economic diversification, limiting its ability to sustain long-term growth. Recent studies highlight the urgent need for diversification policies to reduce reliance on oil and promote broader economic development (World Bank, 2015; Anyak, 2024).`;

// Non-LLM engines to test (LLM engines ghost_pro/ninja/nuru/omega need API keys)
const ENGINES = ['ghost_mini', 'ghost_mini_v1_2', 'fast_v11', 'humara', 'humara_v1_3'];
const API = 'http://localhost:3000/api/humanize';

const CHECKS = {
  // Proper nouns that must survive
  properNouns: [
    'African Development Bank', 'South Sudan', 'Sub-Saharan Africa',
    'Dutch disease', 'World Bank',
  ],
  // Citations that must survive
  citations: [
    'Agosin et al.', 'Hesse, 2009', 'Cadot et al.', 'Giri et al.',
    'Sachs & Warner', 'Auty, 2001', 'Ross, 2015', 'Corden & Neary',
    'van der Ploeg', 'Anyak, 2024', 'World Bank, 2015',
  ],
  // Garbled patterns that should NOT appear
  badPatterns: [
    /is\s+\w+lyed\b/i,           // "is stronglyed"
    /is led by\s*\./,             // "is led by ."
    /\bgrowth Bank\b/,            // bad synonym for Development Bank
    /\bshift Bank\b/,             // bad synonym
    /\bchange Bank\b/,            // bad synonym
    /\bAfrican change\b/i,        // bad synonym
    /\bAfrican growth\b/i,        // bad synonym
    /\bpress that\b/i,            // bad "emphasize" → "press"
    /\bmaking and agricultural\b/i, // "manufacturing" → "making"
    /\bsetup,\s+limited\b/i,     // "infrastructure" → "setup"
  ],
};

const inputWordCount = TEST_TEXT.trim().split(/\s+/).length;

async function testEngine(engine) {
  const start = Date.now();
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: TEST_TEXT, engine, strength: 'medium' }),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const data = await res.json();

    if (!data.success) {
      return { engine, status: 'FAIL', error: data.error || 'Unknown error', elapsed };
    }

    const output = data.humanized;
    const outputWordCount = output.trim().split(/\s+/).length;
    const wordDiff = outputWordCount - inputWordCount;
    const wordDiffPct = ((wordDiff / inputWordCount) * 100).toFixed(1);

    // Check proper nouns
    const missingNouns = CHECKS.properNouns.filter(n => !output.includes(n));

    // Check citations (case-insensitive)
    const missingCitations = CHECKS.citations.filter(c => !output.toLowerCase().includes(c.toLowerCase()));

    // Check garbled patterns
    const foundBad = CHECKS.badPatterns
      .map(rx => { const m = output.match(rx); return m ? m[0] : null; })
      .filter(Boolean);

    // Check paragraph count preserved
    const inputParas = TEST_TEXT.split(/\n\s*\n/).filter(p => p.trim()).length;
    const outputParas = output.split(/\n\s*\n/).filter(p => p.trim()).length;

    // Check last paragraph exists and mentions South Sudan
    const lastPara = output.split(/\n\s*\n/).filter(p => p.trim()).pop() || '';
    const lastParaHasSouthSudan = /South Sudan/i.test(lastPara);
    const lastParaHasAnyak = /Anyak/i.test(lastPara);

    // Check for contractions
    const contractions = output.match(/\b\w+'(?:t|re|ve|ll|d|s|m)\b/g) || [];

    // Overall quality assessment
    const issues = [];
    if (missingNouns.length > 0) issues.push(`Missing proper nouns: ${missingNouns.join(', ')}`);
    if (missingCitations.length > 0) issues.push(`Missing citations: ${missingCitations.join(', ')}`);
    if (foundBad.length > 0) issues.push(`Garbled text: "${foundBad.join('", "')}"`);
    if (wordDiff < -60) issues.push(`Heavy truncation: ${wordDiff} words (${wordDiffPct}%)`);
    if (outputParas < inputParas - 1) issues.push(`Lost paragraphs: ${inputParas} → ${outputParas}`);
    if (!lastParaHasSouthSudan) issues.push(`Last paragraph missing "South Sudan"`);
    if (!lastParaHasAnyak) issues.push(`Last paragraph missing "Anyak" citation`);
    if (contractions.length > 0) issues.push(`Contractions found: ${contractions.slice(0, 5).join(', ')}`);

    const status = issues.length === 0 ? 'PASS ✅' : issues.length <= 2 ? 'WARN ⚠️' : 'FAIL ❌';

    return {
      engine, status, elapsed,
      inputWords: inputWordCount,
      outputWords: outputWordCount,
      wordDiff: `${wordDiff >= 0 ? '+' : ''}${wordDiff} (${wordDiffPct}%)`,
      paragraphs: `${inputParas} → ${outputParas}`,
      lastParaOk: lastParaHasSouthSudan && lastParaHasAnyak ? 'YES' : 'NO',
      meaning: data.meaning_similarity,
      aiScore: `${data.input_detector_results?.overall}% → ${data.output_detector_results?.overall}%`,
      issues: issues.length > 0 ? issues : ['None'],
      outputSnippet: output.slice(-300),
    };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    return { engine, status: 'ERROR', error: err.message, elapsed };
  }
}

async function main() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  HUMANIZER ENGINE TEST — ${new Date().toISOString()}`);
  console.log(`  Input: ${inputWordCount} words, 6 paragraphs + heading`);
  console.log(`${'═'.repeat(80)}\n`);

  for (const engine of ENGINES) {
    console.log(`⏳ Testing ${engine}...`);
    const result = await testEngine(engine);

    console.log(`\n┌─ ${result.engine} — ${result.status} (${result.elapsed}s)`);
    if (result.error) {
      console.log(`│  Error: ${result.error}`);
    } else {
      console.log(`│  Words: ${result.inputWords} → ${result.outputWords} [${result.wordDiff}]`);
      console.log(`│  Paragraphs: ${result.paragraphs}`);
      console.log(`│  Last para intact: ${result.lastParaOk}`);
      console.log(`│  Meaning similarity: ${result.meaning}`);
      console.log(`│  AI score: ${result.aiScore}`);
      if (result.issues[0] !== 'None') {
        console.log(`│  Issues:`);
        result.issues.forEach(i => console.log(`│    ⚠ ${i}`));
      }
      console.log(`│  Last 300 chars: ...${result.outputSnippet}`);
    }
    console.log(`└${'─'.repeat(70)}\n`);
  }
}

main().catch(console.error);
