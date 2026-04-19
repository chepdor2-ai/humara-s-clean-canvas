const text = `Customer Origin and Online Behavior Analysis for Financial Services

Understanding customer origin and online behavior is essential for improving conversion rates and maximizing revenue in financial services. Through exploratory data analysis (EDA), organizations can identify patterns in how customers discover their platforms, interact with services, and ultimately complete transactions. The dataset provided, consisting of 52,446 records from February to June, contains critical variables such as traffic_source, traffic_channel, engagement metrics, and conversion data. These variables allow the company to better understand customer acquisition pathways and optimize digital experiences.

Before conducting analysis, data cleaning is necessary to ensure accuracy and reliability. This process involves handling missing values, removing duplicate records, and standardizing inconsistent entries. For example, variations such as "organic," "Organic," and "ORG" must be unified into a single category. Proper cleaning ensures that the analysis reflects true customer behavior rather than distorted patterns. According to Kotu and Deshpande (2019), data preprocessing is a crucial step in analytics because poor data quality can significantly affect the validity of results.

EDA reveals the importance of understanding where customers originate. Based on the dataset, approximately 18,732 customers (35.7%) came from organic sources, as identified in the traffic_source column. Organic traffic refers to users who reach the website through unpaid methods such as search engines. This finding highlights that a large proportion of customers actively search for financial services, making organic channels a key driver of engagement and revenue.

Understanding organic customer acquisition is particularly valuable because it reflects high user intent and trust. Customers who arrive through organic search are typically more motivated and more likely to convert, as they are already seeking relevant financial solutions. Chaffey and Ellis-Chadwick (2019) emphasize that organic traffic is cost-effective and sustainable, as it does not rely on continuous advertising expenditure. Additionally, analyzing organic behavior enables companies to refine search engine optimization (SEO) strategies, improving visibility and long-term competitiveness.

Further analysis of organic customers through the traffic_channel column indicates that there are four primary organic channels: organic search, organic social, referral, and direct navigation. Among these, organic search accounts for the largest share of traffic, followed by referral and organic social channels. Direct navigation also plays a role when users return to the site after initial discovery.

In response to the Marketing Director's request, the company should focus primarily on organic search and referral channels. Organic search captures high-intent users actively looking for financial services, resulting in higher conversion rates. Investing in SEO strategies such as keyword optimization, technical improvements, and content development will strengthen this channel. Referral traffic is also important because it originates from trusted external sources, enhancing credibility and attracting qualified leads. Lemon and Verhoef (2016) highlight that understanding customer journeys across channels improves personalization and overall customer experience, which ultimately drives revenue growth.

In conclusion, analyzing customer origin and online behavior through EDA provides actionable insights for improving marketing effectiveness. Organic traffic plays a significant role in attracting high-quality customers, particularly through search and referral channels. By leveraging clean data and focusing on high-performing channels, financial service providers can enhance user experience, increase engagement, and achieve sustainable revenue growth.`;

try {
  console.log('Testing Nuru V2 with academic financial services text...');
  console.log('Input length:', text.length, 'chars,', text.split(/\s+/).length, 'words');
  console.log('');
  const start = Date.now();
  const resp = await fetch('http://localhost:3000/api/humanize-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, engine: 'nuru_v2' }),
    signal: AbortSignal.timeout(120000),
  });
  console.log('Status:', resp.status);
  const body = await resp.text();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  
  const lines = body.split('\n');
  const doneLine = lines.find(l => l.includes('"type":"done"'));
  if (doneLine) {
    const d = JSON.parse(doneLine.replace('data: ', ''));
    console.log('Engine:', d.engine_used);
    console.log('Meaning:', d.meaning_preserved, '(' + d.meaning_similarity + ')');
    console.log('Words:', d.input_word_count, '->', d.word_count);
    console.log('Time:', elapsed + 's');
    console.log('\n===== OUTPUT =====\n');
    console.log(d.humanized);

    // ── Quality checks ──
    console.log('\n===== QUALITY CHECKS =====\n');
    const output = d.humanized;

    // Check protected content
    const checks = [
      ['52,446', output.includes('52,446')],
      ['18,732', output.includes('18,732')],
      ['35.7%', output.includes('35.7%')],
      ['(EDA)', output.includes('(EDA)')],
      ['(SEO)', output.includes('(SEO)')],
      ['(2019)', output.includes('(2019)')],
      ['(2016)', output.includes('(2016)')],
      ['traffic_source', output.includes('traffic_source')],
      ['traffic_channel', output.includes('traffic_channel')],
      ['"organic"', output.includes('"organic"') || output.includes('\u201Corganic\u201D')],
      ['No double dots', !/\.{2,}/.test(output)],
      ['No repeated words', !/\b(\w+)\s+\1\b/i.test(output)],
      ['No "arrangement"', !output.toLowerCase().includes('arrangement')],
      ['No "critique"', !output.toLowerCase().includes('critique')],
      ['No "confronting"', !output.toLowerCase().includes('confronting')],
    ];

    let passed = 0;
    for (const [label, ok] of checks) {
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
      if (ok) passed++;
    }
    console.log(`\n  Score: ${passed}/${checks.length}`);
  } else {
    const errLine = lines.find(l => l.includes('"type":"error"'));
    if (errLine) {
      console.log('ERROR:', errLine);
    } else {
      console.log('No done event found. Last 15 lines:');
      lines.slice(-15).forEach(l => console.log(l));
    }
  }
} catch (e) {
  console.error('Fetch error:', e.message);
}
