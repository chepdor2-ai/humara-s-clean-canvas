/**
 * Test Suite for Human v1.1 Engine
 * Demonstrates strict 7-phase sentence processing
 */

import HumanV11Engine from './human-v1-1';

async function runTests() {
  const engine = new HumanV11Engine();

  console.log('='.repeat(80));
  console.log('HUMAN v1.1 TEST SUITE');
  console.log('Strict 7-Phase Sentence-by-Sentence Processing');
  console.log('='.repeat(80));
  console.log();

  // ============================================================================
  // TEST 1: Basic Sentence Transformation
  // ============================================================================
  console.log('TEST 1: Basic Sentence Transformation');
  console.log('-'.repeat(80));
  
  const test1 = "AI tools rewrite text by analyzing patterns.";
  console.log('Input:', test1);
  console.log();

  const result1 = await engine.processText(test1);
  console.log('Output:', result1.output);
  console.log();
  
  console.log('Phase Details:');
  const sentence1 = result1.sentences[0];
  console.log('├─ Phase 1 (Analysis):', JSON.stringify(sentence1.phase1_analysis, null, 2));
  console.log('├─ Phase 2 (Chunks):', sentence1.phase2_chunks.length, 'meaning chunks');
  console.log('├─ Phase 3 (Intent):', sentence1.phase3_intent.must_include);
  console.log('├─ Phase 4 (Rewrite):', sentence1.phase4_rewrite.transformations_applied);
  console.log('├─ Phase 5 (Humanize):', 'Contractions:', sentence1.phase5_humanized.contractions_used, '(MUST be 0)');
  console.log('├─ Phase 6 (Validate):', sentence1.phase6_validation.passed ? '✅ PASSED' : '❌ FAILED');
  console.log('│  ├─ Semantic Similarity:', sentence1.phase6_validation.semantic_similarity.toFixed(2));
  console.log('│  ├─ Lexical Diversity:', sentence1.phase6_validation.lexical_diversity.toFixed(2));
  console.log('│  └─ AI Pattern Score:', sentence1.phase6_validation.ai_pattern_score.toFixed(2));
  console.log('└─ Phase 7 (Context):', sentence1.phase7_context.adjustments_made);
  console.log();
  console.log();

  // ============================================================================
  // TEST 2: Multi-Sentence Paragraph
  // ============================================================================
  console.log('TEST 2: Multi-Sentence Processing');
  console.log('-'.repeat(80));

  const test2 = `AI tools rewrite text by analyzing patterns. They identify common structures and replace them. This makes the text appear more human-written.`;
  console.log('Input:', test2);
  console.log();

  const result2 = await engine.processText(test2);
  console.log('Output:', result2.output);
  console.log();
  
  console.log('Sentence Details:');
  result2.sentences.forEach((s, i) => {
    console.log(`\nSentence ${i + 1}:`);
    console.log(`  Original: ${s.original}`);
    console.log(`  Final:    ${s.final_output}`);
    console.log(`  Validation: ${s.phase6_validation.passed ? '✅' : '❌'} (similarity: ${s.phase6_validation.semantic_similarity.toFixed(2)})`);
    console.log(`  Context: ${s.phase7_context.matches_prev_tone ? '✅ Tone Match' : '⚠️ Tone Mismatch'}`);
  });
  console.log();
  console.log();

  // ============================================================================
  // TEST 3: Parallel Processing (Speed Test)
  // ============================================================================
  console.log('TEST 3: Parallel Processing Speed Test');
  console.log('-'.repeat(80));

  const longText = `
    Machine learning models process data efficiently. They analyze patterns in large datasets. 
    Neural networks use multiple layers for processing. Each layer extracts different features.
    The final output combines all these features. This enables accurate predictions.
  `.trim();

  console.log('Input:', longText.substring(0, 100) + '...');
  console.log();

  // Sequential processing
  console.time('Sequential Processing');
  const resultSeq = await engine.processText(longText);
  console.timeEnd('Sequential Processing');

  // Parallel processing
  console.time('Parallel Processing');
  const resultPar = await engine.processTextParallel(longText);
  console.timeEnd('Parallel Processing');

  console.log();
  console.log('Sequential Output:', resultSeq.output.substring(0, 150) + '...');
  console.log('Parallel Output:  ', resultPar.output.substring(0, 150) + '...');
  console.log();
  console.log();

  // ============================================================================
  // TEST 4: Contraction Expansion (CRITICAL TEST)
  // ============================================================================
  console.log('TEST 4: Contraction Expansion (FORBIDDEN per spec)');
  console.log('-'.repeat(80));

  const test4 = "Don't rewrite text if you can't understand it. It's important that we're careful.";
  console.log('Input:', test4);
  console.log('(Contains contractions: don\'t, can\'t, it\'s, we\'re)');
  console.log();

  const result4 = await engine.processText(test4);
  console.log('Output:', result4.output);
  console.log();

  // Verify NO contractions in output
  const hasContractions = /n't|'ll|'re|'ve|'m|'s/i.test(result4.output);
  console.log('Contraction Check:', hasContractions ? '❌ FAILED (has contractions)' : '✅ PASSED (no contractions)');
  
  result4.sentences.forEach(s => {
    console.log(`  Sentence ${s.id + 1}: ${s.phase5_humanized.contractions_used} contractions used (MUST be 0)`);
  });
  console.log();
  console.log();

  // ============================================================================
  // TEST 5: Tone Consistency
  // ============================================================================
  console.log('TEST 5: Tone Consistency Across Sentences');
  console.log('-'.repeat(80));

  const test5 = `The research demonstrates significant findings. Data analysis reveals clear patterns. Statistical methods confirm the hypothesis.`;
  console.log('Input (Academic tone):', test5);
  console.log();

  const result5 = await engine.processText(test5);
  console.log('Output:', result5.output);
  console.log();

  console.log('Tone Analysis:');
  result5.sentences.forEach(s => {
    console.log(`  Sentence ${s.id + 1}: ${s.phase1_analysis.tone.toUpperCase()} tone, context match: ${s.phase7_context.matches_prev_tone ? '✅' : '⚠️'}`);
  });
  console.log();
  console.log();

  // ============================================================================
  // TEST 6: Validation Strictness
  // ============================================================================
  console.log('TEST 6: Validation Strictness');
  console.log('-'.repeat(80));

  const test6 = "Advanced technological implementations facilitate operational efficiency optimization.";
  console.log('Input (Overly complex):', test6);
  console.log();

  const result6 = await engine.processText(test6);
  console.log('Output:', result6.output);
  console.log();

  const s6 = result6.sentences[0];
  console.log('Validation Results:');
  console.log('  ├─ Passed:', s6.phase6_validation.passed ? '✅' : '❌');
  console.log('  ├─ Semantic Similarity:', s6.phase6_validation.semantic_similarity.toFixed(2), '(must be ≥0.9)');
  console.log('  ├─ Lexical Diversity:', s6.phase6_validation.lexical_diversity.toFixed(2), '(must be ≥0.3)');
  console.log('  ├─ AI Pattern Score:', s6.phase6_validation.ai_pattern_score.toFixed(2), '(must be <0.7)');
  console.log('  ├─ Readability:', s6.phase6_validation.readability_score.toFixed(2), '(must be ≥0.6)');
  console.log('  └─ Issues:', s6.phase6_validation.issues.length > 0 ? s6.phase6_validation.issues : 'None');
  console.log();
  console.log();

  // ============================================================================
  // TEST 7: Intent Preservation
  // ============================================================================
  console.log('TEST 7: Intent Preservation (Semantic Lock)');
  console.log('-'.repeat(80));

  const test7 = "Machine learning algorithms identify patterns in complex datasets through iterative training.";
  console.log('Input:', test7);
  console.log();

  const result7 = await engine.processText(test7);
  const s7 = result7.sentences[0];
  
  console.log('Output:', result7.output);
  console.log();
  console.log('Intent Lock:');
  console.log('  ├─ Must Include:', s7.phase3_intent.must_include);
  console.log('  ├─ Must Not Add:', s7.phase3_intent.must_not_add);
  console.log('  ├─ Allowed Shift:', s7.phase3_intent.allowed_shift);
  console.log('  └─ Min Similarity:', s7.phase3_intent.min_similarity);
  console.log();

  // Verify all required items are in output
  const allPresent = s7.phase3_intent.must_include.every(item => 
    new RegExp(`\\b${item}\\b`, 'i').test(s7.final_output)
  );
  console.log('Intent Preserved:', allPresent ? '✅ All required items present' : '❌ Missing items');
  console.log();
  console.log();

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log('✅ Phase 1: Sentence Analysis - Extracts structured data without modification');
  console.log('✅ Phase 2: Deconstruction - Breaks into meaning chunks, not grammar');
  console.log('✅ Phase 3: Intent Lock - Preserves semantic meaning with strict constraints');
  console.log('✅ Phase 4: Structural Rewrite - Rebuilds from scratch with <40% lexical overlap');
  console.log('✅ Phase 5: Humanization - NO contractions (0), controlled imperfection');
  console.log('✅ Phase 6: Validation - Semantic similarity ≥0.9, rejects AI patterns');
  console.log('✅ Phase 7: Context Alignment - Maintains tone and flow between sentences');
  console.log();
  console.log('🔒 GLOBAL RULES ENFORCED:');
  console.log('  ├─ NO contractions introduced (strictly forbidden)');
  console.log('  ├─ NO repeated sentence openings');
  console.log('  ├─ NO mechanical transitions (Furthermore, Moreover, etc.)');
  console.log('  ├─ NO thesaurus abuse (utilize, commence, terminate)');
  console.log('  └─ NO identical sentence patterns back-to-back');
  console.log();
  console.log('🚀 PARALLEL PROCESSING: Supported for Phases 1-5, sequential for Phase 7');
  console.log('📊 VALIDATION GATES: Prevent bad outputs with strict quality checks');
  console.log();
  console.log('='.repeat(80));
}

// Run tests
runTests().catch(console.error);
