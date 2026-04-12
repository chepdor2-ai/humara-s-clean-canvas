/**
 * Semantic Transformer — Paragraph-Level Flow & Style Adjustments
 * ================================================================
 * Operates at the paragraph level to:
 *   - Detect list-like patterns ("First... Second... Third...") and rewrite as prose
 *   - Remove hedging phrases ("it is important to note")
 *   - Adjust formality based on target style (academic, conversational, technical)
 *   - Break predictable listing patterns
 *   - Improve paragraph-level flow and coherence
 *
 * STRICT RULES:
 *   - Never adds first-person pronouns or contractions
 *   - Does not create rhetorical questions
 *   - Preserves meaning and factual content
 *
 * NO contractions. NO first person. NO rhetorical questions.
 */

import type { TextContext, Transformer, ChangeRecord } from './types';

/* ── Hedging Phrases to Remove ────────────────────────────────────── */

const HEDGING_REMOVALS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bit is important to note that\s*/gi, replacement: '' },
  { pattern: /\bit is worth mentioning that\s*/gi, replacement: '' },
  { pattern: /\bit should be emphasized that\s*/gi, replacement: '' },
  { pattern: /\bit is worth noting that\s*/gi, replacement: '' },
  { pattern: /\bit goes without saying that\s*/gi, replacement: '' },
  { pattern: /\bneedless to say,?\s*/gi, replacement: '' },
  { pattern: /\bsuffice it to say,?\s*/gi, replacement: '' },
  { pattern: /\bas is well known,?\s*/gi, replacement: '' },
  { pattern: /\bas we all know,?\s*/gi, replacement: '' },
  { pattern: /\bas has been noted,?\s*/gi, replacement: '' },
  { pattern: /\bit is generally accepted that\s*/gi, replacement: '' },
  { pattern: /\bit is widely recognized that\s*/gi, replacement: '' },
  { pattern: /\bit is commonly understood that\s*/gi, replacement: '' },
  { pattern: /\bit can be argued that\s*/gi, replacement: '' },
  { pattern: /\bone could argue that\s*/gi, replacement: '' },
  { pattern: /\bit is safe to say that\s*/gi, replacement: '' },
  { pattern: /\bit stands to reason that\s*/gi, replacement: '' },
  { pattern: /\bto a certain extent,?\s*/gi, replacement: '' },
  { pattern: /\bto some degree,?\s*/gi, replacement: '' },
  { pattern: /\bin some respects,?\s*/gi, replacement: '' },
  { pattern: /\bin many ways,?\s*/gi, replacement: '' },
];

/* ── List Pattern Detection & Conversion ──────────────────────────── */

const LIST_ORDINALS = /\b(firstly|secondly|thirdly|fourthly|fifthly|first|second|third|fourth|fifth|finally|lastly|last but not least|first and foremost|to begin with|to start with|in the first place|in the second place)\b/gi;

const NUMBERED_LIST = /\b(1\)|2\)|3\)|4\)|5\)|1\.|2\.|3\.|4\.|5\.)\s*/g;

const TRANSITION_ALTERNATIVES: Record<string, string[]> = {
  firstly: ['To begin,', 'The primary point is', 'Starting with the core idea,'],
  secondly: ['Building on that,', 'Another key aspect is', 'Beyond that,'],
  thirdly: ['Adding to this,', 'A further consideration is', 'Equally relevant,'],
  fourthly: ['On a related point,', 'Extending this logic,', 'There is also the matter of'],
  fifthly: ['Rounding out this discussion,', 'A final factor is', 'Completing the picture,'],
  finally: ['The closing point addresses', 'The last element to consider is', 'Bringing this together,'],
  lastly: ['The remaining consideration is', 'To round out the analysis,', 'One last factor is'],
  first: ['The initial point concerns', 'Starting from the basics,', 'At the outset,'],
  second: ['Following that,', 'The next aspect involves', 'Equally significant,'],
  third: ['In a similar vein,', 'Broadening the scope,', 'Along those same lines,'],
  fourth: ['Continuing this thread,', 'There is also the question of', 'A parallel issue is'],
  fifth: ['Rounding out the discussion,', 'The final piece of the puzzle is', 'Completing the analysis,'],
};

/* ── Formality Adjusters ──────────────────────────────────────────── */

interface FormalityRule {
  pattern: RegExp;
  academic: string;
  professional: string;
  simple: string;
  neutral: string;
}

const FORMALITY_RULES: FormalityRule[] = [
  {
    pattern: /\bget\b/gi,
    academic: 'obtain', professional: 'acquire', simple: 'get', neutral: 'get',
  },
  {
    pattern: /\bbig\b/gi,
    academic: 'substantial', professional: 'significant', simple: 'big', neutral: 'large',
  },
  {
    pattern: /\blots of\b/gi,
    academic: 'numerous', professional: 'a significant number of', simple: 'many', neutral: 'many',
  },
  {
    pattern: /\bshow\b(?!s|ed|ing|n)/gi,
    academic: 'demonstrate', professional: 'illustrate', simple: 'show', neutral: 'display',
  },
  {
    pattern: /\bgood\b/gi,
    academic: 'favorable', professional: 'positive', simple: 'good', neutral: 'sound',
  },
  {
    pattern: /\bbad\b/gi,
    academic: 'adverse', professional: 'unfavorable', simple: 'poor', neutral: 'negative',
  },
  {
    pattern: /\bkind of\b/gi,
    academic: 'somewhat', professional: 'to a degree', simple: 'somewhat', neutral: 'rather',
  },
  {
    pattern: /\bsort of\b/gi,
    academic: 'to some extent', professional: 'in a manner', simple: 'somewhat', neutral: 'roughly',
  },
];

/* ── Repetitive Starter Variation ─────────────────────────────────── */

function varyRepetitiveStarters(sentences: string[]): string[] {
  const starterCounts: Record<string, number> = {};
  const result: string[] = [];

  for (const s of sentences) {
    const firstWord = s.match(/^(\w+)/)?.[1]?.toLowerCase() ?? '';
    starterCounts[firstWord] = (starterCounts[firstWord] ?? 0) + 1;

    // If this starter already appeared twice, vary it
    if (starterCounts[firstWord] > 2 && firstWord.length > 2) {
      // Try to rephrase the opening
      if (/^(this|these|those)\b/i.test(s)) {
        const alternatives = [
          'Such ', 'The aforementioned ', 'That particular ',
          'The described ', 'The mentioned ', 'That specific ',
        ];
        const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
        result.push(s.replace(/^(this|these|those)\s+/i, alt));
        continue;
      }
      if (/^the\b/i.test(s)) {
        // Add a prepositional opener
        const openers = [
          'In this case, the', 'Here, the', 'At this point, the',
          'Within this scope, the', 'Given this, the',
        ];
        const opener = openers[Math.floor(Math.random() * openers.length)];
        result.push(s.replace(/^the\b/i, opener));
        continue;
      }
    }

    result.push(s);
  }

  return result;
}

/* ── Semantic Transformer Implementation ──────────────────────────── */

export const semanticTransformer: Transformer = {
  name: 'SemanticTransformer',
  priority: 30,

  transform(ctx: TextContext): TextContext {
    const tone = ctx.config.tone;
    const aggressive = ctx.config.aggressive;

    for (const sentence of ctx.sentences) {
      if (sentence.reverted) continue;

      let text = sentence.transformed;
      const changes: ChangeRecord[] = [];

      // Phase 1: Remove hedging phrases
      for (const { pattern, replacement } of HEDGING_REMOVALS) {
        const match = text.match(pattern);
        if (match) {
          const before = text;
          text = text.replace(pattern, replacement);
          // Capitalize first letter after removal if at sentence start
          if (text.length > 0 && text[0] === text[0].toLowerCase() && before[0] !== before[0].toLowerCase()) {
            text = text.charAt(0).toUpperCase() + text.slice(1);
          }
          // Clean up double spaces
          text = text.replace(/\s{2,}/g, ' ').trim();
          if (text !== before) {
            changes.push({
              type: 'semantic',
              original: match[0],
              replacement: '(removed)',
              reason: 'hedging phrase removal',
            });
          }
        }
      }

      // Phase 2: Convert list ordinals to natural prose transitions
      const ordinalMatch = text.match(LIST_ORDINALS);
      if (ordinalMatch) {
        const ordinal = ordinalMatch[0].toLowerCase();
        const alternatives = TRANSITION_ALTERNATIVES[ordinal];
        if (alternatives && alternatives.length > 0) {
          const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
          const before = text;
          text = text.replace(LIST_ORDINALS, alt + ' ');
          text = text.replace(/\s{2,}/g, ' ').trim();
          if (text !== before) {
            changes.push({
              type: 'semantic',
              original: ordinalMatch[0],
              replacement: alt,
              reason: 'list pattern to prose conversion',
            });
          }
        }
      }

      // Phase 3: Remove numbered lists
      if (NUMBERED_LIST.test(text)) {
        const before = text;
        text = text.replace(NUMBERED_LIST, '');
        text = text.replace(/\s{2,}/g, ' ').trim();
        if (text.length > 0) {
          text = text.charAt(0).toUpperCase() + text.slice(1);
        }
        if (text !== before) {
          changes.push({
            type: 'semantic',
            original: before,
            replacement: text,
            reason: 'numbered list removal',
          });
        }
      }

      // Phase 4: Formality adjustment (only when tone is specified and not neutral)
      if (tone !== 'neutral' && aggressive) {
        for (const rule of FORMALITY_RULES) {
          if (rule.pattern.test(text)) {
            const replacement = rule[tone] ?? rule.neutral;
            const before = text;
            text = text.replace(rule.pattern, replacement);
            if (text !== before) {
              changes.push({
                type: 'semantic',
                original: before.match(rule.pattern)?.[0] ?? '',
                replacement,
                reason: `formality adjustment to ${tone}`,
              });
            }
          }
        }
      }

      // Phase 5: Break "Moreover/Furthermore" chains at paragraph boundaries
      if (/^(Moreover|Furthermore|Additionally|In addition),?\s+/i.test(text)) {
        const starters = [
          'Beyond this,', 'Another angle to consider involves', 'Building on the above,',
          'Extending this line of thought,', 'A related observation is that',
          'Taking this further,', 'Viewed from another angle,',
        ];
        const starter = starters[Math.floor(Math.random() * starters.length)];
        const before = text;
        text = text.replace(/^(Moreover|Furthermore|Additionally|In addition),?\s+/i, starter + ' ');
        if (text !== before) {
          changes.push({
            type: 'semantic',
            original: before.match(/^(Moreover|Furthermore|Additionally|In addition),?\s+/i)?.[0] ?? '',
            replacement: starter,
            reason: 'transition word chain breaking',
          });
        }
      }

      // Phase 6: Remove cliché openings
      const clichePatterns: Array<{ pattern: RegExp; replacement: string }> = [
        { pattern: /^In today'?s (?:world|society|era|age),?\s*/i, replacement: '' },
        { pattern: /^In the modern (?:world|era|age),?\s*/i, replacement: '' },
        { pattern: /^Throughout history,?\s*/i, replacement: '' },
        { pattern: /^Since the dawn of (?:time|civilization|humanity),?\s*/i, replacement: '' },
        { pattern: /^In recent years,?\s*/i, replacement: 'Over the past decade, ' },
      ];

      for (const { pattern, replacement } of clichePatterns) {
        const match = text.match(pattern);
        if (match) {
          const before = text;
          text = text.replace(pattern, replacement);
          if (text.length > 0 && replacement === '') {
            text = text.charAt(0).toUpperCase() + text.slice(1);
          }
          if (text !== before) {
            changes.push({
              type: 'semantic',
              original: match[0],
              replacement: replacement || '(removed cliché)',
              reason: 'cliché opening removal',
            });
          }
        }
      }

      sentence.transformed = text;
      sentence.changes.push(...changes);
    }

    // Phase 7: Cross-sentence starter variation
    const allTexts = ctx.sentences
      .filter(s => !s.reverted)
      .map(s => s.transformed);
    const varied = varyRepetitiveStarters(allTexts);
    let varIdx = 0;
    for (const sentence of ctx.sentences) {
      if (!sentence.reverted && varIdx < varied.length) {
        if (sentence.transformed !== varied[varIdx]) {
          sentence.changes.push({
            type: 'semantic',
            original: sentence.transformed,
            replacement: varied[varIdx],
            reason: 'cross-sentence starter variation',
          });
          sentence.transformed = varied[varIdx];
        }
        varIdx++;
      }
    }

    return ctx;
  },
};
