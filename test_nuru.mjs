const text = `Creating a Control Chart: Analysis and Findings
Description of Data Collection

For this assignment, I collected quantitative data by tracking the time (in minutes) it took to commute to school each day. Data was recorded at the same time each day over 20 consecutive days, ensuring consistency in measurement conditions. An additional 5 data points were collected afterward to test process stability. This type of data is continuous, making it appropriate for an X-chart (individual control chart).

Summary of Results and Findings

The X-chart was constructed using the collected data, with the centerline representing the average commute time, and the upper and lower control limits (UCL and LCL) calculated using standard SPC formulas. Upon analysis, most data points fell within the control limits, indicating that the process is generally stable and in control. However, one or two points initially fell outside the control limits, suggesting the presence of special cause variation, such as traffic delays or weather conditions. After removing these outliers and recalculating the limits, the process showed improved stability.

Interpretation and Process Control

The process can be considered statistically in control after adjustments because the remaining data points fall within the recalculated limits and show no unusual patterns such as trends or cycles. This indicates that variations in commute time are primarily due to common causes, which are inherent to the system.

Lessons Learned and Application

This assignment demonstrated the importance of distinguishing between common and special cause variation. I learned that control charts are powerful tools for monitoring performance and identifying inconsistencies. This knowledge can be applied in both personal and professional settings, such as improving time management or monitoring business processes. Overall, this assignment was both useful and insightful, as it provided practical experience with SPC tools and reinforced concepts learned in class.`;

try {
  console.log('Sending request...');
  const start = Date.now();
  const resp = await fetch('http://localhost:3001/api/humanize-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, engine: 'nuru_v2' }),
    signal: AbortSignal.timeout(120000),
  });
  console.log('Status:', resp.status);
  const body = await resp.text();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('Response length:', body.length, '| Time:', elapsed + 's');
  const lines = body.split('\n');
  const doneLine = lines.find(l => l.includes('"type":"done"'));
  if (doneLine) {
    const d = JSON.parse(doneLine.replace('data: ', ''));
    console.log('Engine:', d.engine_used);
    console.log('Meaning:', d.meaning_preserved, '(' + d.meaning_similarity + ')');
    console.log('Words:', d.input_word_count, '->', d.word_count);
    console.log('---OUTPUT---');
    console.log(d.humanized);
  } else {
    const errLine = lines.find(l => l.includes('"type":"error"'));
    if (errLine) {
      console.log('ERROR:', errLine);
    } else {
      console.log('No done event found. Last 10 lines:');
      lines.slice(-10).forEach(l => console.log(l));
    }
  }
} catch (e) {
  console.error('Fetch error:', e.message);
  process.exit(1);
}
