const text = `CyberAcctg: Risk Management Capstone – Unit 11 Discussion Post

Cybersecurity risk management has become an essential component of modern accounting as organizations increasingly rely on digital accounting information systems (AIS) to process and store financial data. These systems manage sensitive information such as payroll records, tax filings, and financial statements. As digital transformation expands across organizations, accounting systems have become attractive targets for cybercriminals. Cybersecurity threats such as phishing, data breaches, and system intrusions can compromise the confidentiality, integrity, and availability of financial information. These risks may lead to financial loss, reputational damage, and regulatory consequences for organizations.

One of the most common cyber threats affecting accounting environments is phishing and social engineering. Phishing attacks exploit human vulnerabilities by manipulating individuals into revealing sensitive information such as login credentials or financial details. Research shows that phishing remains a major cybersecurity threat across sectors because attackers use deceptive emails and messages to trick employees into granting unauthorized system access (Wang & Lutchkus, 2023). Because accounting professionals frequently process payments and access confidential financial records, they are particularly vulnerable targets for such attacks.

Effective cyber risk management requires organizations to implement strong security controls and governance mechanisms within accounting information systems. These measures include conducting regular risk assessments, implementing access controls, encrypting financial data, and providing cybersecurity training for employees. Studies also indicate that strengthening accounting information security controls significantly improves the effectiveness of internal controls and protects financial data from cyber threats (Nhan, 2025). Additionally, integrating cybersecurity practices into accounting frameworks enhances transparency, improves stakeholder trust, and strengthens organizational resilience in the digital environment.

Overall, cybersecurity risk management is no longer solely an IT responsibility but also an important governance issue for accounting professionals. By adopting proactive security strategies and strengthening internal controls, organizations can better protect financial information systems and reduce exposure to cyber risks.`;

const API = 'http://localhost:3000/api/humanize';
const engines = ['ninja', 'omega', 'ghost_pro', 'ghost_mini', 'nuru', 'humara', 'humara_v1_3', 'fast_v11', 'undetectable'];
const inputWords = text.split(/\s+/).length;

async function testEngine(engine) {
  try {
    const start = Date.now();
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, engine, strength: 'medium' })
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const d = await r.json();
    if (d.error) {
      console.log(`\n=== ${engine.toUpperCase()} === ERROR: ${d.error}\n`);
      return;
    }
    const ai = d.output_detector_results?.overall ?? 'N/A';
    const meaning = d.meaning_similarity?.toFixed(2) ?? 'N/A';
    const words = d.word_count ?? 'N/A';
    const output = d.humanized || d.humanizedText || d.output || '';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== ${engine.toUpperCase()} === AI: ${ai}% | Meaning: ${meaning} | Words: ${words}/${inputWords} | ${elapsed}s`);
    console.log(`${'='.repeat(60)}`);
    console.log(output);
  } catch (e) {
    console.log(`\n=== ${engine.toUpperCase()} === FETCH ERROR: ${e.message}\n`);
  }
}

(async () => {
  for (const engine of engines) {
    await testEngine(engine);
  }
})();
