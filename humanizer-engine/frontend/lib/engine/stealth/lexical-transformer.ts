/**
 * Lexical Transformer — Context-Aware Word & Phrase Replacement
 * ==============================================================
 * Goes beyond simple synonym swapping. Uses the composite DictionaryService
 * to find contextually appropriate replacements with these rules:
 *   - Only replace words with high AI-pattern frequency
 *   - Prefer PPDB paraphrases over single-word synonyms
 *   - Keep domain-specific terms intact
 *   - Log every change in ctx.changes
 *
 * NO contractions. NO first person. NO rhetorical questions.
 */

import type { TextContext, Transformer, ChangeRecord } from './types';
import { getSynonyms, getParaphrases, getBestReplacement, enrichPhrase, PHRASE_PARAPHRASES } from './dictionary-service';
import { AI_WORD_REPLACEMENTS } from '../shared-dictionaries';

/* ── Protected Terms (Domain-Specific, Academic) ──────────────────── */

const PROTECTED_TERMS = new Set([
  // Academic structure
  'hypothesis', 'methodology', 'statistical', 'significance', 'correlation',
  'empirical', 'qualitative', 'quantitative', 'longitudinal', 'cross-sectional',
  'meta-analysis', 'peer-reviewed', 'systematic', 'literature', 'bibliography',
  'abstract', 'thesis', 'dissertation', 'citation', 'reference',
  // Scientific
  'photosynthesis', 'mitochondria', 'chromosome', 'genome', 'protein',
  'molecule', 'algorithm', 'compilation', 'recursion', 'encryption',
  'quantum', 'thermodynamic', 'electromagnetic', 'gravitational',
  // Medical
  'diagnosis', 'prognosis', 'pathology', 'etiology', 'epidemiology',
  'pharmacology', 'symptom', 'syndrome', 'therapeutic', 'clinical',
  // Legal
  'jurisdiction', 'plaintiff', 'defendant', 'statute', 'precedent',
  'litigation', 'arbitration', 'tort', 'legislation', 'constitutional',
  // Technical
  'infrastructure', 'implementation', 'specification', 'configuration',
  'authentication', 'authorization', 'middleware', 'protocol',
  // People and places (proper nouns handled separately)
]);

/* ── AI-Heavy Words (High Priority for Replacement) ───────────────── */

const HIGH_PRIORITY_AI_WORDS = new Set([
  'utilize', 'utilise', 'leverage', 'facilitate', 'comprehensive', 'multifaceted',
  'paramount', 'furthermore', 'moreover', 'nevertheless', 'consequently',
  'additionally', 'subsequently', 'delve', 'underscore', 'underpin',
  'pivotal', 'nuanced', 'robust', 'holistic', 'paradigm', 'landscape',
  'ecosystem', 'trajectory', 'discourse', 'intersection', 'overarching',
  'aforementioned', 'henceforth', 'thereby', 'thereof', 'wherein',
  'notwithstanding', 'inasmuch', 'insofar', 'heretofore',
  'endeavor', 'endeavour', 'elucidate', 'delineate', 'articulate',
  'juxtapose', 'amalgamate', 'proliferate', 'promulgate', 'disseminate',
  'ameliorate', 'exacerbate', 'epitomize', 'exemplify', 'encapsulate',
  'necessitate', 'perpetuate', 'proliferation', 'ramification',
  'spearhead', 'streamline', 'synergize', 'synthesize',
]);

/* ── Phrase Replacement Patterns ──────────────────────────────────── */

const AI_PHRASE_PATTERNS: Array<{ pattern: RegExp; replacements: string[] }> = [
  { pattern: /\bin order to\b/gi, replacements: ['to', 'so as to'] },
  { pattern: /\bdue to the fact that\b/gi, replacements: ['because', 'since', 'as'] },
  { pattern: /\ba large number of\b/gi, replacements: ['many', 'numerous'] },
  { pattern: /\bin the event that\b/gi, replacements: ['if', 'should'] },
  { pattern: /\bon the other hand\b/gi, replacements: ['by contrast', 'then again', 'alternatively'] },
  { pattern: /\bas a result\b/gi, replacements: ['so', 'thus', 'for that reason'] },
  { pattern: /\bin addition\b/gi, replacements: ['also', 'besides', 'further'] },
  { pattern: /\bfor example\b/gi, replacements: ['for instance', 'such as', 'to illustrate'] },
  { pattern: /\bin terms of\b/gi, replacements: ['regarding', 'when it comes to', 'as for'] },
  { pattern: /\bwith regard to\b/gi, replacements: ['about', 'regarding', 'concerning'] },
  { pattern: /\bit is important to note that\b/gi, replacements: ['notably', 'a key point is that'] },
  { pattern: /\bit should be noted that\b/gi, replacements: ['notably', 'worth noting:'] },
  { pattern: /\bin the context of\b/gi, replacements: ['within', 'in', 'regarding'] },
  { pattern: /\bon the basis of\b/gi, replacements: ['based on', 'from', 'drawing on'] },
  { pattern: /\bat the same time\b/gi, replacements: ['simultaneously', 'concurrently'] },
  { pattern: /\bwith respect to\b/gi, replacements: ['about', 'regarding', 'on'] },
  { pattern: /\bin spite of\b/gi, replacements: ['despite', 'even with', 'regardless of'] },
  { pattern: /\bby means of\b/gi, replacements: ['through', 'using', 'via'] },
  { pattern: /\bin accordance with\b/gi, replacements: ['following', 'per', 'in line with'] },
  { pattern: /\bfor the purpose of\b/gi, replacements: ['to', 'for'] },
  { pattern: /\bprior to\b/gi, replacements: ['before', 'ahead of'] },
  { pattern: /\bsubsequent to\b/gi, replacements: ['after', 'following'] },
  { pattern: /\bin contrast to\b/gi, replacements: ['unlike', 'as opposed to'] },
  { pattern: /\bas well as\b/gi, replacements: ['and', 'along with'] },
  { pattern: /\ba wide range of\b/gi, replacements: ['many', 'various', 'diverse'] },
  { pattern: /\btake into account\b/gi, replacements: ['consider', 'factor in'] },
  { pattern: /\bplay a (?:significant |important |key |crucial )?role in\b/gi, replacements: ['affect', 'shape', 'influence'] },
  { pattern: /\bhave an impact on\b/gi, replacements: ['affect', 'influence', 'change'] },
  { pattern: /\bin light of\b/gi, replacements: ['given', 'considering', 'because of'] },
  { pattern: /\bto a (?:large |great |certain |significant )?extent\b/gi, replacements: ['largely', 'mostly', 'partly'] },
  { pattern: /\bthe fact that\b/gi, replacements: ['that', 'how'] },
  { pattern: /\bit is (?:clear|evident|obvious) that\b/gi, replacements: ['clearly', 'plainly'] },
  { pattern: /\bthere is no doubt that\b/gi, replacements: ['certainly', 'without question'] },
  { pattern: /\bat this point in time\b/gi, replacements: ['now', 'currently'] },
  { pattern: /\bat the present time\b/gi, replacements: ['now', 'currently'] },
  { pattern: /\bin the near future\b/gi, replacements: ['soon', 'shortly'] },
  { pattern: /\bover the course of\b/gi, replacements: ['during', 'throughout'] },
  { pattern: /\bgive rise to\b/gi, replacements: ['cause', 'lead to', 'produce'] },
  { pattern: /\bshed light on\b/gi, replacements: ['explain', 'clarify', 'reveal'] },
  { pattern: /\bpave the way for\b/gi, replacements: ['enable', 'make possible'] },
  { pattern: /\bnot only\b.{1,50}\bbut also\b/gi, replacements: [] }, // Handled sentence-level
];

/* ── Lexical Transformer Implementation ──────────────────────────── */

export const lexicalTransformer: Transformer = {
  name: 'LexicalTransformer',
  priority: 10,

  transform(ctx: TextContext): TextContext {
    const aggressive = ctx.config.aggressive;
    const maxReplacementRate = aggressive ? 0.45 : 0.30;

    for (const sentence of ctx.sentences) {
      if (sentence.reverted) continue;

      let text = sentence.transformed;
      const changes: ChangeRecord[] = [];
      let replacementCount = 0;
      const wordCount = text.split(/\s+/).length;
      const maxReplacements = Math.ceil(wordCount * maxReplacementRate);

      // Phase 1: Replace AI phrases first (higher impact, more natural)
      for (const { pattern, replacements } of AI_PHRASE_PATTERNS) {
        if (replacementCount >= maxReplacements) break;
        if (replacements.length === 0) continue;

        const match = text.match(pattern);
        if (match) {
          const replacement = replacements[Math.floor(Math.random() * replacements.length)];
          const original = match[0];

          // Preserve capitalization
          const finalReplacement = original[0] === original[0].toUpperCase()
            ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
            : replacement;

          text = text.replace(pattern, finalReplacement);
          replacementCount++;
          changes.push({
            type: 'lexical',
            original,
            replacement: finalReplacement,
            reason: 'AI phrase pattern replacement',
          });
        }
      }

      // Phase 2: Replace high-priority AI words
      const words = text.split(/\b/);
      const newWords: string[] = [];
      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const word = words[wIdx];
        if (replacementCount >= maxReplacements) {
          newWords.push(word);
          continue;
        }

        const lower = word.toLowerCase();
        if (PROTECTED_TERMS.has(lower) || word.length <= 3 || !/^[a-zA-Z]+$/.test(word)) {
          newWords.push(word);
          continue;
        }

        // Detect if this word is plural (ends in 's' or 'es') — only for words > 4 chars
        const isPlural = word.length > 4 && /(?:ies|es|s)$/i.test(word);
        const baseWord = isPlural
          ? lower.replace(/ies$/, 'y').replace(/ses$/, 'se').replace(/es$/, 'e').replace(/s$/, '')
          : lower;

        // Only replace words that are actually high-priority AI words
        if (HIGH_PRIORITY_AI_WORDS.has(lower) || HIGH_PRIORITY_AI_WORDS.has(baseWord)) {
          const replacement = getBestReplacement(lower, text) ?? (isPlural ? getBestReplacement(baseWord, text) : null);
          if (replacement && replacement.toLowerCase() !== lower && replacement.toLowerCase() !== baseWord
              && /^[a-zA-Z]+$/.test(replacement) && replacement.length >= 2) {
            // Preserve capitalization and plural form
            let final = replacement;
            if (isPlural && !final.endsWith('s')) {
              final = final + 's';
            }
            if (word[0] === word[0].toUpperCase()) {
              final = final.charAt(0).toUpperCase() + final.slice(1);
            }
            newWords.push(final);
            replacementCount++;
            changes.push({
              type: 'lexical',
              original: word,
              replacement: final,
              reason: 'high-priority AI word replacement',
            });
            continue;
          }
        }

        // Phase 3: Contextual synonym replacement — ONLY for words already in shared AI dict
        if (aggressive && sentence.patternCount > 2 && AI_WORD_REPLACEMENTS[lower] && Math.random() < 0.10) {
          const synonyms = AI_WORD_REPLACEMENTS[lower] ?? [];
          if (synonyms.length > 0) {
            let syn = synonyms[Math.floor(Math.random() * Math.min(3, synonyms.length))];
            if (syn.toLowerCase() !== lower && !syn.includes(' ') && syn.length >= 2 && /^[a-zA-Z]+$/.test(syn)) {
              // Preserve plural form
              if (isPlural && !syn.endsWith('s')) {
                syn = syn + 's';
              }
              const final = word[0] === word[0].toUpperCase()
                ? syn.charAt(0).toUpperCase() + syn.slice(1)
                : syn;
              newWords.push(final);
              replacementCount++;
              changes.push({
                type: 'lexical',
                original: word,
                replacement: final,
                reason: 'contextual synonym diversification',
              });
              continue;
            }
          }
        }

        newWords.push(word);
      }

      text = newWords.join('');

      // Phase 4: "Not only... but also" structure breaking
      const notOnlyMatch = text.match(/\bnot only\b(.{1,80})\bbut also\b(.{1,80})/i);
      if (notOnlyMatch) {
        const part1 = notOnlyMatch[1].trim().replace(/^,?\s*/, '').replace(/,?\s*$/, '');
        const part2 = notOnlyMatch[2].trim();
        const restructured = text.replace(
          /\bnot only\b.{1,80}\bbut also\b.{1,80}/i,
          `${part1}, and ${part2}`
        );
        if (restructured !== text) {
          changes.push({
            type: 'lexical',
            original: notOnlyMatch[0],
            replacement: `${part1}, and ${part2}`,
            reason: 'parallel structure breaking',
          });
          text = restructured;
        }
      }

      sentence.transformed = text;
      sentence.changes.push(...changes);
    }

    return ctx;
  },
};
