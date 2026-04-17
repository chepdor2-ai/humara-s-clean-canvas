#!/usr/bin/env node

// The problematic input from user
const input = `introduction

nonprofit organizations play a critical role in advancing social, educational, and charitable missions, distinguishing themselves from corporations that primarily aim to generate profit for shareholders. unlike for-profit entities, nonprofits reinvest surplus revenues into their programs and services to fulfill their organizational purpose. despite these differences, both sectors require strong financial reporting systems to ensure accountability, transparency, and effective resource management. as nonprofits increasingly manage large volumes of financial resources and public contributions, the need for standardized accounting and auditing frameworks has become essential to maintain stakeholder trust and regulatory compliance.

this paper examines the role of financial accounting standards board (fasb) publications in guiding nonprofit financial reporting, alongside the auditing frameworks that ensure the reliability of financial information. it further explores the differences between nonprofit and governmental auditing practices and evaluates how these standards are applied in practice through an analysis of yale university's 2024 financial statements and irs form 990. by integrating accounting principles, governance practices, and audit standards, this study provides insight into how financial transparency is achieved within large nonprofit institutions.

ultimately, the paper argues that adherence to fasb standards and rigorous auditing practices is essential for promoting accountability, enhancing donor confidence, and ensuring the long-term sustainability of nonprofit organizations in an increasingly complex financial environment.

literature review

the existing literature on nonprofit accounting and auditing highlights the critical role of standardized financial reporting and governance in ensuring transparency and accountability. the financial accounting standards board (fasb) established asc 958 as the primary framework governing nonprofit financial reporting, providing guidance on net asset classification, revenue recognition, and disclosure requirements. this framework distinguishes between assets with and without donor restrictions, ensuring that organizations clearly communicate how funds are utilized (fasb, 2023). the introduction of asu 2016-14 further enhanced financial statement presentation by simplifying net asset categories and requiring detailed disclosures on liquidity and functional expenses, improving comparability across nonprofit entities (johnson, 2023).

research also emphasizes the importance of audit quality in strengthening nonprofit accountability. according to gao and zhang (2019), professional judgment and adherence to auditing standards significantly influence audit effectiveness and the reliability of financial reporting. nonprofit audits conducted under generally accepted auditing standards (gaas) focus on donor restrictions, grant compliance, and financial statement accuracy, while governmental audits under generally accepted government auditing standards (gagas) incorporate performance and compliance assessments (aicpa, 2018; u.s. gao, 2018). duguay (2022) further argues that stricter audit regulations in the charitable sector have improved transparency and reduced the risk of financial misreporting, thereby increasing stakeholder confidence.

governance structures and organizational oversight also play a vital role in nonprofit performance. feng and greenlee (2024) highlight that organizations with independent boards and effective audit committees tend to exhibit higher-quality financial reporting and stronger internal controls. these governance mechanisms ensure that management decisions align with organizational objectives and ethical standards. additionally, transparency in executive compensation, often disclosed through irs form 990, enhances accountability and mitigates concerns about resource misuse.

overall, the literature demonstrates that the integration of fasb standards, robust auditing practices, and effective governance frameworks is essential for maintaining financial integrity in nonprofit organizations. these elements collectively contribute to improved reporting quality, increased donor trust, and enhanced organizational sustainability in the nonprofit sector.`;

async function testDeepKillEngine() {
  try {
    console.log('Testing ghost_trial_2 (deep-kill) engine...\n');
    console.log('Input length:', input.length, 'words:', input.split(/\s+/).length);
    
    // Count input paragraphs
    const inputParagraphs = input.split(/\n\s*\n/).filter(p => p.trim());
    console.log('Input paragraphs:', inputParagraphs.length, '\n');

    const response = await fetch('http://localhost:3000/api/humanize-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: input,
        engine: 'ghost_trial_2',
        strength: 'medium',
        tone: 'academic',
        strict_meaning: true,
        humanization_rate: 8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP Error:', response.status, errorText);
      return;
    }

    let completeOutput = '';
    let events = [];

    for await (const chunk of response.body) {
      const text = chunk.toString();
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            events.push(json);
            
            if (json.type === 'done') {
              completeOutput = json.humanized;
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    }

    console.log('\n=== OUTPUT ANALYSIS ===\n');
    
    // Count output paragraphs
    const outputParagraphs = completeOutput.split(/\n\s*\n/).filter(p => p.trim());
    console.log('Output paragraphs:', outputParagraphs.length);
    console.log('Expected paragraphs:', inputParagraphs.length);
    console.log('Match:', outputParagraphs.length === inputParagraphs.length ? '✓ YES' : '✗ NO\n');
    
    // Check for duplication
    const sentences = completeOutput.split(/[.!?]+/).filter(s => s.trim());
    console.log('Output sentences:', sentences.length);
    
    // Look for duplicates
    const sentenceSet = new Set();
    let duplicates = 0;
    for (const sent of sentences) {
      const normalized = sent.trim().toLowerCase();
      if (sentenceSet.has(normalized)) {
        duplicates++;
      }
      sentenceSet.add(normalized);
    }
    console.log('Duplicate sentences found:', duplicates);
    
    // Print first 500 chars
    console.log('\n=== OUTPUT PREVIEW ===\n');
    console.log(completeOutput.substring(0, 800));
    if (completeOutput.length > 800) console.log('\n[... truncated ...]');
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testDeepKillEngine();
