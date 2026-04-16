import { getBestReplacement } from './dictionary-service';

/**
 * Calculates sentence length variance (burstiness).
 */
function getBurstiness(sentences: string[]): number {
  if (sentences.length <= 1) return 1;
  const lengths = sentences.map(s => s.split(' ').length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / lengths.length;
  return variance / mean; // Coefficient-like measure
}

/**
 * Helper to split sentences.
 */
function splitSents(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()) || [text];
}

/* ─────────────────────────────────────────────────────────────────
 * 1. ZeroGPT
 * Focus: Uniform sentence structure, transition over-indexing.
 * ───────────────────────────────────────────────────────────────── */
const ZEROGPT_TRANSITIONS = new Set(['furthermore', 'moreover', 'additionally', 'consequently', 'therefore', 'thus', 'hence', 'subsequently', 'in addition', 'as a result']);

export function cleanZeroGPTPass(text: string): string {
  let sentences = splitSents(text);
  let changed = false;
  sentences = sentences.map(s => {
    const lower = s.toLowerCase();
    for (const trans of ZEROGPT_TRANSITIONS) {
      if (lower.startsWith(trans + ',') || lower.startsWith(trans + ' ')) {
        const regex = new RegExp(`^${trans}[,]?\\s*`, 'i');
        const replaced = s.replace(regex, '');
        if (replaced.length > 0) {
          changed = true;
          return replaced.charAt(0).toUpperCase() + replaced.slice(1);
        }
      }
    }
    return s;
  });
  
  if (!changed) return text;
  return sentences.join(' ');
}

/* ─────────────────────────────────────────────────────────────────
 * 2. Surfer SEO
 * Focus: Keyword stuffing, unnatural density, robotic lists.
 * ───────────────────────────────────────────────────────────────── */
export function cleanSurferSEOPass(text: string): string {
  // Strip overly dense "keyword" lists e.g. "includes A, B, C, and D."
  let cleaned = text.replace(/([a-zA-Z]+(?:,\s*[a-zA-Z]+){2,}),\s*and\s*([a-zA-Z]+)/gi, '$1 and $2');
  
  // Replace SEO transition fluff
  cleaned = cleaned.replace(/\b(crucial|vital|essential)\b\s+(aspect|element|component|part)\b/gi, 'key part');
  cleaned = cleaned.replace(/\b(comprehensive|ultimate)\b\s+(guide|overview|analysis)\b/gi, 'review');
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────
 * 3. Originality AI
 * Focus: High predictability, adjective-noun over-pairing.
 * ───────────────────────────────────────────────────────────────── */
const ORIGINALITY_PREDICTABLE = [
  { match: /\bdelve\b(?:s|d|ing)?\s+into\b/gi, rep: 'explore' },
  { match: /\btapestry\b/gi, rep: 'mix' },
  { match: /\bseamlessly\s+integrate\b/gi, rep: 'combine' },
  { match: /\btestament\s+to\b/gi, rep: 'proof of' },
  { match: /\boverarching\b/gi, rep: 'main' },
  { match: /\binnovative\s+(solution|approach|method)\b/gi, rep: 'new $1' },
];

export function cleanOriginalityAIPass(text: string): string {
  let cleaned = text;
  for (const rule of ORIGINALITY_PREDICTABLE) {
    cleaned = cleaned.replace(rule.match, rule.rep);
  }
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────
 * 4. GPTZero
 * Focus: Burstiness deficits, flat perplexity.
 * ───────────────────────────────────────────────────────────────── */
export function cleanGPTZeroPass(text: string): string {
  // To increase burstiness, we forcefully merge or split sentences
  let sentences = splitSents(text);
  if (sentences.length < 3) return text;
  
  const b = getBurstiness(sentences);
  if (b < 1.0) { // low burstiness -> merge two sentences with "and"
    for (let i = 0; i < sentences.length - 1; i++) {
        if (sentences[i].length < 60 && sentences[i+1].length < 60) {
            const first = sentences[i].replace(/[.!?]$/, '');
            const second = sentences[i+1];
            const merged = first + ', and ' + second.charAt(0).toLowerCase() + second.slice(1);
            sentences.splice(i, 2, merged);
            break;
        }
    }
  }
  return sentences.join(' ');
}

/* ─────────────────────────────────────────────────────────────────
 * 5. Pangram
 * Focus: Deep structural markings, perfectly balanced punctuation.
 * ───────────────────────────────────────────────────────────────── */
export function cleanPangramPass(text: string): string {
  let sentences = splitSents(text);
  sentences = sentences.map(s => {
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount === 1) {
      // Remove comma if it follows a short introductory clause
      s = s.replace(/^([a-zA-Z\s]{4,15}),\s/g, '$1 ');
    } else if (commaCount === 2) {
      // Flatten mid-sentence clause
      s = s.replace(/,\s([^,]{5,20}),\s/g, ' ($1) ');
    }
    return s;
  });
  return sentences.join(' ');
}

/* ─────────────────────────────────────────────────────────────────
 * 6. Turnitin
 * Focus: Academic AI fluff, passive voice.
 * ───────────────────────────────────────────────────────────────── */
const TURNITIN_FLUFF = [
  { match: /\b(It is worth noting that|It is important to note that|It is essential to recognize that|It should be noted that|It is evident that)\s+/gi, rep: '' },
  { match: /\bIn conclusion,\s+/gi, rep: 'Ultimately, ' },
  { match: /\bTo summarize,\s+/gi, rep: 'Overall, ' },
  { match: /\bIn summary,\s+/gi, rep: 'Overall, ' },
];

export function cleanTurnitinPass(text: string): string {
  let cleaned = text;
  for (const rule of TURNITIN_FLUFF) {
    cleaned = cleaned.replace(rule.match, (match) => {
      // If we are replacing with empty, the next character should be capitalized manually
      // but only if it's the start of the sentence (which these usually are).
      return rule.rep;
    });
  }
  
  // Fix capitalization after empty replacement
  cleaned = cleaned.replace(/^([a-z])/gm, (c) => c.toUpperCase());
  cleaned = cleaned.replace(/\.\s+([a-z])/g, (c) => c.toUpperCase());
  
  return cleaned;
}

export function runFullDetectorForensicsCleanup(text: string): string {
  let cleaned = text;
  
  // Sequence of detector cleaning
  cleaned = cleanZeroGPTPass(cleaned);
  cleaned = cleanSurferSEOPass(cleaned);
  cleaned = cleanOriginalityAIPass(cleaned);
  cleaned = cleanGPTZeroPass(cleaned);
  cleaned = cleanPangramPass(cleaned);
  cleaned = cleanTurnitinPass(cleaned); // Must be last
  
  return cleaned;
}
