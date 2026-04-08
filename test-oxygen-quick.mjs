const text = `International trade has long been recognized as a key driver of economic growth and development. Through the exchange of goods and services across borders, countries can specialize in producing what they are most efficient at, thereby increasing overall productivity. Trade enables access to a wider variety of products, fosters competition, and encourages innovation, all of which contribute to higher standards of living. Additionally, trade can facilitate technology transfer from developed to developing nations, further promoting economic progress.

The relationship between trade openness and economic growth has been widely studied. Research indicates that countries with higher levels of trade openness tend to experience faster economic growth. For example, economies such as South Korea, China, and Singapore have demonstrated remarkable growth, largely attributed to their strategic embrace of international trade and export-oriented policies. These countries invested heavily in infrastructure and education, creating a conducive environment for trade-driven economic expansion. Their success underscores the potential benefits of trade for developing economies seeking to achieve sustained growth (Huchet et al., 2018).

In the context of Sub-Saharan Africa, trade plays a particularly significant role in economic development. Many countries in the region rely heavily on the export of primary commodities, such as oil, minerals, and agricultural products, which constitute a substantial portion of their GDP. However, the reliance on commodity exports also makes these economies vulnerable to global price fluctuations. Diversifying export bases and increasing participation in global value chains are essential strategies for these nations to achieve more stable and sustainable economic growth (World Bank, 2020; Nguyen, 2024).

South Sudan, one of the newest nations in the world, presents a unique case in the study of trade and economic development. Since gaining independence in 2011, South Sudan has faced enormous economic challenges, including political instability, inadequate infrastructure, and limited human capital. The country's economy is overwhelmingly dependent on oil exports, which account for nearly 60% of its GDP and over 90% of government revenue. This over-reliance on a single commodity has left the economy highly susceptible to external shocks, particularly fluctuations in global oil prices (IMF, 2023).

Despite these challenges, international trade remains a vital component of South Sudan's economic strategy. The government has recognized the need to diversify the economy and expand trade relationships to foster sustainable development. Efforts to improve trade infrastructure, such as roads and border facilities, are underway, although progress has been slow due to ongoing conflicts and limited financial resources. South Sudan's membership in regional trade organizations, such as the East African Community (EAC), offers potential avenues for expanding trade and attracting foreign investment (African Development Bank, 2022).

Furthermore, the development of trade policies that support both import substitution and export promotion could significantly impact South Sudan's economic trajectory. Investing in sectors such as agriculture and manufacturing, where the country has untapped potential, can create jobs and reduce dependency on oil revenues. Education and skills development are also crucial for building a workforce capable of supporting a diversified economy. By strategically integrating into the global trading system and leveraging regional partnerships, South Sudan can work towards achieving long-term economic growth and stability, ultimately improving the livelihoods of its citizens (World Bank, 2015; Anyak, 2024).`;

const start = Date.now();
fetch('http://localhost:3000/api/humanize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, engine: 'oxygen', mode: 'quality' })
}).then(r => r.json()).then(data => {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const output = data.humanized || data.humanizedText || data.result || data.text || '';
  const inWords = text.split(/\s+/).length;
  const outWords = output.split(/\s+/).length;
  const pctChange = ((outWords - inWords) / inWords * 100).toFixed(1);
  const inParas = text.split(/\n\n+/).length;
  const outParas = output.split(/\n\n+/).length;
  
  console.log('=== OXYGEN ENGINE TEST ===');
  console.log('Time:', elapsed + 's');
  console.log('Input words:', inWords, '| Output words:', outWords, '| Change:', pctChange + '%');
  console.log('Input paragraphs:', inParas, '| Output paragraphs:', outParas);
  console.log('');
  
  // Check last paragraph
  const lastPara = output.split(/\n\n+/).pop();
  const hasAnyak = /Anyak/i.test(lastPara);
  const hasSouthSudan = /South Sudan/i.test(lastPara);
  const hasWorldBank2015 = /World Bank.*2015|2015.*World Bank/i.test(lastPara);
  console.log('Last paragraph checks:');
  console.log('  Contains Anyak citation:', hasAnyak);
  console.log('  Contains South Sudan:', hasSouthSudan);
  console.log('  Contains World Bank 2015:', hasWorldBank2015);
  console.log('  Last para word count:', lastPara.split(/\s+/).length);
  console.log('');
  
  // Check for garbled patterns
  const garbled = output.match(/is\s+\w+ed\s+by\s+\./g) || [];
  const brokenEnds = output.match(/\.\s*\./g) || [];
  console.log('Garbled patterns:', garbled.length);
  console.log('Broken sentence endings:', brokenEnds.length);
  console.log('');
  
  // Print all paragraphs numbered
  const paras = output.split(/\n\n+/);
  console.log('=== FULL OUTPUT ===');
  paras.forEach((p, i) => {
    console.log(`\n--- Paragraph ${i+1} (${p.split(/\s+/).length} words) ---`);
    console.log(p);
  });
}).catch(e => console.error('Error:', e.message));
