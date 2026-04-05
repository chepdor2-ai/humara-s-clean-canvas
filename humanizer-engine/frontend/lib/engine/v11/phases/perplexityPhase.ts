/**
 * Phase 8 — Perplexity Injection
 * =================================
 * GOAL: Break the uniform token-probability signature that real detectors catch.
 *
 * AI text picks the "most probable next token" consistently, producing flat
 * perplexity curves. Human text has spikes of unpredictable word choices.
 *
 * Strategy:
 *   1. Replace high-probability words with uncommon but valid synonyms
 *   2. Insert parenthetical asides and qualifying phrases
 *   3. Use unexpected word order (fronting, inversion)
 *   4. Add domain-specific or archaic-but-understandable vocabulary
 *   5. Inject hedging and self-correction patterns
 */

import type { DocumentState, Phase } from '../types';

// Words that are commonly both verbs AND nouns — skip in rare swap
// to avoid POS mismatch (e.g. "to process" → "to machinery")
const POS_AMBIGUOUS_SKIP: Set<string> = new Set([
  'process', 'impact', 'approach', 'address', 'study', 'practice',
  'function', 'model', 'state', 'present', 'subject', 'object',
  'figure', 'support', 'experience', 'challenge', 'result',
  'influence', 'benefit', 'increase', 'decrease', 'improve',
  'create', 'maintain', 'suggest', 'indicate', 'establish',
  'provide', 'require', 'ensure', 'achieve', 'consider',
  'potential', 'ability',
]);

// Uncommon but natural synonyms — these are LOW-probability tokens that
// break the prediction chain. AI would never pick these.
const RARE_SWAPS: Record<string, string[]> = {
  // Common AI picks → unexpected alternatives
  important: ['consequential', 'weighty', 'pressing', 'serious', 'critical'],
  significant: ['appreciable', 'marked', 'tangible', 'non-negligible', 'telling'],
  demonstrate: ['bear out', 'make plain', 'lay bare', 'bring to light', 'attest to'],
  various: ['sundry', 'assorted', 'diverse', 'all manner of', 'disparate'],
  approach: ['method', 'angle', 'strategy', 'route', 'path'],
  consider: ['weigh up', 'mull over', 'reckon with', 'take stock of', 'sit with'],
  impact: ['ripple effect', 'consequence', 'repercussion', 'footprint', 'bearing'],
  achieve: ['attain', 'bring about', 'secure', 'manage', 'realize'],
  issues: ['sticking points', 'difficulties', 'wrinkles', 'complications', 'trouble spots'],
  process: ['machinery', 'workings', 'mechanism', 'procedure', 'operation'],
  development: ['headway', 'forward motion', 'evolution', 'unfolding', 'strides'],
  provide: ['furnish', 'supply', 'deliver', 'put forward', 'offer'],
  require: ['call for', 'demand', 'take', 'hinge on', 'presuppose'],
  increase: ['uptick', 'surge', 'climb', 'rise', 'escalation'],
  decrease: ['dip', 'slide', 'downturn', 'falloff', 'drop-off'],
  improve: ['sharpen', 'tighten up', 'elevate', 'bump up', 'fine-tune'],
  create: ['fashion', 'forge', 'construct', 'develop', 'produce'],
  ensure: ['make certain', 'see to it that', 'lock in', 'nail down', 'guarantee'],
  maintain: ['keep up', 'hold onto', 'preserve', 'sustain', 'uphold'],
  suggest: ['hint at', 'point toward', 'advance', 'posit', 'put forth'],
  indicate: ['flag', 'signal', 'point to', 'hint', 'telegraph'],
  establish: ['pin down', 'lay the groundwork for', 'cement', 'set in stone', 'anchor'],
  particular: ['given', 'specific', 'one particular', 'this one', 'the precise'],
  specific: ['pinpointed', 'exact', 'narrow', 'well-defined', 'targeted'],
  system: ['setup', 'apparatus', 'machinery', 'arrangement', 'framework'],
  effective: ['potent', 'workable', 'efficacious', 'fit for purpose', 'productive'],
  technology: ['tooling', 'technical craft', 'instrumentation', 'apparatus', 'technical means'],
  environment: ['setting', 'surroundings', 'milieu', 'terrain', 'backdrop'],
  research: ['inquiry', 'investigation', 'scholarship', 'empirical work', 'examination'],
  analysis: ['dissection', 'breakdown', 'close reading', 'parsing', 'examination'],
  strategy: ['methodology', 'framework', 'blueprint', 'roadmap', 'protocol'],
  evidence: ['proof', 'hard data', 'the record', 'documentation', 'findings'],
  understand: ['apprehend', 'grasp', 'comprehend', 'make sense of', 'discern'],
  experience: ['firsthand exposure', 'practical acquaintance', 'track record', 'familiarity', 'engagement'],
  information: ['particulars', 'data points', 'the specifics', 'details', 'material'],
  opportunity: ['opening', 'window', 'shot', 'chance', 'break'],
  challenge: ['hurdle', 'stumbling block', 'obstacle', 'headwind', 'difficulty'],
  benefit: ['upside', 'payoff', 'perk', 'plus', 'dividend'],
  result: ['upshot', 'outcome', 'end product', 'bottom line', 'yield'],
  influence: ['sway', 'pull', 'weight', 'bearing', 'clout'],
  majority: ['bulk', 'greater portion', 'better part', 'most', 'preponderance'],
  community: ['circle', 'group', 'cohort', 'crowd', 'tribe'],
  situation: ['state of affairs', 'picture', 'lay of the land', 'scenario', 'setup'],
  potential: ['promise', 'upside', 'capacity', 'room', 'ceiling'],
  ability: ['knack', 'capacity', 'wherewithal', 'competence', 'know-how'],
  problem: ['difficulty', 'complication', 'obstacle', 'stumbling block', 'deficiency'],
  solution: ['fix', 'remedy', 'workaround', 'answer', 'patch'],
  support: ['back', 'bolster', 'prop up', 'shore up', 'undergird'],
  positive: ['encouraging', 'promising', 'heartening', 'bright', 'favorable'],
  negative: ['unfavorable', 'discouraging', 'troubling', 'concerning', 'bleak'],
  overall: ['on balance', 'all told', 'taken together', 'in sum', 'broadly speaking'],
  generally: ['by and large', 'for the most part', 'as a rule', 'in the main', 'broadly'],
  necessary: ['indispensable', 'called-for', 'non-negotiable', 'a must', 'requisite'],
  role: ['part', 'piece', 'hand', 'function', 'place'],
};

// Parenthetical asides that spike perplexity — academic/formal style only
const ASIDES: string[] = [
  ' (something often glossed over)',
  ' (a point worth dwelling on)',
  ', strange as it may sound,',
  ' (a wrinkle few scholars address)',
  ', oddly enough,',
  ' (not as straightforward as it may appear)',
  ', to be frank,',
  ' (a distinction that bears emphasis)',
  ' (a nuance frequently overlooked)',
  ', upon closer examination,',
  ' (a factor often underestimated)',
  ', as the evidence indicates,',
];

// Self-correction / hedging patterns — formal register only
const HEDGES: string[] = [
  'Or, to put it differently, ',
  'More precisely, ',
  'That is to say, ',
  'In plainer terms, ',
  'To be more exact, ',
  'On reflection, ',
  'Or rather, ',
  'To rephrase, ',
];

// Fronting/inversion templates — reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FRONTING_PATTERNS: [RegExp, string][] = [
  // "X is Y" → "Y, X is"
  [/^(\w+\s+\w+)\s+(?:is|are|was|were)\s+(?:a |an |the )?(\w+)(.*)$/i,
   '$2, $1 remain$3'],
  // "They have X" → "X, they have"  
  [/^((?:they|we|researchers|scientists|experts|studies)\s+(?:have|had))\s+(.+?)(\.)$/i,
   '$2 — that is what $1$3'],
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Replace common words with uncommon synonyms to spike perplexity.
 * Rate: ~40% of matches to maintain readability.
 */
function injectRareVocabulary(text: string): string {
  const words = text.split(/(\s+)/);
  const result: string[] = [];
  let swapCount = 0;
  const maxSwaps = Math.ceil(words.length / 12); // ~1 per 12 words

  for (const token of words) {
    if (/^\s+$/.test(token)) { result.push(token); continue; }

    const clean = token.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const alts = RARE_SWAPS[clean];

    // Skip POS-ambiguous words to avoid verb↔noun mismatch
    if (alts && !POS_AMBIGUOUS_SKIP.has(clean) && swapCount < maxSwaps && Math.random() < 0.30) {
      // Only use single-word replacements to avoid breaking grammar
      const singleWordAlts = alts.filter(a => !a.includes(' '));
      if (singleWordAlts.length === 0) { result.push(token); continue; }
      let replacement = pickRandom(singleWordAlts);
      const prefix = token.match(/^[^a-zA-Z]*/)?.[0] ?? '';
      const suffix = token.match(/[^a-zA-Z]*$/)?.[0] ?? '';
      // Preserve capitalization
      if (clean !== token.replace(/[^a-zA-Z]/g, '') &&
          token[prefix.length] === token[prefix.length]?.toUpperCase()) {
        replacement = replacement[0].toUpperCase() + replacement.slice(1);
      }
      result.push(prefix + replacement + suffix);
      swapCount++;
    } else {
      result.push(token);
    }
  }

  return result.join('');
}

/**
 * Insert a parenthetical aside after the main clause of a sentence.
 * Only for sentences >15 words to maintain naturalness.
 */
function insertAside(text: string): string {
  const words = text.split(/\s+/);
  if (words.length < 15) return text;

  // Find insertion point: after a comma, period-replacement, or before "and"/"but"/"which"
  // AVOID: between adjective-noun pairs (don't insert between two plain words with no punct)
  let insertAt = -1;
  for (let i = Math.floor(words.length * 0.3); i < Math.floor(words.length * 0.6); i++) {
    // Only insert after a word ending in comma, or before a conjunction
    if (words[i].endsWith(',') || /^(and|but|which|while|where|when|so|yet)$/i.test(words[i + 1] || '')) {
      insertAt = i;
      break;
    }
  }

  // If no good insertion point found, skip (don't force it)
  if (insertAt < 0) return text;

  const aside = pickRandom(ASIDES);
  // Remove trailing comma from previous word if aside starts with comma
  if (aside.startsWith(',') && words[insertAt].endsWith(',')) {
    words[insertAt] = words[insertAt].slice(0, -1);
  }

  words.splice(insertAt + 1, 0, aside.trim());
  return words.join(' ');
}

/**
 * Occasionally add a self-correction/hedge before a sentence.
 */
function addHedge(text: string): string {
  return pickRandom(HEDGES) + text[0].toLowerCase() + text.slice(1);
}

/**
 * Check if a sentence already has injection markers (asides, dashes, parentheticals).
 * If so, we skip further injection to prevent stacking.
 */
function hasInjectionMarkers(text: string): boolean {
  const dashCount = (text.match(/—/g) || []).length;
  const parenCount = (text.match(/[()]/g) || []).length;
  const colonCount = (text.match(/:/g) || []).length;
  return dashCount >= 2 || parenCount >= 2 || colonCount >= 2;
}

export const perplexityPhase: Phase = {
  name: 'perplexity',
  async process(state: DocumentState): Promise<DocumentState> {
    // Re-enabled with SAFE settings: only single-word rare vocabulary swaps
    // at ~15% rate. No asides, no hedges, no fronting — those corrupt output.
    let swapCount = 0;

    for (const paragraph of state.paragraphs) {
      for (const sentence of paragraph.sentences) {
        // Skip if already heavily modified
        if (hasInjectionMarkers(sentence.text)) continue;

        const before = sentence.text;
        sentence.text = injectRareVocabulary(sentence.text);
        if (sentence.text !== before) swapCount++;
      }
    }

    state.logs.push(`[perplexity] ${swapCount} sentences had rare vocabulary injected`);
    return state;
  }
};
