// Comprehensive test: multiple paper types × multiple engines
// Tests structural post-processor v3 consistency across diverse content

const PAPERS = {
  community_health: `Community health nurses play a vital role in promoting wellness and preventing disease within populations. Their essential work spans across diverse settings, from schools and clinics to homes and community centers. Community health nurses give advice on preventive steps like isolation, quarantine, and using personal protective gear, during epidemics or pandemics. Being closely tied to the community enables a quick and effective response to new health dangers. A key part of their job involves tackling the social factors that affect health. Things like poverty, education, jobs, and access to healthcare services have a big impact on health outcomes. Community health nurses support those in need by helping them get the essential healthcare services and resources they require. By caring for underserved communities and pushing for fair access to healthcare; efforts are made to lessen health gaps. This all-including approach understands that preventing disease involves more than just medical treatments and must tackle the wider problems impacting health. Community health nurses play a part in shaping policies and advocating for important health issues. In addition, community health nurses shape public health policies and programs aimed at preventing diseases, with their expertise and background. Working together with government bodies, non-profits, and local leaders, they play a part in creating plans that boost the health of the population. Valuable insights allow shape interventions that fit the culture and respond to what the community needs. Community health nurses are key in preventing disease by providing education, offering immunizations, detecting issues early, managing environmental health, and advocating for the community. The efforts of community health nurses reach far beyond taking care of individual patients as they work to tackle the wider factors that sway health in communities. Through encouraging healthy habits, stopping diseases from spreading. Community health nurses play a key part in bettering public health outcomes; pushing for fair healthcare access. The work they do is key to creating healthier communities and lowering the total impact of disease.`,

  climate_change: `Climate change represents one of the most significant challenges facing humanity in the twenty-first century. The increasing concentration of greenhouse gases in the atmosphere has led to unprecedented changes in global weather patterns. Rising temperatures have resulted in the melting of polar ice caps, rising sea levels, and more frequent extreme weather events. These changes pose serious threats to biodiversity, food security, and human settlements worldwide. The scientific consensus is clear that human activities, particularly the burning of fossil fuels and deforestation, are the primary drivers of climate change. It is essential that governments, businesses, and individuals take immediate action to reduce carbon emissions and transition to renewable energy sources. Various international agreements, such as the Paris Agreement, have established frameworks for global cooperation on climate action. However, progress has been slower than needed, and many countries continue to struggle with balancing economic growth and environmental sustainability. The transition to a low-carbon economy presents both challenges and opportunities for innovation and job creation. Investing in clean energy technologies, improving energy efficiency, and developing sustainable transportation systems are all critical components of an effective climate strategy. Furthermore, adaptation measures are necessary to protect vulnerable communities from the impacts of climate change that are already occurring. Community-based approaches to climate resilience have shown promise in many developing countries. Education and awareness play important roles in building public support for climate action. The consequences of inaction are severe and will disproportionately affect the most vulnerable populations around the world.`,

  artificial_intelligence: `Artificial intelligence has emerged as a transformative technology that is reshaping virtually every aspect of modern society. From healthcare and education to finance and transportation, AI systems are being deployed to enhance efficiency, improve decision-making, and solve complex problems. Machine learning algorithms can analyze vast amounts of data to identify patterns and make predictions with remarkable accuracy. Natural language processing enables machines to understand and generate human language, facilitating applications such as virtual assistants and automated translation services. However, the rapid advancement of AI technology also raises significant ethical concerns. Issues of bias in AI systems, privacy implications of data collection, and the potential displacement of workers by automation are all areas that require careful consideration. It is crucial that the development and deployment of AI technologies are guided by ethical principles and robust regulatory frameworks. Transparency in AI decision-making processes is essential for building public trust and ensuring accountability. The integration of AI in healthcare has shown particularly promising results, with applications in disease diagnosis, drug discovery, and personalized treatment plans. Educational institutions are adapting their curricula to prepare students for an AI-driven world, emphasizing skills such as critical thinking, creativity, and adaptability. The economic impact of AI is substantial, with projections suggesting that AI could contribute trillions of dollars to the global economy in the coming decades. As AI continues to evolve, collaboration between technologists, policymakers, and civil society will be essential in ensuring that its benefits are widely shared and its risks are effectively managed.`,
};

const BASE = 'http://localhost:3000';
const ENGINES = ['ghost_mini', 'humara', 'fast_v11', 'ninja'];

const HUMAN_POSITIVE = new Set([
  'perplexity','burstiness','vocabulary_richness','shannon_entropy',
  'readability_consistency','stylometric_score','starter_diversity',
  'word_length_variance','spectral_flatness','lexical_density_var','dependency_depth'
]);

// Detectors real users care about
const REAL_DETECTORS = ['GPTZero','Turnitin','Originality.ai','ZeroGPT','Surfer SEO AI','Copyleaks','Winston AI'];

async function detect(text) {
  const r = await fetch(`${BASE}/api/detect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  return r.json();
}

async function humanize(text, engine) {
  const r = await fetch(`${BASE}/api/humanize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, engine, strength: 'medium', tone: 'neutral', strict_meaning: true, enable_post_processing: true }) });
  return r.json();
}

async function main() {
  const allResults = [];

  for (const [paperName, paperText] of Object.entries(PAPERS)) {
    console.log(`\n${'═'.repeat(90)}`);
    console.log(`PAPER: ${paperName.toUpperCase()} (${paperText.split(/\s+/).length} words)`);
    console.log('═'.repeat(90));

    const baseline = await detect(paperText);
    console.log(`BASELINE: AI=${baseline.summary.overall_ai_score.toFixed(1)}% | ${baseline.summary.overall_verdict} | Flagged: ${baseline.summary.detectors_flagged_ai}/22`);

    // Show which real detectors flag baseline
    const baselineFlagged = baseline.detectors
      .filter(d => REAL_DETECTORS.some(r => d.detector.includes(r.split(' ')[0])) && d.ai_score >= 50)
      .map(d => `${d.detector}(${d.ai_score.toFixed(0)}%)`)
      .join(', ');
    console.log(`Real detectors flagging AI: ${baselineFlagged || 'none'}`);

    for (const engine of ENGINES) {
      console.log(`\n--- ${engine.toUpperCase()} ---`);
      const t0 = Date.now();
      const hResult = await humanize(paperText, engine);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      if (!hResult.humanized) { console.log(`ERROR: ${hResult.error}`); continue; }

      const det = await detect(hResult.humanized);
      const aiScore = det.summary.overall_ai_score;
      const flagged = det.summary.detectors_flagged_ai;
      const verdict = det.summary.overall_verdict;

      // Which real detectors still flag
      const realFlagged = det.detectors
        .filter(d => REAL_DETECTORS.some(r => d.detector.includes(r.split(' ')[0])) && d.ai_score >= 50)
        .sort((a,b) => b.ai_score - a.ai_score);

      console.log(`AI: ${aiScore.toFixed(1)}% | ${verdict} | Flagged: ${flagged}/22 | ${elapsed}s | Words: ${hResult.humanized.split(/\s+/).length}`);

      if (realFlagged.length > 0) {
        console.log(`  ❌ REAL DETECTORS STILL FLAGGING: ${realFlagged.map(d => `${d.detector}(${d.ai_score.toFixed(0)}%)`).join(', ')}`);
      } else {
        console.log(`  ✅ ALL REAL DETECTORS PASS`);
      }

      // Key signal check
      const signals = det.signals;
      const badSignals = [];
      for (const [name, val] of Object.entries(signals)) {
        const isHumanPos = HUMAN_POSITIVE.has(name);
        if (isHumanPos && val < 45) badSignals.push(`${name}=${val.toFixed(0)}(low,want>50)`);
        if (!isHumanPos && val > 55) badSignals.push(`${name}=${val.toFixed(0)}(high,want<50)`);
      }
      if (badSignals.length > 0) {
        console.log(`  ⚠ Weak signals: ${badSignals.join(', ')}`);
      }

      // Show first 200 chars of output
      console.log(`  Preview: ${hResult.humanized.substring(0, 200).replace(/\n/g, ' ')}...`);

      allResults.push({ paper: paperName, engine, aiScore, flagged, verdict, realFlagged: realFlagged.length, elapsed });
    }
  }

  // ── FINAL SUMMARY ──
  console.log(`\n${'═'.repeat(90)}`);
  console.log('CROSS-PAPER CONSISTENCY SUMMARY');
  console.log('═'.repeat(90));
  console.log(`${'Paper'.padEnd(25)} ${'Engine'.padEnd(14)} ${'AI%'.padStart(6)} ${'Flagged'.padStart(8)} ${'Real Det'.padStart(9)} Verdict`);
  console.log('─'.repeat(90));

  for (const r of allResults) {
    const realStatus = r.realFlagged === 0 ? '✅ PASS' : `❌ ${r.realFlagged} fail`;
    console.log(`${r.paper.padEnd(25)} ${r.engine.padEnd(14)} ${r.aiScore.toFixed(1).padStart(6)} ${(r.flagged+'/22').padStart(8)} ${realStatus.padStart(9)} ${r.verdict}`);
  }

  // Per-engine average
  console.log('\n--- ENGINE AVERAGES ---');
  for (const engine of ENGINES) {
    const engineResults = allResults.filter(r => r.engine === engine);
    const avgAI = engineResults.reduce((s, r) => s + r.aiScore, 0) / engineResults.length;
    const avgFlagged = engineResults.reduce((s, r) => s + r.flagged, 0) / engineResults.length;
    const allPass = engineResults.every(r => r.realFlagged === 0);
    console.log(`${engine.padEnd(14)} Avg AI: ${avgAI.toFixed(1)}% | Avg Flagged: ${avgFlagged.toFixed(1)}/22 | Real Detectors: ${allPass ? '✅ ALL PASS' : '❌ SOME FAIL'}`);
  }
}

main().catch(console.error);
