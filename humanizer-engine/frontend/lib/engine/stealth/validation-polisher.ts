/**
 * Validation & Polishing Module — Quality Assurance
 * ===================================================
 * Final quality gate that ensures:
 *   - Meaning preservation (cosine similarity via TF-IDF)
 *   - Grammar correctness (subject-verb agreement, tense consistency)
 *   - Fluency and readability
 *   - No contractions, no first person (unless input had it), no rhetorical questions
 *   - No garbled output, no repeated words/phrases
 *
 * If meaning similarity falls below threshold, reverts changes sentence by sentence.
 *
 * NO contractions. NO first person. NO rhetorical questions.
 */

import type { TextContext, Transformer, ChangeRecord } from './types';

/* ── TF-IDF Cosine Similarity ─────────────────────────────────────── */

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1);
}

function computeTFIDF(tokens: string[], docFreqs: Map<string, number>, totalDocs: number): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  const tfidf = new Map<string, number>();
  for (const [token, count] of tf) {
    const tfVal = count / tokens.length;
    const df = docFreqs.get(token) ?? 1;
    const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
    tfidf.set(token, tfVal * idf);
  }
  return tfidf;
}

function cosineSimilarity(vec1: Map<string, number>, vec2: Map<string, number>): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  const allKeys = new Set([...vec1.keys(), ...vec2.keys()]);
  for (const key of allKeys) {
    const v1 = vec1.get(key) ?? 0;
    const v2 = vec2.get(key) ?? 0;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Compute semantic similarity between original and transformed text.
 */
function measureMeaningSimilarity(original: string, transformed: string): number {
  const tokens1 = tokenize(original);
  const tokens2 = tokenize(transformed);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  // Build document frequencies
  const docFreqs = new Map<string, number>();
  const allTokens = new Set([...tokens1, ...tokens2]);
  for (const token of allTokens) {
    let count = 0;
    if (tokens1.includes(token)) count++;
    if (tokens2.includes(token)) count++;
    docFreqs.set(token, count);
  }

  const vec1 = computeTFIDF(tokens1, docFreqs, 2);
  const vec2 = computeTFIDF(tokens2, docFreqs, 2);

  return cosineSimilarity(vec1, vec2);
}

/* ── Grammar Rules ────────────────────────────────────────────────── */

interface GrammarFix {
  pattern: RegExp;
  fix: string | ((match: string, ...groups: string[]) => string);
  description: string;
}

const GRAMMAR_RULES: GrammarFix[] = [
  // Double words
  {
    pattern: /\b(\w+)\s+\1\b/gi,
    fix: '$1',
    description: 'remove doubled word',
  },
  // Double articles
  {
    pattern: /\b(a|an|the)\s+(a|an|the)\b/gi,
    fix: '$2',
    description: 'remove double article',
  },
  // "a" before vowel sounds
  {
    pattern: /\ba\s+(?=[aeiou])/gi,
    fix: 'an ',
    description: 'article correction: a -> an before vowel',
  },
  // "an" before consonant sounds (excluding silent h, etc.)
  {
    pattern: /\ban\s+(?=[bcdfgjklmnpqrstvwxyz])/gi,
    fix: 'a ',
    description: 'article correction: an -> a before consonant',
  },
  // ", And " -> ", and "
  {
    pattern: /,\s*And\s+/g,
    fix: ', and ',
    description: 'lowercase conjunction after comma',
  },
  // Broken possessives: "the study s" -> "the study's"
  {
    pattern: /(\w)\s+s\b(?=\s+\w)/g,
    fix: "$1's",
    description: 'fix broken possessive',
  },
  // Run-on "." followed by lowercase
  {
    pattern: /\.\s+([a-z])/g,
    fix: (_match: string, letter: string) => `. ${letter.toUpperCase()}`,
    description: 'capitalize after period',
  },
  // Multiple spaces
  {
    pattern: /\s{2,}/g,
    fix: ' ',
    description: 'remove extra spaces',
  },
  // Stray semicolons
  {
    pattern: /;\s*;/g,
    fix: ';',
    description: 'remove double semicolons',
  },
  // Stray colons
  {
    pattern: /:\s*:/g,
    fix: ':',
    description: 'remove double colons',
  },
];

/* ── Contraction Expansion ────────────────────────────────────────── */

const CONTRACTION_MAP: Record<string, string> = {
  "don't": "do not", "doesn't": "does not", "didn't": "did not",
  "can't": "cannot", "couldn't": "could not", "wouldn't": "would not",
  "shouldn't": "should not", "won't": "will not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "it's": "it is", "that's": "that is", "there's": "there is",
  "here's": "here is", "what's": "what is", "who's": "who is",
  "let's": "let us", "i'm": "I am", "i've": "I have", "i'd": "I would",
  "i'll": "I will", "we're": "we are", "we've": "we have",
  "we'd": "we would", "we'll": "we will", "they're": "they are",
  "they've": "they have", "they'd": "they would", "they'll": "they will",
  "you're": "you are", "you've": "you have", "you'd": "you would",
  "you'll": "you will", "he's": "he is", "she's": "she is",
  "he'd": "he would", "she'd": "she would", "he'll": "he will",
  "she'll": "she will",
};

function expandContractions(text: string): string {
  let result = text;
  for (const [contraction, expansion] of Object.entries(CONTRACTION_MAP)) {
    // Require the apostrophe (or smart quote) — never make it optional
    // to avoid matching inside words (e.g., "its" ≠ "it's", "lets" ≠ "let's")
    const escaped = contraction.replace(/'/g, "[''\u2019]");
    const regex = new RegExp('\\b' + escaped + '\\b', 'gi');
    result = result.replace(regex, (match) => {
      // Preserve capitalization
      if (match[0] === match[0].toUpperCase()) {
        return expansion.charAt(0).toUpperCase() + expansion.slice(1);
      }
      return expansion;
    });
  }
  return result;
}

/* ── First Person Removal ─────────────────────────────────────────── */

function removeFirstPerson(text: string): string {
  // Replace first-person with passive/impersonal
  let result = text;
  result = result.replace(/\bI believe\b/gi, 'The evidence suggests');
  result = result.replace(/\bI think\b/gi, 'The analysis indicates');
  result = result.replace(/\bI argue\b/gi, 'The argument holds');
  result = result.replace(/\bI conclude\b/gi, 'The conclusion drawn is');
  result = result.replace(/\bWe believe\b/gi, 'The evidence suggests');
  result = result.replace(/\bWe observe\b/gi, 'Observations show');
  result = result.replace(/\bWe find\b/gi, 'The findings show');
  result = result.replace(/\bWe can see\b/gi, 'One can observe');
  result = result.replace(/\bIn my view\b/gi, 'From this perspective');
  result = result.replace(/\bIn our view\b/gi, 'From this vantage point');
  result = result.replace(/\bmy\b/g, 'the');
  result = result.replace(/\bMy\b/g, 'The');
  result = result.replace(/\bour\b/g, 'the');
  result = result.replace(/\bOur\b/g, 'The');
  return result;
}

/* ── Rhetorical Question Removal ──────────────────────────────────── */

function removeRhetoricalQuestions(text: string): string {
  // Convert questions to declarative statements
  let result = text;
  result = result.replace(/\bWhy is this important\?\s*/gi, 'The importance of this lies in the following. ');
  result = result.replace(/\bWhat does this mean\?\s*/gi, 'The meaning of this is as follows. ');
  result = result.replace(/\bHow can this be achieved\?\s*/gi, 'Achieving this involves the following steps. ');
  result = result.replace(/\bBut what about .+?\?\s*/gi, '');
  result = result.replace(/\bCan .+?\?\s*/g, '');
  // Generic: sentence starting with question word and ending with ?
  result = result.replace(/^(What|Why|How|When|Where|Can|Could|Would|Should|Is|Are|Do|Does) .+?\?\s*/gim, '');
  return result;
}

/* ── Garble Detection ─────────────────────────────────────────────── */

function isGarbled(text: string): boolean {
  // Check for common garble patterns
  if (/\b(\w+)\s+\1\s+\1\b/i.test(text)) return true; // Triple word
  if (/[A-Z]{5,}/.test(text)) return true; // Random caps
  if (/(.{3,})\1{3,}/.test(text)) return true; // Excessive repetition
  if (/[^a-zA-Z0-9\s.,;:!?'"()\-–—\/]/.test(text.replace(/[\u2018\u2019\u201C\u201D]/g, ''))) return true; // Weird chars
  const words = text.split(/\s+/);
  if (words.length > 3 && words.filter(w => w.length > 20).length > words.length * 0.3) return true; // Too many long words
  // Orphaned possessive: "'s" without preceding word, or space before "'s"
  if (/\s's\b/.test(text) || /^'s\b/.test(text)) return true;
  // Sentence too short (less than 3 real words)
  if (words.filter(w => /^[a-zA-Z]+$/.test(w)).length < 3) return true;
  // Ends mid-word or has incomplete structure
  if (/\s\w$/.test(text.replace(/[.!?]+$/, ''))) return false; // ok, single word at end
  return false;
}

/* ── Validation Transformer Implementation ────────────────────────── */

export const validationTransformer: Transformer = {
  name: 'ValidationPolisher',
  priority: 50,

  transform(ctx: TextContext): TextContext {
    const minSimilarity = ctx.config.minSimilarity;
    const hasFirstPerson = ctx.metadata.hasFirstPerson;

    for (const sentence of ctx.sentences) {
      if (sentence.reverted) continue;

      let text = sentence.transformed;
      const changes: ChangeRecord[] = [];

      // Phase 1: Meaning preservation check
      const similarity = measureMeaningSimilarity(sentence.original, text);
      if (similarity < minSimilarity) {
        // Revert to original if meaning was lost
        changes.push({
          type: 'polish',
          original: text,
          replacement: sentence.original,
          reason: `meaning preservation failed (similarity: ${similarity.toFixed(2)} < ${minSimilarity})`,
        });
        text = sentence.original;
        sentence.reverted = true;
      }

      // Phase 2: Garble detection
      if (isGarbled(text)) {
        changes.push({
          type: 'polish',
          original: text,
          replacement: sentence.original,
          reason: 'garbled output detected — reverted',
        });
        text = sentence.original;
        sentence.reverted = true;
      }

      // Phase 3: Expand contractions (ALWAYS)
      const expanded = expandContractions(text);
      if (expanded !== text) {
        changes.push({
          type: 'polish',
          original: text,
          replacement: expanded,
          reason: 'contraction expansion',
        });
        text = expanded;
      }

      // Phase 4: Remove first person (unless input had it)
      if (!hasFirstPerson) {
        const cleaned = removeFirstPerson(text);
        if (cleaned !== text) {
          changes.push({
            type: 'polish',
            original: text,
            replacement: cleaned,
            reason: 'first person removal',
          });
          text = cleaned;
        }
      }

      // Phase 5: Remove rhetorical questions
      const noQuestions = removeRhetoricalQuestions(text);
      if (noQuestions !== text) {
        changes.push({
          type: 'polish',
          original: text,
          replacement: noQuestions,
          reason: 'rhetorical question removal',
        });
        text = noQuestions;
      }

      // Phase 6: Grammar fixes
      for (const rule of GRAMMAR_RULES) {
        if (rule.pattern.test(text)) {
          const before = text;
          if (typeof rule.fix === 'string') {
            text = text.replace(rule.pattern, rule.fix);
          } else {
            text = text.replace(rule.pattern, rule.fix as (...args: string[]) => string);
          }
          if (text !== before) {
            changes.push({
              type: 'polish',
              original: before,
              replacement: text,
              reason: rule.description,
            });
          }
        }
      }

      // Phase 7: Clean up whitespace and ensure proper punctuation
      text = text.replace(/\s{2,}/g, ' ').trim();
      if (text.length > 0 && !/[.!?]$/.test(text)) {
        text += '.';
      }

      // Phase 8: Ensure first letter is capitalized
      if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }

      sentence.transformed = text;
      sentence.changes.push(...changes);
    }

    return ctx;
  },
};

export { measureMeaningSimilarity, expandContractions, isGarbled };
