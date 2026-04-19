// Quick test - just 2 short paragraphs to verify protection works
const text = `The dataset provided, consisting of 52,446 records from February to June, contains critical variables such as traffic_source, traffic_channel, engagement metrics, and conversion data.

Based on the dataset, approximately 18,732 customers (35.7%) came from organic sources, as identified in the traffic_source column. According to Kotu and Deshpande (2019), data preprocessing is a crucial step in analytics. For example, variations such as "organic," "Organic," and "ORG" must be unified into a single category.`;

try {
  console.log('Quick Nuru V2 protection test...');
  const start = Date.now();
  const resp = await fetch('http://localhost:3000/api/humanize-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, engine: 'nuru_v2' }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await resp.text();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('Time:', elapsed + 's');
  
  const lines = body.split('\n');
  const doneLine = lines.find(l => l.includes('"type":"done"'));
  if (doneLine) {
    const d = JSON.parse(doneLine.replace('data: ', ''));
    console.log('\n===== OUTPUT =====');
    console.log(d.humanized);
    
    const o = d.humanized;
    console.log('\n===== CHECKS =====');
    const checks = [
      ['52,446 preserved', o.includes('52,446')],
      ['18,732 preserved', o.includes('18,732')],
      ['35.7% preserved', o.includes('35.7%')],
      ['traffic_source preserved', o.includes('traffic_source')],
      ['traffic_channel preserved', o.includes('traffic_channel')],
      ['(2019) preserved', o.includes('(2019)')],
      ['"organic" preserved', o.includes('"organic"') || o.includes('\u201Corganic\u201D')],
      ['No double dots', !/\.{2,}/.test(o)],
      ['No repeated words', !/\b(\w{3,})\s+\1\b/i.test(o)],
    ];
    for (const [l, ok] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'} ${l}`);
    console.log(`Score: ${checks.filter(c=>c[1]).length}/${checks.length}`);
  } else {
    console.log('No done event. Last lines:');
    lines.filter(l => l.trim()).slice(-5).forEach(l => console.log(l));
  }
} catch (e) {
  console.error('Error:', e.message);
}
