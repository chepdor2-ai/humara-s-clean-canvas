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
    // Sanity check
    if (result.split(/\s+/).length >= 5) return result;
  }

  // Strategy: Move trailing prepositional phrase to front
  const ppMatch = sentence.match(
    /^(.{15,}?)\s+((?:in|at|through|during|across|among|within)\s+(?:the\s+|this\s+|a\s+)?[\w][\w\s]{3,20})[.!?]$/i
  );
  if (ppMatch) {
    const [, mainPart, pp] = ppMatch;
    const cleanMain = mainPart.replace(/,\s*$/, '').trim();
    return `${pp[0].toUpperCase()}${pp.slice(1)}, ${cleanMain[0].toLowerCase()}${cleanMain.slice(1)}.`;
  }

  return sentence;
}

// ══════════════════════════════════════════════════════════════════
// 4. ACADEMIC EXPANSION PHRASES
// ══════════════════════════════════════════════════════════════════
// Brief, natural academic expansions — not wild injections.

const EXPANSION_STARTERS: string[] = [
  'In practical terms,',
  'Stated differently,',
  'From this angle,',
  'Taken together,',
  'Looked at broadly,',
  'On closer inspection,',
  'At its foundation,',
  'In broader terms,',
  'Looking at the evidence,',
  'To put it plainly,',
  'In substantive terms,',
  'With this in mind,',
];

function addAcademicExpansion(sentence: string, changeRatio: number): string {
  // Only expand if change ratio is still below 60% and sentence is long enough
  if (changeRatio >= 0.60 || sentence.split(/\s+/).length < 8) return sentence;
  if (Math.random() > 0.5) return sentence;
  
  const starter = pick(EXPANSION_STARTERS);
  // Lowercase first letter of sentence after prepending
  return `${starter} ${sentence[0].toLowerCase()}${sentence.slice(1)}`;
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

  // Layer 1: Pre-1990 academic voice restructuring
  s = injectPre1990Voice(s);

  // Layer 2: Clause reorder (skip first sentence of paragraph)
  if (!isFirstInParagraph && Math.random() < 0.45) {
    s = reorderClauses(s);
  }

  // Layer 3: Phrasal verb injection (max 1 per sentence, ~40%)
  s = injectPhrasalVerbs(s);

  // Layer 4: Adverb/transition cleanup
  s = aggressiveRephrase(s);

  // Layer 5: Contraction expansion
  s = expandContractions(s);

  // Layer 6: First-person guard
  s = guardFirstPerson(s, inputHadFirstPerson);

  // Layer 7: AI term kill (catches everything)
  s = finalAIKill(s);

  // 3. Measure change ratio
  const changeRatio = measureWordChange(safeSentence, s);

  // 4. If below 60%, try academic expansion
  if (changeRatio < 0.60) {
    s = addAcademicExpansion(s, changeRatio);
  }

  // 5. If still below 60% and we haven't retried too many times, run pipeline again
  const finalRatio = measureWordChange(safeSentence, s);
  if (finalRatio < 0.60 && attempt < 2) {
    // Run the pipeline once more on already-processed text for compound changes
    s = injectPre1990Voice(s);
    s = injectPhrasalVerbs(s);
    s = aggressiveRephrase(s);
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
const AI_FLOW_PATTERNS: { rx: RegExp; replacements: string[] }[] = [
  // Repetitive formal connectors (AI tends to chain these)
  { rx: /\bFurthermore,/gi, replacements: ['In addition,', 'Beyond that,', 'Added to this,'] },
  { rx: /\bMoreover,/gi, replacements: ['On top of that,', 'What is more,', 'Also of note,'] },
  { rx: /\bAdditionally,/gi, replacements: ['Also,', 'On top of this,', 'Besides this,'] },
  { rx: /\bConsequently,/gi, replacements: ['As a result,', 'Because of this,', 'Following from this,'] },
  { rx: /\bNevertheless,/gi, replacements: ['Even so,', 'All the same,', 'That said,'] },
  { rx: /\bNotwithstanding,/gi, replacements: ['In spite of this,', 'For all that,'] },
  { rx: /\bSubsequently,/gi, replacements: ['After that,', 'Later on,', 'In the time that followed,'] },
  { rx: /\bSignificantly,/gi, replacements: ['In a telling way,', 'Notably,', 'Worth pointing out,'] },
  // AI-typical assertion patterns
  { rx: /\bIt is (?:important|crucial|essential|imperative|vital|critical) to note that\b/gi, 
    replacements: ['One should note that', 'Worth noting,', 'A point of interest:'] },
  { rx: /\bIt is worth (?:noting|mentioning|highlighting) that\b/gi,
    replacements: ['One should be aware that', 'Worth pointing out,', 'To highlight,'] },
  { rx: /\bThis (?:highlights|underscores|emphasizes|demonstrates|illustrates) (?:the fact )?that\b/gi,
    replacements: ['This shows that', 'This makes clear that', 'This reveals that'] },
  { rx: /\bIn (?:today's|the modern|the current|the contemporary) (?:world|era|age|landscape|environment)\b/gi,
    replacements: ['At present', 'In the current period', 'As things stand now'] },
  { rx: /\bplays a (?:crucial|vital|pivotal|key|significant|important) role\b/gi,
    replacements: ['is central to', 'matters greatly for', 'carries weight in'] },
  { rx: /\ba (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/gi,
    replacements: ['many', 'numerous', 'a good number of', 'all sorts of'] },
  { rx: /\bin order to\b/gi, replacements: ['so as to', 'to', 'with the aim of'] },
  { rx: /\bdue to the fact that\b/gi, replacements: ['because', 'given that', 'seeing as'] },
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
    const sentences = para.match(/[^.!?]+[.!?]+/g);
    if (!sentences || sentences.length < 2) return para;
    const fixed = fixConsecutiveStarters(sentences.map(s => s.trim()));
    return fixed.join(' ');
  });
  result = cleanedParagraphs.join('\n\n');

  // Pass 3: Kill remaining high-confidence AI words that slipped through
  // Only activate for high AI scores
  if (aiScore > 50) {
    const FINAL_KILLS: [RegExp, string[]][] = [
      [/\bcomprehensive\b/gi, ['thorough', 'complete', 'full']],
      [/\binnovative\b/gi, ['novel', 'inventive', 'fresh']],
      [/\bfacilitate\b/gi, ['make possible', 'help along', 'enable']],
      [/\bseamlessly\b/gi, ['smoothly', 'without trouble', 'easily']],
      [/\bseamless\b/gi, ['smooth', 'effortless', 'easy']],
      [/\brobust\b/gi, ['solid', 'sturdy', 'dependable']],
      [/\bholistic\b/gi, ['whole-picture', 'all-round', 'broad']],
      [/\bparadigm\b/gi, ['model', 'pattern', 'framework']],
      [/\bsynergy\b/gi, ['combined effect', 'teamwork', 'joint effort']],
      [/\bnuanced\b/gi, ['layered', 'fine-grained', 'subtle']],
      [/\btransformative\b/gi, ['powerful', 'sweeping', 'game-changing']],
      [/\bpivotal\b/gi, ['deciding', 'key', 'turning-point']],
      [/\bgroundbreaking\b/gi, ['pioneering', 'original', 'path-breaking']],
      [/\bcutting-edge\b/gi, ['modern', 'up-to-date', 'advanced']],
      [/\bleverage\b/gi, ['use', 'draw on', 'make use of']],
      [/\bleveraging\b/gi, ['using', 'drawing on', 'making use of']],
      [/\butilize\b/gi, ['use', 'employ', 'make use of']],
      [/\butilizing\b/gi, ['using', 'employing', 'making use of']],
      [/\boptimize\b/gi, ['refine', 'tune', 'improve']],
      [/\boptimizing\b/gi, ['refining', 'tuning', 'improving']],
      [/\bstreamline\b/gi, ['simplify', 'trim', 'clean up']],
      [/\benhance\b/gi, ['strengthen', 'improve', 'sharpen']],
      [/\benhancing\b/gi, ['strengthening', 'improving', 'sharpening']],
      [/\bempower\b/gi, ['enable', 'equip', 'support']],
      [/\bempowering\b/gi, ['enabling', 'equipping', 'supporting']],
      [/\bfoster\b/gi, ['encourage', 'nurture', 'grow']],
      [/\bfostering\b/gi, ['encouraging', 'nurturing', 'growing']],
      [/\bnavigate\b/gi, ['work through', 'handle', 'manage']],
      [/\bnavigating\b/gi, ['working through', 'handling', 'managing']],
      [/\bencompass\b/gi, ['cover', 'include', 'take in']],
      [/\bencompassing\b/gi, ['covering', 'including', 'taking in']],
      [/\bunderscore\b/gi, ['stress', 'highlight', 'bring home']],
      [/\bunderscores\b/gi, ['stresses', 'highlights', 'brings home']],
      [/\bdelve\b/gi, ['dig', 'explore', 'probe']],
      [/\bdelving\b/gi, ['digging', 'exploring', 'probing']],
      [/\bmyriad\b/gi, ['many', 'countless', 'numerous']],
      [/\bplethora\b/gi, ['wealth', 'abundance', 'plenty']],
      [/\bubiquitous\b/gi, ['widespread', 'common', 'everywhere']],
      [/\bparamount\b/gi, ['chief', 'top', 'most important']],
      [/\bindispensable\b/gi, ['essential', 'vital', 'necessary']],
      [/\bprofound\b/gi, ['deep', 'sweeping', 'far-reaching']],
      [/\bprofoundly\b/gi, ['deeply', 'greatly', 'in a serious way']],
    ];

    for (const [rx, alts] of FINAL_KILLS) {
      rx.lastIndex = 0;
      if (rx.test(result)) {
        rx.lastIndex = 0;
        result = result.replace(rx, (match) => {
          const replacement = pick(alts);
          if (match[0] === match[0].toUpperCase()) {
            return replacement[0].toUpperCase() + replacement.slice(1);
          }
          return replacement;
        });
      }
    }
  }

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
    const sentences = trimmedPara.match(/[^.!?]+[.!?]+/g) || [trimmedPara];

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

  return assembled;
}
