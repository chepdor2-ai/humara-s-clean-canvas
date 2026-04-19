// Test Nuru V2 with the academic text about Customer Origin and Online Behavior
const text = `Customer Origin and Online Behavior Analysis for Financial Services

Understanding customer origin and online behavior is essential for improving conversion rates and maximizing revenue in financial services. Through exploratory data analysis (EDA), organizations can identify patterns in how customers discover their platforms, interact with services, and ultimately complete transactions. The dataset provided, consisting of 52,446 records from February to June, contains critical variables such as traffic_source, traffic_channel, engagement metrics, and conversion data. These variables allow the company to better understand customer acquisition pathways and optimize digital experiences.

Before conducting analysis, data cleaning is necessary to ensure accuracy and reliability. This process involves handling missing values, removing duplicate records, and standardizing inconsistent entries. For example, variations such as "organic," "Organic," and "ORG" must be unified into a single category. Proper cleaning ensures that the analysis reflects true customer behavior rather than distorted patterns. According to Kotu and Deshpande (2019), data preprocessing is a crucial step in analytics because poor data quality can significantly affect the validity of results.

EDA reveals the importance of understanding where customers originate. Based on the dataset, approximately 18,732 customers (35.7%) came from organic sources, as identified in the traffic_source column. Organic traffic refers to users who reach the website through unpaid methods such as search engines. This finding highlights that a large proportion of customers actively search for financial services, making organic channels a key driver of engagement and revenue.

Understanding organic customer acquisition is particularly valuable because it reflects high user intent and trust. Customers who arrive through organic search are typically more motivated and more likely to convert, as they are already seeking relevant financial solutions. Chaffey and Ellis-Chadwick (2019) emphasize that organic traffic is cost-effective and sustainable, as it does not rely on continuous advertising expenditure. Additionally, analyzing organic behavior enables companies to refine search engine optimization (SEO) strategies, improving visibility and long-term competitiveness.

Further analysis of organic customers through the traffic_channel column indicates that there are four primary organic channels: organic search, organic social, referral, and direct navigation. Among these, organic search accounts for the largest share of traffic, followed by referral and organic social channels. Direct navigation also plays a role when users return to the site after initial discovery.

In response to the Marketing Director's request, the company should focus primarily on organic search and referral channels. Organic search captures high-intent users actively looking for financial services, resulting in higher conversion rates. Investing in SEO strategies such as keyword optimization, technical improvements, and content development will strengthen this channel. Referral traffic is also important because it originates from trusted external sources, enhancing credibility and attracting qualified leads. Lemon and Verhoef (2016) highlight that understanding customer journeys across channels improves personalization and overall customer experience, which ultimately drives revenue growth.

In conclusion, analyzing customer origin and online behavior through EDA provides actionable insights for improving marketing effectiveness. Organic traffic plays a significant role in attracting high-quality customers, particularly through search and referral channels. By leveraging clean data and focusing on high-performing channels, financial service providers can enhance user experience, increase engagement, and achieve sustainable revenue growth.`;

const PORT = 3000;
const ENGINES = ['nuru_v2'];

for (const engine of ENGINES) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`ENGINE: ${engine}`);
  console.log('='.repeat(70));
  
  try {
    const start = Date.now();
    const resp = await fetch(`http://localhost:${PORT}/api/humanize-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, engine }),
      signal: AbortSignal.timeout(300000), // 5 min timeout
    });
    
    const body = await resp.text();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    const lines = body.split('\n');
    const doneLine = lines.find(l => l.includes('"type":"done"'));
    
    if (doneLine) {
      const d = JSON.parse(doneLine.replace('data: ', ''));
      console.log(`Time: ${elapsed}s | Words: ${d.input_word_count} -> ${d.word_count}`);
      console.log(`Meaning: ${d.meaning_preserved} (${d.meaning_similarity})`);
      console.log(`\n--- OUTPUT ---\n`);
      console.log(d.humanized);
      
      // === VALIDATION CHECKS ===
      console.log(`\n--- VALIDATION ---`);
      const h = d.humanized;
      
      // Check figures preserved
      const checks = [
        ['52,446', h.includes('52,446')],
        ['18,732', h.includes('18,732')],
        ['35.7%', h.includes('35.7%')],
        ['(EDA)', h.includes('(EDA)')],
        ['(SEO)', h.includes('(SEO)')],
        ['(2019)', h.includes('(2019)')],
        ['(2016)', h.includes('(2016)')],
        ['traffic_source', h.includes('traffic_source')],
        ['traffic_channel', h.includes('traffic_channel')],
        ['"organic"', h.includes('"organic"') || h.includes('\u201Corganic\u201D')],
        ['No double dots', !h.includes('..')],
        ['No repeated words', !/\b(\w{3,})\s+\1\b/i.test(h)],
        ['Kotu and Deshpande', h.includes('Kotu') && h.includes('Deshpande')],
        ['Chaffey and Ellis-Chadwick', h.includes('Chaffey') && h.includes('Ellis-Chadwick')],
        ['Lemon and Verhoef', h.includes('Lemon') && h.includes('Verhoef')],
      ];
      
      let pass = 0, fail = 0;
      for (const [label, ok] of checks) {
        console.log(`  ${ok ? '✅' : '❌'} ${label}`);
        if (ok) pass++; else fail++;
      }
      console.log(`\n  Score: ${pass}/${pass + fail} checks passed`);
      
    } else {
      const errLine = lines.find(l => l.includes('"type":"error"'));
      if (errLine) console.log('ERROR:', errLine);
      else {
        console.log(`No done event (${elapsed}s). Last 5 lines:`);
        lines.slice(-5).forEach(l => console.log(l));
      }
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}

console.log('\nDone.');
