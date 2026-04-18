import { parseStructuredBlocks, looksLikeHeadingLine, preserveInputStructure } from './lib/engine/structure-preserver.js';

const original = `The integration of artificial intelligence (AI) into nursing practice represents one of the most significant advancements in contemporary healthcare. As healthcare systems worldwide face unprecedented challenges including aging populations, nursing shortages, and rising patient care demands, AI technologies offer promising solutions to enhance diagnostic accuracy, optimize clinical decision-making, and improve patient outcomes.

Applications of Artificial Intelligence in Nursing

Artificial intelligence applications in nursing span multiple domains, each contributing unique value to clinical practice. Diagnostic support systems utilize machine learning algorithms to analyze patient data.

Benefits of Artificial Intelligence in Nursing Practice

The integration of AI technologies into nursing presents numerous advantages for healthcare providers, patients, and the healthcare system overall.

Challenges and Ethical Considerations

Despite promising benefits, integrating AI into nursing practice presents significant challenges requiring careful consideration.

Future Implications for Nursing and Healthcare

The future trajectory of AI in nursing will significantly shape healthcare delivery models and nursing practice.

Conclusion

Artificial intelligence represents a transformative force in nursing and healthcare, offering unprecedented opportunities to enhance diagnostic accuracy.`;

// Simulate engine output where titles got merged with paragraphs
const rewritten = `The incorporation of artificial intelligence into nursing practice stands as one of the most notable developments in modern healthcare. Healthcare systems around the world encounter extraordinary challenges including aging demographics, nursing workforce gaps, and escalating patient care requirements, and AI technologies present promising approaches to improve diagnostic precision, refine clinical judgment, and enhance patient results.
Applications of Artificial Intelligence in Nursing Artificial intelligence implementations in nursing cover numerous areas, each bringing distinctive value to clinical operations. Diagnostic assistance platforms employ machine learning methods to examine patient information.
Benefits of Artificial Intelligence in Nursing Practice The incorporation of AI innovations into nursing offers considerable benefits for healthcare workers, patients, and the overall healthcare framework.
Challenges and Ethical Considerations In spite of encouraging advantages, embedding AI into nursing practice introduces substantial obstacles demanding thoughtful evaluation.
Future Implications for Nursing and Healthcare The forthcoming direction of AI in nursing will meaningfully influence healthcare delivery frameworks and nursing practice.
Conclusion Artificial intelligence constitutes a revolutionary power in nursing and healthcare, presenting unparalleled prospects to boost diagnostic precision.`;

console.log("=== parseStructuredBlocks (original) ===");
const blocks = parseStructuredBlocks(original);
blocks.forEach((b, i) => console.log(`  [${i}] ${b.type.padEnd(10)} ${b.rawLines[0].substring(0, 80)}`));

console.log("\n=== looksLikeHeadingLine tests ===");
const testLines = [
  "Applications of Artificial Intelligence in Nursing",
  "Benefits of Artificial Intelligence in Nursing Practice",
  "Challenges and Ethical Considerations",
  "Future Implications for Nursing and Healthcare",
  "Conclusion",
  "The integration of artificial intelligence (AI) into nursing practice represents",
  "Artificial intelligence applications in nursing span multiple domains, each contributing unique value to clinical practice.",
  // Engine merged title + paragraph:
  "Applications of Artificial Intelligence in Nursing Artificial intelligence implementations in nursing cover numerous areas, each bringing distinctive value to clinical operations.",
];
for (const line of testLines) {
  console.log(`  ${looksLikeHeadingLine(line) ? "HEADING" : "PARA   "} : "${line.substring(0, 80)}"`);
}

console.log("\n=== preserveInputStructure (merged titles in rewritten) ===");
const result = preserveInputStructure(original, rewritten);
console.log("--- OUTPUT ---");
console.log(result);
console.log("--- END ---");
