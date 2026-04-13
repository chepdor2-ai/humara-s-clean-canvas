/**
 * engine.ts — Core orchestrator
 *
 * Pipeline: Normalize → Segment → Tokenize → Syntax → Rules → Rank → Score → Output
 */

import type { Sentence, Issue, SentenceAnalysis, ScoreBreakdown, CorrectionResult } from './types';
import type { Severity } from './types';
import { normalizeText } from '../normalize';
import { splitSentences } from '../segment';
import { tokenizeSentence } from '../tokenize';
import { findSubject, findMainVerb, detectTense, isPassiveVoice } from '../syntax';
import { ALL_RULES } from '../rules';
import { rankIssues } from '../ranking';
import { applyFixes } from '../output';
import { TRANSITION_WORDS, UNCOUNTABLE_NOUNS, SINGULAR_PRONOUNS } from '../lexicon';
import { IRREGULAR_VERBS, FORM_TO_BASE } from '../lexicon/irregularVerbs';

// ── Sentence parsing: tokenize + syntax ──────────────────────────────────────

function parseSentences(text: string): Sentence[] {
  const rawSegments = splitSentences(text);
  let searchOffset = 0;
  const result: Sentence[] = [];

  for (const raw of rawSegments) {
    const idx = text.indexOf(raw, searchOffset);
    const start = idx >= 0 ? idx : searchOffset;
    const end = start + raw.length;
    const tokens = tokenizeSentence(raw, start);
    const subject = findSubject(tokens);
    const mainVerb = findMainVerb(tokens);
    const tense = detectTense(tokens);
    const passive = isPassiveVoice(tokens);
    result.push({ text: raw, start, end, tokens, subject, mainVerb, tense, isPassive: passive });
    searchOffset = end;
  }

  return result;
}

// ── Scoring helpers ──────────────────────────────────────────────────────────

function computeNaturalness(sentences: Sentence[]): number {
  if (sentences.length === 0) return 100;
  const lengths = sentences.map(s => s.tokens.filter(t => t.kind === 'word').length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, l) => a + Math.pow(l - avg, 2), 0) / lengths.length;
  const varianceScore = Math.min(100, variance * 3);

  const allWords = sentences.flatMap(s => s.tokens.filter(t => t.kind === 'word').map(t => t.norm));
  const unique = new Set(allWords).size;
  const diversityRatio = allWords.length > 0 ? unique / allWords.length : 1;
  const diversityScore = diversityRatio * 100;

  const starts = sentences.map(s => {
    const firstWord = s.tokens.find(t => t.kind === 'word');
    return firstWord?.norm || '';
  });
  const uniqueStarts = new Set(starts).size;
  const startVariety = sentences.length > 0 ? (uniqueStarts / sentences.length) * 100 : 100;

  return Math.round(varianceScore * 0.3 + diversityScore * 0.4 + startVariety * 0.3);
}

function computeClarity(sentences: Sentence[], issues: Issue[]): number {
  if (sentences.length === 0) return 100;
  let score = 100;
  const passiveCount = sentences.filter(s => s.isPassive).length;
  const passiveRatio = passiveCount / sentences.length;
  if (passiveRatio > 0.5) score -= 20;
  else if (passiveRatio > 0.3) score -= 10;

  for (const s of sentences) {
    const wc = s.tokens.filter(t => t.kind === 'word').length;
    if (wc > 40) score -= 8;
    else if (wc > 30) score -= 4;
  }
  const errCount = issues.filter(i => i.severity === 'error').length;
  score -= errCount * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeFlow(sentences: Sentence[]): number {
  if (sentences.length <= 1) return 100;
  let score = 80;

  let transitionCount = 0;
  for (const s of sentences) {
    const firstWord = s.tokens.find(t => t.kind === 'word');
    if (firstWord && TRANSITION_WORDS.has(firstWord.norm)) transitionCount++;
  }
  const transitionRatio = transitionCount / (sentences.length - 1);
  if (transitionRatio >= 0.2 && transitionRatio <= 0.6) score += 15;
  else if (transitionRatio > 0) score += 8;

  const lengths = sentences.map(s => s.tokens.filter(t => t.kind === 'word').length);
  let bigJumps = 0;
  for (let i = 1; i < lengths.length; i++) {
    if (Math.abs(lengths[i] - lengths[i - 1]) > 15) bigJumps++;
  }
  score -= bigJumps * 5;

  const tenses = sentences.map(s => s.tense).filter(t => t !== 'unknown');
  if (tenses.length > 1) {
    const counts: Record<string, number> = {};
    for (const t of tenses) counts[t] = (counts[t] || 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant) {
      const inconsistent = tenses.filter(t => t !== dominant).length;
      score -= inconsistent * 5;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Cross-sentence: tense consistency ────────────────────────────────────────

function checkTenseConsistency(sentences: Sentence[]): Issue[] {
  const issues: Issue[] = [];
  const detectedTenses = sentences.map(s => s.tense).filter(t => t !== 'unknown');
  if (detectedTenses.length < 3) return issues;

  const counts: Record<string, number> = {};
  for (const t of detectedTenses) counts[t] = (counts[t] || 0) + 1;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!dominant) return issues;

  for (const s of sentences) {
    if (s.tense !== 'unknown' && s.tense !== dominant) {
      issues.push({
        ruleId: 'tense_consistency',
        message: `This sentence uses ${s.tense} tense while most text uses ${dominant} tense.`,
        severity: 'style',
        start: s.start,
        end: s.end,
        replacements: [],
        confidence: 0.55,
        category: 'Consistency',
        sentenceIndex: 0,
      });
    }
  }
  return issues;
}

// ── GrammarChecker class ─────────────────────────────────────────────────────

export class GrammarChecker {
  /**
   * Merge AI-detected issues into the existing issue array.
   */
  mergeAiIssues(
    existingIssues: Issue[],
    aiIssues: Array<{ start: number; end: number; message: string; severity: Severity; category: string }>,
  ): Issue[] {
    const merged = [...existingIssues];
    for (const ai of aiIssues) {
      const exists = merged.some(i => Math.abs(i.start - ai.start) < 3 && Math.abs(i.end - ai.end) < 3);
      if (!exists) {
        merged.push({
          ruleId: 'ai_detected',
          message: ai.message,
          severity: ai.severity,
          start: ai.start,
          end: ai.end,
          replacements: [],
          confidence: 0.8,
          category: ai.category,
          sentenceIndex: 0,
          aiDetected: true,
        });
      }
    }
    return merged.sort((a, b) => a.start - b.start);
  }

  /**
   * Main entry point. Runs the full pipeline.
   */
  check(text: string): CorrectionResult {
    if (!text.trim()) {
      return {
        input: text, output: text, issues: [], sentences: [],
        scores: { grammar: 100, naturalness: 100, clarity: 100, flow: 100, overall: 100 },
        stats: { errors: 0, warnings: 0, style: 0 },
      };
    }

    // Phase 1: Normalize
    const normalized = normalizeText(text);

    // Phase 2-4: Segment → Tokenize → Syntax
    const sentences = parseSentences(normalized);

    // Phase 5: Run all rules per sentence
    let allIssues: Issue[] = [];
    const sentAnalyses: SentenceAnalysis[] = [];

    for (let si = 0; si < sentences.length; si++) {
      const s = sentences[si];

      // Run every registered rule
      for (const rule of ALL_RULES) {
        const ruleIssues = rule.apply(s, normalized);
        // Tag each issue with the correct sentence index
        for (const issue of ruleIssues) {
          issue.sentenceIndex = si;
        }
        allIssues.push(...ruleIssues);
      }

      // Detect fragment/run-on for the SentenceAnalysis
      const words = s.tokens.filter(t => t.kind === 'word');
      const hasVerb = words.some(t => t.pos === 'VERB' || t.pos === 'AUX');
      const isFragment = !hasVerb && words.length >= 3 && words.length <= 15;
      const wordCount = words.length;
      const commaCount = s.tokens.filter(t => t.text === ',').length;
      const conjCount = s.tokens.filter(t => t.pos === 'CONJ').length;
      const isRunOn = (wordCount > 40 && commaCount < 2 && conjCount < 2) || wordCount > 50;

      const sentIssues = allIssues.filter(i => i.sentenceIndex === si);
      const sentErrors = sentIssues.filter(i => i.severity === 'error').length;
      const sentScore = Math.max(0,
        100 - sentErrors * 12 -
        sentIssues.filter(i => i.severity === 'warning').length * 6 -
        sentIssues.filter(i => i.severity === 'style').length * 2
      );

      sentAnalyses.push({
        text: s.text, start: s.start, end: s.end, issues: sentIssues,
        score: sentScore, tense: s.tense, isPassive: s.isPassive,
        isFragment, isRunOn, wordCount,
      });
    }

    // Phase 5b: Cross-sentence rules
    const tenseIssues = checkTenseConsistency(sentences);
    allIssues.push(...tenseIssues);

    // Phase 6: Rank & deduplicate
    allIssues = rankIssues(allIssues);

    // Phase 7: Auto-fix (high-confidence only)
    const output = applyFixes(normalized, allIssues);

    // Phase 8: Score
    const errors   = allIssues.filter(i => i.severity === 'error').length;
    const warnings = allIssues.filter(i => i.severity === 'warning').length;
    const style    = allIssues.filter(i => i.severity === 'style').length;

    const grammarScore = Math.max(0, Math.min(100, 100 - errors * 8 - warnings * 4 - style * 1));
    const naturalness  = computeNaturalness(sentences);
    const clarity      = computeClarity(sentences, allIssues);
    const flow         = computeFlow(sentences);
    const overall      = Math.round(grammarScore * 0.4 + naturalness * 0.2 + clarity * 0.2 + flow * 0.2);

    return {
      input: text,
      output,
      issues: allIssues,
      sentences: sentAnalyses,
      scores: { grammar: grammarScore, naturalness, clarity, flow, overall },
      stats: { errors, warnings, style },
    };
  }
}
