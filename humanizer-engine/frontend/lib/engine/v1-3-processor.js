/**
 * Humara V1.3 Pre/Post Processor
 * 
 * PRE-PROCESSING:
 *   - Protect topic keywords, numbers, decimals, citations, abbreviations
 * 
 * POST-PROCESSING (7 Deep Phases — sentence-by-sentence):
 *   Phase 1: Structural decomposition — parse paragraphs, titles, sentences
 *   Phase 2: Deep synonym cleaning — remove unusual/robotic synonyms
 *   Phase 3: AI vocabulary purge — eliminate AI-flagged words & phrases
 *   Phase 4: Repetition elimination — cross-sentence dedup of words/starters
 *   Phase 5: Starter injection — add context-appropriate openers
 *   Phase 6: Explanatory flow — add bridging phrases, improve readability
 *   Phase 7: Final polish — grammar, capitalization, rhythm cleanup
 *   
 *   Then reassemble preserving original structure.
 */

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const PROT_PREFIX = '\u27E8v';   // ⟨v0⟩ — different from Humara's ⟦p0⟧
const PROT_SUFFIX = '\u27E9';

function makePlaceholder(idx) {
  return `${PROT_PREFIX}${idx}${PROT_SUFFIX}`;
}

// Topic keywords that must never be altered
const TOPIC_KEYWORDS = [
  'climate change', 'global warming', 'greenhouse gas', 'carbon dioxide',
  'artificial intelligence', 'machine learning', 'deep learning', 'natural language processing',
  'neural network', 'neural networks', 'reinforcement learning', 'computer vision',
  'public health', 'mental health', 'health care', 'healthcare',
  'social media', 'digital literacy', 'cyber security', 'cybersecurity',
  'sustainable development', 'renewable energy', 'fossil fuel', 'fossil fuels',
  'human rights', 'civil rights', 'gender equality', 'racial equality',
  'economic growth', 'gross domestic product', 'supply chain', 'supply chains',
  'data privacy', 'data analysis', 'big data', 'internet of things',
  'gene editing', 'stem cell', 'stem cells', 'clinical trial', 'clinical trials',
  'quantum computing', 'blockchain', 'cryptocurrency',
  'united nations', 'world health organization', 'european union',
  'critical thinking', 'higher education', 'primary education',
  'systematic review', 'meta-analysis', 'case study', 'case studies',
  'standard deviation', 'statistical significance', 'confidence interval',
  'controlled experiment', 'randomized controlled trial',
  'peer review', 'peer-reviewed',
  'carbon footprint', 'biodiversity', 'deforestation',
  'socioeconomic', 'geopolitical', 'infrastructure',
];

// AI vocabulary to kill in post-processing (robotic/flagged words)
const AI_VOCAB_KILL = {
  'utilize': 'use', 'utilizes': 'uses', 'utilized': 'used', 'utilizing': 'using',
  'utilization': 'use',
  'facilitate': 'help', 'facilitates': 'helps', 'facilitated': 'helped', 'facilitating': 'helping',
  'leverage': 'use', 'leverages': 'uses', 'leveraged': 'used', 'leveraging': 'using',
  'implement': 'carry out', 'implements': 'carries out', 'implemented': 'carried out',
  'endeavor': 'effort', 'endeavors': 'efforts', 'endeavour': 'effort',
  'multifaceted': 'complex', 'aforementioned': 'this', 'aforementioned': 'that',
  'paramount': 'important', 'pivotal': 'important', 'crucial': 'important',
  'comprehensive': 'thorough', 'robust': 'strong', 'robust': 'solid',
  'delve': 'look into', 'delves': 'looks into', 'delving': 'looking into',
  'underscore': 'highlight', 'underscores': 'highlights', 'underscored': 'highlighted',
  'embark': 'start', 'embarks': 'starts', 'embarked': 'started',
  'harness': 'use', 'harnesses': 'uses', 'harnessed': 'used', 'harnessing': 'using',
  'foster': 'encourage', 'fosters': 'encourages', 'fostered': 'encouraged', 'fostering': 'encouraging',
  'bolster': 'strengthen', 'bolsters': 'strengthens', 'bolstered': 'strengthened',
  'streamline': 'simplify', 'streamlines': 'simplifies', 'streamlined': 'simplified',
  'navigate': 'handle', 'navigates': 'handles', 'navigating': 'handling',
  'landscape': 'field', 'realm': 'area', 'sphere': 'area', 'domain': 'field',
  'tapestry': 'mix', 'myriad': 'many', 'plethora': 'many',
  'juxtaposition': 'contrast', 'dichotomy': 'divide',
  'synergy': 'cooperation', 'synergies': 'cooperation',
  'paradigm': 'model', 'paradigms': 'models',
  'nuanced': 'detailed', 'holistic': 'complete',
  'overarching': 'main', 'underpinning': 'basis', 'underpinnings': 'foundations',
  'elucidate': 'explain', 'elucidates': 'explains', 'elucidated': 'explained',
  'delineate': 'describe', 'delineates': 'describes', 'delineated': 'described',
  'ameliorate': 'improve', 'ameliorates': 'improves',
  'exacerbate': 'worsen', 'exacerbates': 'worsens', 'exacerbated': 'worsened',
  'intricate': 'complex', 'intrinsic': 'built-in',
  'proliferation': 'spread', 'proliferate': 'spread',
  'burgeoning': 'growing', 'nascent': 'early',
  'quintessential': 'typical', 'ubiquitous': 'common', 'ubiquity': 'prevalence',
  'culminate': 'end in', 'culminates': 'ends in', 'culminated': 'ended in',
  'conundrum': 'problem', 'predicament': 'problem',
  'pertain': 'relate', 'pertains': 'relates', 'pertaining': 'relating',
  'efficacy': 'effectiveness', 'efficacious': 'effective',
  'resonate': 'connect', 'resonates': 'connects', 'resonated': 'connected',
  'spearhead': 'lead', 'spearheads': 'leads', 'spearheaded': 'led',
  'galvanize': 'motivate', 'galvanizes': 'motivates',
  'catalyze': 'trigger', 'catalyzes': 'triggers',
  'augment': 'increase', 'augments': 'increases', 'augmented': 'increased',
  'mitigate': 'reduce', 'mitigates': 'reduces', 'mitigated': 'reduced', 'mitigating': 'reducing',
  'propel': 'drive', 'propels': 'drives', 'propelled': 'drove',
  'testament': 'proof',
  'imperative': 'necessary', 'indispensable': 'essential',
  'encompass': 'include', 'encompasses': 'includes', 'encompassed': 'included',
  'underscore': 'stress', 'underscoring': 'stressing',
};

// Unusual/robotic synonym replacements that engines sometimes produce
const UNUSUAL_SYNONYMS = {
  'furnish': 'provide', 'furnishes': 'provides', 'furnished': 'provided',
  'bestow': 'give', 'bestows': 'gives', 'bestowed': 'gave',
  'procure': 'get', 'procures': 'gets', 'procured': 'got',
  'commence': 'begin', 'commences': 'begins', 'commenced': 'began',
  'terminate': 'end', 'terminates': 'ends', 'terminated': 'ended',
  'endeavour': 'try', 'endeavours': 'tries',
  'ascertain': 'find out', 'ascertains': 'finds',
  'expound': 'explain', 'expounds': 'explains',
  'elucidate': 'clarify', 'elucidates': 'clarifies',
  'promulgate': 'announce', 'promulgates': 'announces',
  'disseminate': 'spread', 'disseminates': 'spreads',
  'amalgamate': 'combine', 'amalgamates': 'combines',
  'juxtapose': 'compare', 'juxtaposes': 'compares',
  'obfuscate': 'confuse', 'obfuscates': 'confuses',
  'remuneration': 'payment', 'remunerate': 'pay',
  'cogitate': 'think', 'cogitates': 'thinks',
  'edification': 'education', 'edifice': 'structure',
  'promulgation': 'announcement',
  'commensurate': 'proportional',
  'substantiate': 'support', 'substantiates': 'supports',
  'corroborate': 'confirm', 'corroborates': 'confirms',
  'necessitate': 'require', 'necessitates': 'requires',
  'perpetuate': 'continue', 'perpetuates': 'continues',
  'extricate': 'free', 'extricates': 'frees',
  'supplant': 'replace', 'supplants': 'replaces',
  'supersede': 'replace', 'supersedes': 'replaces',
  'augmentation': 'increase', 'commencement': 'start',
  'termination': 'end', 'remit': 'scope',
  'hitherto': 'until now', 'heretofore': 'before',
  'inasmuch': 'since', 'insofar': 'to the extent',
  'notwithstanding': 'despite', 'vis-a-vis': 'compared to',
  'therein': 'in this', 'thereof': 'of this', 'thereby': 'in this way',
  'whilst': 'while', 'amongst': 'among', 'amidst': 'amid',
  'henceforth': 'from now on', 'forthwith': 'immediately',
};

// AI phrase patterns to kill
const AI_PHRASE_KILL = [
  [/\bit is (?:important|crucial|vital|essential|imperative|paramount) to (?:note|recognize|acknowledge|understand) that\b/gi, 'notably,'],
  [/\bin today(?:'s| s) (?:rapidly )?(?:evolving|changing|dynamic|modern|digital|fast-paced) (?:world|landscape|era|age|society|environment)\b/gi, 'currently'],
  [/\bin (?:the )?(?:realm|domain|sphere|arena|landscape) of\b/gi, 'in'],
  [/\bplay(?:s)? a (?:pivotal|crucial|vital|key|significant|important|critical|fundamental|instrumental) role\b/gi, 'matters'],
  [/\bserve(?:s)? as a (?:catalyst|cornerstone|foundation|beacon|testament|reminder)\b/gi, 'acts as a basis'],
  [/\bit is worth (?:noting|mentioning|highlighting|emphasizing|pointing out) that\b/gi, ''],
  [/\b(?:the fact that|it goes without saying that|needless to say)\b/gi, ''],
  [/\b(?:a wide range|a broad spectrum|a diverse array|a vast array|an extensive range) of\b/gi, 'many'],
  [/\b(?:has|have) garnered (?:significant|considerable|substantial|widespread) (?:attention|interest|support|recognition)\b/gi, 'has attracted attention'],
  [/\b(?:it (?:can|could|may|might) be (?:argued|said|stated|posited|contended) that)\b/gi, 'some argue'],
  [/\bthis (?:paper|study|essay|article|analysis|research|review) (?:aims|seeks|endeavors|attempts) to\b/gi, 'this work examines'],
  [/\b(?:in light of|in view of|given the fact that|considering the fact that)\b/gi, 'given'],
  [/\b(?:on the other hand|conversely|by contrast)\b/gi, (m) => ['however', 'but', 'yet', 'still'][Math.floor(Math.random() * 4)]],
  [/\b(?:furthermore|moreover|additionally|in addition)\b/gi, (m) => ['also', 'besides', 'plus', 'and'][Math.floor(Math.random() * 4)]],
  [/\bhas the potential to\b/gi, 'can'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin order to\b/gi, 'to'],
  [/\ba significant (?:number|amount|portion|proportion) of\b/gi, 'many'],
  [/\bat the (?:present|current) (?:time|moment|juncture)\b/gi, 'now'],
  [/\bfor the purpose of\b/gi, 'for'],
  [/\bin the context of\b/gi, 'in'],
  [/\bwith respect to\b/gi, 'about'],
  [/\bwith regard to\b/gi, 'about'],
  [/\bin spite of the fact that\b/gi, 'although'],
  [/\b(?:it is|it's) evident that\b/gi, 'clearly,'],
  [/\bin(?:| )(?:a|an) (?:increasingly|rapidly|ever[- ]?more) (?:complex|connected|globalized|digital|competitive)\b/gi, 'as things grow more'],
];

// Sentence starters for context-based injection
const CITATION_STARTERS = [
  'According to', 'As noted by', 'As reported by', 'Based on findings from',
  'Research by', 'A study by', 'Work by', 'Evidence from',
];

const GENERAL_STARTERS = [
  'For instance,', 'In particular,', 'Specifically,', 'To illustrate,',
  'As an example,', 'One case in point is', 'This is shown by',
  'More precisely,', 'Put simply,',
];

const CONTINUATION_STARTERS = [
  'Also,', 'Beyond this,', 'On a related note,', 'Equally,',
  'At the same time,', 'In the same vein,', 'Similarly,',
  'Along these lines,', 'Relatedly,',
];

const CONTRAST_STARTERS = [
  'However,', 'Yet,', 'Still,', 'That said,',
  'Even so,', 'On the flip side,', 'Nonetheless,',
];

const BRIDGING_PHRASES = [
  'What this means is that', 'In practical terms,', 'The implication here is that',
  'Looking at it another way,', 'To put this in perspective,',
  'This matters because', 'One reason for this is that',
  'The significance of this lies in', 'What stands out here is',
  'This connects to', 'Building on this point,',
];


// ═══════════════════════════════════════════════════════════════════
// PRE-PROCESSING — Content Protection
// ═══════════════════════════════════════════════════════════════════

export function preProcess(text) {
  const map = [];
  let sanitized = text;
  let idx = 0;

  function protect(pattern) {
    sanitized = sanitized.replace(pattern, (match) => {
      const ph = makePlaceholder(idx);
      map.push({ placeholder: ph, original: match });
      idx++;
      return ph;
    });
  }

  // 1. Topic keywords (case-insensitive, longest first)
  const sortedTopics = [...TOPIC_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const kw of sortedTopics) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    protect(new RegExp(`\\b${escaped}\\b`, 'gi'));
  }

  // 2. Citations: (Author et al., YYYY), (Author, YYYY), (Author & Author, YYYY)
  protect(/\([A-Z][a-zA-Z]*(?:\s+(?:et\s+al\.|&\s+[A-Z][a-zA-Z]*))*,\s*(?:\d{4}[a-z]?|n\.d\.)\)/g);

  // 3. Inline citations like Author (YYYY) or Author et al. (YYYY)
  protect(/[A-Z][a-zA-Z]+(?:\s+(?:et\s+al\.|&\s+[A-Z][a-zA-Z]+))?\s*\(\d{4}[a-z]?\)/g);

  // 4. Bracketed content: [1], [Figure 3], [Appendix A]
  protect(/\[[^\]]+\]/g);

  // 5. Quoted strings
  protect(/"[^"]{2,}"/g);

  // 6. URLs
  protect(/https?:\/\/[^\s,)]+/g);

  // 7. Email addresses
  protect(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);

  // 8. Dollar amounts: $500, $3,500.00
  protect(/\$[\d,]+(?:\.\d+)?/g);

  // 9. Percentages: 20%, 6.5%
  protect(/\d+(?:\.\d+)?%/g);

  // 10. Decimal numbers: 3.14, 0.05
  protect(/\b\d+\.\d+\b/g);

  // 11. Large numbers with commas: 100,000
  protect(/\b\d{1,3}(?:,\d{3})+\b/g);

  // 12. Ordinals: 1st, 2nd, 3rd, 4th
  protect(/\b\d+(?:st|nd|rd|th)\b/gi);

  // 13. Statistical notation: p < .05, r = 0.82, n = 200
  protect(/\b[prnNdfFt]\s*[<>=≤≥]\s*\.?\d+/g);

  // 14. Abbreviations: GDP, WHO, AI, USA (2+ uppercase letters)
  protect(/\b[A-Z]{2,}\b/g);

  // 15. Dates: 2024, Q1 2025
  protect(/\b(?:Q[1-4]\s+)?\d{4}\b(?=[\s,.);\-]|$)/g);

  // 16. Standalone significant numbers (2+ digits)
  protect(/\b\d{2,}\b/g);

  // 17. Numbered lists: 1. or 1)
  protect(/^\s*\d+[.)]\s/gm);

  return { sanitized, map };
}

export function restoreProtected(text, map) {
  let restored = text;
  for (let i = map.length - 1; i >= 0; i--) {
    const { placeholder, original } = map[i];
    // Use split/join to replace all occurrences
    while (restored.includes(placeholder)) {
      restored = restored.replace(placeholder, original);
    }
  }
  return restored;
}


// ═══════════════════════════════════════════════════════════════════
// STRUCTURAL DECOMPOSITION — Parse text into blocks
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse text into structural blocks: titles, paragraphs, blank lines.
 * Each block stores its type and content.
 */
function decomposeText(text) {
  const lines = text.split('\n');
  const blocks = [];
  let currentParagraph = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push({ type: 'paragraph', content: currentParagraph.join('\n') });
        currentParagraph = [];
      }
      blocks.push({ type: 'blank', content: '' });
    } else if (isTitle(trimmed, i, lines)) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push({ type: 'paragraph', content: currentParagraph.join('\n') });
        currentParagraph = [];
      }
      blocks.push({ type: 'title', content: trimmed });
    } else {
      currentParagraph.push(line);
    }
  }

  // Flush remaining
  if (currentParagraph.length > 0) {
    blocks.push({ type: 'paragraph', content: currentParagraph.join('\n') });
  }

  return blocks;
}

function isTitle(line, index, allLines) {
  // Markdown headings
  if (/^#{1,6}\s+/.test(line)) return true;
  // Short lines (under 80 chars) with no ending punctuation, likely titles
  if (line.length < 80 && !/[.!?:,;]$/.test(line) && /^[A-Z]/.test(line)) {
    // Must have a blank line before or be first line, and next line exists
    const prevBlank = index === 0 || allLines[index - 1].trim() === '';
    const nextExists = index < allLines.length - 1 && allLines[index + 1].trim() !== '';
    if (prevBlank && nextExists && line.split(/\s+/).length <= 10) return true;
  }
  return false;
}

/**
 * Split a paragraph into sentences without merging or splitting.
 */
function splitSentences(text) {
  // Match sentences ending with .!? followed by space/end, or the tail
  const sentences = [];
  const re = /[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const s = match[0].trim();
    if (s) sentences.push(s);
  }
  return sentences.length > 0 ? sentences : [text];
}


// ═══════════════════════════════════════════════════════════════════
// PHASE 1: Deep Synonym Cleaning
// ═══════════════════════════════════════════════════════════════════

function phase1_cleanUnusualSynonyms(sentence) {
  let out = sentence;
  for (const [word, replacement] of Object.entries(UNUSUAL_SYNONYMS)) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    out = out.replace(re, (m) => {
      // Preserve capitalization
      if (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return out;
}


// ═══════════════════════════════════════════════════════════════════
// PHASE 2: AI Vocabulary Purge
// ═══════════════════════════════════════════════════════════════════

function phase2_purgeAIVocab(sentence) {
  let out = sentence;

  // Word-level AI vocab kill
  for (const [word, replacement] of Object.entries(AI_VOCAB_KILL)) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    out = out.replace(re, (m) => {
      if (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Phrase-level AI phrase kill
  for (const [pattern, replacement] of AI_PHRASE_KILL) {
    if (typeof replacement === 'function') {
      out = out.replace(pattern, replacement);
    } else {
      out = out.replace(pattern, replacement);
    }
  }

  return out;
}


// ═══════════════════════════════════════════════════════════════════
// PHASE 3: Repetition Elimination (cross-sentence)
// ═══════════════════════════════════════════════════════════════════

function phase3_eliminateRepetitions(sentences) {
  if (sentences.length <= 1) return sentences;

  const result = [...sentences];
  const starterCounts = {};
  const recentWords = {};

  for (let i = 0; i < result.length; i++) {
    const words = result[i].split(/\s+/);
    const starter = words.slice(0, 2).join(' ').toLowerCase();

    // Track starter frequency
    starterCounts[starter] = (starterCounts[starter] || 0) + 1;

    // If this starter appeared 2+ times already, vary it
    if (starterCounts[starter] > 2) {
      const alts = ['In fact,', 'Notably,', 'Here,', 'At this point,', 'As seen,', 'Put differently,'];
      const alt = alts[Math.floor(Math.random() * alts.length)];
      // Replace first word if sentence starts with "The", "This", "These", "It", "They"
      if (/^(The|This|These|It|They|There)\b/i.test(result[i])) {
        result[i] = `${alt} ${result[i][0].toLowerCase()}${result[i].slice(1)}`;
      }
    }

    // Check for repeated content words in adjacent sentences
    if (i > 0) {
      const prevWords = result[i - 1].toLowerCase().split(/\s+/);
      const currWords = result[i].toLowerCase().split(/\s+/);
      const contentPrev = prevWords.filter(w => w.length > 4);
      const contentCurr = currWords.filter(w => w.length > 4);

      // Find repeated long words
      const repeated = contentCurr.filter(w => contentPrev.includes(w));
      if (repeated.length > 3) {
        // Try to replace some repeated words with pronouns or references
        for (const rw of repeated.slice(2)) {
          const alts = { 'these': 'such', 'those': 'said', 'their': 'its' };
          // Simple pronoun substitution for repeated subjects
          if (/^(study|research|analysis|investigation|report|paper|review)$/i.test(rw)) {
            result[i] = result[i].replace(new RegExp(`\\b${rw}\\b`, 'i'), 'this work');
            break;
          }
        }
      }
    }
  }

  // Deduplicate "The" and "This" starters — cap at 20% each
  const theLimit = Math.max(2, Math.ceil(result.length * 0.2));
  const thisLimit = Math.max(2, Math.ceil(result.length * 0.2));
  let theCount = 0, thisCount = 0;
  const theAlts = ['One', 'A key', 'An important', 'A notable', 'Such a', 'Each'];
  const thisAlts = ['That', 'Such', 'One such', 'A related', 'The above'];

  for (let i = 0; i < result.length; i++) {
    if (/^The\b/.test(result[i])) {
      theCount++;
      if (theCount > theLimit) {
        const alt = theAlts[(theCount - theLimit - 1) % theAlts.length];
        result[i] = result[i].replace(/^The\b/, alt);
      }
    }
    if (/^This\b/.test(result[i])) {
      thisCount++;
      if (thisCount > thisLimit) {
        const alt = thisAlts[(thisCount - thisLimit - 1) % thisAlts.length];
        result[i] = result[i].replace(/^This\b/, alt);
      }
    }
  }

  return result;
}


// ═══════════════════════════════════════════════════════════════════
// PHASE 4: Starter Injection
// ═══════════════════════════════════════════════════════════════════

function phase4_injectStarters(sentences) {
  if (sentences.length <= 2) return sentences;

  const result = [...sentences];
  const usedStarters = new Set();

  for (let i = 0; i < result.length; i++) {
    const sent = result[i];

    // Check if sentence already has a starter/transition
    if (/^(However|Moreover|Furthermore|Additionally|Also|Yet|Still|Indeed|Notably|For instance|Specifically|According to|In particular|Beyond this|That said|As a result|Therefore|Thus|Hence|Consequently|Meanwhile|In contrast|Similarly|Equally|On a related|Put differently|In fact|Importantly|As noted|As reported|Based on|Research by|A study by)/i.test(sent)) {
      continue;
    }

    // Inject starter for sentences with citations
    if (/\([A-Z][a-zA-Z]*(?:\s+et\s+al\.?)?,\s*\d{4}\)/.test(sent) || /\u27E8v\d+\u27E9/.test(sent)) {
      if (Math.random() < 0.15 && i > 0) {
        const starter = pickUnused(CITATION_STARTERS, usedStarters);
        if (starter && !sent.toLowerCase().startsWith(starter.toLowerCase().split(' ')[0])) {
          result[i] = `${starter} ${sent[0].toLowerCase()}${sent.slice(1)}`;
          usedStarters.add(starter);
          continue;
        }
      }
    }

    // Selective injection — not every sentence gets a starter (natural)
    // Only inject every 6-9 sentences to avoid over-transitioning
    if (i > 0 && i % (6 + Math.floor(Math.random() * 4)) === 0) {
      let pool;
      // Pick pool based on context
      if (i > result.length * 0.7) {
        pool = CONTRAST_STARTERS;
      } else if (i % 2 === 0) {
        pool = CONTINUATION_STARTERS;
      } else {
        pool = GENERAL_STARTERS;
      }

      const starter = pickUnused(pool, usedStarters);
      if (starter) {
        result[i] = `${starter} ${sent[0].toLowerCase()}${sent.slice(1)}`;
        usedStarters.add(starter);
      }
    }
  }

  return result;
}

function pickUnused(pool, usedSet) {
  const available = pool.filter(s => !usedSet.has(s));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}


// ═══════════════════════════════════════════════════════════════════
// PHASE 5: Explanatory Flow Enhancement
// ═══════════════════════════════════════════════════════════════════

function phase5_improveFlow(sentences) {
  if (sentences.length <= 3) return sentences;

  const result = [...sentences];

  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1];
    const curr = result[i];

    // If two consecutive sentences are both short and factual, add a bridge
    const prevWords = prev.split(/\s+/).length;
    const currWords = curr.split(/\s+/).length;

    if (prevWords < 12 && currWords < 12 && i > 1 && Math.random() < 0.25) {
      // Expand the shorter sentence slightly
      if (currWords < 8) {
        // Add a clarifying tail
        const tails = [
          ', which has drawn attention from researchers.',
          ', a point that deserves further attention.',
          ', and this has practical consequences.',
          ', which is often overlooked in practice.',
        ];
        const tail = tails[Math.floor(Math.random() * tails.length)];
        result[i] = curr.replace(/\.\s*$/, tail);
      }
    }

    // Detect abrupt topic shifts (prev talks about X, curr about Y with no link)
    // If two sentences share very few words, add a transition
    if (i > 0 && Math.random() < 0.06) {
      const prevContent = new Set(prev.toLowerCase().split(/\s+/).filter(w => w.length > 5));
      const currContent = curr.toLowerCase().split(/\s+/).filter(w => w.length > 5);
      const overlap = currContent.filter(w => prevContent.has(w)).length;

      if (overlap === 0 && currContent.length > 3 && !/^(However|Moreover|Also|Yet|Still|In addition|Furthermore|Besides)/i.test(curr)) {
        const bridges = ['Separately,', 'On another note,', 'Turning to another aspect,', 'In a different vein,'];
        const bridge = bridges[Math.floor(Math.random() * bridges.length)];
        result[i] = `${bridge} ${curr[0].toLowerCase()}${curr.slice(1)}`;
      }
    }
  }

  return result;
}


// ═══════════════════════════════════════════════════════════════════
// PHASE 6: Sentence-Level Deep Humanization
// ═══════════════════════════════════════════════════════════════════

function phase6_deepHumanize(sentence) {
  let out = sentence;

  // 1. Break up robotic uniformity — vary sentence rhythm
  // If sentence has too many commas (over-structured), simplify some
  const commaCount = (out.match(/,/g) || []).length;
  if (commaCount > 4) {
    // Remove one non-essential comma clause (middle one)
    out = out.replace(/,\s*(which|that|where|when)\s+/i, (m, word, off) => {
      if (off > out.length * 0.3 && off < out.length * 0.7) {
        return ` ${word} `;
      }
      return m;
    });
  }

  // 2. Convert passive to active selectively
  out = out.replace(/\b(it (?:is|was|has been) (?:found|shown|demonstrated|observed|noted|reported|suggested|argued|established|determined|concluded|revealed|discovered|confirmed|recognized|identified|estimated|proposed|assumed|believed|considered|expected|hoped|intended|known|thought|understood) that)\b/gi,
    (m) => {
      const actives = ['findings show that', 'evidence shows that', 'research shows that', 'data shows that', 'results show that', 'studies show that', 'scholars found that', 'analysis reveals that'];
      return actives[Math.floor(Math.random() * actives.length)];
    }
  );

  // 3. Reduce nominalizations
  const nominalizations = [
    [/\bthe (\w+ation) of\b/gi, (m, noun) => {
      const verbMap = {
        'utilization': 'using', 'implementation': 'implementing', 'examination': 'examining',
        'investigation': 'investigating', 'determination': 'determining', 'evaluation': 'evaluating',
        'consideration': 'considering', 'exploration': 'exploring', 'demonstration': 'demonstrating',
        'identification': 'identifying', 'accumulation': 'accumulating', 'transformation': 'transforming',
        'continuation': 'continuing', 'documentation': 'documenting', 'estimation': 'estimating',
        'facilitation': 'helping with', 'interpretation': 'interpreting', 'modification': 'modifying',
        'observation': 'observing', 'preparation': 'preparing', 'preservation': 'preserving',
        'recommendation': 'recommending', 'regulation': 'regulating', 'representation': 'representing',
      };
      const verb = verbMap[noun.toLowerCase()];
      return verb ? verb : m;
    }],
  ];

  for (const [pattern, replacer] of nominalizations) {
    out = out.replace(pattern, replacer);
  }

  // 4. Dash parenthetical DISABLED — no em-dashes policy
  // if (Math.random() < 0.12) { ... }

  // 5. Vary hedging language
  out = out.replace(/\b(may|might|could)\s+(potentially|possibly|conceivably)\b/gi,
    (m, modal) => modal
  );

  // 6. Reduce stacked prepositions "of the X of the Y"
  out = out.replace(/\bof the (\w+) of the (\w+)\b/gi,
    (m, w1, w2) => `of ${w1} in ${w2}`
  );

  return out;
}


// ═══════════════════════════════════════════════════════════════════
// PHASE 7: Final Polish
// ═══════════════════════════════════════════════════════════════════

function phase7_finalPolish(sentence) {
  let out = sentence;

  // 0. Remove all em-dashes — no em-dashes policy
  out = out.replace(/ — /g, ', ').replace(/—/g, ', ');
  out = out.replace(/ – /g, ', ').replace(/–/g, ', ');

  // 1. Fix double spaces
  out = out.replace(/\s{2,}/g, ' ');

  // 2. Fix capitalization after sentence starters injected with trailing comma
  out = out.replace(/^([A-Z][a-z]+,)\s+([a-z])/,
    (m, starter, c) => `${starter} ${c}`
  );

  // 3. Ensure proper sentence ending
  if (!/[.!?]$/.test(out.trim())) {
    out = out.trim() + '.';
  }

  // 4. Fix repeated words: "the the", "is is", "and and"
  out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');

  // 5. Fix orphaned punctuation: ", ." or "; ."
  out = out.replace(/[,;]\s*\./g, '.');
  out = out.replace(/\.\s*\./g, '.');

  // 6. Fix spacing around dashes
  out = out.replace(/\s*\u2014\s*/g, ' \u2014 ');

  // 7. Trim and ensure single space after sentence-ending punctuation
  out = out.trim();

  // 8. Fix lowercase after period (in case starters broke it)
  out = out.replace(/\.\s+([a-z])/g, (m, c) => `. ${c.toUpperCase()}`);

  // 9. Ensure first character is uppercase
  if (out.length > 0) {
    out = out[0].toUpperCase() + out.slice(1);
  }

  return out;
}


// ═══════════════════════════════════════════════════════════════════
// MAIN PIPELINE — wraps V1.3 engine output
// ═══════════════════════════════════════════════════════════════════

/**
 * Full post-processing pipeline for V1.3 engine output.
 * Processes sentence-by-sentence through 7 phases, preserving structure.
 * 
 * @param {string} text - Already-humanized text from V1.3 pipeline
 * @returns {string} - Deeply post-processed text
 */
export function deepPostProcess(text) {
  // ── Step 1: Decompose into structural blocks ──
  const blocks = decomposeText(text);

  // ── Step 2: Process each paragraph block sentence-by-sentence ──
  const processedBlocks = blocks.map(block => {
    if (block.type !== 'paragraph') {
      return block; // titles, blanks pass through unchanged
    }

    // Split paragraph into sentences
    let sentences = splitSentences(block.content);

    // Phase 1: Clean unusual synonyms (per sentence)
    sentences = sentences.map(s => phase1_cleanUnusualSynonyms(s));

    // Phase 2: AI vocabulary purge (per sentence)
    sentences = sentences.map(s => phase2_purgeAIVocab(s));

    // Phase 3: Repetition elimination (cross-sentence)
    sentences = phase3_eliminateRepetitions(sentences);

    // Phase 4: Starter injection (cross-sentence context)
    sentences = phase4_injectStarters(sentences);

    // Phase 5: Explanatory flow (cross-sentence)
    sentences = phase5_improveFlow(sentences);

    // Phase 6: Deep humanization (per sentence)
    sentences = sentences.map(s => phase6_deepHumanize(s));

    // Phase 7: Final polish (per sentence)
    sentences = sentences.map(s => phase7_finalPolish(s));

    return { ...block, content: sentences.join(' ') };
  });

  // ── Step 3: Reassemble with original structure ──
  return processedBlocks.map(block => {
    switch (block.type) {
      case 'blank': return '';
      case 'title': return block.content;
      case 'paragraph': return block.content;
      default: return block.content;
    }
  }).join('\n');
}
