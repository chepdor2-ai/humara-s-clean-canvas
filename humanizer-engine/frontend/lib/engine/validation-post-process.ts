/**
 * Post-Processing Validation Module
 * ==================================
 * Ensures sentence integrity, prevents truncation, and validates content preservation
 * after humanization. Used across all humanizer engines.
 */

interface ValidationResult {
  isValid: boolean;
  issues: string[];
  stats: {
    originalSentences: number;
    humanizedSentences: number;
    originalWords: number;
    humanizedWords: number;
    truncatedSentences: number;
    missingSentences: number;
    wordPreservationRatio: number;
  };
}

interface SentenceValidation {
  index: number;
  original: string;
  humanized: string;
  isTruncated: boolean;
  isMissing: boolean;
  wordChangeRatio: number;
}

/**
 * Split text into sentences with robust handling.
 */
function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  
  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();
  
  // Split on sentence boundaries
  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z])/g)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // If no sentences found, return the whole text as one sentence
  return sentences.length > 0 ? sentences : [normalized];
}

/**
 * Count words in text (excluding punctuation).
 */
function countWords(text: string): number {
  return text
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

/**
 * Check if a sentence appears truncated (ends abruptly without proper punctuation).
 */
function isSentenceTruncated(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) return false;
  
  // Check if ends with sentence-ending punctuation
  if (/[.!?]$/.test(trimmed)) return false;
  
  // Check if it's a title/heading (acceptable to have no punctuation)
  const words = trimmed.split(/\s+/);
  if (words.length <= 12) {
    const capitalWords = words.filter(w => w.length > 0 && /^[A-Z]/.test(w)).length;
    const titleRatio = capitalWords / Math.max(words.length, 1);
    if (titleRatio >= 0.6) return false; // It's a title, not truncated
  }
  
  // Check if ends mid-word (letter followed by nothing)
  if (/[a-z]$/.test(trimmed) && words.length > 3) {
    const lastWord = words[words.length - 1];
    // If last word is very short and no punctuation, likely truncated
    if (lastWord.length <= 3 && countWords(trimmed) >= 5) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate that a humanized sentence corresponds to its original.
 */
function validateSentencePair(
  original: string, 
  humanized: string, 
  index: number
): SentenceValidation {
  const origWords = countWords(original);
  const humWords = countWords(humanized);
  
  const wordChangeRatio = origWords > 0 
    ? Math.abs(origWords - humWords) / origWords 
    : 0;
  
  return {
    index,
    original,
    humanized,
    isTruncated: isSentenceTruncated(humanized),
    isMissing: !humanized || humanized.trim().length === 0,
    wordChangeRatio,
  };
}

/**
 * Main validation function - validates entire humanized output.
 */
export function validateHumanizedOutput(
  originalText: string,
  humanizedText: string,
  options: {
    allowWordChangeBound?: number; // Max word change ratio per sentence (default: 0.5 = 50%)
    minSentenceWords?: number; // Min words to not be considered truncated (default: 3)
    strictMode?: boolean; // Fail on any issue (default: false)
  } = {}
): ValidationResult {
  const {
    allowWordChangeBound = 0.7,
    minSentenceWords = 3,
    strictMode = false,
  } = options;
  
  const issues: string[] = [];
  
  // Split into sentences
  const originalSentences = splitIntoSentences(originalText);
  const humanizedSentences = splitIntoSentences(humanizedText);
  
  // Count words
  const originalWords = countWords(originalText);
  const humanizedWords = countWords(humanizedText);
  
  // Validate sentence count
  const sentenceCountDiff = Math.abs(originalSentences.length - humanizedSentences.length);
  if (sentenceCountDiff > Math.ceil(originalSentences.length * 0.2)) {
    issues.push(
      `Sentence count mismatch: original has ${originalSentences.length}, ` +
      `humanized has ${humanizedSentences.length} (diff: ${sentenceCountDiff})`
    );
  }
  
  // Validate word preservation
  const wordPreservationRatio = originalWords > 0 
    ? humanizedWords / originalWords 
    : 1;
  
  if (wordPreservationRatio < 0.5 || wordPreservationRatio > 1.8) {
    issues.push(
      `Word count out of bounds: original has ${originalWords}, ` +
      `humanized has ${humanizedWords} (ratio: ${wordPreservationRatio.toFixed(2)})`
    );
  }
  
  // Validate each sentence
  let truncatedCount = 0;
  let missingCount = 0;
  
  const sentenceValidations: SentenceValidation[] = [];
  const maxIndex = Math.max(originalSentences.length, humanizedSentences.length);
  
  for (let i = 0; i < maxIndex; i++) {
    const orig = originalSentences[i] || '';
    const hum = humanizedSentences[i] || '';
    
    const validation = validateSentencePair(orig, hum, i);
    sentenceValidations.push(validation);
    
    if (validation.isTruncated) {
      truncatedCount++;
      issues.push(
        `Sentence ${i + 1} appears truncated: "${validation.humanized.substring(0, 80)}..."`
      );
    }
    
    if (validation.isMissing && orig.trim().length > 0) {
      missingCount++;
      issues.push(
        `Sentence ${i + 1} is missing in humanized output: "${orig.substring(0, 80)}..."`
      );
    }
    
    // Check for excessive word count change in individual sentences
    if (orig && hum && validation.wordChangeRatio > allowWordChangeBound) {
      issues.push(
        `Sentence ${i + 1} has excessive word change (${(validation.wordChangeRatio * 100).toFixed(0)}%): ` +
        `"${orig.substring(0, 60)}..." vs "${hum.substring(0, 60)}..."`
      );
    }
    
    // Check for very short humanized sentences (possible truncation)
    if (hum && !validation.isMissing) {
      const humWordCount = countWords(hum);
      const origWordCount = countWords(orig);
      if (humWordCount < minSentenceWords && origWordCount >= minSentenceWords) {
        issues.push(
          `Sentence ${i + 1} too short (${humWordCount} words): possibly truncated`
        );
      }
    }
  }
  
  const isValid = strictMode ? issues.length === 0 : truncatedCount === 0 && missingCount === 0;
  
  return {
    isValid,
    issues,
    stats: {
      originalSentences: originalSentences.length,
      humanizedSentences: humanizedSentences.length,
      originalWords,
      humanizedWords,
      truncatedSentences: truncatedCount,
      missingSentences: missingCount,
      wordPreservationRatio,
    },
  };
}

/**
 * Attempt to repair common issues in humanized output.
 */
export function repairHumanizedOutput(
  originalText: string,
  humanizedText: string
): { repaired: string; repairs: string[] } {
  const repairs: string[] = [];
  let repaired = humanizedText;
  
  const originalSentences = splitIntoSentences(originalText);
  const humanizedSentences = splitIntoSentences(repaired);
  
  // If humanized has fewer sentences, append missing originals
  if (humanizedSentences.length < originalSentences.length) {
    const missing = originalSentences.slice(humanizedSentences.length);
    if (missing.length > 0) {
      repaired = repaired.trim() + ' ' + missing.join(' ');
      repairs.push(`Appended ${missing.length} missing sentences from original`);
    }
  }
  
  // Fix truncated last sentence
  const lastHumanized = humanizedSentences[humanizedSentences.length - 1] || '';
  if (isSentenceTruncated(lastHumanized) && originalSentences.length > 0) {
    const lastOriginal = originalSentences[originalSentences.length - 1];
    // Replace truncated ending with original ending
    const repairedSentences = [...humanizedSentences];
    repairedSentences[repairedSentences.length - 1] = lastOriginal;
    repaired = repairedSentences.join(' ');
    repairs.push('Repaired truncated last sentence');
  }
  
  // Fix missing ending punctuation
  if (repaired && !/[.!?]$/.test(repaired.trim())) {
    const lastChar = originalText.trim().slice(-1);
    if (/[.!?]/.test(lastChar)) {
      repaired = repaired.trim() + lastChar;
      repairs.push('Added missing ending punctuation');
    } else {
      repaired = repaired.trim() + '.';
      repairs.push('Added default ending period');
    }
  }
  
  return { repaired, repairs };
}

/**
 * Validate and repair humanized output in one step.
 */
export function validateAndRepairOutput(
  originalText: string,
  humanizedText: string,
  options: {
    allowWordChangeBound?: number;
    minSentenceWords?: number;
    autoRepair?: boolean; // Auto-repair if validation fails (default: true)
  } = {}
): {
  text: string;
  validation: ValidationResult;
  wasRepaired: boolean;
  repairs: string[];
} {
  const { autoRepair = true, ...validationOptions } = options;
  
  let finalText = humanizedText;
  let wasRepaired = false;
  let repairs: string[] = [];
  
  // First validation
  let validation = validateHumanizedOutput(originalText, finalText, validationOptions);
  
  // If invalid and auto-repair enabled, attempt repair
  if (!validation.isValid && autoRepair) {
    const repairResult = repairHumanizedOutput(originalText, finalText);
    finalText = repairResult.repaired;
    repairs = repairResult.repairs;
    wasRepaired = repairs.length > 0;
    
    // Re-validate after repair
    validation = validateHumanizedOutput(originalText, finalText, validationOptions);
  }
  
  return {
    text: finalText,
    validation,
    wasRepaired,
    repairs,
  };
}
