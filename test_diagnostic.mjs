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

async function testEngineDetailed(engineName) {
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
      return { engine: engineName, error: response.status };
    }

    const full = await readStream(response.body);
    let output = '';
    let allEvents = [];
    
    const lines = full.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
          allEvents.push(json);
          if (json.type === 'done') {
            output = json.humanized || '';
          }
        } catch (e) {}
      }
    }

    // Count the raw output from "Init" stage
    const initEvent = allEvents.find(e => e.type === 'init');
    const sentenceCount = initEvent?.sentences?.length || 0;

    return {
      engine: engineName,
      inputSize: testInput.length,
      outputSize: output.length,
      ratio: (output.length / testInput.length).toFixed(2),
      inputSentences: sentenceCount,
      outputSentences: output.split(/[.!?]+/).filter(s => s.trim()).length,
      stages: allEvents.filter(e => e.type === 'stage').map(e => e.stage),
      output: output,
    };
  } catch (error) {
    return { engine: engineName, exception: error.message };
  }
}

async function runTest() {
  console.log('Detailed diagnostic of oxygen engine:\n');
  
  const result = await testEngineDetailed('oxygen');
  
  console.log('Engine:', result.engine);
  console.log('Input size:', result.inputSize);
  console.log('Output size:', result.outputSize);
  console.log('Ratio:', result.ratio + 'x');
  console.log('Input sentences:', result.inputSentences);
  console.log('Output sentences:', result.outputSentences);
  console.log('\nFull output:\n');
  console.log(result.output);
}

runTest().catch(console.error);
