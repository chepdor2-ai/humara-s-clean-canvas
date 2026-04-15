import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

/**
 * Advanced punctuation rules:
 * - Missing comma before coordinating conjunctions (FANBOYS) in compound sentences
 * - Capitalization after sentence-ending punctuation
 * - Missing comma after dependent clause openers
 * - Colon followed by lowercase when listing a complete sentence
 * - Semicolon misuse (between non-independent clauses)
 */

const COORDINATING_CONJS = new Set(['and', 'but', 'or', 'nor', 'for', 'yet', 'so']);
const DEPENDENT_OPENERS = new Set([
  'although', 'because', 'since', 'while', 'when', 'before', 'after',
  'if', 'unless', 'until', 'though', 'even', 'whereas', 'once',
  'whenever', 'wherever', 'provided', 'assuming',
]);

export const advancedPunctuationRule: Rule = {
  id: 'advanced_punctuation',
  description: 'Compound sentence commas, dependent clause commas, capitalization after periods',

  apply(sentence: Sentence, fullText: string): Issue[] {
    const issues: Issue[] = [];
    const raw = fullText.slice(sentence.start, sentence.end);
    const base = sentence.start;
    const words = sentence.tokens.filter(t => t.kind === 'word');

    // 1. Capitalization after sentence-ending punctuation (.!?) inside text
    const afterPeriod = /([.!?])\s+([a-z])/g;
    let match: RegExpExecArray | null;
    while ((match = afterPeriod.exec(raw)) !== null) {
      const charIdx = match.index + match[0].length - 1;
      const lower = match[2];
      // Skip common abbreviations like "e.g.", "i.e.", "vs."
      const prevChars = raw.slice(Math.max(0, match.index - 4), match.index + 1);
      if (/\b(e\.g|i\.e|vs|mr|mrs|ms|dr|prof|sr|jr|etc|inc|ltd|co|st)\./i.test(prevChars)) continue;
      issues.push({
        ruleId: 'cap_after_period',
        message: `Capitalize after "${match[1]}": "${lower}" → "${lower.toUpperCase()}"`,
        severity: 'error',
        start: base + charIdx,
        end: base + charIdx + 1,
        replacements: [lower.toUpperCase()],
        confidence: 0.93,
        category: 'Capitalization',
        sentenceIndex: 0,
      });
    }

    // 2. Missing comma before FANBOYS in compound sentences (>= 5 words each side)
    for (let i = 2; i < words.length - 2; i++) {
      if (!COORDINATING_CONJS.has(words[i].norm)) continue;
      // Check no comma immediately before the conjunction
      const prevToken = sentence.tokens.find(t => t.end === words[i].start || t.end === words[i].start - 1);
      if (prevToken && prevToken.text === ',') continue;
      // Simple heuristic: both sides have a subject+verb (at least 4 words each side)
      if (i >= 3 && (words.length - i - 1) >= 3) {
        const hasVerbBefore = words.slice(0, i).some(w => w.pos === 'VERB' || w.pos === 'AUX');
        const hasVerbAfter = words.slice(i + 1).some(w => w.pos === 'VERB' || w.pos === 'AUX');
        if (hasVerbBefore && hasVerbAfter) {
          issues.push({
            ruleId: 'comma_before_conj',
            message: `Add a comma before "${words[i].text}" in a compound sentence.`,
            severity: 'warning',
            start: words[i].start - 1,
            end: words[i].start,
            replacements: [`, `],
            confidence: 0.72,
            category: 'Punctuation',
            sentenceIndex: 0,
          });
        }
      }
    }

    // 3. Missing comma after dependent clause opener at start of sentence
    if (words.length >= 4 && DEPENDENT_OPENERS.has(words[0].norm)) {
      // Look for comma within first ~8 tokens
      const firstComma = sentence.tokens.findIndex(t => t.text === ',');
      if (firstComma < 0 || firstComma > 12) {
        // Find a good break point (after subject/verb cluster)
        const breakIdx = Math.min(words.length - 2, 6);
        const breakPos = words[breakIdx].end;
        issues.push({
          ruleId: 'comma_after_dependent',
          message: `Add a comma after the introductory "${words[0].text}" clause.`,
          severity: 'warning',
          start: breakPos,
          end: breakPos,
          replacements: [','],
          confidence: 0.70,
          category: 'Punctuation',
          sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
