import { getBestReplacement } from './dictionary-service';

// splitSents removed because it destructively flattened paragraph formatting

/* ─────────────────────────────────────────────────────────────────
 * 1. ZeroGPT
 * Focus: Uniform sentence structure, transition over-indexing.
 * ───────────────────────────────────────────────────────────────── */
const ZEROGPT_TRANSITIONS = new Set(['furthermore', 'moreover', 'additionally', 'consequently', 'therefore', 'thus', 'hence', 'subsequently', 'in addition', 'as a result']);

export function cleanZeroGPTPass(text: string): string {
  let cleaned = text;
  for (const trans of ZEROGPT_TRANSITIONS) {
    // Top of line or paragraph boundary
    let regex = new RegExp(`(^|\\n\\s*\\n)\\s*${trans}[,]?\\s+([a-z])`, 'gi');
    cleaned = cleaned.replace(regex, (match, p1, p2) => p1 + p2.toUpperCase());
    
    // Mid-text sentence boundary
    regex = new RegExp(`([.!?]\\s+)${trans}[,]?\\s+([a-z])`, 'gi');
    cleaned = cleaned.replace(regex, (match, p1, p2) => p1 + p2.toUpperCase());
  }
  return cleaned;
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
  // To increase burstiness, forcefully merge two short sentences.
  // Avoids destructive array/join mapping.
  let mergedOnce = false;
  const cleaned = text.replace(/([a-z]{3,50})\.\s+([A-Z][a-z]{2,50}\s)/g, (match, p1, p2) => {
    if (mergedOnce) return match;
    mergedOnce = true;
    return p1 + ', and ' + p2.charAt(0).toLowerCase() + p2.slice(1);
  });
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────
 * 5. Pangram
 * Focus: Deep structural markings, perfectly balanced punctuation.
 * ───────────────────────────────────────────────────────────────── */
export function cleanPangramPass(text: string): string {
  let cleaned = text;
  // Remove comma if it follows a short introductory clause safely
  cleaned = cleaned.replace(/(^|[.!?]\s+)([A-Z][a-zA-Z\s]{4,15}),\s/g, '$1$2 ');
  
  // Flatten mid-sentence clause safely
  cleaned = cleaned.replace(/,\s([^,]{5,20}),\s/g, ' ($1) ');
  
  return cleaned;
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
