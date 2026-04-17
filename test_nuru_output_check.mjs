const text = `Abstract

Artificial intelligence (AI) has rapidly emerged as a transformative force in education, fundamentally reshaping how institutions deliver instruction, assess student performance, and personalize learning pathways. This paper examines the multifaceted impact of AI technologies on modern educational practices, analyzing both the opportunities and challenges that arise from their integration into academic settings. Through a comprehensive review of current literature and empirical evidence, this study investigates how AI-powered tools such as intelligent tutoring systems, automated grading platforms, and adaptive learning environments are being deployed across various educational levels. The findings suggest that while AI holds tremendous potential for enhancing educational outcomes, its implementation raises significant concerns regarding equity, privacy, and the evolving role of educators.

1. Introduction

The integration of artificial intelligence into educational systems represents one of the most significant technological shifts in the history of pedagogy. Over the past decade, AI technologies have evolved from experimental tools used primarily in research settings to mainstream applications that are increasingly embedded in everyday classroom experiences (Holmes et al., 2022). This transformation has prompted educators, policymakers, and researchers to critically examine how these technologies influence teaching and learning processes.

The rapid advancement of machine learning algorithms, natural language processing capabilities, and data analytics has created unprecedented opportunities for personalizing education at scale. AI-driven platforms can now analyze individual student behavior patterns, identify knowledge gaps, and deliver customized content that adapts in real-time to each learner's needs (Chen et al., 2021). These capabilities represent a fundamental departure from the traditional one-size-fits-all approach that has characterized much of formal education throughout history.

However, the enthusiasm surrounding AI in education must be tempered with careful consideration of its limitations and potential risks. Critics argue that over-reliance on AI systems may diminish the human elements of teaching that are essential for holistic student development, including mentorship, emotional support, and the cultivation of critical thinking skills (Selwyn, 2019). Furthermore, concerns about algorithmic bias, data privacy, and the digital divide raise important questions about whether AI technologies will exacerbate existing educational inequalities rather than alleviate them.

This paper seeks to address several key research questions:

1. How are AI technologies currently being implemented across different educational levels and contexts?
2. What measurable impacts have AI-powered educational tools had on student learning outcomes?
3. What ethical and practical challenges arise from the integration of AI into educational settings?
4. How can educational institutions develop frameworks for responsible AI adoption that maximize benefits while minimizing risks?

2. Literature Review

The academic literature on AI in education has grown substantially over the past five years, reflecting the increasing prominence of these technologies in educational discourse. Early research in this field focused primarily on the technical capabilities of AI systems, while more recent scholarship has shifted toward examining the pedagogical, ethical, and social implications of AI-enhanced learning environments (Zawacki-Richter et al., 2019).`;

const body = JSON.stringify({ text, engine: 'nuru_v2', mode: 'standard' });

const res = await fetch('http://localhost:3000/api/humanize-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let fullText = '';
let buf = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const j = JSON.parse(line.slice(6));
        if (j.type === 'done' && j.humanized) fullText = j.humanized;
      } catch {}
    }
  }
}

console.log('=== FINAL HUMANIZED OUTPUT ===');
console.log(fullText);
console.log('\n=== STRUCTURE CHECK ===');
const hasAbstract = /^Abstract$/m.test(fullText);
const hasIntro = /^1\.\s*Introduction$/m.test(fullText);
const hasLitReview = /^2\.\s*Literature Review$/m.test(fullText);
const hasResearchQ = /^This paper seeks to address/m.test(fullText) || /research questions/i.test(fullText);
const hasQ1 = /^1\.\s*How/m.test(fullText);
const hasQ2 = /^2\.\s*What/m.test(fullText);
const hasQ3 = /^3\.\s*What/m.test(fullText);
const hasQ4 = /^4\.\s*How/m.test(fullText);
const paragraphs = fullText.split(/\n\s*\n/).length;

console.log(`Abstract heading: ${hasAbstract}`);
console.log(`1. Introduction heading: ${hasIntro}`);
console.log(`2. Literature Review heading: ${hasLitReview}`);
console.log(`Research questions mention: ${hasResearchQ}`);
console.log(`Question 1: ${hasQ1}`);
console.log(`Question 2: ${hasQ2}`);
console.log(`Question 3: ${hasQ3}`);
console.log(`Question 4: ${hasQ4}`);
console.log(`Total paragraphs (double-newline separated): ${paragraphs}`);
