// Test paragraph extraction
const testText = `VI. Significance of the Study
A. For Students

This study provides students with an evidence-based framework to make informed decisions about which study strategies best support their learning preferences and academic goals. By comparing digital and traditional approaches, the study aims to clarify which method promotes stronger comprehension, motivation, and retention. Students often rely on convenience or habit when selecting study tools, but data-driven insights can help them choose methods aligned with cognitive effectiveness. Understanding how tool type affects concentration and memory can empower learners to optimize their study sessions for greater efficiency and long-term success. Furthermore, the findings can promote metacognitive awareness—encouraging students to reflect on how they learn most effectively (Zimmerman, 2002). This focus on student agency aligns with contemporary educational priorities emphasizing self-regulated and personalized learning. In sum, students will gain practical strategies to enhance both academic performance and intrinsic motivation.

B. For Instructors

For instructors, this research offers valuable empirical evidence to inform pedagogical decision-making regarding study practices and learning support. The results can help educators design lessons and assessments that integrate both traditional and digital tools, thereby addressing the diverse preferences of students in modern classrooms. Instructors will also gain insights into how study tools affect engagement, enabling them to foster deeper participation rather than passive consumption of information. This understanding is critical in preventing surface-level learning that can result from overreliance on technology (Pamolarco, 2022). Additionally, the study's outcomes may guide the development of blended learning environments where digital convenience complements the cognitive rigor of traditional study habits. By aligning instructional design with evidence-based findings, teachers can promote balanced learning approaches that enhance comprehension, retention, and overall student satisfaction. Ultimately, these insights can lead to more inclusive and adaptive teaching practices in higher education.`;

// Exact same as engine
function extractParagraphs(text) {
  return text.split(/\n\s*\n/).map(p => p.trim());
}

function isProtectedLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^[IVXLCDM]+[.)]\s/i.test(t)) return true;
  if (/^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Appendix)\b/i.test(t)) return true;
  if (/^[\d]+[.):\-]\s/.test(t) || /^[A-Za-z][.)]\s/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length <= 5 && !/[.!?]$/.test(t)) return true;
  return false;
}

function extractSentences(paragraph) {
  const raw = paragraph.match(/[^.!?]*[.!?]+[\s]*/g) || [paragraph];
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}

const paragraphs = extractParagraphs(testText);
console.log(`Total paragraphs: ${paragraphs.length}\n`);

paragraphs.forEach((p, i) => {
  const prot = isProtectedLine(p);
  console.log(`PARA[${i}] protected=${prot}:`);
  console.log(`  Full text: "${p.slice(0, 100)}..."`);
  if (!prot) {
    const sents = extractSentences(p);
    console.log(`  Sentences (${sents.length}):`);
    sents.forEach((s, j) => {
      console.log(`    [${j}]: "${s.slice(0, 80)}..."`);
    });
  }
  console.log();
});
