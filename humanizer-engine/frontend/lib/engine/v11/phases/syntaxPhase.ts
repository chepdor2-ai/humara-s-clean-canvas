/**
 * Phase 9 — Syntactic Restructuring
 * =======================================
 * GOAL: Break the sentence-structure templates that AI detectors recognize.
 *
 * AI generates text in predictable syntactic patterns:
 *   - Subject → Verb → Object → Qualifier (uniformly)
 *   - Parallel structure across sentences
 *   - Balanced clause lengths
 *
 * Human writing is syntactically messy:
 *   - Fronted adverbials ("On the face of it, ...")
 *   - Inverted structures ("Gone are the days when ...")
 *   - Cleft sentences ("What matters is ...")
 *   - Sentence fragments for emphasis
 *   - Questions mixed in with declaratives
 *   - Appositive phrases breaking flow
 *
 * Strategy:
 *   1. Convert some passive → active (and vice versa, for variety)
 *   2. Front adverbial phrases
 *   3. Insert cleft constructions
 *   4. Convert ~10% of statements to rhetorical questions
 *   5. Reorder clause positions (subordinate-first)
 *   6. Break monotonous parallel structures
 */

import type { DocumentState, Phase } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── CLEFT sentence transforms ──
// Turn "X does Y" → "What X does is Y" or "It is Y that X does"
const CLEFT_STARTERS: string[] = [
  'What stands out is that ',
  'What the evidence suggests is that ',
  'The underlying point is that ',
  'What remains underappreciated is that ',
  'The substantive finding is that ',
];

// ── SUBORDINATE-FIRST reorder ──
// Move trailing clauses to front
const SUBORDINATE_PATTERNS: [RegExp, string][] = [
  // "X because Y" → "Because Y, X"
  [/^(.{15,}?)\s+because\s+(.{10,})$/i,
   'Because $2, $1'],
  // "X although Y" → "Although Y, X"
  [/^(.{15,}?)\s+although\s+(.{10,})$/i,
   'Although $2, $1'],
  // "X while Y" → "While Y, X"
  [/^(.{15,}?)\s+while\s+(.{10,})$/i,
   'While $2, $1'],
  // "X since Y" → "Since Y, X"
  [/^(.{15,}?)\s+since\s+(.{10,})$/i,
   'Since $2, $1'],
  // "X even though Y" → "Even though Y, X"
  [/^(.{15,}?)\s+even though\s+(.{10,})$/i,
   'Even though $2, $1'],
  // "X when Y" → "When Y, X"
  [/^(.{15,}?)\s+when\s+(.{10,})$/i,
   'When $2, $1'],
  // "X as Y" → "As Y, X" (require longer clause, handled with extra check in function)
  [/^(.{20,}?)\s+as\s+(.{25,})$/i,
   'As $2, $1'],
];

// ── RHETORICAL QUESTION transforms ──
const QUESTION_TEMPLATES: [RegExp, string][] = [
  // "It is clear that X" → "Is it not clear that X?"
  [/^it (?:is|seems|appears) (?:clear|obvious|evident|apparent) that (.+)\.$/i,
   'But is it not clear that $1?'],
  // "X is important" → "Why does X matter?"
  [/^(.+?) (?:is|are|remains?) (?:important|significant|crucial|vital|essential)\.$/i,
   'Why does $1 matter so much?'],
  // "We need to X" → "Do we not need to X?"
  [/^we (?:need|must|should|have) to (.+)\.$/i,
   'And shouldn\'t we $1?'],
  // General: "X happens" → "But does X really happen?"
  [/^(.{10,}?)\s+(happens?|occurs?|exists?|works?)(.*)\.$/i,
   'But does $1 really $2$3?'],
];

// Additional question forms for remaining sentences
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const QUESTION_WRAPS: string[] = [
  'But here is the question: ',
  'So what does this tell us? ',
  'And why should we care? ',
  'What happens when we look closer? ',
  'Consider this: ',
  'Ask yourself: ',
];

// ── FRONTED ADVERBIALS ──
const ADVERB_FRONTS: string[] = [
  'In practical terms, ',
  'On closer inspection, ',
  'From a wider angle, ',
  'Seen another way, ',
  'Stepping back, ',
  'On the face of it, ',
  'By all accounts, ',
  'In fairness, ',
  'At the risk of oversimplifying, ',
  'Looked at historically, ',
  'From the ground level, ',
  'With hindsight, ',
  'In no uncertain terms, ',
  'Against that backdrop, ',
  'Time and again, ',
  'Under normal circumstances, ',
  'For better or worse, ',
  'In the strictest sense, ',
  'By any reasonable measure, ',
  'Beneath the surface, ',
];

// ── APPOSITIVE INSERTIONS ──
// Short descriptive phrases inserted after the subject
const APPOSITIVES: string[] = [
  ', a point often missed,',
  ', long a subject of debate,',
  ', no mere technicality,',
  ', seldom discussed openly,',
  ', once considered settled,',
  ', a thorny issue at best,',
  ', hardly a new concern,',
  ', overlooked for decades,',
  ', deceptively simple on the surface,',
  ', still evolving in practice,',
];

/**
 * Reorder subordinate clause to front of sentence.
 */
function reorderSubordinate(text: string): string | null {
  // Skip sentences that already start with a subordinating conjunction
  if (/^(While|Although|Because|Since|Even though|Whereas|Unless|If)\b/i.test(text.trim())) return null;
  for (const [pattern, replacement] of SUBORDINATE_PATTERNS) {
    if (pattern.test(text)) {
      // Skip "such as" contexts — "such as" is not a subordinating conjunction
      if (/\bsuch\s+as\b/i.test(text) && replacement.startsWith('As ')) continue;
      let result = text.replace(pattern, replacement);
      // Clean up double periods
      result = result.replace(/\.\./, '.').replace(/\.\s*,/, ',');
      // Ensure ends with period
      if (!/[.!?]$/.test(result.trim())) result = result.trim() + '.';
      // Validate: both halves must have a verb to be complete clauses
      const parts = result.split(/,\s+/);
      if (parts.length >= 2) {
        const hasVerbInFirst = /\b(is|are|was|were|has|have|had|does|do|did|can|could|will|would|shall|should|may|might|must|need|seems?|appears?|remains?|becomes?)\b/i.test(parts[0]);
        // If the fronted clause has no verb, it's likely a fragment — skip
        if (!hasVerbInFirst && parts[0].split(/\s+/).length < 5) return null;
      }
      return result;
    }
  }
  return null;
}

/**
 * Convert a declarative sentence to a rhetorical question.
 */
function toRhetoricalQuestion(text: string): string | null {
  for (const [pattern, replacement] of QUESTION_TEMPLATES) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }
  return null;
}

/**
 * Add a cleft construction to emphasize.
 */
function toCleft(text: string): string {
  if (!text || text.length === 0) return text;
  const starter = pickRandom(CLEFT_STARTERS);
  // Lowercase the first letter of the original
  return starter + text[0].toLowerCase() + text.slice(1);
}

/**
 * Insert an appositive after the subject of a sentence.
 */
function insertAppositive(text: string): string {
  const words = text.split(/\s+/);
  if (words.length < 8) return text;

  // Find first verb position (rough heuristic)
  const verbIdx = words.findIndex((w, i) =>
    i > 0 && i < 6 &&
    /^(is|are|was|were|has|have|had|does|do|did|can|could|will|would|should|may|might|must|remains?|seems?|appears?|becomes?)$/i.test(w.replace(/[^a-z]/gi, ''))
  );

  if (verbIdx > 0) {
    const appositive = pickRandom(APPOSITIVES);
    words.splice(verbIdx, 0, appositive);
    return words.join(' ');
  }
  return text;
}

export const syntaxPhase: Phase = {
  name: 'syntax',
  async process(state: DocumentState): Promise<DocumentState> {
    let reorders = 0;
    let questions = 0;
    let clefts = 0;
    let fronts = 0;
    let appositives = 0;

    for (const paragraph of state.paragraphs) {
      const len = paragraph.sentences.length;

      for (let i = 0; i < len; i++) {
        const sentence = paragraph.sentences[i];
        const words = sentence.text.split(/\s+/);

        // Skip very short sentences
        if (words.length < 6) continue;

        // Skip sentences already structurally modified by earlier phases
        if (sentence.flags.includes('struct-mod')) continue;

        // Skip sentences that already have heavy punctuation injection
        const dashCount = (sentence.text.match(/—/g) || []).length;
        const commaCount = (sentence.text.match(/,/g) || []).length;
        if (dashCount >= 2 || commaCount >= 4) continue;

        const roll = Math.random();

        // Each sentence gets at most ONE structural transform (to avoid chaos)

        if (roll < 0.06) {
          // 6% chance: subordinate reorder (reduced from 18%)
          const reordered = reorderSubordinate(sentence.text);
          if (reordered) {
            sentence.text = reordered;
            sentence.flags.push('struct-mod');
            reorders++;
            continue;
          }
        }

        // DISABLED: rhetorical question injection creates unnatural "But does X really Y?" patterns

        // Cleft constructions DISABLED — they compound with Phase 13 synonym swaps
        // producing garbled outputs like "The actual discovering is that"

        // DISABLED: fronted adverbial injection ("At the risk of oversimplifying,"
        // "In no uncertain terms," etc.) was creating unnatural register mixing

        // DISABLED: appositive insertion was adding unnatural parentheticals
      }
    }

    state.logs.push(
      `[syntax] ${reorders} reorders, ${questions} questions, ${clefts} clefts, ${fronts} fronts, ${appositives} appositives`
    );
    return state;
  },
};
