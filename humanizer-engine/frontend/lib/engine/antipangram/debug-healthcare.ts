import { buildForensicProfile, splitToSentences, buildDocumentContext } from './pangram-forensics';
import { splitLongSentence } from './sentence-surgeon';
import { reflowDocument } from './document-reflow';
import { antiPangramHumanize } from './index';

const text = `The importance of mental health awareness has grown significantly in recent years, driven by increasing recognition of the profound impact that psychological well-being has on overall quality of life. Mental health conditions such as depression, anxiety, and post-traumatic stress disorder affect millions of people worldwide, yet stigma and lack of access to care continue to serve as major barriers to treatment. Promoting mental health literacy and creating supportive environments are essential steps toward addressing these challenges and ensuring that individuals receive the help they need.`;

const sents = splitToSentences(text);
console.log(`\n${sents.length} sentences:`);
sents.forEach((s, i) => {
  const wc = s.split(/\s+/).length;
  console.log(`  [${i}] ${wc} words: "${s.substring(0, 60)}..."`);
  if (wc >= 20) {
    const parts = splitLongSentence(s);
    console.log(`       Split result: ${parts.length} parts`);
    if (parts.length > 1) parts.forEach((p, j) => console.log(`         Part ${j}: ${p.split(/\s+/).length} words`));
  }
});

const fp = buildForensicProfile(text);
console.log(`\nForensic: AI=${fp.overallAiScore} CV=${fp.sentenceLengthVariance.toFixed(3)}`);

// Test reflow only
const ctx = buildDocumentContext(text);
const reflowed = reflowDocument(text, ctx, fp, 'strong');
console.log('\nREFLOWED TEXT:');
console.log(reflowed);
const rSents = splitToSentences(reflowed);
console.log(`\nAfter reflow: ${rSents.length} sentences`);
rSents.forEach((s, i) => console.log(`  [${i}] ${s.split(/\s+/).length} words`));
const rfp = buildForensicProfile(reflowed);
console.log(`Reflow forensic: AI=${rfp.overallAiScore} CV=${rfp.sentenceLengthVariance.toFixed(3)}`);

// Test full pipeline
const result = antiPangramHumanize(text, { strength: 'strong' });
const hSents = splitToSentences(result.humanized);
console.log(`\nFinal: ${hSents.length} sentences`);
hSents.forEach((s, i) => console.log(`  [${i}] ${s.split(/\s+/).length} words`));
console.log(`Final forensic: AI=${result.forensicAfter.overallAiScore} CV=${result.forensicAfter.sentenceLengthVariance.toFixed(3)}`);
