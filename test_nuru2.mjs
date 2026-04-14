import http from 'http';

const text = `Creating a Control Chart: Analysis and Findings
Description of Data Collection

For this assignment, I collected quantitative data by tracking the time (in minutes) it took to commute to school each day. Data was recorded at the same time each day over 20 consecutive days, ensuring consistency in measurement conditions. An additional 5 data points were collected afterward to test process stability. This type of data is continuous, making it appropriate for an X-chart (individual control chart).

Summary of Results and Findings

The X-chart was constructed using the collected data, with the centerline representing the average commute time, and the upper and lower control limits (UCL and LCL) calculated using standard SPC formulas. Upon analysis, most data points fell within the control limits, indicating that the process is generally stable and in control. However, one or two points initially fell outside the control limits, suggesting the presence of special cause variation, such as traffic delays or weather conditions. After removing these outliers and recalculating the limits, the process showed improved stability.

Interpretation and Process Control

The process can be considered statistically in control after adjustments because the remaining data points fall within the recalculated limits and show no unusual patterns such as trends or cycles. This indicates that variations in commute time are primarily due to common causes, which are inherent to the system.

Lessons Learned and Application

This assignment demonstrated the importance of distinguishing between common and special cause variation. I learned that control charts are powerful tools for monitoring performance and identifying inconsistencies. This knowledge can be applied in both personal and professional settings, such as improving time management or monitoring business processes. Overall, this assignment was both useful and insightful, as it provided practical experience with SPC tools and reinforced concepts learned in class.`;

const body = JSON.stringify({ text, engine: 'nuru_v2' });
const start = Date.now();
process.stdout.write('Sending request...\n');

const req = http.request('http://localhost:3001/api/humanize-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk.toString();
    const lines = chunk.toString().split('\n');
    for (const l of lines) {
      if (l.includes('"type":"stage"')) {
        const m = l.match(/"stage":"([^"]+)"/);
        if (m) process.stdout.write(`  Stage: ${m[1]} (${((Date.now()-start)/1000).toFixed(1)}s)\n`);
      }
    }
  });
  res.on('end', () => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const lines = data.split('\n');
    const doneLine = lines.find(l => l.includes('"type":"done"'));
    if (doneLine) {
      const d = JSON.parse(doneLine.replace('data: ', ''));
      process.stdout.write(`\nEngine: ${d.engine_used} | Time: ${elapsed}s\n`);
      process.stdout.write(`Meaning: ${d.meaning_preserved} (${d.meaning_similarity})\n`);
      process.stdout.write(`Words: ${d.input_word_count} -> ${d.word_count}\n`);
      process.stdout.write('---OUTPUT---\n');
      process.stdout.write(d.humanized + '\n');
    } else {
      const errLine = lines.find(l => l.includes('"type":"error"'));
      if (errLine) process.stdout.write('ERROR: ' + errLine + '\n');
      else {
        process.stdout.write('No done event. Last 10 lines:\n');
        lines.slice(-10).forEach(l => process.stdout.write(l + '\n'));
      }
    }
  });
});
req.write(body);
req.end();
