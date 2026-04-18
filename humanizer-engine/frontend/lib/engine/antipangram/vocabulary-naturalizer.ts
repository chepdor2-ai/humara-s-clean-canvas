/**
 * AntiPangram — Vocabulary Naturalizer
 * ======================================
 * Replaces AI-typical vocabulary with human-natural alternatives.
 * Goes beyond simple synonym swaps — targets the specific lexical
 * patterns that Pangram's perplexity model flags.
 *
 * Key insight: Pangram measures lexical predictability. AI text uses
 * the "expected" word in context. Humans use slightly unexpected but
 * still correct words. This module introduces controlled unpredictability.
 */

import type { DocumentContext } from './types';

// ═══════════════════════════════════════════════════════════════════
// 1. AI VOCABULARY → NATURAL HUMAN VOCABULARY
//    These are words that AI consistently chooses over human-preferred
//    alternatives. The replacements are real human choices from corpora.
// ═══════════════════════════════════════════════════════════════════

const VOCAB_NATURALIZER: Record<string, string[]> = {
  // High-frequency AI adjectives
  'significant': ['real', 'important', 'big', 'major', 'noticeable'],
  'comprehensive': ['full', 'complete', 'thorough', 'broad'],
  'fundamental': ['basic', 'core', 'central', 'key'],
  'crucial': ['key', 'important', 'critical'],
  'essential': ['key', 'needed', 'important', 'basic'],
  'effective': ['useful', 'helpful', 'working', 'good'],
  'structured': ['organized', 'planned', 'set up'],
  'practical': ['hands-on', 'real-world', 'applied', 'useful'],
  'applicable': ['useful', 'relevant', 'fitting'],
  'productive': ['useful', 'constructive', 'effective'],
  'balanced': ['measured', 'steady', 'even', 'fair'],
  'positive': ['good', 'constructive', 'healthy', 'helpful'],
  'negative': ['bad', 'harmful', 'unhealthy', 'destructive'],
  'unhelpful': ['counterproductive', 'harmful', 'useless', 'bad'],
  'healthier': ['better', 'more constructive', 'improved'],
  'stronger': ['better', 'greater', 'tougher', 'firmer'],
  'widespread': ['common', 'wide', 'broad'],
  'numerous': ['many', 'a number of', 'several'],

  // AI transition/hedge verbs
  'addresses': ['deals with', 'handles', 'covers', 'looks at'],
  'demonstrates': ['shows', 'makes clear', 'proves'],
  'indicates': ['shows', 'points to', 'suggests'],
  'facilitates': ['helps', 'supports', 'makes easier'],
  'enables': ['lets', 'allows', 'makes it possible for'],
  'encompasses': ['includes', 'covers', 'takes in'],
  'encompasses': ['includes', 'covers', 'takes in'],
  'contributes': ['adds', 'helps', 'feeds into'],
  'influences': ['affects', 'shapes', 'touches'],
  'maintains': ['keeps', 'holds', 'carries on'],
  'promotes': ['supports', 'encourages', 'pushes for'],
  'enhances': ['improves', 'boosts', 'lifts'],
  'utilizes': ['uses', 'applies', 'draws on'],
  'employs': ['uses', 'relies on'],
  'focuses': ['centers', 'zeroes in', 'puts attention'],
  'concentrates': ['focuses', 'zeroes in', 'narrows in'],
  'recognizes': ['sees', 'spots', 'picks up on', 'notices'],

  // AI abstract nouns
  'interactions': ['exchanges', 'connections', 'dealings'],
  'mechanisms': ['methods', 'tools', 'ways'],
  'strategies': ['methods', 'plans', 'approaches', 'techniques'],
  'challenges': ['problems', 'issues', 'difficulties', 'hurdles'],
  'implications': ['effects', 'results', 'what this means'],
  'components': ['parts', 'pieces', 'elements'],
  'perspective': ['angle', 'view', 'lens', 'standpoint'],
  'framework': ['structure', 'setup', 'model', 'system'],
  'methodology': ['method', 'approach', 'process'],

  // AI-typical connector words (mid-sentence)
  'significantly': ['greatly', 'deeply', 'a great deal', 'heavily'],
  'particularly': ['especially', 'above all', 'in particular'],
  'consequently': ['so', 'as a result'],
  'subsequently': ['then', 'later', 'after that'],
  'ultimately': ['in the end', 'finally', 'at the end of the day'],
  'predominantly': ['mostly', 'mainly', 'largely'],
  'inherently': ['by nature', 'naturally', 'at its core'],
  'primarily': ['mainly', 'mostly', 'first of all', 'largely'],
  'widely': ['broadly', 'commonly', 'generally'],

  // Additional high-frequency AI words
  'transformative': ['game-changing', 'far-reaching', 'powerful'],
  'unprecedented': ['never before seen', 'unheard of', 'remarkable'],
  'increasingly': ['more and more', 'gradually', 'steadily'],
  'individuals': ['people', 'persons', 'someone'],
  'diverse': ['varied', 'different', 'wide-ranging'],
  'mitigate': ['reduce', 'lessen', 'ease'],
  'regarding': ['about', 'concerning', 'on'],
  'ensure': ['make sure', 'guarantee', 'see to it'],
  'ensuring': ['making sure', 'seeing to it'],
  'addressing': ['tackling', 'dealing with', 'working on'],
  'leveraging': ['using', 'taking advantage of', 'drawing on'],
  'implementing': ['putting in place', 'rolling out', 'setting up'],
  'fostering': ['building', 'growing', 'encouraging'],
  'navigating': ['working through', 'finding your way through', 'dealing with'],
  'profound': ['deep', 'strong', 'serious'],
  'resilience': ['toughness', 'strength', 'grit'],
  'pivotal': ['key', 'central', 'critical'],
  'paramount': ['key', 'top priority', 'critical'],
  'imperative': ['vital', 'critical', 'urgent'],
  'exacerbating': ['worsening', 'making worse', 'compounding'],
  'vulnerability': ['weakness', 'exposure', 'risk'],
  'revolutionized': ['changed', 'transformed', 'reshaped'],
  'immersive': ['engaging', 'absorbing', 'hands-on'],
  'unprecedented': ['remarkable', 'unusual', 'new'],
  'disparities': ['gaps', 'differences', 'inequalities'],
  'comprehensive': ['full', 'complete', 'thorough', 'broad'],
  'coordinated': ['organized', 'joint', 'planned'],
  'accessible': ['available', 'open', 'reachable'],
  'personalized': ['tailored', 'customized', 'individual'],
  'furthermore': ['also', 'on top of that', 'plus'],
  'additional': ['extra', 'more', 'added'],
  'additionally': ['also', 'plus', 'on top of that'],
  'moreover': ['also', 'what is more', 'besides'],
};

// ═══════════════════════════════════════════════════════════════════
// 2. AI PHRASE PATTERNS → HUMAN PHRASES
//    Multi-word patterns that only AI produces consistently
// ═══════════════════════════════════════════════════════════════════

const PHRASE_NATURALIZER: Array<{ pattern: RegExp; replacements: string[] }> = [
  {
    pattern: /\bgoal[- ]oriented\b/gi,
    replacements: ['focused on goals', 'aimed at results', 'goal-driven'],
  },
  {
    pattern: /\baction[- ]oriented\b/gi,
    replacements: ['focused on action', 'hands-on', 'practical'],
  },
  {
    pattern: /\bevidence[- ]based\b/gi,
    replacements: ['backed by evidence', 'research-backed', 'grounded in evidence'],
  },
  {
    pattern: /\bwell[- ]established\b/gi,
    replacements: ['proven', 'known', 'established'],
  },
  {
    pattern: /\bform of psychotherapy\b/gi,
    replacements: ['type of therapy', 'kind of therapy', 'therapy approach', 'therapeutic method'],
  },
  {
    pattern: /\bform of (?:treatment|intervention)\b/gi,
    replacements: ['treatment method', 'type of treatment', 'treatment approach'],
  },
  {
    pattern: /\bmental health conditions?\b/gi,
    replacements: ['mental health issues', 'conditions like depression or anxiety', 'mental health problems'],
  },
  {
    pattern: /\bthinking patterns?\b/gi,
    replacements: ['thought habits', 'ways of thinking', 'how someone thinks'],
  },
  {
    pattern: /\bnegative or unhelpful\b/gi,
    replacements: ['unhealthy', 'counterproductive', 'destructive'],
  },
  {
    pattern: /\bhealthier and more positive\b/gi,
    replacements: ['better', 'more constructive', 'healthier'],
  },
  {
    pattern: /\bmore balanced and productive\b/gi,
    replacements: ['more measured', 'healthier', 'more constructive'],
  },
  {
    pattern: /\brelationship between\b/gi,
    replacements: ['connection between', 'link between', 'how X and Y relate'].map(s => s),
  },
  {
    pattern: /\bfaulty ways of thinking\b/gi,
    replacements: ['flawed thinking', 'distorted thoughts', 'thinking errors'],
  },
  {
    pattern: /\blearned patterns of\b/gi,
    replacements: ['habits of', 'patterns of', 'ingrained'],
  },
  {
    pattern: /\bdevelop healthier\b/gi,
    replacements: ['build better', 'form healthier', 'adopt better'],
  },
  {
    pattern: /\breplace them with\b/gi,
    replacements: ['swap them for', 'change them to', 'shift to'],
  },
  {
    pattern: /\bconcentrates (?:more )?on\b/gi,
    replacements: ['focuses on', 'zeroes in on', 'puts more weight on'],
  },
  {
    pattern: /\bfinding effective solutions\b/gi,
    replacements: ['finding what works', 'looking for solutions', 'solving problems'],
  },
  {
    pattern: /\bequips (?:individuals|people|patients) with\b/gi,
    replacements: ['gives people', 'provides people with', 'arms people with'],
  },
  {
    pattern: /\bcan be applied in everyday life\b/gi,
    replacements: ['work in daily life', 'are useful day to day', 'carry over to real life'],
  },
  {
    pattern: /\bmaintaining long[- ]term\b/gi,
    replacements: ['keeping up long-term', 'sustaining', 'holding onto'],
  },
];

// ═══════════════════════════════════════════════════════════════════
// 3. PERPLEXITY INJECTION
//    Strategic word replacements that increase lexical surprise
//    without harming readability. These are unusual but correct choices.
// ═══════════════════════════════════════════════════════════════════

const PERPLEXITY_BOOSTS: Array<{ pattern: RegExp; replacements: string[] }> = [
  { pattern: /\bhelps\b/gi, replacements: ['lets', 'allows'] },
  { pattern: /\bimproves\b/gi, replacements: ['lifts', 'raises', 'boosts'] },
  { pattern: /\bidentify\b/gi, replacements: ['spot', 'catch', 'pick up on', 'notice'] },
  { pattern: /\brespond\b/gi, replacements: ['react', 'deal with', 'handle'] },
  { pattern: /\bmanage\b/gi, replacements: ['handle', 'deal with', 'work through'] },
  { pattern: /\bcontrol\b/gi, replacements: ['handle', 'rein in', 'keep in check'] },
  { pattern: /\badopt\b/gi, replacements: ['pick up', 'take on', 'start using'] },
  { pattern: /\bovercome\b/gi, replacements: ['get past', 'push through', 'work through'] },
  { pattern: /\bsuch as\b/gi, replacements: ['like', 'including'] },
];

// ═══════════════════════════════════════════════════════════════════
// MAIN NATURALIZER FUNCTION
// ═══════════════════════════════════════════════════════════════════

export function naturalizeVocabulary(
  sentence: string,
  protectedTerms: Set<string>,
  intensity: number = 0.6   // 0-1: how aggressively to replace
): string {
  let result = sentence;

  // Phase 1: Phrase-level naturalizations (highest priority — multi-word)
  for (const { pattern, replacements } of PHRASE_NATURALIZER) {
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      pattern.lastIndex = 0;
      // Use deterministic selection based on sentence length for consistency
      const replacement = replacements[result.length % replacements.length];
      result = result.replace(pattern, (match) => {
        // Preserve capitalization of first character
        if (match.charAt(0) === match.charAt(0).toUpperCase() && replacement.charAt(0) !== replacement.charAt(0).toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
    }
  }

  // Phase 2: Word-level vocabulary swaps (apply to all matches at strong intensity)
  for (const [word, replacements] of Object.entries(VOCAB_NATURALIZER)) {
    if (protectedTerms.has(word.toLowerCase())) continue;
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    if (re.test(result)) {
      re.lastIndex = 0;
      // Deterministic selection + always apply at intensity >= 0.6
      const shouldApply = intensity >= 0.6 || Math.random() < intensity;
      if (shouldApply) {
        const replacement = replacements[result.length % replacements.length];
        // Only replace first occurrence to avoid over-processing
        result = result.replace(re, (_match) => {
          // Preserve capitalization
          if (_match.charAt(0) === _match.charAt(0).toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
          }
          return replacement;
        });
      }
    }
  }

  // Phase 3: Perplexity boosts (apply more aggressively at strong intensity)
  for (const { pattern, replacements } of PERPLEXITY_BOOSTS) {
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      const shouldApply = intensity >= 0.8 || Math.random() < intensity * 0.5;
      if (shouldApply) {
        pattern.lastIndex = 0;
        const replacement = replacements[result.length % replacements.length];
        // Replace only first match
        let replaced = false;
        result = result.replace(pattern, (match) => {
          if (replaced) return match;
          replaced = true;
          if (match.charAt(0) === match.charAt(0).toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
          }
          return replacement;
        });
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
