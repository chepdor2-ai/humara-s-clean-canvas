// Quick content protection test
const text = `The dataset has 52,446 records and 18,732 customers (35.7%) through exploratory data analysis (EDA). Variables include traffic_source and traffic_channel. According to Kotu and Deshpande (2019), data quality matters. Search engine optimization (SEO) is key. Lemon and Verhoef (2016) highlight customer journeys.`;

try {
  const resp = await fetch('http://localhost:3000/api/humanize-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, engine: 'nuru_v2' }),
    signal: AbortSignal.timeout(120000),
  });
  const body = await resp.text();
  const lines = body.split('\n');
  const doneLine = lines.find(l => l.includes('"type":"done"'));
  if (doneLine) {
    const d = JSON.parse(doneLine.replace('data: ', ''));
    console.log('OUTPUT:', d.humanized);
    console.log('\n--- CHECKS ---');
    const checks = [
      ['52,446', d.humanized.includes('52,446')],
      ['18,732', d.humanized.includes('18,732')],
      ['35.7%', d.humanized.includes('35.7%')],
      ['(EDA)', d.humanized.includes('(EDA)')],
      ['(SEO)', d.humanized.includes('(SEO)')],
      ['(2019)', d.humanized.includes('(2019)')],
      ['(2016)', d.humanized.includes('(2016)')],
      ['traffic_source', d.humanized.includes('traffic_source')],
      ['traffic_channel', d.humanized.includes('traffic_channel')],
      ['No double dots', !d.humanized.includes('..')],
    ];
    let pass = 0;
    for (const [label, ok] of checks) {
      console.log(`  ${ok ? '✅' : '❌'} ${label}`);
      if (ok) pass++;
    }
    console.log(`\n  Score: ${pass}/${checks.length}`);
  } else {
    const errLine = lines.find(l => l.includes('"type":"error"'));
    if (errLine) console.log('ERROR:', errLine);
    else console.log('No done event. Last 3:', lines.slice(-3));
  }
} catch (e) {
  console.error('FETCH ERROR:', e.message);
}
