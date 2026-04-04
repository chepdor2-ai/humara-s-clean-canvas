/**
 * Phase 10 — Pre-2000 Voice
 * ============================
 * GOAL: Make the text read like it was written in the 1990s or earlier,
 * before LLMs existed. This is the strongest detector-beating signal
 * because detectors are trained on post-2020 AI text patterns.
 *
 * Pre-2000 writing characteristics:
 *   - Shorter, punchier sentences on average
 *   - Active voice dominant, direct statements
 *   - Concrete language over abstractions
 *   - Authorial voice ("I argue", "one finds", "we see")
 *   - Idiomatic expressions and colloquialisms
 *   - Less hedging, more assertive tone
 *   - Domain-specific vocabulary over generic academic
 *   - More semicolons, dashes, colons as punctuation
 *   - Rhetorical flourishes and literary devices
 *   - Fewer qualifier chains (very + adj + noun patterns)
 *
 * This phase transforms the TONE and STYLE at the discourse level,
 * not individual words.
 */

import type { DocumentState, Phase } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── POST-2020 patterns to kill (things AI says that pre-2000 writers never did) ──
const MODERN_AI_PATTERNS: [RegExp, string[]][] = [
  // "It is [adj] to [verb]" → direct imperatives or statements
  [/^it (?:is|seems|appears) (\w+) to (\w+)/i, [
    'One must $2', 'The task at hand is to $2', 'The obligation is to $2', 'It falls to the reader to $2',
  ]],
  // "This highlights..." → more direct
  [/^this (?:highlights|underscores|demonstrates|illustrates|showcases|exemplifies)\s+/i, [
    'Plainly, ', 'The record shows ', 'One notices ', 'The data confirm ',
  ]],
  // "plays a [adj] role in" → direct verb
  [/plays a \w+ role in/gi, [
    'shapes', 'drives', 'steers', 'governs', 'underpins', 'feeds into',
  ]],
  // "in today's [anything]" → temporal removal (catch-all pattern)
  [/in today'?s (?:\w+ )*\w+/gi, [
    'in the present state of things', 'as things stand', 'under current conditions', 'at this juncture',
  ]],
  // "it is worth noting" family
  [/it (?:is|seems) (?:worth|important to) (?:noting|mentioning|pointing out) that/gi, [
    'One point deserves attention:', 'A remark is in order:', 'Note well that', 'Bear in mind that',
  ]],
  // "have become increasingly" → was already happening
  [/(?:has|have) become increasingly/gi, [
    'grew steadily more', 'turned more and more', 'edged ever closer to being', 'proved more',
  ]],
  // "leverage" as verb (post-2010 corporate jargon)
  [/\bleverage(?:s|d)?\b/gi, [
    'draw on', 'exploit', 'put to use', 'turn to account', 'harness',
  ]],
  // "ecosystem" (tech jargon)
  [/\becosystem\b/gi, [
    'network', 'web', 'fabric', 'sphere', 'arena',
  ]],
  // "scalable" (tech jargon)
  [/\bscalable\b/gi, [
    'expandable', 'flexible', 'elastic', 'adaptable',
  ]],
  // "stakeholders" (post-2000 corporate)
  [/\bstakeholders?\b/gi, [
    'interested parties', 'those involved', 'the parties concerned', 'participants',
  ]],
  // "utilize/utilise" family — NOTE: "utilization of X" → must not produce "make use of of X"
  [/\butiliz(?:e[sd]?|ing)\b/gi, [
    'use', 'employ', 'put to work', 'apply',
  ]],
  [/\butilization\b/gi, [
    'use', 'employment', 'application',
  ]],
  // "impactful" (not a real word before ~2005)
  [/\bimpactful\b/gi, [
    'forceful', 'telling', 'effective', 'potent', 'striking',
  ]],
  // "deep dive"
  [/\bdeep dive\b/gi, [
    'thorough examination', 'close look', 'careful study', 'hard look',
  ]],
  // "at the forefront"
  [/\bat the forefront of\b/gi, [
    'leading the way in', 'out front in', 'ahead of the pack in', 'spearheading',
  ]],
  // "moving forward" / "going forward"
  [/\b(?:moving|going) forward\b/gi, [
    'from here on', 'in time to come', 'hereafter', 'in future',
  ]],
];

// ── Authorial voice insertions (pre-2000 writers had personality) ──
const AUTHORIAL_INSERTIONS: string[] = [
  'It would be hasty to conclude that ',
  'A careful reader will note that ',
  'The careful observer will find that ',
  'It takes no great insight to see that ',
  'A moment of reflection shows that ',
  'The evidence, taken on its own terms, suggests that ',
  'The record speaks plainly: ',
  'One ought to consider that ',
  'By all reasonable accounts, ',
  'On the strength of the evidence, ',
  'A measured reading of the data shows that ',
  'The broader pattern suggests that ',
];

// ── Literary/rhetorical devices (humans use these, AI almost never does) ──
const LITERARY_DEVICES: [RegExp, string[]][] = [
  // Litotes: "X is important" → "X is no small matter"
  [/\b(\w+)\s+(?:is|are|was|were)\s+(?:very |extremely |highly )?important\b/gi, [
    '$1 is no small matter', '$1 is hardly trivial', '$1 is not to be taken lightly',
  ]],
  // Metonymy: "the government" → "the powers that be"
  [/\bthe government\b/gi, [
    'the authorities', 'the powers that be', 'those in power', 'the governing body',
  ]],
  // Analogy insertions
  [/\bis like\b/gi, [
    'resembles', 'calls to mind', 'bears a likeness to', 'mirrors',
  ]],
];

// ── Punctuation diversification (pre-2000 used more varied punctuation) ──
function diversifyPunctuation(text: string): string {
  let result = text;

  // Convert some "X, and Y" to "X; Y" (semicolons were common in older writing)
  if (Math.random() < 0.25) {
    result = result.replace(/,\s+and\s+/i, '; ');
  }

  // Em-dash for contrast removed — em-dash budget enforced in formatPhase

  // Add colon for elaboration: "X. This means Y" → "X: Y"
  result = result.replace(/\.\s+This (?:means|implies|suggests) that /i, ': ');

  return result;
}

// ── Qualifier chain removal (AI loves "very significant strategic implications") ──
function removeQualifierChains(text: string): string {
  // Remove redundant adverb + adjective pairs
  return text
    .replace(/\b(very|extremely|incredibly|remarkably|exceptionally|particularly|especially|highly|truly|quite) (significant|important|crucial|essential|notable|substantial|considerable)\b/gi,
      '$2')
    .replace(/\b(significant|substantial|considerable|meaningful|noteworthy) (impact|effect|influence|role|contribution)\b/gi,
      (_m, _adj, noun) => pickRandom(['real', 'clear', 'marked', 'plain', 'direct']) + ' ' + noun);
}

export const voicePhase: Phase = {
  name: 'voice',
  async process(state: DocumentState): Promise<DocumentState> {
    let patternKills = 0;
    let authorialInserts = 0;
    let literaryDevices = 0;
    let punctChanges = 0;
    let qualifierStrips = 0;

    for (const paragraph of state.paragraphs) {
      for (let i = 0; i < paragraph.sentences.length; i++) {
        const sentence = paragraph.sentences[i];
        let text = sentence.text;

        // 1. Kill modern AI patterns (mandatory — these are detector red flags)
        for (const [pattern, replacements] of MODERN_AI_PATTERNS) {
          if (pattern.test(text)) {
            text = text.replace(pattern, () => pickRandom(replacements));
            patternKills++;
          }
        }

        // 2. Literary devices — DISABLED (creates unnatural phrasing)
        // if (Math.random() < 0.30) { ... }

        // 3. Authorial voice insertion — DISABLED (creates unnatural phrases)
        // if (i > 0 && Math.random() < 0.12 ...) { ... }

        // 4. Diversify punctuation (25% chance)
        if (Math.random() < 0.25) {
          const after = diversifyPunctuation(text);
          if (after !== text) {
            text = after;
            punctChanges++;
          }
        }

        // 5. Strip qualifier chains (always)
        const stripped = removeQualifierChains(text);
        if (stripped !== text) {
          text = stripped;
          qualifierStrips++;
        }

        sentence.text = text;
      }
    }

    state.logs.push(
      `[voice] ${patternKills} AI patterns killed, ${authorialInserts} authorial inserts, ` +
      `${literaryDevices} literary devices, ${punctChanges} punct changes, ${qualifierStrips} qualifier strips`
    );
    return state;
  },
};
