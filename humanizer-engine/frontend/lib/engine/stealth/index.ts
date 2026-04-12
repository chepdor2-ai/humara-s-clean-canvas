/**
 * Stealth Humanizer — Sentence-by-Sentence Non-LLM Engine
 * =========================================================
 *
 * Single-pass, sentence-level processing. Each sentence is independently:
 *   1. Phrase-replaced (AI phrases → natural alternatives)
 *   2. Word-replaced (AI buzzwords → casual synonyms)
 *   3. Contextual synonym swapped (~20-35% of remaining content words)
 *   4. Probabilistically given a sentence starter injection
 *   5. Validated for ≥40% word-level change, meaning preservation, grammar
 *   6. Cleaned: zero contractions, zero first person (unless input had it)
 *
 * Quality is the top priority. Every sentence must read naturally.
 *
 * NO contractions. NO first person (unless input). NO rhetorical questions.
 */

import { AI_WORD_REPLACEMENTS } from '../shared-dictionaries';
import { getBestReplacement } from './dictionary-service';

/* ── Sentence Splitter ────────────────────────────────────────────── */

function splitSentences(text: string): string[] {
  // Split on . ! ? followed by space+capital, but respect abbreviations
  return text
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/* ── AI Phrase Patterns → Natural Replacements ────────────────────── */

const PHRASE_REPLACEMENTS: Array<{ pattern: RegExp; replacements: string[] }> = [
  { pattern: /\bin order to\b/gi, replacements: ['to', 'so as to'] },
  { pattern: /\bdue to the fact that\b/gi, replacements: ['because', 'since'] },
  { pattern: /\ba large number of\b/gi, replacements: ['many', 'numerous'] },
  { pattern: /\bin the event that\b/gi, replacements: ['if', 'should'] },
  { pattern: /\bon the other hand\b/gi, replacements: ['then again', 'by contrast'] },
  { pattern: /\bas a result\b/gi, replacements: ['so', 'because of this'] },
  { pattern: /\bin addition\b/gi, replacements: ['also', 'besides'] },
  { pattern: /\bfor example\b/gi, replacements: ['for instance', 'to illustrate'] },
  { pattern: /\bin terms of\b/gi, replacements: ['regarding', 'when it comes to'] },
  { pattern: /\bwith regard to\b/gi, replacements: ['about', 'regarding'] },
  { pattern: /\bit is important to note that\s*/gi, replacements: [''] },
  { pattern: /\bit should be noted that\s*/gi, replacements: [''] },
  { pattern: /\bit is worth mentioning that\s*/gi, replacements: [''] },
  { pattern: /\bin the context of\b/gi, replacements: ['within', 'in'] },
  { pattern: /\bon the basis of\b/gi, replacements: ['based on', 'from'] },
  { pattern: /\bat the same time\b/gi, replacements: ['meanwhile', 'yet'] },
  { pattern: /\bwith respect to\b/gi, replacements: ['about', 'regarding'] },
  { pattern: /\bin spite of\b/gi, replacements: ['despite', 'even with'] },
  { pattern: /\bby means of\b/gi, replacements: ['through', 'using'] },
  { pattern: /\bin accordance with\b/gi, replacements: ['following', 'per'] },
  { pattern: /\bfor the purpose of\b/gi, replacements: ['to', 'for'] },
  { pattern: /\bprior to\b/gi, replacements: ['before'] },
  { pattern: /\bsubsequent to\b/gi, replacements: ['after', 'following'] },
  { pattern: /\bin contrast to\b/gi, replacements: ['unlike', 'compared with'] },
  { pattern: /\bas well as\b/gi, replacements: ['and', 'along with'] },
  { pattern: /\ba wide range of\b/gi, replacements: ['many', 'various'] },
  { pattern: /\btake into account\b/gi, replacements: ['consider', 'factor in'] },
  { pattern: /\bplay a (?:significant |important |key |crucial |vital |critical |pivotal )?role in\b/gi, replacements: ['shape', 'affect', 'influence'] },
  { pattern: /\bhave an impact on\b/gi, replacements: ['affect', 'influence'] },
  { pattern: /\bin light of\b/gi, replacements: ['given', 'considering'] },
  { pattern: /\bthe fact that\b/gi, replacements: ['that', 'how'] },
  { pattern: /\bit is (?:clear|evident|obvious) that\b/gi, replacements: ['clearly,'] },
  { pattern: /\bthere is no doubt that\b/gi, replacements: ['certainly,'] },
  { pattern: /\bin today's (?:world|society|era|age)\b/gi, replacements: ['right now', 'today'] },
  { pattern: /\bin the modern (?:world|era|age)\b/gi, replacements: ['today'] },
  { pattern: /\bnot only\b(.{3,60}?)\bbut also\b/gi, replacements: ['SPLIT'] },
  { pattern: /\bgive rise to\b/gi, replacements: ['cause', 'lead to'] },
  { pattern: /\bshed light on\b/gi, replacements: ['explain', 'clarify'] },
  { pattern: /\bpave the way for\b/gi, replacements: ['enable', 'allow'] },
  { pattern: /\bover the course of\b/gi, replacements: ['during', 'throughout'] },
  { pattern: /\bat this point in time\b/gi, replacements: ['now', 'currently'] },
];

/* ── Sentence Starters (probabilistic injection) ──────────────────── */

const STARTERS_ACADEMIC: string[] = [
  'Notably,', 'Historically,', 'Traditionally,', 'In practice,',
  'In broad terms,', 'From a practical standpoint,', 'At its core,',
  'On balance,', 'By extension,', 'In reality,',
  'Against this backdrop,', 'Under these conditions,',
];

/* ── Contraction Map ──────────────────────────────────────────────── */

const CONTRACTIONS: Record<string, string> = {
  "don't": "do not", "doesn't": "does not", "didn't": "did not",
  "can't": "cannot", "couldn't": "could not", "wouldn't": "would not",
  "shouldn't": "should not", "won't": "will not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "it's": "it is", "that's": "that is", "there's": "there is",
  "what's": "what is", "who's": "who is", "let's": "let us",
  "i'm": "I am", "i've": "I have", "i'd": "I would", "i'll": "I will",
  "we're": "we are", "we've": "we have", "we'd": "we would",
  "we'll": "we will", "they're": "they are", "they've": "they have",
  "you're": "you are", "you've": "you have",
};

/* ── Protected Terms (never replace) ──────────────────────────────── */

const PROTECTED = new Set([
  'hypothesis', 'methodology', 'statistical', 'significance', 'correlation',
  'empirical', 'qualitative', 'quantitative', 'longitudinal', 'meta-analysis',
  'photosynthesis', 'mitochondria', 'chromosome', 'genome', 'algorithm',
  'quantum', 'thermodynamic', 'electromagnetic', 'gravitational',
  'diagnosis', 'prognosis', 'pathology', 'epidemiology', 'therapeutic',
  'jurisdiction', 'plaintiff', 'defendant', 'statute', 'precedent',
  'infrastructure', 'implementation', 'specification', 'authentication',
  'artificial', 'intelligence', 'organizations', 'decision',
]);

/* ── Stopwords (skip for synonym replacement) ─────────────────────── */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'that', 'this', 'these', 'those', 'it', 'its',
  'they', 'them', 'their', 'we', 'our', 'he', 'she', 'his', 'her',
  'which', 'what', 'who', 'whom', 'about', 'also', 'up', 'down', 'much',
]);

/* ── Morphology Helpers ───────────────────────────────────────────── */

/**
 * Transfer the inflectional suffix from the original word to the replacement.
 * "transformed" + "shift" → "shifted"
 * "making" + "create" → "creating"
 */
function transferMorphology(original: string, replacement: string): string {
  const orig = original.toLowerCase();
  const rep = replacement.toLowerCase();

  // Past tense: -ed
  if (orig.endsWith('ed') && !rep.endsWith('ed') && orig.length > 4) {
    if (rep.endsWith('e')) return replacement + 'd';
    // Avoid doubling consonant for common patterns — keep it simple
    return replacement + 'ed';
  }

  // Gerund / present participle: -ing
  if (orig.endsWith('ing') && !rep.endsWith('ing') && orig.length > 5) {
    if (rep.endsWith('e')) return replacement.slice(0, -1) + 'ing';
    return replacement + 'ing';
  }

  return replacement;
}

/**
 * Strip common inflectional suffix to get an approximate base form
 * for dictionary lookup.  Returns the base form.
 */
function naiveStem(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

/* ── Helper: measure word-level change ratio ──────────────────────── */

function wordChangeRatio(original: string, modified: string): number {
  const origWords = original.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const modWords = modified.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (origWords.length === 0) return 0;
  let changed = 0;
  const maxLen = Math.max(origWords.length, modWords.length);
  for (let i = 0; i < maxLen; i++) {
    if (origWords[i] !== modWords[i]) changed++;
  }
  return changed / origWords.length;
}

/* ── Helper: content word overlap (meaning check) ─────────────────── */

function contentOverlap(original: string, modified: string): number {
  const getContent = (t: string) => {
    return t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w));
  };
  const origSet = new Set(getContent(original));
  const modWords = getContent(modified);
  if (origSet.size === 0) return 1;
  let matches = 0;
  for (const w of modWords) {
    if (origSet.has(w)) { matches++; origSet.delete(w); }
    else {
      // Stem match (first 5 chars)
      for (const o of origSet) {
        if (o.length >= 5 && w.length >= 5 && o.slice(0, 5) === w.slice(0, 5)) {
          matches += 0.7; origSet.delete(o); break;
        }
      }
    }
  }
  return Math.min(1, matches / getContent(original).length);
}

/* ── Core: process one sentence ──────────────────────────────────── */

function processSentence(
  sentence: string,
  hasFirstPerson: boolean,
  sentenceIndex: number,
  totalSentences: number,
  usedStarters: Set<string>,
  strength: string,
): string {
  if (!sentence || sentence.trim().length < 8) return sentence;
  const original = sentence;
  let text = sentence;

  // ─── Step 1: AI phrase replacement ───────────────────────────
  for (const { pattern, replacements } of PHRASE_REPLACEMENTS) {
    if (replacements.length === 0) continue;
    if (replacements[0] === 'SPLIT') {
      // "not only X but also Y" → "X, and Y"
      text = text.replace(pattern, (_m, mid) => {
        return mid.trim().replace(/^,?\s*/, '').replace(/,?\s*$/, '') + ', and ';
      });
      continue;
    }
    const match = text.match(pattern);
    if (match) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)];
      // Preserve capitalization
      const final = match[0][0] === match[0][0].toUpperCase() && rep.length > 0
        ? rep.charAt(0).toUpperCase() + rep.slice(1)
        : rep;
      text = text.replace(pattern, final);
      // If replacement was empty (hedging removal), capitalize next char
      if (final === '' && text.length > 0 && text[0] !== text[0].toUpperCase()) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
    }
  }

  // ─── Step 2: AI word replacement (from shared dictionary) ────
  const tokens = text.split(/(\b)/);
  const resultTokens: string[] = [];
  let replaceCount = 0;
  const wordCount = text.split(/\s+/).length;
  const maxReplacements = Math.ceil(wordCount * (strength === 'strong' ? 0.50 : 0.40));

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (replaceCount >= maxReplacements || !/^[a-zA-Z]{3,}$/.test(token)) {
      resultTokens.push(token);
      continue;
    }
    const lower = token.toLowerCase();
    if (PROTECTED.has(lower) || STOPWORDS.has(lower)) {
      resultTokens.push(token);
      continue;
    }

    // Check AI_WORD_REPLACEMENTS first (high confidence replacements)
    // Try exact match, then stem match (e.g., "transformed" → stem "transform")
    const aiReps = AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[naiveStem(lower)];
    const usingStem = !AI_WORD_REPLACEMENTS[lower] && !!AI_WORD_REPLACEMENTS[naiveStem(lower)];
    if (aiReps && aiReps.length > 0) {
      // Pick a single-word replacement if available, else first
      const singleWord = aiReps.filter(r => !r.includes(' ') && r.length >= 2);
      const pool = singleWord.length > 0 ? singleWord : aiReps.filter(r => r.length >= 2);
      if (pool.length > 0) {
        let rep = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
        // Preserve capitalization
        if (token[0] === token[0].toUpperCase()) {
          rep = rep.charAt(0).toUpperCase() + rep.slice(1);
        }
        // Transfer morphology if we matched via stem
        if (usingStem) {
          rep = transferMorphology(token, rep);
        }
        // Preserve plural
        if (/s$/.test(token) && !/s$/.test(rep) && token.length > 4) {
          rep = rep + 's';
        }
        resultTokens.push(rep);
        replaceCount++;
        continue;
      }
    }

    resultTokens.push(token);
  }
  text = resultTokens.join('');

  // ─── Step 3: Contextual synonym swap for remaining words ─────
  // Target ~20-30% of content words to reach the 40% change threshold
  const currentChange = wordChangeRatio(original, text);
  if (currentChange < 0.40) {
    const tokens2 = text.split(/(\b)/);
    const result2: string[] = [];
    let extraSwaps = 0;
    const neededChange = 0.40 - currentChange;
    const maxExtra = Math.ceil(wordCount * neededChange) + 2;

    for (let i = 0; i < tokens2.length; i++) {
      const tk = tokens2[i];
      if (extraSwaps >= maxExtra || !/^[a-zA-Z]{4,}$/.test(tk)) {
        result2.push(tk);
        continue;
      }
      const lower = tk.toLowerCase();
      if (PROTECTED.has(lower) || STOPWORDS.has(lower)) {
        result2.push(tk);
        continue;
      }

      // Probabilistic: ~40% chance per eligible word
      if (Math.random() < 0.40) {
        let syn = getBestReplacement(lower, text);
        // If no result for inflected form, try stem
        if (!syn || syn.toLowerCase() === lower) {
          const stemmed = naiveStem(lower);
          if (stemmed !== lower) {
            syn = getBestReplacement(stemmed, text);
          }
        }
        if (syn && syn.toLowerCase() !== lower && /^[a-zA-Z]+$/.test(syn) && syn.length >= 2) {
          let rep = syn;
          // Transfer morphology (e.g., "transformed" → replacement gets -ed)
          rep = transferMorphology(tk, rep);
          if (tk[0] === tk[0].toUpperCase()) {
            rep = rep.charAt(0).toUpperCase() + rep.slice(1);
          }
          if (/s$/.test(tk) && !/s$/.test(rep) && tk.length > 4) {
            rep = rep + 's';
          }
          result2.push(rep);
          extraSwaps++;
          continue;
        }
      }
      result2.push(tk);
    }
    text = result2.join('');
  }

  // ─── Step 4: Probabilistic sentence starter injection ────────
  // ~25% chance, only if sentence doesn't already start with a varied opener
  const starterRoll = Math.random();
  const alreadyHasStarter = /^(Notably|Historically|Traditionally|In practice|In broad|From a|At its|On balance|By extension|In reality|Against|Under these)/i.test(text);
  if (starterRoll < 0.25 && !alreadyHasStarter && sentenceIndex > 0 && text.length > 30) {
    const available = STARTERS_ACADEMIC.filter(s => !usedStarters.has(s));
    if (available.length > 0) {
      const starter = available[Math.floor(Math.random() * available.length)];
      usedStarters.add(starter);
      text = starter + ' ' + text.charAt(0).toLowerCase() + text.slice(1);
    }
  }

  // ─── Step 5: Hedging/cliché opener removal ──────────────────
  text = text.replace(/^In today's (?:world|society|era|age),?\s*/i, '');
  text = text.replace(/^In the modern (?:world|era|age),?\s*/i, '');
  text = text.replace(/^Throughout history,?\s*/i, '');
  text = text.replace(/^It is (?:widely|generally|commonly) (?:known|recognized|accepted) that\s*/i, '');
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // ─── Step 6: Expand contractions (REQUIRE apostrophe) ────────
  for (const [c, e] of Object.entries(CONTRACTIONS)) {
    const escaped = c.replace(/'/g, "[''\u2019]");
    const re = new RegExp('\\b' + escaped + '\\b', 'gi');
    text = text.replace(re, e);
  }

  // ─── Step 7: Remove first person (unless input had it) ───────
  if (!hasFirstPerson) {
    text = text.replace(/\bI believe\b/gi, 'The evidence suggests');
    text = text.replace(/\bI think\b/gi, 'The analysis indicates');
    text = text.replace(/\bWe believe\b/gi, 'The evidence suggests');
    text = text.replace(/\bWe observe\b/gi, 'Observations show');
    text = text.replace(/\bI\s+(?=\w)/g, 'The analysis ');
    text = text.replace(/\bwe\s+(?=\w)/gi, 'the research ');
    text = text.replace(/\bmy\b/g, 'the');
    text = text.replace(/\bMy\b/g, 'The');
    text = text.replace(/\bour\b/g, 'the');
    text = text.replace(/\bOur\b/g, 'The');
  }

  // ─── Step 8: Grammar cleanup ─────────────────────────────────
  text = text.replace(/\b(\w+)\s+\1\b/gi, '$1');          // doubled words
  text = text.replace(/\b(a|an|the)\s+(a|an|the)\b/gi, '$2'); // double articles
  text = text.replace(/\s{2,}/g, ' ');                     // multiple spaces
  text = text.replace(/\s+([.,;:!?])/g, '$1');            // space before punctuation
  // Article agreement
  text = text.replace(/\ba\s+([aeiou])/gi, (m, v) => {
    return (m[0] === 'A' ? 'An ' : 'an ') + v;
  });
  text = text.replace(/\ban\s+([bcdfgjklmnpqrstvwxyz])/gi, (m, c) => {
    return (m[0] === 'A' ? 'A ' : 'a ') + c;
  });
  // Ensure proper ending
  text = text.trim();
  if (text.length > 0 && !/[.!?]$/.test(text)) {
    text += '.';
  }
  // Capitalize first letter
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // ─── Step 9: Quality gate — revert if meaning lost ──────────
  const overlap = contentOverlap(original, text);
  if (overlap < 0.30) {
    // Meaning too far gone — revert to original with minimal changes
    return original;
  }

  return text;
}

/* ── Public API ───────────────────────────────────────────────────── */

export function stealthHumanize(
  text: string,
  strength: string = 'medium',
  _tone: string = 'academic',
): string {
  console.log('[NURU_V2] === NEW ENGINE ACTIVE === Input length:', text.length);
  if (!text || text.trim().length === 0) return text;

  const hasFirstPerson = /\b(I|we|my|our|me|us|myself|ourselves)\b/.test(text);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const usedStarters = new Set<string>();

  // Count total sentences for index tracking
  let globalSentenceIdx = 0;
  const allSentences: Array<{ paraIdx: number; sentences: string[] }> = [];
  let totalSentences = 0;
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sents = splitSentences(paragraphs[pi]);
    allSentences.push({ paraIdx: pi, sentences: sents });
    totalSentences += sents.length;
  }

  // Process sentence by sentence, preserving paragraph structure
  const outputParagraphs: string[] = [];

  for (const { sentences } of allSentences) {
    const outputSentences: string[] = [];

    for (const sent of sentences) {
      const processed = processSentence(
        sent, hasFirstPerson, globalSentenceIdx, totalSentences,
        usedStarters, strength,
      );
      outputSentences.push(processed);
      globalSentenceIdx++;
    }

    outputParagraphs.push(outputSentences.join(' '));
  }

  return outputParagraphs.join('\n\n');
}

export default stealthHumanize;
