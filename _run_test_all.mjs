const TEST = `public health: protecting and improving community well-being

public health is a vital field that focuses on protecting and improving the health of populations rather than individuals. unlike clinical medicine, which treats patients after they become ill, public health emphasizes prevention, health promotion, and the creation of conditions that support well-being. in a world facing challenges such as infectious diseases, lifestyle-related illnesses, and environmental hazards, public health plays a crucial role in ensuring longer, healthier lives for communities.

one of the primary goals of public health is disease prevention. this is achieved through measures such as vaccination programs, sanitation improvements, and health education. for example, immunization campaigns have successfully reduced or eliminated diseases like polio and measles in many parts of the world. by focusing on prevention, public health reduces the burden on healthcare systems and improves overall quality of life. early detection through screening programs also helps identify diseases such as cancer or diabetes at manageable stages, increasing survival rates.

another important aspect of public health is health promotion. this involves encouraging healthy behaviors such as balanced diets, regular exercise, and avoiding harmful habits like smoking or excessive alcohol consumption. public health campaigns use media, schools, and community programs to raise awareness about these issues. for instance, anti-smoking campaigns have significantly reduced tobacco use in many countries, leading to a decrease in related illnesses such as lung cancer and heart disease.

environmental health is also a key component of public health. clean air, safe drinking water, proper waste disposal, and safe housing conditions are essential for preventing disease. pollution and climate change have become major concerns, as they contribute to respiratory illnesses, waterborne diseases, and food insecurity. public health professionals work to develop policies and regulations that protect the environment and reduce health risks.

in addition, public health addresses social determinants of health, which are the conditions in which people are born, grow, live, work, and age. factors such as income, education, employment, and access to healthcare significantly influence health outcomes. for example, people living in poverty are more likely to experience poor health due to limited access to nutritious food, clean water, and medical services. public health initiatives aim to reduce these inequalities and promote health equity for all populations.

public health systems rely on data collection and research to identify health trends and inform decision-making. epidemiology, the study of disease patterns, helps track outbreaks and develop strategies to control them. during global health crises such as pandemics, public health organizations play a critical role in coordinating responses, issuing guidelines, and ensuring the distribution of resources like vaccines and medical supplies.

despite its importance, public health faces several challenges. limited funding, political barriers, misinformation, and emerging health threats can hinder efforts to protect populations. additionally, rapid urbanization and globalization increase the spread of diseases and strain health systems. addressing these challenges requires strong leadership, international cooperation, and community engagement.

in conclusion, public health is essential for building healthier societies by preventing disease, promoting healthy lifestyles, and addressing environmental and social factors that affect health. it is a collective effort that involves governments, organizations, and individuals working together to improve well-being. as global health challenges continue to evolve, the importance of public health will only increase, making it a cornerstone of sustainable development and human progress.`;

const IWC = TEST.split(/\s+/).filter(w => w.length > 0).length;
console.log('Input word count: ' + IWC);
const engines = ['ninja_4','easy','ozone','ninja_1','humara_v3_3','oxygen','king','nuru_v2','ghost_pro_wiki','ninja_3','ninja_2','ninja_5','ghost_trial_2'];
const modes = {ninja_4:'Stealth',easy:'Stealth',ozone:'Stealth',ninja_1:'Stealth',humara_v3_3:'Anti-GPT',oxygen:'Anti-GPT',king:'Anti-GPT',nuru_v2:'Anti-GPT',ghost_pro_wiki:'Anti-GPT',ninja_3:'DeepKill',ninja_2:'DeepKill',ninja_5:'DeepKill',ghost_trial_2:'DeepKill'};

async function test(eng) {
  const start = Date.now();
  try {
    const r = await fetch('http://localhost:3000/api/humanize-stream', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({text: TEST, engine: eng, strength: 'medium', tone: 'academic', strict_meaning: false, enable_post_processing: true})
    });
    const t = await r.text();
    const lines = t.split('\n').filter(l => l.startsWith('data: '));
    let stages = [];
    for (const l of lines) {
      try {
        const e = JSON.parse(l.slice(6));
        if (e.type === 'stage') stages.push(e.stage);
        if (e.type === 'done') {
          const owc = e.humanized.split(/\s+/).filter(w => w.length > 0).length;
          const secs = ((Date.now() - start) / 1000).toFixed(1);
          const ratio = (owc / IWC).toFixed(2);
          const status = owc > IWC * 2 ? 'BLOAT' : owc < IWC * 0.3 ? 'LOW' : 'OK';
          const hasNuru = stages.some(s => /nuru/i.test(s));
          console.log(`[${status}] ${eng.padEnd(16)}${modes[eng].padEnd(10)}${String(owc).padEnd(6)}w (${ratio}x) ${secs}s  nuru:${hasNuru}  stages:${stages.length}`);
          return { eng, owc, ratio: parseFloat(ratio), status, hasNuru, secs };
        }
        if (e.type === 'error') {
          console.log(`[ERR] ${eng}: ${e.error}`);
          return null;
        }
      } catch {}
    }
    console.log(`[NODATA] ${eng}: no done event`);
    return null;
  } catch (e) {
    console.log(`[ERR] ${eng}: ${e.message}`);
    return null;
  }
}

(async () => {
  console.log(`${'Engine'.padEnd(16)}${'Mode'.padEnd(10)}${'Words'.padEnd(8)}Ratio    Time     Nuru    Stages`);
  console.log('-'.repeat(90));
  const results = [];
  for (const e of engines) {
    const r = await test(e);
    if (r) results.push(r);
  }
  console.log('-'.repeat(90));
  const bloats = results.filter(r => r.status === 'BLOAT');
  const lows = results.filter(r => r.status === 'LOW');
  console.log(`Summary: ${results.length} tested, ${bloats.length} bloated, ${lows.length} low`);
  if (bloats.length > 0) console.log('BLOATED: ' + bloats.map(r => `${r.eng}(${r.ratio}x)`).join(', '));
  if (lows.length > 0) console.log('LOW: ' + lows.map(r => `${r.eng}(${r.ratio}x)`).join(', '));
  const nuruEngines = results.filter(r => r.hasNuru);
  console.log('Nuru post-processing active in: ' + (nuruEngines.length > 0 ? nuruEngines.map(r => r.eng).join(', ') : 'NONE'));
  console.log('Done.');
})();
