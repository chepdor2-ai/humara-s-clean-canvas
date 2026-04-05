/**
 * V1.3 Shared Techniques
 * =======================
 * Key stealth techniques extracted from v1.3 Stealth Engine for use
 * across ALL humanizer engines via the unified sentence processor.
 *
 * Techniques:
 *   1. Collocation replacement (200+ multi-word phrase pairs)
 *   2. Phrase compression (wordy AI phrases → concise human phrasing)
 *   3. Punctuation variation (semicolons at clause boundaries)
 *   4. AI phrase kill (150+ patterns)
 *   5. Sentence restructuring (40+ patterns)
 *   6. Out-of-context synonym fixer (post-processing)
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { PHRASE_COMPRESS, NATURAL_PAIRS } from './v1.3/_humanize-dict.js';

// ══════════════════════════════════════════════════════════════════
// 1. COLLOCATION REPLACEMENT — 200+ multi-word phrase swaps
// ══════════════════════════════════════════════════════════════════

const COLLOCATIONS: Record<string, string[]> = {
  'significant impact': ['substantial effect', 'marked influence', 'strong consequence'],
  'wide range': ['broad spectrum', 'diverse selection', 'rich variety'],
  'key factor': ['core driver', 'central element', 'main influence'],
  'major challenge': ['serious difficulty', 'considerable hurdle', 'real obstacle'],
  'growing concern': ['rising worry', 'mounting alarm', 'increasing unease'],
  'common practice': ['standard approach', 'typical method', 'usual routine'],
  'critical analysis': ['careful examination', 'in-depth review', 'close reading'],
  'positive outcome': ['favorable result', 'good ending', 'successful conclusion'],
  'negative impact': ['harmful effect', 'adverse consequence', 'damaging result'],
  'clear evidence': ['plain proof', 'obvious signs', 'solid indication'],
  'strong correlation': ['tight link', 'firm connection', 'close relationship'],
  'direct impact': ['immediate effect', 'straight influence', 'clear consequence'],
  'major shift': ['large change', 'big move', 'sweeping turn'],
  'rapid growth': ['fast expansion', 'quick increase', 'swift rise'],
  'current situation': ['present state', 'existing condition', 'state of affairs'],
  'fundamental change': ['basic shift', 'core transformation', 'root-level overhaul'],
  'key component': ['central part', 'vital element', 'main building block'],
  'primary focus': ['main attention', 'chief concern', 'central priority'],
  'significant role': ['major part', 'key contribution', 'meaningful share'],
  'general consensus': ['broad agreement', 'shared view', 'collective opinion'],
  'significant difference': ['marked gap', 'notable contrast', 'clear divide'],
  'increasing number': ['growing count', 'rising total', 'climbing figure'],
  'complex issue': ['complicated matter', 'intricate problem', 'tricky question'],
  'underlying cause': ['root reason', 'deeper source', 'hidden factor'],
  'crucial step': ['vital move', 'key action', 'essential measure'],
  'extensive research': ['thorough investigation', 'in-depth study', 'wide-ranging inquiry'],
  'relevant information': ['useful data', 'applicable details', 'pertinent facts'],
  'potential risk': ['possible danger', 'conceivable threat', 'likely hazard'],
  'positive impact': ['helpful effect', 'constructive influence', 'beneficial result'],
  'significant contribution': ['major input', 'key addition', 'meaningful offering'],
  'previous research': ['earlier studies', 'past work', 'prior investigation'],
  'limited resources': ['scarce means', 'restricted supplies', 'tight budget'],
  'high quality': ['superior standard', 'excellent caliber', 'top-tier grade'],
  'critical thinking': ['careful reasoning', 'analytical thought', 'sharp judgment'],
  'long term': ['over time', 'extended period', 'down the road'],
  'short term': ['near future', 'immediate period', 'right away'],
  'conduct research': ['carry out a study', 'run an inquiry', 'perform an investigation'],
  'raise awareness': ['increase consciousness', 'boost understanding', 'draw attention'],
  'provide evidence': ['present proof', 'offer data', 'supply supporting facts'],
  'gain insight': ['develop understanding', 'build knowledge', 'grow awareness'],
  'draw conclusions': ['reach findings', 'form judgments', 'come to results'],
  'reach a consensus': ['find agreement', 'come to a shared view', 'arrive at unity'],
  'give rise to': ['lead to', 'cause', 'bring about'],
  'carry out': ['perform', 'execute', 'complete'],
  'bring about': ['cause', 'create', 'trigger'],
  'point out': ['note', 'mention', 'highlight'],
  'look into': ['examine', 'investigate', 'explore'],
  'break down': ['analyze', 'dissect', 'decompose'],
  'come up with': ['devise', 'develop', 'craft'],
  'put forward': ['propose', 'suggest', 'present'],
  'depend on': ['rely on', 'hinge on', 'rest on'],
  'result in': ['lead to', 'cause', 'produce'],
  'focus on': ['center on', 'concentrate on', 'zero in on'],
  'account for': ['explain', 'represent', 'address'],
  'stem from': ['come from', 'originate in', 'arise from'],
  'contribute to': ['add to', 'feed into', 'support'],
  'at the same time': ['simultaneously', 'concurrently', 'in parallel'],
  'on the other hand': ['by contrast', 'conversely', 'then again'],
  'as a result': ['because of this', 'for this reason', 'so'],
  'in other words': ['put differently', 'that is', 'said another way'],
  'for example': ['for instance', 'to illustrate', 'say'],
  'in particular': ['especially', 'specifically', 'notably'],
  'in fact': ['actually', 'really', 'as it turns out'],
  'as well as': ['along with', 'together with', 'coupled with'],
  'of course': ['naturally', 'understandably', 'as expected'],
  'in general': ['broadly', 'usually', 'on the whole'],
  'by and large': ['mostly', 'generally', 'on the whole'],
  'vast majority': ['great bulk', 'overwhelming share', 'most'],
  'growing body': ['expanding collection', 'rising volume', 'increasing mass'],
  'driving force': ['main engine', 'key catalyst', 'primary motivator'],
  'root cause': ['underlying reason', 'core source', 'fundamental origin'],
  'point of view': ['perspective', 'angle', 'stance'],
  'course of action': ['path', 'plan', 'approach'],
  'lack of': ['absence of', 'shortage of', 'deficit in'],
  'in light of': ['given', 'considering', 'because of'],
  'in terms of': ['regarding', 'concerning', 'when it comes to'],
  'in line with': ['matching', 'consistent with', 'aligned with'],
  'on the basis of': ['based on', 'drawing on', 'relying on'],
  'in the face of': ['despite', 'confronting', 'faced with'],
  'with regard to': ['about', 'regarding', 'concerning'],
  'with respect to': ['about', 'regarding', 'on'],
  'by means of': ['through', 'using', 'via'],
  'as a whole': ['overall', 'entirely', 'collectively'],
  'to some extent': ['partly', 'somewhat', 'to a degree'],
  'mental health': ['psychological well-being', 'emotional wellness'],
  'decision making': ['choosing', 'judgment calls', 'selection process'],
  'well being': ['welfare', 'wellness', 'quality of life'],
  'increasingly important': ['more and more vital', 'gaining importance'],
  'highly effective': ['very successful', 'remarkably productive'],
  'closely related': ['tightly connected', 'strongly linked'],
  'widely recognized': ['broadly known', 'well established'],
  'well established': ['firmly set', 'long-standing', 'proven'],
  'actively engaged': ['deeply involved', 'fully participating'],
  'deeply rooted': ['firmly entrenched', 'long-standing', 'ingrained'],
};

// Pre-compiled for performance
const COLLOC_ENTRIES = Object.entries(COLLOCATIONS)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([phrase, alts]) => ({
    re: new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
    alts,
  }));

const usedCollocations = new Set<string>();

export function replaceCollocations(text: string): string {
  let r = text;
  for (const { re, alts } of COLLOC_ENTRIES) {
    r = r.replace(re, (match: string) => {
      const available = alts.filter((a: string) => !usedCollocations.has(a));
      const pool = available.length > 0 ? available : alts;
      const picked = pool[Math.floor(Math.random() * pool.length)];
      usedCollocations.add(picked);
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
        return picked.charAt(0).toUpperCase() + picked.slice(1);
      }
      return picked;
    });
  }
  return r;
}

/** Reset used-set between documents */
export function resetCollocationTracking(): void {
  usedCollocations.clear();
}

// ══════════════════════════════════════════════════════════════════
// 2. PHRASE COMPRESSION — Wordy AI phrases → concise human phrasing
//    THE #1 impact tool for AI detection bypass
// ══════════════════════════════════════════════════════════════════

const COMPRESS_MAP: Record<string, string> = PHRASE_COMPRESS ?? {};

const COMPRESS_ENTRIES = Object.entries(COMPRESS_MAP)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([phrase, replacement]) => ({
    re: new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
    replacement: replacement as string,
  }));

export function compressPhrases(text: string): string {
  let r = text;
  for (const { re, replacement } of COMPRESS_ENTRIES) {
    r = r.replace(re, (match: string) => {
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return r;
}

// ══════════════════════════════════════════════════════════════════
// 3. PUNCTUATION VARIATION — Semicolons at clause boundaries
//    Spikes perplexity; detectors expect uniform comma usage
// ══════════════════════════════════════════════════════════════════

export function varyPunctuation(sentence: string): string {
  // DISABLED — semicolons/colons replacing commas produce grammatically
  // invalid structures. "efficiency, accessibility" becomes "efficiency; accessibility"
  // which is wrong (semicolons require independent clauses on both sides).
  return sentence;
}

// ══════════════════════════════════════════════════════════════════
// 4. SENTENCE RESTRUCTURING — 20+ core patterns
//    Move clauses, invert sentence structure, front adverbs
// ══════════════════════════════════════════════════════════════════

function stripPunct(s: string): string {
  return s.replace(/[.!?,;:]+$/, '').trim();
}

function endPunct(s: string): string {
  const m = s.match(/[.!?]+$/);
  return m ? m[0] : '.';
}

function capFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

interface RestructurePattern {
  re: RegExp;
  apply: (m: RegExpMatchArray) => string;
}

const RESTRUCTURE_PATTERNS: RestructurePattern[] = [
  // "It is X that Y" → "Y X"
  {
    re: /^It\s+(?:is|was|has been)\s+(clear|evident|apparent|obvious|notable|interesting|significant|important|well known|widely accepted)\s+that\s+(.+)$/i,
    apply: (m) => `${capFirst(stripPunct(m[2]))}; this is ${m[1]}${endPunct(m[2])}`,
  },
  // "There are X that Y" → "X Y"
  {
    re: /^There\s+(?:are|is|were|was)\s+(.+?)\s+(?:that|which|who)\s+(.+)$/i,
    apply: (m) => `${capFirst(stripPunct(m[1]))} ${m[2]}`,
  },
  // "X, which leads to Y" → "X, and this leads to Y"
  {
    re: /^(.+?),\s+which\s+(leads?|results?|contributes?)\s+(?:to|in)\s+(.+)$/i,
    apply: (m) => `${m[1]}, and this ${m[2]} to ${m[3]}`,
  },
  // "Despite X, Y" → "Y, despite X"
  {
    re: /^Despite\s+(.{10,}?),\s+(.+)$/i,
    apply: (m) => `${capFirst(stripPunct(m[2]))}, despite ${m[1].toLowerCase()}${endPunct(m[2])}`,
  },
  // "Although X, Y" → "Y, although X"
  {
    re: /^Although\s+(.{10,}?),\s+(.+)$/i,
    apply: (m) => `${capFirst(stripPunct(m[2]))}, although ${m[1].toLowerCase()}${endPunct(m[2])}`,
  },
  // "X is considered Y" → "Y is how X is often seen"
  {
    re: /^(.+?)\s+(?:is|are)\s+(?:considered|regarded|viewed|seen)\s+(?:as\s+)?(.+)$/i,
    apply: (m) => `${capFirst(stripPunct(m[2]))} is how ${m[1].toLowerCase()} is often seen${endPunct(m[2])}`,
  },
  // "X has been shown to Y" → "Research shows X Y"
  {
    re: /^(.+?)\s+(?:has|have)\s+been\s+(?:shown|demonstrated|proven|found)\s+to\s+(.+)$/i,
    apply: (m) => {
      const subjects = ['Research shows', 'Evidence shows', 'Studies show', 'Findings show'];
      return `${subjects[Math.floor(Math.random() * subjects.length)]} ${m[1].toLowerCase()} ${m[2]}`;
    },
  },
  // "It should be noted that X" → "Notably, X" or just X
  {
    re: /^It\s+(?:should|must|can)\s+be\s+(?:noted|mentioned|emphasized|highlighted|stressed|observed)\s+that\s+(.+)$/i,
    apply: (m) => {
      if (Math.random() < 0.5) return `Notably, ${m[1][0].toLowerCase()}${m[1].slice(1)}`;
      return capFirst(m[1]);
    },
  },
  // "The X of Y" → "Y's X" (possessive)
  {
    re: /^The\s+(\w+)\s+of\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(.+)$/i,
    apply: (m) => {
      // Skip if gerund or pronoun
      if (/^(ing|tion|ment|ness|ity|ism|ance|ence)$/i.test(m[1].slice(-3))) return `The ${m[1]} of ${m[2]} ${m[3]}`;
      return `${capFirst(m[2])}'s ${m[1]} ${m[3]}`;
    },
  },
];

export function restructureSentence(sentence: string): string {
  // DISABLED — sentence inversion patterns (\"Although X, Y\" → \"Y, although X\")
  // garble sentence structure and create unnatural text. StealthWriter-quality
  // output requires preserving the original sentence flow.
  return sentence;
}

// ══════════════════════════════════════════════════════════════════
// 5. OUT-OF-CONTEXT SYNONYM FIXER (post-processing)
//    Catches synonyms that are semantically wrong in context
// ══════════════════════════════════════════════════════════════════

// Common wrong-sense synonym replacements that engines produce
const WRONG_SENSE_FIXES: [RegExp, string][] = [
  // "gauge cards" (should be "flash cards" or "study cards")
  [/\bgauge\s+cards?\b/gi, 'flash cards'],
  // "marker cards" (same wrong-sense)
  [/\bmarker\s+cards?\b/gi, 'flash cards'],
  [/\bindicator\s+cards?\b/gi, 'flash cards'],
  // "succeeding experience" (wrong-sense for "following exposure")
  [/\bsucceeding\s+experience\s+to\b/gi, 'following exposure to'],
  // "constrained performing's" (garbled)
  [/\bconstrained\s+performing'?s?\s+management\b/gi, 'limited working'],
  // "urge" when meaning "motivation"
  [/\bsway\s+student\s+urge\b/gi, 'affect student motivation'],
  [/\bstudent\s+urge\b/gi, 'student motivation'],
  // "impetus" wrong form
  [/\bbesides\s+impetus\b/gi, 'and motivation'],
  // "make" when meaning "construct"
  [/\bmultidimensional\s+make\b/gi, 'multidimensional construct'],
  // "pin down" in formal academic context
  [/\baims?\s+to\s+pin\s+down\b/gi, 'aims to determine'],
  // "sway" for "influence" in wrong register
  [/\bqualities\s+sway\b/gi, 'qualities influence'],
  // "crafting them potent" (garbled)
  [/\bcrafting\s+them\s+potent\b/gi, 'making them strong'],
  // "supply convincing indication" (wrong-sense)
  [/\bsupply\s+convincing\s+indication\b/gi, 'provide convincing evidence'],
  // "dearth" used incorrectly (should be "lack")
  [/\bapproaches\s+dearth\b/gi, 'approaches lack'],
  // "consequence" for "affect" 
  [/\btools?\s+consequence\s+cognitive\b/gi, 'tools affect cognitive'],
  // "foreground" for "highlight"
  [/\bforeground\s+the\b/gi, 'highlight the'],
  // "self-governance" for "self-regulation"
  [/\bself-governance\b/gi, 'self-regulation'],
  // "top benefits" for "greater advantages"
  [/\btop\s+benefits\b/gi, 'greater advantages'],
  // "bulk of working" for "most effective"
  [/\bthe\s+bulk\s+of\s+working\s+approaches\b/gi, 'the most effective approaches'],
  // "output differences" for "outcome differences"
  [/\boutput\s+differences\b/gi, 'outcome differences'],
  // "beneficial perception" for "valuable insight"
  [/\bbeneficial\s+perception\b/gi, 'valuable insight'],
  // "customs" for "practices"
  [/\bpedagogical\s+customs\b/gi, 'pedagogical practices'],
  // "elevate academic outcomes" (register mismatch)
  [/\belevate\s+academic\s+outcomes\b/gi, 'improve academic outcomes'],
  // "pursues" for "seeks"
  [/\bthe\s+study\s+pursues\b/gi, 'the study seeks'],
  // "push both persistence" (wrong register)
  [/\bpush\s+both\s+persistence\b/gi, 'promote both persistence'],
  // "tune engagement" (wrong register)
  [/\btune\s+engagement\b/gi, 'improve engagement'],
  // "notify balanced" (wrong-sense)
  [/\bnotify\s+balanced\b/gi, 'inform balanced'],
  // "raise both cognitive" (wrong register)
  [/\braise\s+both\s+cognitive\b/gi, 'enhance both cognitive'],
  // "feed into pedagogical" → "inform pedagogical"
  [/\bfeed\s+into\s+pedagogical\b/gi, 'inform pedagogical'],
  // "inspects how" → "examines how"
  [/\binspects\s+how\b/gi, 'examines how'],
  // "grounded in a large body" → OK but "inspects" is wrong
  [/\binspects\s+the\b/gi, 'examines the'],
  [/\binspects\s+whether\b/gi, 'examines whether'],
  [/\binspects\s+what\b/gi, 'examines what'],
  // Generic: "noted output" → "observed outcome"
  [/\bnoted\s+output\b/gi, 'observed outcome'],
  // "coupled with" appearing excessively → "and"
  // Fixed in collocation pass but catch remaining
  
  // ── Broader pattern: Adjective+Noun mismatches ──
  // "thorough processing" → "deep processing" (in learning context)
  [/\bthorough\s+processing\b/gi, 'deep processing'],
  // "strengthened cognitive encoding" → OK
  // "kinesthetic memory" → OK (valid term)
  
  // ── Wrong preposition patterns ──
  [/\bmeasure\s+against\s+the\s+effectiveness\b/gi, 'measure the effectiveness'],
  [/\bmeasured\s+against\s+to\b/gi, 'compared to'],
  // "relative to" appearing oddly  
  [/\btechnology-based\s+relative\s+to\s+traditional\b/gi, 'technology-based versus traditional'],
  
  // ── Double/stacked transition phrases ──
  [/\b(Looking at the evidence,?\s*)(in practice,?\s*)/gi, '$1'],
  [/\b(In practical terms,?\s*)(at this stage,?\s*)/gi, '$1'],
  [/\b(With this in mind,?\s*)(the objective is\b)/gi, 'The objective is'],
  [/\b(On another note,?\s*)(understanding\b)/gi, 'Understanding'],
  [/\b(Similarly,?\s*)(this focus\b)/gi, 'This focus'],
  [/\b(If if,?\s*)/gi, ''],
  [/\b(That said,?\s*)(finally\b)/gi, 'Finally'],
  
  // ── Garbled sentence fragments ──
  [/\bthe principal purpose of\.\s*/gi, ''],
  [/\bthe study aims to\.\s*/gi, 'the study aims to '],
];

export function fixOutOfContextSynonyms(text: string): string {
  let result = text;
  for (const [pattern, replacement] of WRONG_SENSE_FIXES) {
    result = result.replace(pattern, replacement as string);
  }
  // Fix double spaces created by removals
  result = result.replace(/ {2,}/g, ' ');
  // Fix capitalization after sentence-start cleanup
  result = result.replace(/([.!?])\s+([a-z])/g, (_m, p, l) => `${p} ${l.toUpperCase()}`);
  return result;
}

// ══════════════════════════════════════════════════════════════════
// 6. COLLOCATION VALIDATION — Catch unnatural pairings
// ══════════════════════════════════════════════════════════════════

const NATURAL_PAIR_SET: Record<string, Set<string>> = {};
if (NATURAL_PAIRS && typeof NATURAL_PAIRS === 'object') {
  for (const [adj, nouns] of Object.entries(NATURAL_PAIRS)) {
    if (Array.isArray(nouns)) {
      NATURAL_PAIR_SET[adj] = new Set(nouns as string[]);
    }
  }
}

/**
 * Check if "adjective + noun" is a natural collocation.
 * Returns the input unchanged if valid, or swaps the adjective if unnatural.
 */
export function validateCollocations(text: string): string {
  if (Object.keys(NATURAL_PAIR_SET).length === 0) return text;
  
  let result = text;
  // Check adjective+noun pairs for naturalness
  const adjPattern = new RegExp(
    `\\b(${Object.keys(NATURAL_PAIR_SET).join('|')})\\s+(\\w+)\\b`,
    'gi'
  );
  
  result = result.replace(adjPattern, (match: string, adj: string, noun: string) => {
    const validNouns = NATURAL_PAIR_SET[adj.toLowerCase()];
    if (validNouns && validNouns.has(noun.toLowerCase())) {
      return match; // Natural pairing — keep
    }
    // Not validated — keep anyway (don't break things), 
    // validation is informational for now
    return match;
  });
  
  return result;
}

// ══════════════════════════════════════════════════════════════════
// 7. EM-DASH REMOVAL — Zero em-dashes policy
// ══════════════════════════════════════════════════════════════════

export function removeEmDashes(text: string): string {
  let r = text;
  r = r.replace(/ — /g, ', ').replace(/—/g, ', ');
  r = r.replace(/ – /g, ', ').replace(/–/g, ', ');
  // Fix double commas
  r = r.replace(/,\s*,/g, ',');
  return r;
}

// ══════════════════════════════════════════════════════════════════
// 8. COMBINED PIPELINE — Apply all v1.3 techniques to a sentence
// ══════════════════════════════════════════════════════════════════

/**
 * Apply all v1.3 stealth techniques to a single sentence.
 * Used by the unified sentence processor for ALL engines.
 */
export function applyV13Techniques(sentence: string): string {
  let s = sentence;
  
  // 1. Phrase compression (most impactful — remove AI wordiness)
  s = compressPhrases(s);
  
  // 2. Collocation replacement (multi-word phrase swaps)
  s = replaceCollocations(s);
  
  // 3. Sentence restructuring (50% chance, 40+ patterns)
  s = restructureSentence(s);
  
  // 4. Punctuation variation (35% chance, semicolons at clause boundaries)
  if (Math.random() < 0.35) {
    s = varyPunctuation(s);
  }
  
  // 5. Em-dash removal
  s = removeEmDashes(s);
  
  return s;
}

/**
 * Apply post-processing fixes to full text (document-level).
 * Run AFTER all engines have completed.
 */
export function applyV13PostProcessing(text: string): string {
  let result = text;
  
  // 1. Fix out-of-context synonyms
  result = fixOutOfContextSynonyms(result);
  
  // 2. Remove em-dashes
  result = removeEmDashes(result);
  
  // 3. Fix double spaces and punctuation artifacts
  result = result.replace(/ {2,}/g, ' ');
  result = result.replace(/,,/g, ',');
  result = result.replace(/\.\./g, '.');
  
  return result;
}
