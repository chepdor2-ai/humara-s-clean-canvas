/**
 * Phase 11 — Anti-Pattern Breaker
 * ==================================
 * GOAL: Target the specific statistical features that transformer-based
 * detectors (GPTZero, Originality, Copyleaks, ZeroGPT) measure.
 *
 * Detector models look at:
 *   1. Token-level uniformity — AI uses the most probable next token
 *   2. Sentence-level uniformity — AI sentences are similar in length
 *   3. Paragraph-level patterns — AI paragraphs are structured identically
 *   4. Vocabulary consistency — AI uses the same register throughout
 *   5. Transitional monotony — AI uses the same connectors in order
 *   6. Opening/closing formulae — AI has templated intros and conclusions
 *   7. N-gram frequency — AI n-grams match training data distribution
 *   8. Information density — AI packs information uniformly
 *
 * This phase breaks ALL of these patterns simultaneously.
 */

import type { DocumentState, Phase } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── 1. SENTENCE LENGTH VARIANCE ──
// GPTZero specifically measures sentence length standard deviation.
// Humans vary between 3-word punches and 40-word rambles.

/**
 * Inject extreme length variance: add very short sentences and
 * occasionally concatenate two medium ones into a long one.
 */
function injectLengthVariance(sentences: string[]): string[] {
  if (sentences.length < 3) return sentences;
  const result: string[] = [];

  // Short emphatic interjections
  const SHORT_PUNCHES: string[] = [
    'The numbers bear this out.',
    'The evidence confirms this.',
    'The pattern holds.',
    'The data are unambiguous.',
    'An instructive case.',
  ];

  for (let i = 0; i < sentences.length; i++) {
    result.push(sentences[i]);
    const words = sentences[i].split(/\s+/).length;

    // After a long sentence (>22 words), 15% chance to inject a short one
    if (words > 22 && Math.random() < 0.15) {
      result.push(pickRandom(SHORT_PUNCHES));
    }

    // Occasionally concatenate two medium sentences with a semicolon
    if (i + 1 < sentences.length && words >= 8 && words <= 18 && Math.random() < 0.15) {
      const next = sentences[i + 1];
      if (next && next.length > 0) {
        const nextWords = next.split(/\s+/).length;
        if (nextWords >= 8 && nextWords <= 18) {
          // Pop the last sentence we added and merge
          result.pop();
          const merged = sentences[i].replace(/[.!?]\s*$/, '') +
            '; ' + next[0].toLowerCase() + next.slice(1);
          result.push(merged);
          i++; // skip next
        }
      }
    }
  }

  return result;
}

// ── 2. REGISTER MIXING ──
// AI maintains a consistent register. Humans slip between formal and informal.

const INFORMAL_INJECTIONS: [RegExp, string][] = [
  [/\bthis is because\b/gi, 'the explanation is straightforward:'],
  [/\bconsequently\b/gi, 'as a result,'],
  [/\bfurthermore\b/gi, 'beyond this,'],
  [/\badditionally\b/gi, 'on top of that,'],
  [/\bnotably\b/gi, 'of particular note,'],
  [/\bindeed\b/gi, 'in fact,'],
  [/\bnevertheless\b/gi, 'even so,'],
  [/\bnonetheless\b/gi, 'all the same,'],
  [/\bthus\b(?!ly)/gi, 'and so,'],
  [/\bhence\b/gi, 'which is why'],
  [/\bthereby\b/gi, 'and in doing so,'],
  [/\bmoreover\b/gi, 'in addition,'],
  [/\bwhereas\b/gi, 'by contrast,'],
];

// ── 3. OPENING FORMULA BREAKERS ──
// AI always starts paragraphs the same way. Pre-2000 writers started with variety.
const PARAGRAPH_OPENERS: string[] = [
  'On closer examination, ',
  'On balance, ',
];

// ── 4. CLOSING FORMULA BREAKERS ──
// AI concludes with "In conclusion, X remains Y." Pre-2000 writers ended differently.
const AI_CLOSINGS: RegExp[] = [
  /^in conclusion,?\s*/i,
  /^to (?:conclude|summarize|sum up),?\s*/i,
  /^in summary,?\s*/i,
  /^overall,?\s*/i,
  /^all in all,?\s*/i,
  /^to wrap up,?\s*/i,
  /^as (?:we have|has been) (?:seen|discussed|shown|noted|demonstrated),?\s*/i,
];

const CLOSING_REPLACEMENTS: string[] = [
  'The central finding is plain. ',
  'Where does all this leave the analysis? ',
  'Drawing the threads together, ',
  'What can be said with confidence? ',
  'The argument, at its core, is a measured one. ',
  'None of this is settled, of course, but ',
  'One final observation. ',
  'Taken together, the evidence points in a clear direction. ',
  'The broader implications warrant attention. ',
];

// ── 5. N-GRAM BREAKERS ──
// Common AI n-grams that appear in training data distributions
const AI_NGRAMS: [RegExp, string[]][] = [
  [/\bthe (?:importance|significance|relevance) of\b/gi, [
    'why it matters to look at', 'the weight of', 'what makes notice of',
  ]],
  [/\bthe (?:concept|notion|idea) of\b/gi, [
    'the thought behind', 'what people mean by', 'the working definition of',
  ]],
  [/\bthe (?:process|act) of\b/gi, [
    'the work of', 'the practice of', 'the task of',
  ]],
  [/\bin (?:the|this) (?:context|regard|respect)\b/gi, [
    'on this score', 'here', 'in this connection', 'on that count',
  ]],
  [/\ba (?:growing|rising|increasing) (?:number|body) of\b/gi, [
    'more and more', 'an ever-larger share of', 'a swelling count of',
  ]],
  [/\bthe (?:ability|capacity|capability) to\b/gi, [
    'the capacity to', 'the means to', 'the competence to',
  ]],
  [/\bthe (?:potential|possibility) (to)\b/gi, [
    'the capacity to', 'the means to',
  ]],
  [/\bthe (?:potential|possibility) (for|of)\b/gi, [
    'the prospect of', 'the likelihood of',
  ]],
  [/\b(?:a|the) (?:key|critical|crucial|vital|essential) (?:factor|element|component|aspect)\b/gi, [
    'a linchpin', 'a deciding piece', 'the crux', 'a make-or-break factor',
  ]],
  [/\b(?:significant|substantial|considerable) (?:amount|number|portion|degree|extent) of\b/gi, [
    'a good deal of', 'quite a lot of', 'no small amount of', 'a fair measure of',
  ]],
  [/\bhas (?:gained|attracted|received|drawn) (?:significant|considerable|growing|increasing) (?:attention|interest|traction)\b/gi, [
    'has caught attention', 'has turned heads', 'has been getting noticed', 'has sparked real curiosity',
  ]],
  [/\b(?:serves|serve) as (?:a|an) (?:important|valuable|useful|powerful|effective) (?:tool|means|method|vehicle)\b/gi, [
    'works well as a way', 'proves handy for', 'does the job as a', 'functions neatly as a',
  ]],
  [/\bprovides? (?:a|an) (?:comprehensive|thorough|detailed|in-depth) (?:overview|analysis|examination|understanding)\b/gi, [
    'gives a close look at', 'offers a hard look at', 'lays out the full picture of', 'spells out',
  ]],
  [/\bat the (?:same|very) time\b/gi, [
    'equally', 'in parallel', 'alongside that', 'concurrently',
  ]],
  [/\bon the other hand\b/gi, [
    'then again', 'viewed differently', 'seen from the other side', 'by contrast',
  ]],
  [/\bin (?:recent|the past few) years\b/gi, [
    'of late', 'over the past while', 'in a relatively short span', 'just lately',
  ]],
];

// ── 6. INFORMATION DENSITY VARIATION ──
// AI packs information uniformly. Humans bunch facts then pause to reflect.

const REFLECTIVE_PAUSES: string[] = [
  'The weight of that observation should not be lost.',
  'A small point, but a telling one.',
  'That alone says a great deal.',
  'This warrants careful consideration.',
  'The implications extend further than they may appear.',
  'That distinction carries real consequence.',
  'A subtlety worth pausing over.',
  'The significance of that point is easily underestimated.',
];

export const antiPatternPhase: Phase = {
  name: 'antiPattern',
  async process(state: DocumentState): Promise<DocumentState> {
    let ngramBreaks = 0;
    let registerMixes = 0;
    let openerChanges = 0;
    let closerChanges = 0;
    let reflectives = 0;

    const totalParagraphs = state.paragraphs.length;

    for (let pIdx = 0; pIdx < totalParagraphs; pIdx++) {
      const paragraph = state.paragraphs[pIdx];
      const isFirst = pIdx === 0;
      const isLast = pIdx === totalParagraphs - 1;

      for (let sIdx = 0; sIdx < paragraph.sentences.length; sIdx++) {
        const sentence = paragraph.sentences[sIdx];
        let text = sentence.text;

        // A. Break AI n-grams (mandatory, all sentences)
        for (const [pattern, replacements] of AI_NGRAMS) {
          if (pattern.test(text)) {
            text = text.replace(pattern, () => pickRandom(replacements));
            ngramBreaks++;
          }
        }

        // B. Register mixing — re-enabled at low rate (~15%)
        // Only apply safe replacements that maintain academic register
        if (Math.random() < 0.15) {
          for (const [pattern, replacement] of INFORMAL_INJECTIONS) {
            if (pattern.test(text)) {
              text = text.replace(pattern, replacement);
              registerMixes++;
              break; // Only one per sentence
            }
          }
        }

        // C. Break opening formula — DISABLED (injects unnatural openers like "On closer examination,")
        // if (sIdx === 0 && !isFirst && Math.random() < 0.10
        //     && !sentence.flags.includes('struct-mod') && text.length > 0) {
        //   const opener = pickRandom(PARAGRAPH_OPENERS);
        //   text = opener + text[0].toLowerCase() + text.slice(1);
        //   sentence.flags.push('struct-mod');
        //   openerChanges++;
        // }

        // D. Break closing formula (last paragraph)
        if (isLast && sIdx === 0) {
          for (const pattern of AI_CLOSINGS) {
            if (pattern.test(text)) {
              text = text.replace(pattern, pickRandom(CLOSING_REPLACEMENTS));
              closerChanges++;
              break;
            }
          }
        }

        sentence.text = text;
      }

      // E. Reflective pauses DISABLED — these inject context-free orphan sentences
      // that break coherence (e.g. "A subtlety worth pausing over." with no referent).

      // F. DISABLED: injectLengthVariance was corrupting paragraph↔sentence mapping
      // by inserting emphatic interjections and merging sentences with semicolons,
      // causing sentences to cross paragraph boundaries
    }

    state.logs.push(
      `[antiPattern] ${ngramBreaks} n-gram breaks, ${registerMixes} register mixes, ` +
      `${openerChanges} opener changes, ${closerChanges} closer changes, ${reflectives} reflective pauses`
    );
    return state;
  },
};
