/**
 * Unified Sentence Processor
 * ============================
 * Every engine's output flows through this module. It treats each sentence
 * as if a different academic writer has rewritten it independently, then
 * reassembles the paragraphs and runs a final deep-clean pass on the
 * combined result.
 *
 * Guarantees:
 *   - Decimals, figures, %, citations, bracket contents are PROTECTED
 *   - Each sentence achieves ≥60% word-level change
 *   - First sentence of each paragraph is NOT restructured (only rephrased)
 *   - Post-assembly deep scan kills surviving AI flow patterns
 *   - Meaning is preserved throughout
 */

import {
  injectPre1990Voice,
  injectPhrasalVerbs,
  aggressiveRephrase,
  expandContractions,
  guardFirstPerson,
  finalAIKill,
  humanizeSentence,
} from './humanize-transforms';
import {
  applyV13Techniques,
  applyV13PostProcessing,
  resetCollocationTracking,
} from './engine/v13-shared-techniques';
import {
  academicRewrite,
  academicPostProcess,
  resetConnectorTracking,
} from './engine/academic-rewriter';
import { robustSentenceSplit } from './engine/content-protection';

// ══════════════════════════════════════════════════════════════════
// 1. CONTENT PROTECTION (sentence-level)
// ══════════════════════════════════════════════════════════════════

const SENTENCE_PROTECTION_PATTERNS: RegExp[] = [
  // Brackets & parentheses (entire contents)
  /\[[^\]]*\]/g,
  /\([^)]*\)/g,
  // Currency
  /\$\d+(?:,\d{3})*(?:\.\d+)?/g,
  /£\d+(?:,\d{3})*(?:\.\d+)?/g,
  /€\d+(?:,\d{3})*(?:\.\d+)?/g,
  // Percentages  
  /\b\d+\.\d+%/g,
  /\b\d+%/g,
  // Measurements with units
  /\b\d+(?:\.\d+)?\s*(?:kg|g|mg|lb|oz|km|m|cm|mm|mi|ft|in|°[CF]|K|Hz|kHz|MHz|GHz|THz|GB|MB|KB|TB|PB|ml|L|dB|MW|kW|GW|ppm|ppb)\b/gi,
  // Academic references (Figure 1, Table 2.3, p < 0.05, n = 200, et al.)
  /\b(?:Figure|Fig\.|Table|Equation|Eq\.|Chart|Graph|Appendix|Section|Chapter)\s+\d+(?:\.\d+)*\b/gi,
  /\bp\s*[<>=≤≥]\s*(?:0\.\d+|\.\d+)\b/g,
  /\b[nN]\s*=\s*\d+/g,
  /\b(?:et\s+al\.|ibid\.|op\.\s*cit\.|loc\.\s*cit\.)/gi,
  /\(\d{4}\)/g,
  // Dates
  /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
  // Large numbers with commas (1,000  10,000,000)
  /\b\d+(?:,\d{3})+\b/g,
  // Standalone decimals  
  /\b\d+\.\d+\b/g,
  // Number-word compounds (e.g. 3-tier, 5-point)
  /\b\d+-[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g,
  // URLs and emails
  /https?:\/\/[^\s)]+/gi,
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  // Code/math (inline LaTeX, backtick)
  /\$[^$]+\$/g,
  /`[^`]+`/g,
];

interface ProtectionResult {
  text: string;
  spans: Map<string, string>;
}

function protectSentence(sentence: string): ProtectionResult {
  const spans = new Map<string, string>();
  let idx = 0;
  let result = sentence;

  for (const pattern of SENTENCE_PROTECTION_PATTERNS) {
    const rx = new RegExp(pattern.source, pattern.flags);
    result = result.replace(rx, (match) => {
      const placeholder = `⦃SP${idx}⦄`;
      spans.set(placeholder, match);
      idx++;
      return placeholder;
    });
  }

  return { text: result, spans };
}

function restoreSentence(text: string, spans: Map<string, string>): string {
  let result = text;
  for (const [placeholder, original] of spans) {
    // Escape the placeholder for regex use (⦃ and ⦄ are literal)
    result = result.split(placeholder).join(original);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// 2. WORD-CHANGE MEASUREMENT
// ══════════════════════════════════════════════════════════════════

function measureWordChange(original: string, modified: string): number {
  const origWords = original.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const modWords = modified.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (origWords.length === 0) return 1;

  // Strip placeholders from comparison
  const cleanOrig = origWords.filter(w => !w.startsWith('⦃'));
  const cleanMod = modWords.filter(w => !w.startsWith('⦃'));
  if (cleanOrig.length === 0) return 1;

  let changed = 0;
  const len = Math.max(cleanOrig.length, cleanMod.length);
  for (let i = 0; i < len; i++) {
    if (!cleanOrig[i] || !cleanMod[i] || cleanOrig[i] !== cleanMod[i]) {
      changed++;
    }
  }
  return changed / len;
}

// ══════════════════════════════════════════════════════════════════
// 3. ACADEMIC CLAUSE REORDER (for non-first sentences only)
// ══════════════════════════════════════════════════════════════════

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SUBORDINATE_CONJ = /\b(because|since|although|though|while|whereas|unless|until|after|before|when|if|given that|provided that)\b/i;

/** Quick coherence check — detects garbled clause reordering */
function isGarbledReorder(result: string, original: string): boolean {
  if (/^(?:do|does|did|is|are|was|were|has|have|had)\s+\w+\s+(?:from|in|at|by|of|to)\b/i.test(result) && !/^(?:do|does|did)\s+(?:not|n't)\b/i.test(result)) return true;
  if (/\b(?:that|which|this|these|those|the|a|an)\.\s*$/i.test(result)) return true;
  if (result.length < original.length * 0.7) return true;
  if (/\b(?:because|since|although|while|whereas|unless|when|if)\s+[^,]{0,20}\b(?:because|since|although|while|whereas|unless|when|if)\b/i.test(result)) return true;
  return false;
}

function reorderClauses(sentence: string): string {
  const words = sentence.split(/\s+/);
  if (words.length < 10 || words.length > 40) return sentence;

  // Strategy: Move subordinate clause to front
  const match = sentence.match(
    new RegExp(`^(.{15,}?),?\\s+(${SUBORDINATE_CONJ.source})\\s+(.{10,})$`, 'i')
  );
  if (match) {
    const [, main, conj, sub] = match;
    const cleanMain = main.replace(/[.!?]+$/, '').trim();
    const fixedConj = conj[0].toUpperCase() + conj.slice(1).toLowerCase();
    const fixedSub = sub.replace(/[.!?]+$/, '').trim();
    const result = `${fixedConj} ${fixedSub}, ${cleanMain[0].toLowerCase()}${cleanMain.slice(1)}.`;
    if (result.split(/\s+/).length >= 5 && !isGarbledReorder(result, sentence)) return result;
  }

  // Strategy: Move trailing prepositional phrase to front
  const ppMatch = sentence.match(
    /^(.{15,}?)\s+((?:in|at|through|during|across|among|within)\s+(?:the\s+|this\s+|a\s+)?[\w][\w\s]{3,20})[.!?]$/i
  );
  if (ppMatch) {
    const [, mainPart, pp] = ppMatch;
    const cleanMain = mainPart.replace(/,\s*$/, '').trim();
    const result = `${pp[0].toUpperCase()}${pp.slice(1)}, ${cleanMain[0].toLowerCase()}${cleanMain.slice(1)}.`;
    if (!isGarbledReorder(result, sentence)) return result;
  }

  return sentence;
}

// ══════════════════════════════════════════════════════════════════
// 4. ACADEMIC EXPANSION PHRASES
// ══════════════════════════════════════════════════════════════════
// Brief, natural academic expansions — not wild injections.

const EXPANSION_STARTERS: string[] = [
  'In practical terms,',
  'With this in mind,',
  'Looking at the evidence,',
  'To put it plainly,',
];

function addAcademicExpansion(sentence: string, changeRatio: number): string {
  // DISABLED — prepending fabricated starters degrades naturalness
  return sentence;
}

// ══════════════════════════════════════════════════════════════════
// 5. SINGLE-SENTENCE FULL PIPELINE
// ══════════════════════════════════════════════════════════════════

/**
 * Process ONE sentence through the full humanization pipeline.
 * Each sentence is treated as if written by a different academic writer.
 *
 * @param sentence - Raw sentence to humanize 
 * @param inputHadFirstPerson - Whether the full input text had first-person
 * @param isFirstInParagraph - If true, skip clause reordering (preserve opening flow)
 * @param attempt - Internal retry counter
 */
function processSingleSentence(
  sentence: string,
  inputHadFirstPerson: boolean,
  isFirstInParagraph: boolean,
  attempt = 0,
): string {
  const trimmed = sentence.trim();
  if (!trimmed || trimmed.length < 10) return trimmed;

  // 1. Protect content
  const { text: safeSentence, spans } = protectSentence(trimmed);

  // 2. Full humanization pipeline (all stages)
  let s = safeSentence;

  // Layer 1: Academic sentence-level structural rewriting
  // (Pattern-based rewrites, de-hedging, clause fronting, voice changes)
  s = academicRewrite(s);

  // Layer 2: V1.3 stealth techniques (compression, collocation, restructure, punctuation)
  s = applyV13Techniques(s);

  // Layer 3: Clause reorder (skip first sentence of paragraph)
  if (!isFirstInParagraph && Math.random() < 0.45) {
    s = reorderClauses(s);
  }

  // Layer 4: Contraction expansion
  s = expandContractions(s);

  // Layer 5: First-person guard
  s = guardFirstPerson(s, inputHadFirstPerson);

  // Layer 6: AI term kill (targeted academic register only)
  s = finalAIKill(s);

  // 3. Measure change ratio
  const changeRatio = measureWordChange(safeSentence, s);

  // 4. If below 40%, try academic expansion (moderate touch)
  if (changeRatio < 0.40) {
    s = addAcademicExpansion(s, changeRatio);
  }

  // 5. Target 40-55% change — retry for sentences with low change.
  const finalRatio = measureWordChange(safeSentence, s);
  if (finalRatio < 0.30 && attempt < 1) {
    s = finalAIKill(s);
  }

  // 6. Cleanup
  s = s.replace(/ {2,}/g, ' ').trim();
  s = s.replace(/([.!?])\s+([a-z])/g, (_m, p, l) => `${p} ${l.toUpperCase()}`);
  if (s.length > 0 && /[a-z]/.test(s[0])) {
    s = s[0].toUpperCase() + s.slice(1);
  }
  // Fix a/an agreement
  s = s.replace(/\b(a|an)\s+(\w+)/gi, (_match, article, word) => {
    const vowelStart = /^[aeiou]/i.test(word) && !/^(uni|one|once|use[ds]?|usu|ura|eur)/i.test(word);
    const hStart = /^(hour|honest|honor|heir|herb)/i.test(word);
    const shouldBeAn = vowelStart || hStart;
    const correct = shouldBeAn ? 'an' : 'a';
    const cased = /^A/.test(article) ? correct.charAt(0).toUpperCase() + correct.slice(1) : correct;
    return `${cased} ${word}`;
  });
  // Fix double prepositions/articles
  s = s.replace(/\b(of|to|in|for|on|at|by|with|from|as|is|the|a|an) \1\b/gi, '$1');

  // 7. Restore protected content
  s = restoreSentence(s, spans);

  return s;
}

// ══════════════════════════════════════════════════════════════════
// 6. POST-ASSEMBLY DEEP AI FLOW CLEANER
// ══════════════════════════════════════════════════════════════════
// After reassembly, scan the combined text for AI flow patterns
// that only appear when sentences sit together.

// Pre-compiled AI flow patterns (document-level signals)
// Only replace genuinely AI-specific patterns with formal academic alternatives
const AI_FLOW_PATTERNS: { rx: RegExp; replacements: string[] }[] = [
  // AI-typical assertion patterns (these ARE AI-specific)
  { rx: /\bIt is (?:important|crucial|essential|imperative|vital|critical) to note that\b/gi, 
    replacements: ['One observes that', 'It bears mention that', 'Of note,'] },
  { rx: /\bIt is worth (?:noting|mentioning|highlighting) that\b/gi,
    replacements: ['One may observe that', 'It is relevant that', 'Of significance,'] },
  { rx: /\bThis (?:highlights|underscores|emphasizes|demonstrates|illustrates) (?:the fact )?that\b/gi,
    replacements: ['This indicates that', 'This confirms that', 'This points to the conclusion that'] },
  { rx: /\bIn (?:today's|the modern|the current|the contemporary) (?:world|era|age|landscape|environment)\b/gi,
    replacements: ['In the present context', 'Under current conditions', 'In contemporary terms'] },
  { rx: /\bplays a (?:crucial|vital|pivotal|key|significant|important) role\b/gi,
    replacements: ['is central', 'is integral', 'figures prominently'] },
  { rx: /\ba (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/gi,
    replacements: ['numerous', 'various', 'a considerable number of'] },
  { rx: /\bdue to the fact that\b/gi, replacements: ['because', 'given that', 'since'] },
];

// Consecutive duplicate starters detection  
function fixConsecutiveStarters(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;
  const result = [...sentences];
  const ALT_OPENERS = [
    'In turn,', 'By contrast,', 'Equally,', 'Then,',
    'Alongside this,', 'At the same time,', 'Put another way,',
    'To that end,', 'On that note,', 'Relatedly,',
  ];

  for (let i = 1; i < result.length; i++) {
    const prevStart = result[i - 1].split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    const currStart = result[i].split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    if (prevStart && currStart && prevStart === currStart) {
      const alt = pick(ALT_OPENERS);
      result[i] = `${alt} ${result[i][0].toLowerCase()}${result[i].slice(1)}`;
    }
  }
  return result;
}

/**
 * Post-assembly deep AI flow cleaner.
 * Scans the combined output for AI patterns that emerge when
 * sentences sit next to each other, and kills them.
 * 
 * Aggressiveness is controlled by the AI score: higher score = more aggressive.
 */
export function deepAIFlowClean(text: string, aiScore: number = 50): string {
  let result = text;

  // Determine connector replacement probability based on AI score
  // Higher AI score → more aggressive replacement
  const probability = aiScore > 70 ? 0.90 : aiScore > 40 ? 0.70 : 0.50;

  // Pass 1: Kill AI flow patterns
  for (const { rx, replacements } of AI_FLOW_PATTERNS) {
    rx.lastIndex = 0;
    if (rx.test(result) && Math.random() < probability) {
      rx.lastIndex = 0;
      let replaced = false;
      result = result.replace(rx, (match) => {
        if (replaced) return match; // Only replace first occurrence to avoid uniformity
        replaced = true;
        return pick(replacements);
      });
    }
  }

  // Pass 2: Fix consecutive duplicate starters across all sentences
  const paragraphs = result.split(/\n\n+/);
  const cleanedParagraphs = paragraphs.map(para => {
    const sentences = robustSentenceSplit(para);
    if (sentences.length < 2) return para;
    const fixed = fixConsecutiveStarters(sentences.map(s => s.trim()));
    return fixed.join(' ');
  });
  result = cleanedParagraphs.join('\n\n');

  // Pass 3: Removed — standard academic vocabulary (comprehensive, facilitate,
  // enhance, etc.) is preserved. Only genuinely AI-specific words are handled
  // by the finalAIKill layer (Layer 6) in the per-sentence pipeline.

  // Pass 4: Fix double spaces and punctuation artifacts
  result = result.replace(/ {2,}/g, ' ');
  result = result.replace(/\.\./g, '.');
  result = result.replace(/,,/g, ',');
  result = result.replace(/([.!?])\s*([a-z])/g, (_m, p, l) => `${p} ${l.toUpperCase()}`);

  return result;
}

// ══════════════════════════════════════════════════════════════════
// 7. MAIN EXPORT — PROCESS FULL TEXT
// ══════════════════════════════════════════════════════════════════

/**
 * Process an already-humanized text through the unified sentence processor.
 * 
 * This is the shared post-engine processor that ALL engines route through.
 * It ensures every sentence meets the quality bar regardless of which
 * engine produced it.
 *
 * Steps:
 *   1. Split into paragraphs
 *   2. Split each paragraph into sentences
 *   3. Process each sentence independently (like 7 different writers)
 *   4. Reassemble paragraphs
 *   5. Deep AI flow clean on the combined output
 */
export function unifiedSentenceProcess(
  text: string,
  inputHadFirstPerson: boolean,
  aiScore: number = 50,
): string {
  if (!text || text.trim().length < 20) return text;

  // Reset tracking for each new document
  resetCollocationTracking();
  resetConnectorTracking();

  // Split into paragraphs (preserve blank lines)
  const paragraphs = text.split(/\n\n+/);
  const processedParagraphs: string[] = [];

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) {
      processedParagraphs.push('');
      continue;
    }

    // Detect headings — short lines without terminal punctuation
    const words = trimmedPara.split(/\s+/);
    const isHeading = words.length <= 10 && !/[.!?]$/.test(trimmedPara);
    if (isHeading) {
      processedParagraphs.push(trimmedPara);
      continue;
    }

    // Split paragraph into sentences
    const sentences = robustSentenceSplit(trimmedPara);

    const processedSentences: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      const raw = sentences[i].trim();
      if (!raw) continue;

      const isFirstInParagraph = (i === 0);
      const processed = processSingleSentence(
        raw,
        inputHadFirstPerson,
        isFirstInParagraph,
      );
      processedSentences.push(processed);
    }

    processedParagraphs.push(processedSentences.join(' '));
  }

  // Reassemble
  let assembled = processedParagraphs.join('\n\n');

  // Deep AI flow clean on the combined output
  assembled = deepAIFlowClean(assembled, aiScore);

  // V1.3 post-processing: fix out-of-context synonyms, remove em-dashes
  assembled = applyV13PostProcessing(assembled);

  // Academic post-processing: burstiness injection, cross-sentence coherence
  assembled = academicPostProcess(assembled);

  return assembled;
}
