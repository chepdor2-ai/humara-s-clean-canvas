#!/usr/bin/env node

// Shorter test input for quick validation
const input = `introduction

nonprofit organizations play a critical role in advancing social missions. unlike for-profit entities, nonprofits reinvest surplus revenues into their programs.

this paper examines the role of financial accounting standards board (fasb) publications in guiding nonprofit financial reporting.

literature review

the existing literature highlights the critical role of standardized financial reporting and governance. the fasb established asc 958 as the primary framework governing nonprofit financial reporting.`;

async function testDeepKillEngine() {
  try {
    console.log('Testing ghost_trial_2 (deep-kill) engine...');
    console.log('Input paragraphs:', input.split(/\n\s*\n/).filter(p => p.trim()).length);

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
      console.error('HTTP Error:', response.status);
      return;
    }

    let completeOutput = '';

    for await (const chunk of response.body) {
      const text = chunk.toString();
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'done') {
              completeOutput = json.humanized;
              console.log('\n✓ Test completed successfully');
              break;
            }
          } catch (e) {}
        }
      }
    }

    const inputParas = input.split(/\n\s*\n/).filter(p => p.trim()).length;
    const outputParas = completeOutput.split(/\n\s*\n/).filter(p => p.trim()).length;
    
    console.log(`Paragraphs: Input=${inputParas}, Output=${outputParas}, Match=${inputParas === outputParas ? '✓' : '✗'}`);
    console.log(`\nOutput preview:\n${completeOutput.substring(0, 300)}...`);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testDeepKillEngine();
