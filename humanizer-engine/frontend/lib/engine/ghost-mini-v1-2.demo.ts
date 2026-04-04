/**
 * Ghost Mini v1.2 - Quick Validation Script
 * Run this to demonstrate structure preservation
 */

import { ghostMiniV1_2, validateStructurePreservation } from './ghost-mini-v1-2';

const DEMO_TEXT = `Introduction to Leadership Theory

Leadership has evolved significantly over the past century. I think modern approaches are very different from traditional methods. Organizations can't rely on outdated models anymore.

Emotional Intelligence

Research shows that EI is essential for effective leadership. Leaders who utilize high emotional intelligence demonstrate better team outcomes. They're more successful in challenging situations.

Key Components:

1. Self-awareness
2. Social awareness  
3. Relationship management

Practical Applications

Organizations should look at implementing EI training programs. These programs need to be very comprehensive and practical. We believe this is the best approach for leadership development.

Conclusion

Leadership development isn't just about skills — it's about creating sustainable organizational cultures. Companies that don't invest in this area will find it hard to compete effectively.`;

console.log('🚀 Ghost Mini v1.2 - Structure Preservation Demo\n');
console.log('='.repeat(70));

// Process the text
const processed = ghostMiniV1_2(DEMO_TEXT);

// Validate preservation
const validation = validateStructurePreservation(DEMO_TEXT, processed);

// Display results
console.log('\n📝 ORIGINAL TEXT:');
console.log(DEMO_TEXT);

console.log('\n' + '='.repeat(70));
console.log('\n✨ PROCESSED TEXT:');
console.log(processed);

console.log('\n' + '='.repeat(70));
console.log('\n📊 STRUCTURE VALIDATION RESULTS:\n');
console.log(`   Paragraph Count: ${validation.originalParagraphs} → ${validation.processedParagraphs} ${validation.paragraphCountMatch ? '✅' : '❌'}`);
console.log(`   Blank Lines Preserved: ${validation.blankLinesPreserved ? '✅' : '❌'}`);
console.log(`   Structure Match: ${validation.paragraphCountMatch && validation.blankLinesPreserved ? '✅ PERFECT' : '❌ MISMATCH'}`);

console.log('\n🔍 TRANSFORMATION VERIFICATION:\n');

// Check transformations
const checks = {
  contractionsExpanded: !/\b(can't|won't|don't|doesn't|isn't|aren't|it's|they're)\b/i.test(processed),
  emDashesRemoved: !processed.includes('—'),
  firstPersonReduced: (DEMO_TEXT.match(/\bI think\b/gi) || []).length > (processed.match(/\bI think\b/gi) || []).length,
  academicVocabulary: processed.includes('examine') || processed.includes('employ') || processed.includes('demonstrate')
};

console.log(`   Contractions Expanded: ${checks.contractionsExpanded ? '✅' : '❌'}`);
console.log(`   Em-dashes Removed: ${checks.emDashesRemoved ? '✅' : '❌'}`);
console.log(`   First-person Reduced: ${checks.firstPersonReduced ? '✅' : '❌'}`);
console.log(`   Academic Vocabulary: ${checks.academicVocabulary ? '✅' : '❌'}`);

const allPassed = Object.values(checks).every(v => v) && validation.paragraphCountMatch && validation.blankLinesPreserved;

console.log('\n' + '='.repeat(70));
console.log(`\n${allPassed ? '✅ ALL VALIDATIONS PASSED' : '⚠️  SOME VALIDATIONS FAILED'}\n`);

export { DEMO_TEXT, validation };
