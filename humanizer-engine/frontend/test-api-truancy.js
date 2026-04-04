const http = require('http');

const text = `Null and Alternative Hypotheses Related to Truancy. The hypotheses below are presented in null and alternative pairs related to demographic variables and truancy rates. H\u2080\u2081: There is no statistically significant difference in truancy rates when accounting for student gender. H\u2081\u2081: There is a statistically significant difference in truancy rates when accounting for student gender. H\u2080\u2082: There is no statistically significant relationship between parental involvement and truancy rates. H\u2081\u2082: There is a statistically significant relationship between parental involvement and truancy rates. The mean truancy rate was compared across the analysis sample using a paired-sample t-test (Marshall, n.d.). Each pair of hypotheses was tested to determine whether demographic variables produced a measurable effect on truancy. The data analysis involved examination of mean differences, independent and dependent groups, and determination of statistical significance at the p less than .05 level.`;

const data = JSON.stringify({ text, engine: 'humara', strength: 'medium', tone: 'neutral' });
const options = {
  hostname: 'localhost', port: 3000, path: '/api/humanize', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
};

console.log('Sending truancy paper to humara engine...');
const start = Date.now();
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode, 'Time:', Date.now()-start, 'ms');
    try {
      const result = JSON.parse(body);
      console.log('\n=== HUMANIZED OUTPUT ===');
      console.log(result.humanized || result.error);
      console.log('\n=== SCORES ===');
      if (result.scores) console.log(JSON.stringify(result.scores, null, 2));
    } catch { console.log('Body:', body.substring(0, 1000)); }
  });
});
req.on('error', (e) => console.log('Error:', e.message));
req.setTimeout(120000, () => { console.log('TIMEOUT after 120s'); req.destroy(); });
req.write(data);
req.end();
