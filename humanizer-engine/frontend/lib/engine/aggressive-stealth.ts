/**
 * Aggressive Stealth Post-Processor for TypeScript Engines
 * Targets: 0% AI Score on GPTZero, Originality, Copyleaks, Turnitin, Pangram, Sifer SEO.
 * Rules: Sentence merging ALLOWED. Sentence splitting FORBIDDEN. Retain semantic meaning.
 * Pattern: Pre-2000s Academic & Early Blog tone.
 * Target Change Rate: 40-55%
 */

export const PRE_2000_PATTERNS: Record<string, string> = {
  "\\bin today's rapidly evolving\\b": "in the current climate",
  "\\bleveraging\\b": "making use of",
  "\\bdelving into\\b": "examining",
  "\\bgame-changing\\b": "notable",
  "\\bparadigm shift\\b": "fundamental change",
  "\\bcrucial\\b": "necessary",
  "\\bin conclusion\\b": "to summarize",
  "\\btapestry of\\b": "array of",
  "\\btestament to\\b": "evidence of",
  "\\bunderscores\\b": "highlights",
  "\\bnavigating the complexities\\b": "handling the difficulties",
  "\\bseamlessly\\b": "smoothly",
  "\\brobust\\b": "stable",
  "\\bfostering\\b": "developing",
  "\\bmeticulous\\b": "careful",
  "\\bsynergy\\b": "cooperation",
  "\\bpivotal\\b": "central",
};

export const AI_TELLS = [
  "It is important to note", "Moreover,", "Furthermore,",
  "Additionally,", "In summary", "Ultimately,", "Consequently,"
];

function applyPre2000Tone(text: string): string {
  let result = text;
  Object.keys(PRE_2000_PATTERNS).forEach((pattern) => {
    const regex = new RegExp(pattern, "gi");
    result = result.replace(regex, PRE_2000_PATTERNS[pattern]);
  });

  AI_TELLS.forEach((tell) => {
    if (Math.random() > 0.3) {
      result = result.replace(new RegExp(`${tell}\\s+`, "g"), "");
      result = result.replace(new RegExp(`${tell.toLowerCase()}\\s+`, "g"), "");
    }
  });

  return result;
}

function mergeSentences(text: string): string {
  const paragraphs = text.split("\\n");
  const mergedParagraphs: string[] = [];
  const conjunctions = ["; moreover, ", "; furthermore, ", ", and ", ", while ", "; thus, ", ", yet "];

  for (const p of paragraphs) {
    if (!p.trim()) {
      mergedParagraphs.push(p);
      continue;
    }

    const sentences = p.trim().split(/(?<=[.!?])\\s+/);
    const merged: string[] = [];
    let skipNext = false;

    for (let i = 0; i < sentences.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      const s1 = sentences[i];
      if (i < sentences.length - 1 && Math.random() < 0.4) {
        const s2 = sentences[i + 1];
        if (s1.endsWith(".") && /^[A-Z]/.test(s2)) {
          const s1Clean = s1.slice(0, -1);
          const conj = conjunctions[Math.floor(Math.random() * conjunctions.length)];
          const s2Clean = s2.charAt(0).toLowerCase() + s2.slice(1);
          merged.push(`${s1Clean}${conj}${s2Clean}`);
          skipNext = true;
          continue;
        }
      }
      merged.push(s1);
    }
    mergedParagraphs.push(merged.join(" "));
  }
  return mergedParagraphs.join("\\n");
}

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/\\b[a-z]{5,}\\b/g) || [];
  return new Set(words);
}

function validateMeaningRetention(original: string, processed: string): boolean {
  const origWords = extractKeywords(original);
  const procWords = extractKeywords(processed);

  if (origWords.size === 0) return true;

  let intersectionCount = 0;
  for (const word of origWords) {
    if (procWords.has(word)) intersectionCount++;
  }

  const overlap = intersectionCount / origWords.size;
  return overlap > 0.65;
}

export function executeAggressiveStealthPostProcessing(text: string): string {
  const originalText = text;
  
  let processed = text.replace(/\\s+/g, " ");
  processed = applyPre2000Tone(processed);
  processed = mergeSentences(processed);
  processed = processed.replace(/ ,/g, ",").replace(/ \\./g, ".").replace(/ ;/g, ";");
  processed = processed.replace(/\\s+/g, " ").trim();

  if (!validateMeaningRetention(originalText, processed)) {
    return originalText;
  }

  return processed;
}
