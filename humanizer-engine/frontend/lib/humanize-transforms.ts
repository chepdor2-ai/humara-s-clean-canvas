/**
 * Shared Humanization Transforms
 * ================================
 * Sentence-by-sentence transforms that make text sound like it was written
 * by a pre-1990 human author. Designed to collectively beat all AI detectors.
 *
 * Three layers:
 *   1. Pre-1990 Voice Injection — literary sentence patterns, authorial tone
 *   2. Phrasal Verb & Explanatory Injection — replace formal verbs with
 *      phrasal verbs and add human explanatory padding
 *   3. Final AI Kill — scorched-earth replacement of every remaining
 *      AI-flagged term with natural human alternatives
 *
 * Rules (absolute):
 *   - Zero contractions (expansion enforced)
 *   - Zero first-person unless present in input
 *   - Sentence count must not change
 */

// ══════════════════════════════════════════════════════════════════
// UTILITY
// ══════════════════════════════════════════════════════════════════

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ══════════════════════════════════════════════════════════════════
// 1. PHRASAL VERB INJECTION
// ══════════════════════════════════════════════════════════════════
// Replace academic/formal verbs with phrasal verbs that no AI model uses.
// Phrasal verbs are the hallmark of native human English.

const PHRASAL_VERB_MAP: Record<string, string[]> = {
  // Action verbs
  investigate: ['look into', 'dig into'],
  eliminate: ['get rid of', 'do away with'],
  establish: ['set up', 'put in place'],
  contribute: ['add to', 'chip in to'],
  implement: ['carry out', 'put into practice'],
  distribute: ['hand out', 'pass around'],
  discover: ['come across', 'stumble on'],
  postpone: ['put off', 'hold off on'],
  tolerate: ['put up with', 'live with'],
  evaluate: ['go over', 'think through'],
  resolve: ['sort out', 'work out'],
  compensate: ['make up for'],
  surrender: ['give in', 'give up'],
  continue: ['carry on', 'keep at'],
  abandon: ['give up', 'walk away from'],
  resemble: ['take after', 'look like'],
  recover: ['bounce back', 'pull through'],
  succeed: ['pull off', 'come through'],
  endure: ['go through', 'hold out'],
  decline: ['turn down', 'fall off'],
  reduce: ['cut down', 'scale back', 'bring down'],
  increase: ['step up', 'ramp up', 'build up'],
  support: ['back up', 'stand behind'],
  explain: ['spell out', 'lay out', 'break down'],
  examine: ['go through', 'look over'],
  understand: ['figure out', 'make sense of'],
  overcome: ['get past', 'push through'],
  maintain: ['keep up', 'hold on to'],
  reveal: ['bring to light', 'lay bare'],
  emphasize: ['drive home', 'bring out'],
  indicate: ['point to', 'hint at'],
  address: ['deal with', 'take on'],
  produce: ['put out', 'turn out'],
  constitute: ['make up', 'add up to'],
  deteriorate: ['break down', 'fall apart'],
  summarize: ['sum up', 'wrap up'],
  generate: ['bring about', 'give rise to'],
  initiate: ['kick off', 'set in motion'],
  terminate: ['cut off', 'wind down', 'bring to an end'],
  incorporate: ['build in', 'work in'],
  allocate: ['set aside', 'put aside'],
  accelerate: ['speed up', 'pick up pace'],
  accumulate: ['pile up', 'build up'],
  demonstrate: ['bring out', 'show off'],
  represent: ['stand for', 'amount to'],
  encounter: ['run into', 'come up against'],
  transform: ['turn around', 'shake up'],
  disregard: ['brush off', 'look past'],
  replicate: ['copy', 'mirror'],
  approximate: ['come close to', 'come near to'],
  necessitate: ['call for', 'bring about the need for'],
  differentiate: ['tell apart', 'set apart'],
  conceptualize: ['think of', 'picture'],
  operationalize: ['put to work', 'make workable'],
};

// ── Pre-compiled phrasal verb patterns (built once at module load) ──
interface PhrasalVerbEntry {
  phrasals: string[];
  base: RegExp;
  sForm: RegExp;
  edForm: RegExp;
  ingForm: RegExp;
}

const COMPILED_PHRASAL_VERBS: PhrasalVerbEntry[] = Object.entries(PHRASAL_VERB_MAP).map(
  ([formal, phrasals]) => ({
    phrasals,
    base: new RegExp(`\\b${escRx(formal)}\\b`, 'gi'),
    sForm: new RegExp(`\\b${escRx(formal)}s\\b`, 'gi'),
    edForm: new RegExp(`\\b${escRx(formal)}(?:ed|d)\\b`, 'gi'),
    ingForm: new RegExp(`\\b${escRx(formal.replace(/e$/, ''))}ing\\b`, 'gi'),
  })
);

/**
 * Inject phrasal verbs into a sentence, replacing formal verbs.
 * Probability ~40% per match — moderate replacement.
 */
export function injectPhrasalVerbs(sentence: string): string {
  let result = sentence;
  for (const entry of COMPILED_PHRASAL_VERBS) {
    // At most one phrasal verb swap per sentence
    if (Math.random() >= 0.40) continue;

    // Try each tense form
    const { phrasals, base, sForm, edForm, ingForm } = entry;

    if (base.test(result)) {
      base.lastIndex = 0;
      result = result.replace(base, () => pick(phrasals));
      return result;
    }
    if (sForm.test(result)) {
      sForm.lastIndex = 0;
      result = result.replace(sForm, () => {
        const pv = pick(phrasals);
        const parts = pv.split(' ');
        // Proper third-person conjugation: consonant+y → ies, sibilant → es
        const verb = parts[0];
        if (/[^aeiou]y$/i.test(verb)) {
          parts[0] = verb.slice(0, -1) + 'ies';
        } else if (/[sxz]$/i.test(verb) || /[sc]h$/i.test(verb)) {
          parts[0] = verb + 'es';
        } else {
          parts[0] = verb + 's';
        }
        return parts.join(' ');
      });
      return result;
    }
    if (edForm.test(result)) {
      edForm.lastIndex = 0;
      result = result.replace(edForm, () => {
        const pv = pick(phrasals);
        const parts = pv.split(' ');
        const verb = parts[0];
        // Handle irregular verbs
        const IRREG: Record<string, string> = { deal: 'dealt', carry: 'carried', put: 'put', cut: 'cut', set: 'set', get: 'got', keep: 'kept', hold: 'held', run: 'ran', go: 'went', come: 'came', take: 'took', give: 'gave', find: 'found', think: 'thought', bring: 'brought', buy: 'bought', catch: 'caught', fight: 'fought', seek: 'sought', teach: 'taught', lay: 'laid', pay: 'paid', say: 'said', send: 'sent', spend: 'spent', build: 'built', lend: 'lent', lose: 'lost', sit: 'sat', stand: 'stood', stick: 'stuck', tell: 'told', sell: 'sold', win: 'won', begin: 'began', break: 'broke', choose: 'chose', drive: 'drove', fall: 'fell', grow: 'grew', know: 'knew', rise: 'rose', speak: 'spoke', throw: 'threw', write: 'wrote', draw: 'drew' };
        if (IRREG[verb.toLowerCase()]) {
          parts[0] = IRREG[verb.toLowerCase()];
        } else if (verb.endsWith('e')) {
          parts[0] = verb + 'd';
        } else if (/[^aeiou]y$/i.test(verb)) {
          parts[0] = verb.slice(0, -1) + 'ied';
        } else {
          parts[0] = verb + 'ed';
        }
        return parts.join(' ');
      });
      return result;
    }
    if (ingForm.test(result)) {
      ingForm.lastIndex = 0;
      result = result.replace(ingForm, () => {
        const pv = pick(phrasals);
        const parts = pv.split(' ');
        parts[0] = parts[0].replace(/e$/, '') + 'ing';
        return parts.join(' ');
      });
      return result;
    }
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// 2. PRE-1990 ACADEMIC RESTRUCTURING
// ══════════════════════════════════════════════════════════════════
// Restructure and rephrase sentences to read like pre-1990 academic
// prose. Focus on REWRITING — clause reordering, voice changes,
// word-level substitution — not phrase injection. Probabilistic:
// ~55% of sentences get restructured, others pass through unchanged.

// ── Word-level synonyms (ONLY genuinely informal/slangy → academic) ──
// Kept minimal: do NOT replace common human words like about, also,
// before, after, now, get, make, thing, etc. Those are natural.
const ACADEMIC_SYNONYMS: [RegExp, string[]][] = [
  [/\bimportant\b/gi, ['significant', 'key', 'central']],
  [/\bbig\b/gi, ['considerable', 'substantial']],
  [/\blot(?:s)? of\b/gi, ['many', 'numerous', 'plenty of']],
  [/\bkind of\b/gi, ['somewhat', 'rather']],
  [/\bsort of\b/gi, ['to a degree', 'rather']],
];

// ── Clause reordering patterns ────────────────────────────────
// Move subordinate clauses to the front or restructure sentence order.

function reorderClauses(sentence: string): string {
  // Pattern: "X verb Y because/since/as Z." → "Because/Since Z, X verb Y."
  const causalMatch = sentence.match(/^(.{15,}?)\s+(because|since|as)\s+(.{10,}?)\.?\s*$/i);
  if (causalMatch && Math.random() < 0.50) {
    const [, main, conj, reason] = causalMatch;
    const conjCap = conj.charAt(0).toUpperCase() + conj.slice(1);
    return `${conjCap} ${reason.trim()}, ${main.charAt(0).toLowerCase() + main.slice(1).trim()}.`;
  }

  // Pattern: "X, which/that Y, verb Z." → front the relative clause
  // "When X, Y" stays as is — but "Y when X" → "When X, Y"
  const whenMatch = sentence.match(/^(.{10,}?)\s+(when|while|after|before|once|until)\s+(.{8,}?)\.?\s*$/i);
  if (whenMatch && Math.random() < 0.45) {
    const [, main, conj, sub] = whenMatch;
    const conjCap = conj.charAt(0).toUpperCase() + conj.slice(1);
    return `${conjCap} ${sub.trim()}, ${main.charAt(0).toLowerCase() + main.slice(1).trim()}.`;
  }

  // Pattern: "If X, Y" → "Y, provided that X" (inversion)
  const ifMatch = sentence.match(/^If\s+(.{8,?}),\s*(.{10,}?)\.?\s*$/i);
  if (ifMatch && Math.random() < 0.40) {
    const [, condition, result] = ifMatch;
    return `${result.trim()}, provided that ${condition.trim()}.`;
  }

  return sentence;
}

// ── Voice transformation (active ↔ academic passive) ──────────
function transformVoice(sentence: string): string {
  // "X verb Y" patterns → passive academic form (~30%)
  // e.g. "Researchers found evidence" → "Evidence was found by researchers"
  // Only simple SVO with short subjects
  const svoMatch = sentence.match(/^(The\s+\w+|[A-Z]\w+)\s+(found|noted|observed|reported|identified|confirmed|revealed|suggested|proposed|described|examined|analysed|analyzed)\s+(.{5,}?)\.?\s*$/i);
  if (svoMatch && Math.random() < 0.30) {
    const [, subj, verb, obj] = svoMatch;
    const pastPart = verb.endsWith('ed') ? verb : verb + 'ed';
    return `${obj.charAt(0).toUpperCase() + obj.slice(1).trim()} was ${pastPart} by ${subj.toLowerCase().trim()}.`;
  }

  return sentence;
}

// ── Structural rewrite patterns ─────────────────────────────────
// These rephrase common AI-sounding sentence structures into
// pre-1990 academic prose. Applied probabilistically.

const STRUCTURAL_REWRITES: [RegExp, string[]][] = [
  [/^There\s+(is|are)\s+(.+)/i, [
    '$2 $1 present',
    '$2 exists',
    '$2 remains',
  ]],
  [/\bcan be\b/gi, ['may be', 'is apt to be', 'proves to be']],
  [/\bplays?\s+(?:a|an)\s+(?:key|important|significant|major|central|vital)?\s*role\b/gi, [
    'figures prominently',
    'bears upon the matter',
    'carries weight',
    'holds a position of importance',
  ]],
  [/^(?:In conclusion|To (?:summarize|sum up|conclude)|Overall|All in all),?\s*/i, [
    'On the whole, ',
    'Taken together, ',
    'In sum, ',
    'Viewed as a whole, ',
  ]],
  [/^This is because\b/i, [
    'This comes down to the fact that',
    'The reason is that',
    'This is so because',
  ]],
  [/\b(has|have)\s+become\b/gi, [
    '$1 grown to be',
    '$1 come to serve as',
    '$1 developed into',
  ]],
  [/\bneeds?\s+to\s+be\b/gi, ['ought to be', 'must be', 'requires to be']],
  [/\bis\s+(?:considered|regarded|viewed|seen)\s+(?:as|to be)\b/gi, [
    'is generally held to be',
    'is commonly taken to be',
    'is widely recognised as',
  ]],
  [/\ba (?:number|variety|range) of\b/gi, ['several', 'numerous', 'a considerable number of']],
  [/^However,?\s*/i, ['Nevertheless, ', 'Yet, ', 'That said, ', 'Even so, ']],
  [/^Although\b/i, ['Though', 'Whilst', 'Even though']],
  [/\bshould\b/gi, ['ought to', 'would do well to']],
  [/^(?:For example|For instance),?\s*/i, [
    'By way of example, ',
    'To illustrate, ',
    'As a case in point, ',
  ]],
  [/\b(?:leads?\s+to|results?\s+in)\b/gi, ['gives rise to', 'brings about', 'occasions']],
  [/\bbased on\b/gi, ['grounded in', 'built upon', 'drawn from']],
  [/\bin order to\b/gi, ['so as to', 'with the aim of', 'for the purpose of']],
  [/\bas well as\b/gi, ['together with', 'alongside', 'in addition to']],
  [/\bdue to\b/gi, ['owing to', 'on account of', 'by reason of']],
  [/\bfocus(?:es|ed)? on\b/gi, ['attend to', 'centre upon', 'direct attention to']],
  [/\bin terms of\b/gi, ['with respect to', 'as regards', 'concerning']],
  [/\bimpact(?:s)? on\b/gi, ['bear upon', 'affect', 'influence']],
];

// ── AI-pattern direct replacements (always applied) ─────────
const AI_PATTERN_REPLACEMENTS: [RegExp, string[]][] = [
  [/\bThis (?:shows|demonstrates|proves|indicates)\b/i, [
    'This reveals', 'This makes evident', 'This confirms',
  ]],
  [/\bIt is (?:important|crucial|essential|vital|critical) to (?:note|recognize|understand|consider)\b/i, [
    'One ought to recognise', 'It warrants attention that',
    'It is necessary to observe',
  ]],
  [/\bIn (?:recent years|the modern era|contemporary times|today's world)\b/i, [
    'In the present circumstances', 'As matters now stand',
    'Under prevailing conditions',
  ]],
  [/\b(?:Additionally|Furthermore|Moreover)\b/i, [
    'Equally', 'In addition', 'Beyond this',
  ]],
  [/\b(?:significantly|substantially|dramatically)\b/gi, [
    'considerably', 'appreciably', 'markedly',
  ]],
  [/\bkey\s+(?:factor|element|component|aspect)\b/gi, [
    'principal element', 'chief factor', 'decisive consideration',
  ]],
];

/**
 * Restructure a sentence to read as pre-1990 academic prose.
 * Probabilistic: ~55% of eligible sentences get restructured.
 * Focus is on rewriting, not injecting new phrases.
 */
export function injectPre1990Voice(sentence: string): string {
  const words = sentence.split(/\s+/);
  let result = sentence;

  // Skip very short sentences (< 5 words)
  if (words.length < 5) return result;

  // ── Only restructure ~40% of sentences ──
  if (Math.random() > 0.40) {
    // Even non-restructured sentences get AI pattern replacements
    for (const [pattern, alts] of AI_PATTERN_REPLACEMENTS) {
      if (pattern.test(result)) {
        result = result.replace(pattern, pick(alts));
      }
    }
    return result;
  }

  // ── Step 1: Clause reordering (~50% when applicable) ──
  const reordered = reorderClauses(result);
  if (reordered !== result) {
    result = reordered;
  }

  // ── Step 2: Structural rewrites (first matching pattern) ──
  for (const [pattern, alts] of STRUCTURAL_REWRITES) {
    if (pattern.test(result)) {
      result = result.replace(pattern, pick(alts));
      break; // One structural rewrite per sentence
    }
  }

  // ── Step 3: Voice transformation (~30%) ──
  result = transformVoice(result);

  // ── Step 4: Word-level academic synonyms (at most 2 per sentence) ──
  let synonymSwaps = 0;
  for (const [rx, alts] of ACADEMIC_SYNONYMS) {
    if (synonymSwaps >= 2) break;
    if (rx.test(result) && Math.random() < 0.35) {
      result = result.replace(rx, () => pick(alts));
      synonymSwaps++;
    }
  }

  // ── Step 5: AI pattern replacements (always) ──
  for (const [pattern, alts] of AI_PATTERN_REPLACEMENTS) {
    if (pattern.test(result)) {
      result = result.replace(pattern, pick(alts));
    }
  }

  return result;
}


// ══════════════════════════════════════════════════════════════════
// 3. FINAL AI TERM KILL — TARGETED ACADEMIC REGISTER
// ══════════════════════════════════════════════════════════════════
// Only replaces genuinely AI-specific vocabulary (buzzwords, clichés,
// and hype words). Standard academic vocabulary (comprehensive,
// crucial, facilitate, furthermore, etc.) is PRESERVED — these are
// normal in pre-2000 scholarly writing. All alternatives are formal
// academic register.

const AI_KILL_MAP: Record<string, string[]> = {
  // ── Genuinely AI-specific words (not found in pre-2000 papers) ──
  delve: ['examine', 'investigate', 'explore'],
  delves: ['examines', 'investigates', 'explores'],
  delving: ['examining', 'investigating', 'exploring'],
  landscape: ['environment', 'context', 'field'],
  tapestry: ['composition', 'fabric', 'structure'],
  multifaceted: ['complex', 'varied', 'manifold'],
  ecosystem: ['network', 'system', 'framework'],
  synergy: ['collaboration', 'combined effect', 'interaction'],
  holistic: ['integrated', 'unified', 'comprehensive'],
  seamlessly: ['effectively', 'readily', 'without difficulty'],
  seamless: ['smooth', 'effective', 'uninterrupted'],
  transformative: ['significant', 'substantial', 'far-reaching'],
  empower: ['enable', 'equip', 'prepare'],
  empowers: ['enables', 'equips', 'prepares'],
  empowering: ['enabling', 'equipping', 'preparing'],
  myriad: ['numerous', 'many', 'a range of'],
  harness: ['employ', 'apply', 'draw upon'],
  harnessing: ['employing', 'applying', 'drawing upon'],
  harnessed: ['employed', 'applied', 'drawn upon'],
  plethora: ['abundance', 'range', 'variety'],
  showcase: ['demonstrate', 'illustrate', 'present'],
  showcases: ['demonstrates', 'illustrates', 'presents'],
  showcasing: ['demonstrating', 'illustrating', 'presenting'],
  exponentially: ['considerably', 'markedly', 'substantially'],
  reimagine: ['reconceptualize', 'reformulate', 'reconsider'],
  reimagines: ['reconceptualizes', 'reformulates', 'reconsiders'],
  reimagining: ['reconceptualizing', 'reformulating', 'reconsidering'],
  redefine: ['reformulate', 'reconceptualize', 'reshape'],
  redefines: ['reformulates', 'reconceptualizes', 'reshapes'],
  redefining: ['reformulating', 'reconceptualizing', 'reshaping'],
  resonate: ['correspond', 'accord', 'align'],
  resonates: ['corresponds', 'accords', 'aligns'],
  burgeoning: ['expanding', 'growing', 'developing'],
  ubiquitous: ['widespread', 'prevalent', 'pervasive'],
  impactful: ['consequential', 'significant', 'effective'],
  groundbreaking: ['pioneering', 'original', 'novel'],
  'cutting-edge': ['advanced', 'current', 'recent'],
  'state-of-the-art': ['current', 'advanced', 'modern'],
  forefront: ['vanguard', 'leading position', 'front'],
  'at the forefront': ['at the leading edge', 'in the vanguard', 'among the first'],
  cornerstone: ['foundation', 'basis', 'core element'],
  interplay: ['interaction', 'relationship', 'dynamic'],
  testament: ['evidence', 'indication', 'proof'],
  arguably: ['one may contend', 'it may be argued', 'conceivably'],
  proliferation: ['spread', 'growth', 'expansion'],
  catalyze: ['initiate', 'precipitate', 'prompt'],
  catalyzes: ['initiates', 'precipitates', 'prompts'],
  overarching: ['broad', 'encompassing', 'general'],

  // ── AI-specific phrases ──
  'it is worth noting': ['one may observe', 'it bears mention'],
  'it should be noted': ['it is relevant to observe', 'attention is drawn to the fact'],
  'plays a crucial role': ['figures centrally in', 'is integral to'],
  'plays a significant role': ['contributes meaningfully to', 'is central to'],
  'plays a vital role': ['is essential to', 'is instrumental in'],
  'a wide range of': ['a broad array of', 'various', 'diverse'],
  'due to the fact that': ['because', 'given that', 'since'],
  'in light of': ['given', 'considering', 'in view of'],
  'in today\'s': ['in the present', 'in the contemporary'],
  'evolving landscape': ['changing context', 'shifting environment'],
  'digital age': ['contemporary period', 'present era'],
  'rapidly evolving': ['swiftly developing', 'fast-changing'],
  'interconnected world': ['connected environment', 'linked context'],
  'a growing body of': ['accumulating', 'an expanding literature of'],
  'shed light on': ['illuminate', 'clarify', 'elucidate'],
  'pave the way for': ['create conditions for', 'establish grounds for'],
  'at the end of the day': ['ultimately', 'in the final analysis'],
  'serves as a': ['functions as a', 'operates as a', 'acts as a'],
  'it is imperative': ['it is essential', 'it is necessary', 'it remains critical'],
};

// ── Pre-compiled AI kill patterns (built once at module load) ──
interface AIKillEntry {
  rx: RegExp;
  alts: string[];
  isPhrase: boolean;
}

const COMPILED_AI_KILL_PHRASES: AIKillEntry[] = Object.keys(AI_KILL_MAP)
  .filter(k => k.includes(' ') || k.includes('-'))
  .sort((a, b) => b.length - a.length)
  .map(k => ({ rx: new RegExp(`\\b${escRx(k)}\\b`, 'gi'), alts: AI_KILL_MAP[k], isPhrase: true }));

const COMPILED_AI_KILL_WORDS: AIKillEntry[] = Object.keys(AI_KILL_MAP)
  .filter(k => !k.includes(' ') && !k.includes('-'))
  .map(k => ({ rx: new RegExp(`\\b${escRx(k)}\\b`, 'gi'), alts: AI_KILL_MAP[k], isPhrase: false }));

/**
 * Final AI term kill — replaces every remaining flagged word/phrase.
 * Applied to every sentence unconditionally.
 */
export function finalAIKill(sentence: string): string {
  let result = sentence;

  // Apply multi-word phrases first (longest first)
  for (const { rx, alts } of COMPILED_AI_KILL_PHRASES) {
    rx.lastIndex = 0;
    if (rx.test(result)) {
      rx.lastIndex = 0;
      result = result.replace(rx, () => pick(alts));
    }
  }

  // Then single words
  for (const { rx, alts } of COMPILED_AI_KILL_WORDS) {
    rx.lastIndex = 0;
    if (rx.test(result)) {
      rx.lastIndex = 0;
      result = result.replace(rx, (match) => {
        const replacement = pick(alts);
        if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
          return replacement[0].toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
    }
  }

  return result;
}


// ══════════════════════════════════════════════════════════════════
// 4. SENTENCE-LEVEL REPHRASING
// ══════════════════════════════════════════════════════════════════
// Targets weak adverbs and flat transitions. Replaces them with
// concise academic equivalents (no word-count inflation).

const ADVERB_REWRITES: [RegExp, string[]][] = [
  [/\bvery\s+important\b/gi, ['significant', 'consequential']],
  [/\bvery\s+difficult\b/gi, ['demanding', 'arduous']],
  [/\bvery\s+effective\b/gi, ['highly effective', 'potent']],
  [/\bvery\s+common\b/gi, ['widespread', 'prevalent']],
  [/\bvery\s+useful\b/gi, ['valuable', 'serviceable']],
  [/\bvery\s+clear\b/gi, ['unmistakable', 'evident']],
  [/\bvery\s+different\b/gi, ['markedly different', 'distinct']],
  [/\bvery\s+large\b/gi, ['substantial', 'considerable']],
  [/\bvery\s+small\b/gi, ['negligible', 'slight']],
  [/\bvery\b/gi, ['quite', 'notably', 'considerably']],
  [/\breally\b/gi, ['genuinely', 'truly']],
  [/\bbasically\b/gi, ['in essence', 'fundamentally']],
  [/\bdefinitely\b/gi, ['assuredly', 'without question']],
  [/\bclearly\b/gi, ['plainly', 'evidently']],
  [/\bobviously\b/gi, ['evidently', 'manifestly']],
  [/\bactually\b/gi, ['in fact', 'indeed']],
  [/\bcurrently\b/gi, ['at present', 'presently']],
  [/\bultimately\b/gi, ['in the end', 'finally']],
  [/\beffectively\b/gi, ['in practice', 'in effect']],
  [/\bessentially\b/gi, ['at its core', 'in substance']],
];

// Transition rewrites — keep same length, change wording
const TRANSITION_REWRITES: [RegExp, string[]][] = [
  [/^And\b/i, ['In addition,', 'Equally,']],
  [/^But\b/i, ['Yet', 'Still,']],
  [/^So\b/i, ['Accordingly,', 'Thus,']],
  [/^Also,?\s*/i, ['Likewise, ', 'Similarly, ']],
  [/^Therefore,?\s*/i, ['Accordingly, ', 'Hence, ']],
  [/^Thus,?\s*/i, ['Consequently, ', 'Accordingly, ']],
  [/^Meanwhile,?\s*/i, ['Concurrently, ', 'In parallel, ']],
];

/**
 * Sentence-level rephrasing. Targets weak adverbs and flat
 * transitions. Replaces with concise academic equivalents.
 * At most 1 adverb + 1 transition per sentence.
 */
export function aggressiveRephrase(sentence: string): string {
  let result = sentence;

  // Adverb replacement — at most one per sentence (~50%)
  for (const [rx, alts] of ADVERB_REWRITES) {
    if (rx.test(result) && Math.random() < 0.50) {
      result = result.replace(rx, () => pick(alts));
      break; // One adverb swap per sentence
    }
  }

  // Transition rewrite (~60%)
  for (const [rx, alts] of TRANSITION_REWRITES) {
    if (rx.test(result) && Math.random() < 0.60) {
      result = result.replace(rx, pick(alts));
      break;
    }
  }

  return result;
}


// ══════════════════════════════════════════════════════════════════
// 5. CONTRACTION EXPANSION (absolute — zero tolerance)
// ══════════════════════════════════════════════════════════════════

const CONTRACTIONS: [RegExp, string][] = [
  [/\bI'm\b/g, 'I am'], [/\bI've\b/g, 'I have'], [/\bI'll\b/g, 'I will'], [/\bI'd\b/g, 'I would'],
  [/\bdon't\b/gi, 'do not'], [/\bdoesn't\b/gi, 'does not'], [/\bdidn't\b/gi, 'did not'],
  [/\bisn't\b/gi, 'is not'], [/\baren't\b/gi, 'are not'],
  [/\bwasn't\b/gi, 'was not'], [/\bweren't\b/gi, 'were not'],
  [/\bwon't\b/gi, 'will not'], [/\bwouldn't\b/gi, 'would not'],
  [/\bcouldn't\b/gi, 'could not'], [/\bshouldn't\b/gi, 'should not'],
  [/\bcan't\b/gi, 'cannot'], [/\bhaven't\b/gi, 'have not'],
  [/\bhasn't\b/gi, 'has not'], [/\bhadn't\b/gi, 'had not'],
  [/\bmustn't\b/gi, 'must not'], [/\bneedn't\b/gi, 'need not'],
  [/\bit's\b/gi, 'it is'], [/\bthat's\b/gi, 'that is'],
  [/\bthere's\b/gi, 'there is'], [/\bthere're\b/gi, 'there are'],
  [/\bthey're\b/gi, 'they are'], [/\bthey've\b/gi, 'they have'],
  [/\bthey'll\b/gi, 'they will'], [/\bwe're\b/gi, 'we are'],
  [/\bwe've\b/gi, 'we have'], [/\bwe'll\b/gi, 'we will'],
  [/\byou're\b/gi, 'you are'], [/\byou've\b/gi, 'you have'],
  [/\byou'll\b/gi, 'you will'], [/\bhe's\b/gi, 'he is'],
  [/\bshe's\b/gi, 'she is'], [/\bwho's\b/gi, 'who is'],
  [/\bwhat's\b/gi, 'what is'], [/\bwhere's\b/gi, 'where is'],
  [/\bhow's\b/gi, 'how is'], [/\bwhen's\b/gi, 'when is'],
  [/\bhere's\b/gi, 'here is'], [/\blet's\b/gi, 'let us'],
  [/\bhe'll\b/gi, 'he will'], [/\bshe'll\b/gi, 'she will'],
];

export function expandContractions(sentence: string): string {
  let result = sentence;
  for (const [pattern, replacement] of CONTRACTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// 5. FIRST-PERSON GUARD
// ══════════════════════════════════════════════════════════════════

export function guardFirstPerson(sentence: string, inputHadFirstPerson: boolean): string {
  if (inputHadFirstPerson) return sentence;

  let result = sentence;
  // Replace first-person with impersonal constructions
  result = result
    .replace(/\b(I|We)\s+(argue|believe|contend|maintain|submit|find|show|suggest|note|observe|propose|assert|claim|hold)\b/g,
      (_m, _p, verb) => `The analysis ${verb}s`)
    .replace(/\bWe\b/g, 'The analysis')
    .replace(/\bwe\b/g, 'the analysis')
    .replace(/\bOur\b/g, 'The')
    .replace(/\bour\b/g, 'the')
    .replace(/\bUs\b/g, 'The analysis')
    .replace(/\bus\b/g, 'the analysis');
  return result;
}


// ══════════════════════════════════════════════════════════════════
// 6. MASTER HUMANIZATION PIPELINE (per-sentence)
// ══════════════════════════════════════════════════════════════════

/**
 * Apply the full humanization pipeline to a single sentence.
 * This is the main export used by both engines.
 *
 * Approach: restructure and rephrase, not inject phrases.
 * Probabilistic — not every sentence is rewritten, but when
 * rewritten the tone is pre-1990 academic without contractions,
 * first person, or colloquial insertions.
 *
 * Order of operations:
 *   1. Pre-1990 academic restructuring (~40% of sentences — light
 *      clause reordering, voice changes, minimal synonym swaps)
 *   2. Phrasal verb swap (~40% chance, at most 1 per sentence)
 *   3. Adverb/transition clean-up (concise replacements)
 *   4. Contraction expansion (zero tolerance)
 *   5. First-person guard
 *   6. AI term replacement (LAST — catches ALL remaining flagged words)
 *   7. Punctuation cleanup
 */
export function humanizeSentence(sentence: string, inputHadFirstPerson: boolean): string {
  if (!sentence || sentence.trim().length < 5) return sentence;

  let s = sentence;

  // Layer 1: Pre-1990 restructuring (probabilistic inside)
  s = injectPre1990Voice(s);

  // Layer 2: Phrasal verb swap (max 1, ~40%)
  s = injectPhrasalVerbs(s);

  // Layer 3: Adverb/transition cleanup
  s = aggressiveRephrase(s);

  // Layer 4: Contraction expansion
  s = expandContractions(s);

  // Layer 5: First-person guard
  s = guardFirstPerson(s, inputHadFirstPerson);

  // Layer 6: AI term kill (LAST — catches everything after all transforms)
  s = finalAIKill(s);

  // Layer 6: Cleanup
  s = s.replace(/ {2,}/g, ' ').trim();
  // Fix capitalization after sentence-ending punctuation
  s = s.replace(/([.!?])\s+([a-z])/g, (_m, p, l) => `${p} ${l.toUpperCase()}`);
  // Capitalize first letter
  if (s.length > 0 && /[a-z]/.test(s[0])) {
    s = s[0].toUpperCase() + s.slice(1);
  }
  // Fix a/an agreement
  s = s.replace(/\b(a|an)\s+(\w+)/gi, (_match, article, word) => {
    const vowelStart = /^[aeiou]/i.test(word) && !/^(uni|one|once|use[ds]?|usu|ura|eur)/i.test(word);
    const hStart = /^(hour|honest|honor|heir|herb)/i.test(word);
    const shouldBeAn = vowelStart || hStart;
    const correct = shouldBeAn ? 'an' : 'a';
    const final = /^A/.test(article) ? correct.charAt(0).toUpperCase() + correct.slice(1) : correct;
    return `${final} ${word}`;
  });
  // Fix double prepositions
  s = s.replace(/\b(of|to|in|for|on|at|by|with|from|as|is|the|a|an) \1\b/gi, '$1');

  return s;
}
