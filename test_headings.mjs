#!/usr/bin/env node

const testInput = `research methodology

this section describes the methods used in the study. qualitative approaches were employed to gather data from participants.

findings

participants reported improvements. the results showed a 45% increase.

discussion

the study demonstrates benefits. further research is needed.`;

async function readStream(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function testEngine(engineName) {
  const response = await fetch('http://localhost:3000/api/humanize-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: testInput,
      engine: engineName,
      strength: 'medium',
      tone: 'academic',
      strict_meaning: true,
      humanization_rate: 8,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const full = await readStream(response.body);
  let output = '';
  
  const lines = full.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.slice(6));
        if (json.type === 'done') {
          output = json.humanized || '';
        }
      } catch (e) {}
    }
  }

  // Parse output into paragraphs
  const paragraphs = output.split(/\n\s*\n/).filter(p => p.trim());  
  
  // Check each paragraph
  const results = [];
  for (const para of paragraphs) {
    const wordCount = para.split(/\s+/).length;
    const looks_like_heading = para.length < 100 && !para.includes('.') && wordCount <= 5;
    results.push({
      looks_like_heading,
      text: para.substring(0, 80),
      words: wordCount,
    });
  }

  return {
    engine: engineName,
    input_paras: testInput.split(/\n\s*\n/).filter(p => p.trim()).length,
    output_paras: paragraphs.length,
    size_ratio: (output.length / testInput.length).toFixed(2),
    paragraphs: results,
    full_output: output,
  };
}

async function run() {
  console.log('=== HEADING & STRUCTURE DIAGNOSTIC ===\n');
  
  const result = await testEngine('oxygen');
  
  if (!result) {
    console.log('ERROR: Engine request failed');
    return;
  }

  console.log(`Engine: oxygen`);
  console.log(`Input paragraphs: ${result.input_paras}`);
  console.log(`Output paragraphs: ${result.output_paras}`);
  console.log(`Size: ${result.size_ratio}x`);
  console.log('\nParagraph breakdown:');
  
  for (let i = 0; i < result.paragraphs.length; i++) {
    const p = result.paragraphs[i];
    console.log(`${i + 1}. ${p.looks_like_heading ? '[HEADING]' : '[BODY]'} (${p.words} words) ${p.text}...`);
  }

  console.log('\n=== FULL OUTPUT ===\n');
  console.log(result.full_output);
}

run().catch(console.error);
