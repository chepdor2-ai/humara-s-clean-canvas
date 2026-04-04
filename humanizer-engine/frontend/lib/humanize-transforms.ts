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
        parts[0] = parts[0] + 's';
        return parts.join(' ');
      });
      return result;
    }
    if (edForm.test(result)) {
      edForm.lastIndex = 0;
      result = result.replace(edForm, () => {
        const pv = pick(phrasals);
        const parts = pv.split(' ');
        parts[0] = parts[0].endsWith('e') ? parts[0] + 'd' : parts[0] + 'ed';
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
// 3. FINAL AI TERM KILL — SCORCHED EARTH
// ══════════════════════════════════════════════════════════════════
// Every word and phrase that AI detectors flag, mapped to natural
// human alternatives. This runs LAST so nothing survives.

const AI_KILL_MAP: Record<string, string[]> = {
  // Top-flagged AI words (GPTZero, Originality, ZeroGPT, Copyleaks)
  delve: ['look closely at', 'dig into', 'examine'],
  delves: ['looks closely at', 'digs into', 'examines'],
  delving: ['looking closely at', 'digging into', 'examining'],
  landscape: ['situation', 'scene', 'lay of the land', 'state of affairs'],
  realm: ['area', 'field', 'territory', 'world'],
  tapestry: ['fabric', 'weave', 'mixture', 'blend'],
  multifaceted: ['many-sided', 'complex', 'varied', 'layered'],
  comprehensive: ['thorough', 'full', 'complete', 'all-around'],
  crucial: ['key', 'central', 'vital', 'pressing'],
  innovative: ['inventive', 'original', 'fresh', 'novel'],
  facilitate: ['make possible', 'smooth the way for', 'help along'],
  facilitates: ['makes possible', 'helps along', 'smooths the way for'],
  facilitating: ['making possible', 'helping along', 'easing'],
  facilitated: ['made possible', 'helped along', 'eased'],
  enhance: ['sharpen', 'strengthen', 'deepen', 'boost'],
  enhances: ['sharpens', 'strengthens', 'deepens', 'boosts'],
  enhancing: ['sharpening', 'strengthening', 'deepening'],
  enhanced: ['sharpened', 'strengthened', 'deepened'],
  optimize: ['refine', 'tune', 'hone', 'fine-tune'],
  optimizes: ['refines', 'tunes', 'hones'],
  optimizing: ['refining', 'tuning', 'honing'],
  optimized: ['refined', 'tuned', 'honed'],
  streamline: ['simplify', 'trim', 'clean up'],
  paradigm: ['model', 'template', 'pattern', 'frame of reference'],
  robust: ['solid', 'hard-wearing', 'dependable', 'sturdy'],
  holistic: ['whole-picture', 'all-round', 'broad-based'],
  synergy: ['combined effect', 'joint force', 'working together'],
  nuanced: ['layered', 'textured', 'fine-grained', 'subtle'],
  leverage: ['draw on', 'make use of', 'rely on'],
  leverages: ['draws on', 'makes use of', 'relies on'],
  leveraging: ['drawing on', 'making use of', 'relying on'],
  leveraged: ['drew on', 'made use of', 'relied on'],
  ecosystem: ['network', 'web', 'fabric', 'setup'],
  scalable: ['expandable', 'flexible', 'elastic', 'growable'],
  utilize: ['use', 'employ', 'make use of'],
  utilizes: ['uses', 'employs', 'makes use of'],
  utilizing: ['using', 'employing', 'making use of'],
  utilized: ['used', 'employed', 'made use of'],
  utilization: ['use', 'employment'],
  impactful: ['forceful', 'telling', 'effective', 'striking'],
  discourse: ['conversation', 'debate', 'exchange', 'talk'],
  pivotal: ['deciding', 'make-or-break', 'turning-point'],
  integral: ['built-in', 'woven-in', 'core', 'central'],
  imperative: ['a must', 'pressing', 'urgent', 'non-negotiable'],
  profound: ['deep', 'sweeping', 'serious', 'thorough'],
  profoundly: ['deeply', 'greatly', 'in a far-reaching way'],
  underscore: ['stress', 'bring home', 'hammer home'],
  underscores: ['stresses', 'brings home', 'hammers home'],
  underscoring: ['stressing', 'bringing home', 'hammering home'],
  underscored: ['stressed', 'brought home', 'hammered home'],
  navigate: ['work through', 'find a way through', 'handle'],
  navigates: ['works through', 'finds a way through', 'handles'],
  navigating: ['working through', 'finding a way through', 'handling'],
  navigated: ['worked through', 'found a way through', 'handled'],
  foster: ['encourage', 'nurture', 'cultivate', 'grow'],
  fosters: ['encourages', 'nurtures', 'cultivates'],
  fostering: ['encouraging', 'nurturing', 'cultivating'],
  fostered: ['encouraged', 'nurtured', 'cultivated'],
  groundbreaking: ['path-breaking', 'original', 'pioneering'],
  'cutting-edge': ['modern', 'up-to-date', 'forward-looking'],
  'state-of-the-art': ['latest', 'modern', 'best available'],
  forefront: ['front', 'leading edge', 'vanguard'],
  'at the forefront': ['at the front', 'in the lead', 'out ahead'],
  endeavor: ['effort', 'undertaking', 'venture', 'project'],
  endeavors: ['efforts', 'undertakings', 'ventures'],
  embark: ['set out', 'begin', 'start on'],
  embarks: ['sets out', 'begins', 'starts on'],
  embarking: ['setting out', 'beginning', 'starting on'],
  embarked: ['set out', 'began', 'started on'],
  intricate: ['involved', 'complicated', 'elaborate', 'detailed'],
  aligns: ['matches', 'fits with', 'goes with'],
  align: ['match', 'fit with', 'go with', 'line up with'],
  aligning: ['matching', 'fitting with', 'lining up with'],
  aligned: ['matched', 'fitted with', 'lined up with'],
  commendable: ['praiseworthy', 'admirable', 'creditable'],
  noteworthy: ['worth noting', 'remarkable', 'striking'],
  meticulously: ['carefully', 'painstakingly', 'with great care'],
  meticulous: ['careful', 'painstaking', 'thorough'],
  encompass: ['cover', 'take in', 'span', 'include'],
  encompasses: ['covers', 'takes in', 'spans', 'includes'],
  encompassing: ['covering', 'taking in', 'spanning'],
  testament: ['proof', 'evidence', 'sign', 'mark'],
  underpinning: ['foundation', 'basis', 'support'],
  underpinnings: ['foundations', 'bases', 'supports'],
  cornerstone: ['foundation stone', 'bedrock', 'base'],
  interplay: ['give-and-take', 'back-and-forth', 'interaction'],
  arguably: ['it could be said', 'by reasonable account', 'in many people\u2019s view'],
  furthermore: ['beyond that', 'on top of that', 'more than that'],
  moreover: ['what is more', 'on top of that', 'adding to that'],
  additionally: ['on top of this', 'besides this', 'in addition to this'],
  consequently: ['as a result', 'because of this', 'following from this'],
  nevertheless: ['even so', 'all the same', 'for all that'],
  notwithstanding: ['in spite of this', 'even considering this'],
  henceforth: ['from this point on', 'from now on'],
  heretofore: ['up to this point', 'until now', 'before this'],
  subsequently: ['after that', 'later on', 'in the time that followed'],
  predominantly: ['mainly', 'for the most part', 'largely'],
  significantly: ['in a real way', 'to a marked degree', 'noticeably'],
  substantially: ['by a good margin', 'to a large extent', 'in no small measure'],
  'it is worth noting': ['one should notice', 'it bears mentioning'],
  'it should be noted': ['it is worth pointing out', 'one ought to be aware'],
  'plays a crucial role': ['is central to', 'matters greatly in'],
  'a wide range of': ['a broad set of', 'many different', 'all manner of'],
  'in order to': ['so as to', 'with the aim of', 'to'],
  'due to the fact that': ['because', 'given that', 'seeing as'],
  'take into account': ['bear in mind', 'keep in mind'],
  'on the other hand': ['then again', 'by contrast', 'looked at differently'],
  'in light of': ['given', 'considering', 'in view of'],
  'with regard to': ['as for', 'concerning', 'when it comes to'],
  'in the context of': ['within', 'as part of', 'in connection with'],
  'it is evident that': ['plainly', 'as can be seen', 'the facts show that'],
  'it is clear that': ['plainly', 'without doubt', 'the record shows that'],
  'a growing body of': ['an increasing amount of', 'more and more'],
  'shed light on': ['throw light on', 'make plain', 'bring clarity to'],
  'pave the way for': ['open the door to', 'clear the path for', 'make room for'],
  'at the end of the day': ['when all is said and done', 'in the final reckoning'],
  'the fact remains': ['the truth stands', 'still the case is'],
  'in today\'s': ['in the present-day', 'in the current'],
  'evolving landscape': ['shifting scene', 'changing situation'],
  'digital age': ['present era', 'current period'],
  'rapidly evolving': ['fast-changing', 'quickly shifting'],
  'ever-changing': ['always shifting', 'perpetually in flux'],
  'interconnected world': ['linked-up world', 'closely tied world'],
  // ── Additional AI-flagged terms ──
  transformative: ['powerful', 'game-changing', 'sweeping'],
  seamlessly: ['smoothly', 'without a hitch', 'easily'],
  seamless: ['smooth', 'effortless', 'trouble-free'],
  empower: ['enable', 'equip', 'support'],
  empowers: ['enables', 'equips', 'supports'],
  empowering: ['enabling', 'equipping', 'supporting'],
  myriad: ['many', 'countless', 'numerous'],
  harness: ['use', 'tap into', 'put to use'],
  harnessing: ['using', 'tapping into', 'putting to use'],
  harnessed: ['used', 'tapped into', 'put to use'],
  plethora: ['wealth', 'abundance', 'wide range'],
  showcase: ['show', 'display', 'present'],
  showcases: ['shows', 'displays', 'presents'],
  showcasing: ['showing', 'displaying', 'presenting'],
  exponentially: ['greatly', 'rapidly', 'by leaps and bounds'],
  inherently: ['naturally', 'by nature', 'at heart'],
  inherent: ['natural', 'built-in', 'inborn'],
  overarching: ['broad', 'wide-ranging', 'general'],
  redefine: ['reshape', 'change', 'rework'],
  redefines: ['reshapes', 'changes', 'reworks'],
  redefining: ['reshaping', 'changing', 'reworking'],
  reimagine: ['rethink', 'reconsider', 'rework'],
  reimagines: ['rethinks', 'reconsiders', 'reworks'],
  reimagining: ['rethinking', 'reconsidering', 'reworking'],
  resonate: ['connect', 'ring true', 'strike a chord'],
  resonates: ['connects', 'rings true', 'strikes a chord'],
  proliferation: ['spread', 'growth', 'increase'],
  mitigate: ['lessen', 'reduce', 'ease'],
  mitigates: ['lessens', 'reduces', 'eases'],
  mitigating: ['lessening', 'reducing', 'easing'],
  burgeoning: ['growing', 'expanding', 'rising'],
  ubiquitous: ['everywhere', 'widespread', 'common'],
  paramount: ['top', 'chief', 'most important'],
  undeniably: ['without doubt', 'certainly', 'clearly'],
  indispensable: ['essential', 'necessary', 'vital'],
  pertinent: ['relevant', 'related', 'to the point'],
  catalyze: ['trigger', 'spark', 'set off'],
  catalyzes: ['triggers', 'sparks', 'sets off'],
  elucidate: ['explain', 'clarify', 'make clear'],
  elucidates: ['explains', 'clarifies', 'makes clear'],
  delineate: ['outline', 'spell out', 'describe'],
  delineates: ['outlines', 'spells out', 'describes'],
  exemplify: ['show', 'illustrate', 'demonstrate'],
  exemplifies: ['shows', 'illustrates', 'demonstrates'],
  efficacy: ['effectiveness', 'power', 'potency'],
  salient: ['key', 'main', 'notable'],
  'serves as a': ['works as a', 'acts as a', 'functions as a'],
  'it is imperative': ['it is necessary', 'it matters', 'it is a must'],
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
