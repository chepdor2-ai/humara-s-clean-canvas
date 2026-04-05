/**
 * Multi-Engine Humanization Test & Validation
 * Processes text through all available humanizer engines and validates outputs
 */

import { humanize } from './src/humanizer';
import { premiumHumanize } from './src/premium-humanizer';
import { llmHumanize } from './src/llm-humanizer';
import { ghostProHumanize } from './src/ghost-pro';
import HumanV11Engine from './src/human-v1-1';
import { semanticSimilaritySync } from './src/semantic-guard';
import { sentTokenize } from './src/utils';

const INPUT_TEXT = `Psychological Foundations of Leadership
Part 1: Leadership Case Problem A - Suzanne Expects Results

I. Introduction
Suzanne, the Chief Marketing Officer (CMO) of an athletic clothing company, is confronted with significant challenges due to the declining performance of her sales manager, Hank. As a key figure in the organization, Suzanne's role is critical in driving the company's marketing and sales strategies. However, her leadership approach, especially in dealing with Hank's performance issues, reveals several underlying problems. The purpose of this analysis is to delve into Suzanne's leadership performance, focusing on her application of the four foundations of leadership. By evaluating her cognitive, social, emotional, and moral foundations, we can better understand her strengths and areas needing improvement. This analysis aims to provide insights into how Suzanne can enhance her leadership effectiveness and foster a more supportive and productive work environment.`;

interface ValidationMetrics {
  semanticSimilarity: number;
  sentenceCountMatch: boolean;
  hasContractions: boolean;
  lexicalDiversity: number;
  aiDetectionScore: number;
  readabilityScore: number;
  preservedEntities: boolean;
}

function validateOutput(original: string, humanized: string): ValidationMetrics {
  // 1. Semantic Similarity
  const semanticSimilarity = semanticSimilaritySync(original, humanized);

  // 2. Sentence Count Match
  const originalSentences = sentTokenize(original);
  const humanizedSentences = sentTokenize(humanized);
  const sentenceCountMatch = originalSentences.length === humanizedSentences.length;

  // 3. Check for contractions (should be NONE per v1.1 spec)
  const hasContractions = /\b\w+'(?:t|s|re|ve|ll|d|m)\b/i.test(humanized);

  // 4. Lexical Diversity (how many words changed)
  const originalWords = new Set(original.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const humanizedWords = new Set(humanized.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const onlyInHumanized = [...humanizedWords].filter(w => !originalWords.has(w));
  const lexicalDiversity = onlyInHumanized.length / humanizedWords.size;

  // 5. AI Detection Score (simple heuristic)
  const aiDetectionScore = calculateAIDetectionScore(humanized);

  // 6. Readability Score
  const readabilityScore = calculateReadabilityScore(humanized);

  // 7. Check if key entities are preserved
  const keyEntities = ['Suzanne', 'Hank', 'CMO', 'Chief Marketing Officer'];
  const preservedEntities = keyEntities.every(e => humanized.includes(e));

  return {
    semanticSimilarity,
    sentenceCountMatch,
    hasContractions,
    lexicalDiversity,
    aiDetectionScore,
    readabilityScore,
    preservedEntities,
  };
}

function calculateAIDetectionScore(text: string): number {
  let score = 0;

  // Check for AI patterns
  const aiMarkers = [
    /\bfurthermore\b/gi,
    /\bmoreover\b/gi,
    /\bin conclusion\b/gi,
    /\bconsequently\b/gi,
    /\badditionally\b/gi,
  ];

  for (const marker of aiMarkers) {
    const matches = text.match(marker);
    if (matches) score += matches.length * 0.1;
  }

  // Check for overly complex words
  const complexWords = /\b(utilize|facilitate|implement|optimize|leverage)\b/gi;
  const complexMatches = text.match(complexWords);
  if (complexMatches) score += complexMatches.length * 0.15;

  return Math.min(score, 1);
}

function calculateReadabilityScore(text: string): number {
  const words = text.split(/\s+/);
  const sentences = sentTokenize(text);
  
  const avgWordsPerSentence = words.length / sentences.length;
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;

  // Ideal: 15-20 words per sentence, 4-6 chars per word
  const sentenceLengthScore = 1 - Math.abs(avgWordsPerSentence - 17.5) / 20;
  const wordLengthScore = 1 - Math.abs(avgWordLength - 5) / 5;

  return (sentenceLengthScore + wordLengthScore) / 2;
}

async function runAllEngines() {
  console.log('='.repeat(100));
  console.log('MULTI-ENGINE HUMANIZATION TEST & VALIDATION');
  console.log('='.repeat(100));
  console.log();
  console.log('INPUT TEXT:');
  console.log('-'.repeat(100));
  console.log(INPUT_TEXT);
  console.log();
  console.log('Original Stats:');
  console.log(`  - Characters: ${INPUT_TEXT.length}`);
  console.log(`  - Words: ${INPUT_TEXT.split(/\s+/).length}`);
  console.log(`  - Sentences: ${sentTokenize(INPUT_TEXT).length}`);
  console.log();
  console.log('='.repeat(100));
  console.log();

  const results: Array<{
    engine: string;
    output: string;
    metrics: ValidationMetrics;
    processingTime: number;
  }> = [];

  // ============================================================================
  // ENGINE 1: Standard Humanizer
  // ============================================================================
  console.log('ENGINE 1: Standard Humanizer');
  console.log('-'.repeat(100));
  
  const start1 = Date.now();
  const output1 = humanize(INPUT_TEXT, {
    preserve_sentence_count: true,
    allow_contractions: false,
    allow_first_person_injection: false,
    stealth_mode: true,
    max_word_change: 0.6,
  });
  const time1 = Date.now() - start1;
  
  const metrics1 = validateOutput(INPUT_TEXT, output1);
  results.push({ engine: 'Standard Humanizer', output: output1, metrics: metrics1, processingTime: time1 });
  
  console.log('OUTPUT:');
  console.log(output1.substring(0, 500) + '...\n');
  console.log('VALIDATION:');
  console.log(`  ✓ Processing Time: ${time1}ms`);
  console.log(`  ${metrics1.semanticSimilarity >= 0.9 ? '✅' : '❌'} Semantic Similarity: ${metrics1.semanticSimilarity.toFixed(3)} (≥0.9 required)`);
  console.log(`  ${metrics1.sentenceCountMatch ? '✅' : '❌'} Sentence Count Match: ${metrics1.sentenceCountMatch}`);
  console.log(`  ${!metrics1.hasContractions ? '✅' : '❌'} No Contractions: ${!metrics1.hasContractions}`);
  console.log(`  ${metrics1.lexicalDiversity >= 0.3 ? '✅' : '⚠️'} Lexical Diversity: ${metrics1.lexicalDiversity.toFixed(3)} (≥0.3 ideal)`);
  console.log(`  ${metrics1.aiDetectionScore < 0.3 ? '✅' : '⚠️'} AI Detection Score: ${metrics1.aiDetectionScore.toFixed(3)} (<0.3 ideal)`);
  console.log(`  ${metrics1.readabilityScore >= 0.6 ? '✅' : '⚠️'} Readability: ${metrics1.readabilityScore.toFixed(3)} (≥0.6 ideal)`);
  console.log(`  ${metrics1.preservedEntities ? '✅' : '❌'} Key Entities Preserved: ${metrics1.preservedEntities}`);
  console.log();

  // ============================================================================
  // ENGINE 2: Premium Humanizer
  // ============================================================================
  console.log('ENGINE 2: Premium Humanizer');
  console.log('-'.repeat(100));
  
  const start2 = Date.now();
  const output2 = await premiumHumanize(INPUT_TEXT, {
    preserve_sentence_count: true,
    allow_contractions: false,
    allow_first_person_injection: false,
    stealth_mode: true,
  });
  const time2 = Date.now() - start2;
  
  const metrics2 = validateOutput(INPUT_TEXT, output2);
  results.push({ engine: 'Premium Humanizer', output: output2, metrics: metrics2, processingTime: time2 });
  
  console.log('OUTPUT:');
  console.log(output2.substring(0, 500) + '...\n');
  console.log('VALIDATION:');
  console.log(`  ✓ Processing Time: ${time2}ms`);
  console.log(`  ${metrics2.semanticSimilarity >= 0.9 ? '✅' : '❌'} Semantic Similarity: ${metrics2.semanticSimilarity.toFixed(3)} (≥0.9 required)`);
  console.log(`  ${metrics2.sentenceCountMatch ? '✅' : '❌'} Sentence Count Match: ${metrics2.sentenceCountMatch}`);
  console.log(`  ${!metrics2.hasContractions ? '✅' : '❌'} No Contractions: ${!metrics2.hasContractions}`);
  console.log(`  ${metrics2.lexicalDiversity >= 0.3 ? '✅' : '⚠️'} Lexical Diversity: ${metrics2.lexicalDiversity.toFixed(3)} (≥0.3 ideal)`);
  console.log(`  ${metrics2.aiDetectionScore < 0.3 ? '✅' : '⚠️'} AI Detection Score: ${metrics2.aiDetectionScore.toFixed(3)} (<0.3 ideal)`);
  console.log(`  ${metrics2.readabilityScore >= 0.6 ? '✅' : '⚠️'} Readability: ${metrics2.readabilityScore.toFixed(3)} (≥0.6 ideal)`);
  console.log(`  ${metrics2.preservedEntities ? '✅' : '❌'} Key Entities Preserved: ${metrics2.preservedEntities}`);
  console.log();

  // ============================================================================
  // ENGINE 3: LLM Humanizer
  // ============================================================================
  console.log('ENGINE 3: LLM Humanizer');
  console.log('-'.repeat(100));
  
  const start3 = Date.now();
  const output3 = await llmHumanize(INPUT_TEXT, {
    preserve_sentence_count: true,
    allow_contractions: false,
    allow_first_person_injection: false,
    stealth_mode: true,
  });
  const time3 = Date.now() - start3;
  
  const metrics3 = validateOutput(INPUT_TEXT, output3);
  results.push({ engine: 'LLM Humanizer', output: output3, metrics: metrics3, processingTime: time3 });
  
  console.log('OUTPUT:');
  console.log(output3.substring(0, 500) + '...\n');
  console.log('VALIDATION:');
  console.log(`  ✓ Processing Time: ${time3}ms`);
  console.log(`  ${metrics3.semanticSimilarity >= 0.9 ? '✅' : '❌'} Semantic Similarity: ${metrics3.semanticSimilarity.toFixed(3)} (≥0.9 required)`);
  console.log(`  ${metrics3.sentenceCountMatch ? '✅' : '❌'} Sentence Count Match: ${metrics3.sentenceCountMatch}`);
  console.log(`  ${!metrics3.hasContractions ? '✅' : '❌'} No Contractions: ${!metrics3.hasContractions}`);
  console.log(`  ${metrics3.lexicalDiversity >= 0.3 ? '✅' : '⚠️'} Lexical Diversity: ${metrics3.lexicalDiversity.toFixed(3)} (≥0.3 ideal)`);
  console.log(`  ${metrics3.aiDetectionScore < 0.3 ? '✅' : '⚠️'} AI Detection Score: ${metrics3.aiDetectionScore.toFixed(3)} (<0.3 ideal)`);
  console.log(`  ${metrics3.readabilityScore >= 0.6 ? '✅' : '⚠️'} Readability: ${metrics3.readabilityScore.toFixed(3)} (≥0.6 ideal)`);
  console.log(`  ${metrics3.preservedEntities ? '✅' : '❌'} Key Entities Preserved: ${metrics3.preservedEntities}`);
  console.log();

  // ============================================================================
  // ENGINE 4: Ghost Pro Humanizer
  // ============================================================================
  console.log('ENGINE 4: Ghost Pro Humanizer');
  console.log('-'.repeat(100));
  
  const start4 = Date.now();
  const output4 = await ghostProHumanize(INPUT_TEXT, {
    preserve_sentence_count: true,
    allow_contractions: false,
    allow_first_person_injection: false,
    stealth_mode: true,
  });
  const time4 = Date.now() - start4;
  
  const metrics4 = validateOutput(INPUT_TEXT, output4);
  results.push({ engine: 'Ghost Pro', output: output4, metrics: metrics4, processingTime: time4 });
  
  console.log('OUTPUT:');
  console.log(output4.substring(0, 500) + '...\n');
  console.log('VALIDATION:');
  console.log(`  ✓ Processing Time: ${time4}ms`);
  console.log(`  ${metrics4.semanticSimilarity >= 0.9 ? '✅' : '❌'} Semantic Similarity: ${metrics4.semanticSimilarity.toFixed(3)} (≥0.9 required)`);
  console.log(`  ${metrics4.sentenceCountMatch ? '✅' : '❌'} Sentence Count Match: ${metrics4.sentenceCountMatch}`);
  console.log(`  ${!metrics4.hasContractions ? '✅' : '❌'} No Contractions: ${!metrics4.hasContractions}`);
  console.log(`  ${metrics4.lexicalDiversity >= 0.3 ? '✅' : '⚠️'} Lexical Diversity: ${metrics4.lexicalDiversity.toFixed(3)} (≥0.3 ideal)`);
  console.log(`  ${metrics4.aiDetectionScore < 0.3 ? '✅' : '⚠️'} AI Detection Score: ${metrics4.aiDetectionScore.toFixed(3)} (<0.3 ideal)`);
  console.log(`  ${metrics4.readabilityScore >= 0.6 ? '✅' : '⚠️'} Readability: ${metrics4.readabilityScore.toFixed(3)} (≥0.6 ideal)`);
  console.log(`  ${metrics4.preservedEntities ? '✅' : '❌'} Key Entities Preserved: ${metrics4.preservedEntities}`);
  console.log();

  // ============================================================================
  // ENGINE 5: Human v1.1 (NEW - Strict 7-Phase)
  // ============================================================================
  console.log('ENGINE 5: Human v1.1 (Strict 7-Phase Sentence Processing)');
  console.log('-'.repeat(100));
  
  const start5 = Date.now();
  const humanV11 = new HumanV11Engine();
  const result5 = await humanV11.processTextParallel(INPUT_TEXT);
  const output5 = result5.output;
  const time5 = Date.now() - start5;
  
  const metrics5 = validateOutput(INPUT_TEXT, output5);
  results.push({ engine: 'Human v1.1', output: output5, metrics: metrics5, processingTime: time5 });
  
  console.log('OUTPUT:');
  console.log(output5.substring(0, 500) + '...\n');
  console.log('VALIDATION:');
  console.log(`  ✓ Processing Time: ${time5}ms`);
  console.log(`  ${metrics5.semanticSimilarity >= 0.9 ? '✅' : '❌'} Semantic Similarity: ${metrics5.semanticSimilarity.toFixed(3)} (≥0.9 required)`);
  console.log(`  ${metrics5.sentenceCountMatch ? '✅' : '❌'} Sentence Count Match: ${metrics5.sentenceCountMatch}`);
  console.log(`  ${!metrics5.hasContractions ? '✅' : '❌'} No Contractions: ${!metrics5.hasContractions}`);
  console.log(`  ${metrics5.lexicalDiversity >= 0.3 ? '✅' : '⚠️'} Lexical Diversity: ${metrics5.lexicalDiversity.toFixed(3)} (≥0.3 ideal)`);
  console.log(`  ${metrics5.aiDetectionScore < 0.3 ? '✅' : '⚠️'} AI Detection Score: ${metrics5.aiDetectionScore.toFixed(3)} (<0.3 ideal)`);
  console.log(`  ${metrics5.readabilityScore >= 0.6 ? '✅' : '⚠️'} Readability: ${metrics5.readabilityScore.toFixed(3)} (≥0.6 ideal)`);
  console.log(`  ${metrics5.preservedEntities ? '✅' : '❌'} Key Entities Preserved: ${metrics5.preservedEntities}`);
  console.log();
  console.log('Phase-by-Phase Details (First 3 sentences):');
  result5.sentences.slice(0, 3).forEach(s => {
    console.log(`\n  Sentence ${s.id + 1}:`);
    console.log(`    Original: ${s.original}`);
    console.log(`    Final:    ${s.final_output}`);
    console.log(`    Phases:   ${s.phase4_rewrite.transformations_applied.join(', ')}`);
    console.log(`    Valid:    ${s.phase6_validation.passed ? '✅' : '❌'} (sim: ${s.phase6_validation.semantic_similarity.toFixed(2)})`);
  });
  console.log();

  // ============================================================================
  // COMPARATIVE ANALYSIS
  // ============================================================================
  console.log('='.repeat(100));
  console.log('COMPARATIVE ANALYSIS');
  console.log('='.repeat(100));
  console.log();

  // Create comparison table
  console.log('┌─────────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ Engine                  │ Semantic │ Sentence │ No Contr │ Lexical  │ AI Score │');
  console.log('│                         │ Similarity│ Match   │          │ Diversity│          │');
  console.log('├─────────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');
  
  results.forEach(r => {
    const name = r.engine.padEnd(23);
    const sem = r.metrics.semanticSimilarity.toFixed(3).padStart(8);
    const sent = (r.metrics.sentenceCountMatch ? '✅' : '❌').padStart(8);
    const contr = (!r.metrics.hasContractions ? '✅' : '❌').padStart(8);
    const lex = r.metrics.lexicalDiversity.toFixed(3).padStart(8);
    const ai = r.metrics.aiDetectionScore.toFixed(3).padStart(8);
    
    console.log(`│ ${name} │ ${sem} │ ${sent} │ ${contr} │ ${lex} │ ${ai} │`);
  });
  
  console.log('└─────────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');
  console.log();

  // Performance comparison
  console.log('PERFORMANCE:');
  results.forEach(r => {
    console.log(`  ${r.engine.padEnd(25)}: ${r.processingTime}ms`);
  });
  console.log();

  // Best performer
  const bestSemantic = results.reduce((best, r) => 
    r.metrics.semanticSimilarity > best.metrics.semanticSimilarity ? r : best
  );
  const bestDiversity = results.reduce((best, r) => 
    r.metrics.lexicalDiversity > best.metrics.lexicalDiversity ? r : best
  );
  const bestAI = results.reduce((best, r) => 
    r.metrics.aiDetectionScore < best.metrics.aiDetectionScore ? r : best
  );
  const fastest = results.reduce((best, r) => 
    r.processingTime < best.processingTime ? r : best
  );

  console.log('BEST PERFORMERS:');
  console.log(`  ⭐ Best Semantic Preservation: ${bestSemantic.engine} (${bestSemantic.metrics.semanticSimilarity.toFixed(3)})`);
  console.log(`  ⭐ Best Lexical Diversity: ${bestDiversity.engine} (${bestDiversity.metrics.lexicalDiversity.toFixed(3)})`);
  console.log(`  ⭐ Lowest AI Detection: ${bestAI.engine} (${bestAI.metrics.aiDetectionScore.toFixed(3)})`);
  console.log(`  ⭐ Fastest Processing: ${fastest.engine} (${fastest.processingTime}ms)`);
  console.log();

  // Overall recommendation
  console.log('='.repeat(100));
  console.log('RECOMMENDATION:');
  console.log('='.repeat(100));
  
  // Score each engine
  const scores = results.map(r => ({
    engine: r.engine,
    score: 
      (r.metrics.semanticSimilarity >= 0.9 ? 1 : 0) +
      (r.metrics.sentenceCountMatch ? 1 : 0) +
      (!r.metrics.hasContractions ? 1 : 0) +
      (r.metrics.lexicalDiversity >= 0.3 ? 1 : 0) +
      (r.metrics.aiDetectionScore < 0.3 ? 1 : 0) +
      (r.metrics.readabilityScore >= 0.6 ? 1 : 0) +
      (r.metrics.preservedEntities ? 1 : 0),
  }));

  scores.sort((a, b) => b.score - a.score);

  console.log();
  console.log('Overall Rankings (7 criteria):');
  scores.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.engine.padEnd(25)}: ${s.score}/7 points`);
  });
  console.log();

  if (scores[0].score >= 6) {
    console.log(`✅ RECOMMENDED ENGINE: ${scores[0].engine}`);
    console.log('   This engine meets most quality criteria while maintaining semantic accuracy.');
  } else {
    console.log('⚠️  No engine achieved 6/7 criteria. Consider refining settings or hybrid approach.');
  }

  console.log();
  console.log('='.repeat(100));
  console.log('FULL OUTPUTS');
  console.log('='.repeat(100));
  console.log();

  results.forEach((r, i) => {
    console.log(`ENGINE ${i + 1}: ${r.engine}`);
    console.log('-'.repeat(100));
    console.log(r.output);
    console.log();
    console.log();
  });
}

// Run the test
runAllEngines().catch(console.error);
