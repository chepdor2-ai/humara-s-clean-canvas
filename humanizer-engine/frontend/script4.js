const fs = require('fs'); let content = fs.readFileSync('app/api/humanize/route.ts', 'utf8');

const injectionBlock = 
function splitIntoIndexedSentences(text: string): { sentences: string[]; paragraphBoundaries: number[] } {
  const paragraphs = text.split(/\\n\\s*\\n/).filter(p => p.trim());
  const sentences: string[] = [];
  const paragraphBoundaries: number[] = [];
  for (const para of paragraphs) {
    paragraphBoundaries.push(sentences.length);
    const trimmed = para.trim();
    const isHeading = trimmed.length < 120 && !/[.!?]$/.test(trimmed) && trimmed.split(/\\s+/).length <= 15;
    if (isHeading) {
      sentences.push(trimmed);
    } else {
      const sents = trimmed.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()) || [trimmed];
      sentences.push(...sents);
    }
  }
  return { sentences, paragraphBoundaries };
}

function reassembleText(sentences: string[], paragraphBoundaries: number[]): string {
  const paragraphs: string[][] = [];
  for (let i = 0; i < paragraphBoundaries.length; i++) {
    const start = paragraphBoundaries[i];
    const end = i < paragraphBoundaries.length - 1 ? paragraphBoundaries[i + 1] : sentences.length;
    paragraphs.push(sentences.slice(start, end));
  }
  return paragraphs.map(p => p.join(' ')).join('\\n\\n');
}

    if (engine !== 'ozone') {
      const nuruPostStart = Date.now();
      humanized = applySmartNuruPolish(humanized, 15);
      
      const { sentences: nuruPostSents, paragraphBoundaries: sharedBounds } = splitIntoIndexedSentences(humanized);
      const { sentences: sharedSource } = splitIntoIndexedSentences(normalizedText);
      applySentenceStartersDistribution(nuruPostSents);
      applyNuruDocumentFlowCalibration(nuruPostSents, sharedBounds, sharedSource);
      humanized = reassembleText(nuruPostSents, sharedBounds.length ? sharedBounds : [0]);
      
      console.log(\[Nuru Post] Complete in \ms\);
    };

content = content.replace(/if \(engine !== 'ozone'\) \{\s*const nuruPostStart = Date\.now\(\);\s*humanized = applySmartNuruPolish\(humanized, 15\);\s*console\.log\(\[Nuru Post\] Complete in \$\{Date\.now\(\) - nuruPostStart\}ms\);\s*\}/, injectionBlock);

const importTarget = 'import { stealthHumanize, stealthHumanizeTargeted } from \'@/lib/engine/stealth\';';
const importReplace = importTarget + '\nimport { applySentenceStartersDistribution, applyNuruDocumentFlowCalibration } from \'@/lib/engine/stealth/nuru-document-phases\';';
content = content.replace(importTarget, importReplace);

// Remove the inline engine=='nuru_v2' preservation later down which is redundant now.
content = content.replace(/if \(engine !== 'nuru_v2' && !isDeepKill\) \{\s*humanized = preserveInputStructure\(normalizedText, humanized\);\s*\}/, 
'if (!isDeepKill) {\n      humanized = preserveInputStructure(normalizedText, humanized);\n    }');

fs.writeFileSync('app/api/humanize/route.ts', content);
