const fs = require('fs'); let content = fs.readFileSync('app/api/humanize-stream/route.ts', 'utf8');

// 1. Add definitions array removal string replace for SentenceStartersDistribution
content = content.replace(/if \(eng === 'nuru_v2' && !deadlineReached\) \{[\s\S]*?stage: 'Nuru 2.0 Sentence Starters' \}?\)?;\s*\}\s*\}/, '');

// 2. Remove document flow calibration
content = content.replace(/if \(eng === 'nuru_v2'\) \{[\s\S]*?stage: 'Nuru 2.0 Flow Calibration' \}\);\s*\}\s*await flushDelay\(1\);\s*\}/, '');

// 3. Inject Nuru logic into universal base
const universalTarget = 'humanized = applySmartNuruPolish(humanized, 1);\n            latestHumanized = humanized;';
const universalReplace = 'humanized = applySmartNuruPolish(humanized, 1);\n\n            // Universal Document Flow Constraints\n            const { sentences: nuruPostSents, paragraphBoundaries: sharedBounds } = splitIntoIndexedSentences(humanized);\n            const { sentences: sharedSource } = splitIntoIndexedSentences(normalizedText);\n            applySentenceStartersDistribution(nuruPostSents);\n            applyNuruDocumentFlowCalibration(nuruPostSents, sharedBounds, sharedSource);\n            humanized = reassembleText(nuruPostSents, sharedBounds.length ? sharedBounds : [0]);\n\n            latestHumanized = humanized;';
content = content.replace(universalTarget, universalReplace);

// 4. Import definitions
const importTarget = 'import { stealthHumanize, stealthHumanizeTargeted } from \'@/lib/engine/stealth\';';
const importReplace = importTarget + '\nimport { applySentenceStartersDistribution, applyNuruDocumentFlowCalibration } from \'@/lib/engine/stealth/nuru-document-phases\';';
content = content.replace(importTarget, importReplace);

fs.writeFileSync('app/api/humanize-stream/route.ts', content);
