#!/usr/bin/env node

const testInput = `research methodology

this section describes the methods used in the study. qualitative approaches were employed to gather data from participants. the sample consisted of thirty educators from five different schools.

findings

participants reported significant improvements in student engagement. the results showed a 45% increase in completion rates. these findings are consistent with previous research.

discussion

the study demonstrates clear benefits of the new approach. institutions should consider implementing these strategies. further research is needed to understand long-term effects.`;

async function readStream(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function testEngine(engineName) {
  try {
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
      return { engine: engineName, status: 'ERROR', error: response.status };
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

    const inputLength = testInput.length;
    const outputLength = output.length;
    const inputParas = testInput.split(/\n\s*\n/).filter(p => p.trim()).length;
    const outputParas = output.split(/\n\s*\n/).filter(p => p.trim()).length;
    
    // Check for title preservation
    const hasResearchMethodology = /research methodology/i.test(output);
    const hasFindings = /findings/i.test(output);
    const hasDiscussion = /discussion/i.test(output);
    
    // Check for duplication
    const dupCount = (output.match(/qualitative approaches/gi) || []).length;

    return {
      engine: engineName,
      status: 'OK',
      inputLength,
      outputLength,
      sizeRatio: (outputLength / inputLength).toFixed(2),
      inputParas,
      outputParas,
      paraMatch: inputParas === outputParas,
      titles: [hasResearchMethodology, hasFindings, hasDiscussion].filter(x => x).length,
      titleCount: 3,
      dups: dupCount,
    };
  } catch (error) {
    return { engine: engineName, status: 'EXCEPTION', error: error.message };
  }
}

async function runAllTests() {
  console.log('Testing engines for duplication & structure...\n');
  
  const engines = ['oxygen', 'easy', 'oxygen3', 'humara_v3_3', 'nuru_v2', 'ninja_2', 'ninja_3', 'ghost_trial_2', 'king', 'ghost_pro_wiki'];

  for (const engine of engines) {
    console.log(`Testing ${engine}...`);
    const result = await testEngine(engine);
    if (result.status === 'OK') {
      console.log(`  Input: ${result.inputParas} para | Output: ${result.outputParas} para | Titles: ${result.titles}/3 | Size: ${result.sizeRatio}x | Dups: ${result.dups}`);
    } else {
      console.log(`  ERROR: ${result.error}`);
    }
  }
}

runAllTests().catch(console.error);
