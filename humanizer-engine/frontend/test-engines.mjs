import { writeFileSync } from 'fs';

const testText = `VI. Significance of the Study
A. For Students

This study provides students with an evidence-based framework to make informed decisions about which study strategies best support their learning preferences and academic goals. By comparing digital and traditional approaches, the study aims to clarify which method promotes stronger comprehension, motivation, and retention. Students often rely on convenience or habit when selecting study tools, but data-driven insights can help them choose methods aligned with cognitive effectiveness. Understanding how tool type affects concentration and memory can empower learners to optimize their study sessions for greater efficiency and long-term success. Furthermore, the findings can promote metacognitive awareness—encouraging students to reflect on how they learn most effectively (Zimmerman, 2002). This focus on student agency aligns with contemporary educational priorities emphasizing self-regulated and personalized learning. In sum, students will gain practical strategies to enhance both academic performance and intrinsic motivation.

B. For Instructors

For instructors, this research offers valuable empirical evidence to inform pedagogical decision-making regarding study practices and learning support. The results can help educators design lessons and assessments that integrate both traditional and digital tools, thereby addressing the diverse preferences of students in modern classrooms. Instructors will also gain insights into how study tools affect engagement, enabling them to foster deeper participation rather than passive consumption of information. This understanding is critical in preventing surface-level learning that can result from overreliance on technology (Pamolarco, 2022). Additionally, the study's outcomes may guide the development of blended learning environments where digital convenience complements the cognitive rigor of traditional study habits. By aligning instructional design with evidence-based findings, teachers can promote balanced learning approaches that enhance comprehension, retention, and overall student satisfaction. Ultimately, these insights can lead to more inclusive and adaptive teaching practices in higher education.`;

async function testEngine(engine) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TESTING ${engine.toUpperCase()} ENGINE`);
  console.log(`${'='.repeat(60)}\n`);

  const body = JSON.stringify({
    text: testText,
    engine,
    strength: 'medium',
    tone: 'academic',
  });

  try {
    const res = await fetch('http://localhost:3000/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`ERROR ${res.status}: ${errText}`);
      return;
    }

    const data = await res.json();
    console.log('--- OUTPUT ---');
    console.log(data.humanized);
    
    // Write to file for accurate inspection
    writeFileSync(`test-output-${engine}.txt`, data.humanized, 'utf8');
    
    // Split by paragraph breaks and show each
    const outputParas = data.humanized.split(/\n\s*\n/);
    console.log(`\n--- PARAGRAPH ANALYSIS (${outputParas.length} paragraphs) ---`);
    outputParas.forEach((p, i) => {
      console.log(`  PARA[${i}]: [${p.slice(0, 80)}...]`);
    });
    
    console.log('\n--- STATS ---');
    console.log(`Input length:  ${testText.length} chars`);
    console.log(`Output length: ${data.humanized.length} chars`);

    // Check for contractions
    const contractions = data.humanized.match(/\b\w+'\w+\b/g) || [];
    console.log(`Contractions found: ${contractions.length}`, contractions.length > 0 ? contractions : '');

    // Check preserved structure
    const hasVI = data.humanized.includes('VI.');
    const hasA = data.humanized.includes('A.');
    const hasB = data.humanized.includes('B.');
    console.log(`Structure preserved: VI=${hasVI} A=${hasA} B=${hasB}`);

    // Check first person
    const firstPerson = data.humanized.match(/\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/gi) || [];
    console.log(`First person words: ${firstPerson.length}`, firstPerson.length > 0 ? firstPerson : '');

    // Count sentences
    const inputSentences = testText.match(/[^.!?]*[.!?]+/g) || [];
    const outputSentences = data.humanized.match(/[^.!?]*[.!?]+/g) || [];
    console.log(`Input sentences:  ${inputSentences.length}`);
    console.log(`Output sentences: ${outputSentences.length}`);

  } catch (err) {
    console.error(`FETCH ERROR: ${err.message}`);
  }
}

async function main() {
  console.log('Testing both engines with academic text...\n');
  
  // Test Nuru first (fast, no LLM)
  await testEngine('nuru');
  
  // Test Omega (LLM, slower)
  await testEngine('omega');
  
  console.log('\n\nDone.');
}

main();
