/**
 * Composite Dictionary Service — Massive Lexical & Phrase Datastore
 * ==================================================================
 * Provides enriched word and phrase lookups by combining:
 *   1. PPDB paraphrases (loaded from generated JSON)
 *   2. Extended dictionary (ECDICT-derived, loaded from generated JSON)
 *   3. WordNet synonyms (built-in semantic network)
 *   4. Existing shared-dictionaries from the humanizer engine
 *
 * Fallback order: PPDB -> Extended Dict -> WordNet -> Shared Dictionaries
 *
 * The Python generator scripts populate the JSON data files.
 * This module loads them lazily with LRU caching for O(1) lookups.
 *
 * NO contractions. NO first person. NO rhetorical questions.
 */

import type { DictionaryEntry, PhrasePair } from './types';
import { AI_WORD_REPLACEMENTS } from '../shared-dictionaries';
import * as fs from 'fs';
import * as path from 'path';

/* ── LRU Cache ────────────────────────────────────────────────────── */

class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 50000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, val);
    }
    return val;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }
}

/* ── Built-in WordNet Semantic Network ────────────────────────────── */

const WORDNET_SYNONYMS: Record<string, string[]> = {
  // Core academic/formal words with natural alternatives
  important: ['significant', 'key', 'central', 'critical', 'major', 'vital'],
  significant: ['meaningful', 'notable', 'marked', 'substantial', 'real'],
  demonstrate: ['show', 'reveal', 'prove', 'display', 'illustrate'],
  establish: ['set up', 'create', 'build', 'form', 'found'],
  implement: ['carry out', 'apply', 'put into practice', 'execute', 'introduce'],
  analyze: ['examine', 'study', 'look at', 'break down', 'review'],
  evaluate: ['assess', 'judge', 'measure', 'weigh', 'rate', 'appraise'],
  contribute: ['add', 'help', 'give', 'play a part in', 'assist with'],
  achieve: ['reach', 'gain', 'earn', 'secure', 'accomplish', 'attain'],
  maintain: ['keep', 'hold', 'preserve', 'sustain', 'continue'],
  provide: ['give', 'offer', 'supply', 'deliver', 'present'],
  require: ['need', 'demand', 'call for', 'depend on'],
  consider: ['think about', 'look at', 'weigh', 'examine', 'review'],
  indicate: ['show', 'suggest', 'point to', 'signal', 'reveal'],
  approach: ['method', 'way', 'strategy', 'technique', 'path'],
  determine: ['find', 'decide', 'figure out', 'identify', 'establish'],
  influence: ['affect', 'shape', 'impact', 'change', 'alter'],
  develop: ['create', 'build', 'grow', 'form', 'produce', 'design'],
  address: ['deal with', 'handle', 'tackle', 'respond to', 'work on'],
  enhance: ['improve', 'boost', 'strengthen', 'raise', 'lift'],
  ensure: ['make sure', 'guarantee', 'confirm', 'verify', 'secure'],
  obtain: ['get', 'gain', 'acquire', 'secure', 'earn'],
  occur: ['happen', 'take place', 'come about', 'come up', 'emerge'],
  perceive: ['see', 'view', 'notice', 'sense', 'recognize'],
  possess: ['have', 'hold', 'own', 'carry', 'bear'],
  promote: ['support', 'advance', 'encourage', 'foster', 'push for'],
  reveal: ['show', 'uncover', 'expose', 'bring to light', 'disclose'],
  select: ['choose', 'pick', 'opt for', 'decide on'],
  sufficient: ['enough', 'adequate', 'ample', 'plenty of'],
  transform: ['change', 'shift', 'convert', 'reshape', 'alter'],
  various: ['different', 'several', 'diverse', 'multiple', 'assorted'],
  complex: ['complicated', 'intricate', 'involved', 'detailed', 'layered'],
  effective: ['successful', 'strong', 'productive', 'useful', 'powerful'],
  essential: ['necessary', 'vital', 'key', 'critical', 'needed'],
  fundamental: ['basic', 'core', 'central', 'primary', 'underlying'],
  initial: ['first', 'early', 'opening', 'starting', 'original'],
  primary: ['main', 'chief', 'key', 'central', 'leading'],
  relevant: ['related', 'applicable', 'pertinent', 'connected', 'fitting'],
  specific: ['particular', 'exact', 'precise', 'definite', 'certain'],
  substantial: ['large', 'considerable', 'major', 'significant', 'real'],
  traditional: ['conventional', 'classic', 'customary', 'standard', 'usual'],
  // Verbs
  acquire: ['get', 'gain', 'obtain', 'pick up', 'earn'],
  adapt: ['adjust', 'change', 'modify', 'tailor', 'reshape'],
  allocate: ['assign', 'distribute', 'set aside', 'give out'],
  anticipate: ['expect', 'predict', 'foresee', 'look forward to'],
  advocate: ['support', 'back', 'promote', 'push for', 'champion'],
  clarify: ['explain', 'clear up', 'spell out', 'make plain'],
  collaborate: ['work together', 'cooperate', 'partner', 'team up'],
  compile: ['gather', 'collect', 'assemble', 'put together'],
  comprise: ['include', 'contain', 'consist of', 'make up'],
  conclude: ['finish', 'end', 'wrap up', 'close', 'decide'],
  constitute: ['make up', 'form', 'represent', 'compose'],
  depict: ['show', 'portray', 'describe', 'illustrate', 'present'],
  diminish: ['reduce', 'lessen', 'decrease', 'shrink', 'weaken'],
  eliminate: ['remove', 'get rid of', 'cut out', 'do away with'],
  emerge: ['appear', 'surface', 'come out', 'develop', 'show up'],
  emphasize: ['stress', 'highlight', 'underline', 'focus on', 'point out'],
  encounter: ['meet', 'face', 'come across', 'run into', 'find'],
  exhibit: ['show', 'display', 'demonstrate', 'present', 'reveal'],
  generate: ['create', 'produce', 'make', 'yield', 'bring about'],
  illustrate: ['show', 'demonstrate', 'highlight', 'make clear', 'depict'],
  incorporate: ['include', 'add', 'blend in', 'integrate', 'mix in'],
  integrate: ['combine', 'merge', 'blend', 'unify', 'bring together'],
  interpret: ['read', 'understand', 'explain', 'make sense of', 'decode'],
  investigate: ['look into', 'examine', 'explore', 'study', 'research'],
  justify: ['defend', 'support', 'explain', 'back up', 'account for'],
  maximize: ['increase', 'boost', 'make the most of', 'optimize'],
  minimize: ['reduce', 'lessen', 'cut down', 'limit', 'shrink'],
  modify: ['change', 'adjust', 'alter', 'tweak', 'revise'],
  monitor: ['watch', 'track', 'check', 'observe', 'keep an eye on'],
  navigate: ['find a way through', 'steer', 'work through', 'handle'],
  negotiate: ['discuss', 'work out', 'bargain', 'settle', 'arrange'],
  participate: ['take part', 'join in', 'be involved', 'engage'],
  persist: ['continue', 'carry on', 'last', 'endure', 'remain'],
  prioritize: ['rank', 'focus on', 'put first', 'favor', 'give weight to'],
  regulate: ['control', 'manage', 'govern', 'oversee', 'direct'],
  resolve: ['settle', 'fix', 'sort out', 'clear up', 'work out'],
  restore: ['bring back', 'return', 'rebuild', 'repair', 'renew'],
  sustain: ['keep up', 'maintain', 'support', 'continue', 'uphold'],
  // Nouns
  aspect: ['part', 'side', 'element', 'feature', 'dimension'],
  component: ['part', 'piece', 'element', 'section', 'unit'],
  concept: ['idea', 'notion', 'thought', 'principle', 'theory'],
  consequence: ['result', 'outcome', 'effect', 'impact'],
  constraint: ['limit', 'restriction', 'barrier', 'obstacle'],
  context: ['setting', 'background', 'situation', 'circumstances'],
  criteria: ['standards', 'measures', 'benchmarks', 'requirements'],
  dimension: ['aspect', 'side', 'element', 'part', 'facet'],
  domain: ['area', 'field', 'realm', 'sphere', 'sector'],
  element: ['part', 'piece', 'component', 'factor', 'feature'],
  emphasis: ['focus', 'stress', 'weight', 'attention', 'priority'],
  environment: ['setting', 'surroundings', 'conditions', 'context'],
  evidence: ['proof', 'data', 'support', 'facts', 'backing'],
  factor: ['element', 'cause', 'reason', 'part', 'component'],
  implication: ['effect', 'consequence', 'result', 'meaning'],
  mechanism: ['process', 'method', 'system', 'means', 'way'],
  objective: ['goal', 'aim', 'target', 'purpose', 'end'],
  outcome: ['result', 'consequence', 'effect', 'product'],
  parameter: ['limit', 'boundary', 'setting', 'guideline'],
  perspective: ['view', 'angle', 'standpoint', 'outlook', 'take'],
  phenomenon: ['event', 'occurrence', 'trend', 'pattern', 'development'],
  potential: ['possibility', 'promise', 'capacity', 'chance', 'ability'],
  principle: ['rule', 'law', 'standard', 'guideline', 'foundation'],
  procedure: ['process', 'method', 'steps', 'routine', 'practice'],
  proportion: ['share', 'part', 'fraction', 'ratio', 'amount'],
  resource: ['source', 'supply', 'asset', 'tool', 'means'],
  strategy: ['plan', 'approach', 'method', 'tactic', 'scheme'],
  structure: ['framework', 'setup', 'system', 'arrangement', 'form'],
  technique: ['method', 'approach', 'skill', 'practice', 'way'],
  tendency: ['trend', 'pattern', 'lean', 'inclination', 'habit'],
  variable: ['factor', 'element', 'condition', 'aspect'],
};

/* ── Built-in Phrase Paraphrases (PPDB-style) ─────────────────────── */

const PHRASE_PARAPHRASES: Record<string, string[]> = {
  'in order to': ['to', 'so as to', 'for the purpose of'],
  'due to the fact that': ['because', 'since', 'as', 'given that'],
  'a large number of': ['many', 'numerous', 'a great deal of', 'plenty of'],
  'in the event that': ['if', 'should', 'in case'],
  'on the other hand': ['by contrast', 'then again', 'alternatively', 'conversely'],
  'as a result': ['so', 'thus', 'because of this', 'for that reason'],
  'in addition': ['also', 'besides', 'on top of that', 'further'],
  'for example': ['for instance', 'such as', 'to illustrate', 'as an example'],
  'in terms of': ['regarding', 'when it comes to', 'as for', 'concerning'],
  'with regard to': ['about', 'regarding', 'concerning', 'on the topic of'],
  'it is important to note that': ['notably', 'a key point is that', 'one should recognize that'],
  'it should be noted that': ['notably', 'worth noting:', 'an important detail is that'],
  'it is worth mentioning': ['a relevant point is', 'one should note', 'significantly'],
  'as a consequence': ['as a result', 'in turn', 'because of this', 'consequently'],
  'in the context of': ['within', 'in', 'regarding', 'concerning'],
  'on the basis of': ['based on', 'from', 'drawing on', 'using'],
  'at the same time': ['simultaneously', 'concurrently'],
  'with respect to': ['about', 'regarding', 'concerning', 'on'],
  'in spite of': ['despite', 'even with', 'regardless of', 'notwithstanding'],
  'by means of': ['through', 'using', 'via', 'with the help of'],
  'in accordance with': ['following', 'per', 'in line with', 'consistent with'],
  'for the purpose of': ['to', 'for', 'in order to', 'aimed at'],
  'in the case of': ['for', 'with', 'regarding', 'when it comes to'],
  'prior to': ['before', 'ahead of', 'preceding', 'in advance of'],
  'subsequent to': ['after', 'following', 'once'],
  'in contrast to': ['unlike', 'as opposed to', 'compared with', 'differing from'],
  'as well as': ['and', 'along with', 'together with', 'plus'],
  'a wide range of': ['many', 'various', 'diverse', 'all kinds of'],
  'take into account': ['consider', 'factor in', 'keep in mind', 'allow for'],
  'take into consideration': ['consider', 'think about', 'bear in mind'],
  'play a role in': ['affect', 'shape', 'influence', 'contribute to'],
  'play a significant role': ['matter greatly', 'carry heavy weight', 'strongly influence'],
  'have an impact on': ['affect', 'influence', 'change', 'shape'],
  'is associated with': ['relates to', 'links to', 'connects to', 'goes with'],
  'is characterized by': ['features', 'involves', 'shows', 'includes'],
  'is comprised of': ['contains', 'includes', 'consists of', 'is made up of'],
  'in light of': ['given', 'considering', 'because of', 'as a result of'],
  'to a large extent': ['largely', 'mostly', 'in great part', 'to a great degree'],
  'to a certain extent': ['partly', 'somewhat', 'in some ways', 'up to a point'],
  'a number of': ['several', 'some', 'a few', 'multiple'],
  'the majority of': ['most', 'nearly all', 'the bulk of', 'the greater part of'],
  'the fact that': ['that', 'how'],
  'it is clear that': ['clearly', 'plainly', 'obviously'],
  'it is evident that': ['evidently', 'clearly', 'as shown'],
  'it can be seen that': ['this shows', 'the data shows', 'one can see'],
  'there is no doubt that': ['certainly', 'without question', 'undeniably'],
  'it has been shown that': ['research shows', 'studies confirm', 'evidence indicates'],
  'is of great importance': ['matters greatly', 'carries weight', 'is critical'],
  'is of particular interest': ['stands out', 'draws attention', 'deserves focus'],
  'at this point in time': ['now', 'currently', 'at present', 'today'],
  'at the present time': ['now', 'currently', 'these days', 'at present'],
  'in the near future': ['soon', 'shortly', 'before long', 'in time'],
  'over the course of': ['during', 'throughout', 'across', 'over'],
  'give rise to': ['cause', 'lead to', 'produce', 'create'],
  'shed light on': ['explain', 'clarify', 'reveal', 'illuminate'],
  'pave the way for': ['enable', 'open doors for', 'set the stage for', 'make possible'],
  'bring about': ['cause', 'create', 'trigger', 'produce'],
  'carry out': ['do', 'perform', 'conduct', 'execute'],
  'come to terms with': ['accept', 'deal with', 'adjust to', 'face'],
  'put forward': ['propose', 'suggest', 'present', 'introduce'],
  'set forth': ['present', 'describe', 'outline', 'lay out'],
  'point out': ['note', 'mention', 'highlight', 'observe'],
  'stem from': ['come from', 'arise from', 'grow out of', 'result from'],
  'account for': ['explain', 'justify', 'represent', 'make up'],
  'lend itself to': ['suit', 'fit', 'work well for', 'be suited to'],
  'stand out': ['distinguish', 'be notable', 'be remarkable', 'excel'],
  'fall short of': ['miss', 'not reach', 'fail to meet', 'lag behind'],
  'keep pace with': ['match', 'stay level with', 'keep up with'],
  'run counter to': ['oppose', 'conflict with', 'go against', 'contradict'],
};

/* ── Extended Dictionary Loader ──────────────────────────────────── */

let extendedDict: Map<string, DictionaryEntry> | null = null;
let ppdbPhrases: Map<string, PhrasePair[]> | null = null;
const lookupCache = new LRUCache<string, DictionaryEntry>(100000);
const phraseCache = new LRUCache<string, string[]>(50000);

function getDataPath(filename: string): string {
  return path.join(process.cwd(), 'data', 'stealth', filename);
}

function loadExtendedDict(): Map<string, DictionaryEntry> {
  if (extendedDict) return extendedDict;
  extendedDict = new Map();
  try {
    const filePath = getDataPath('extended_dictionary.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data: Record<string, DictionaryEntry> = JSON.parse(raw);
      for (const [word, entry] of Object.entries(data)) {
        extendedDict.set(word.toLowerCase(), entry);
      }
      console.log(`[Stealth Dict] Loaded ${extendedDict.size} extended dictionary entries`);
    }
  } catch {
    console.warn('[Stealth Dict] Extended dictionary not found — using built-in WordNet only');
  }
  return extendedDict;
}

function loadPPDB(): Map<string, PhrasePair[]> {
  if (ppdbPhrases) return ppdbPhrases;
  ppdbPhrases = new Map();
  try {
    const filePath = getDataPath('ppdb_phrases.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data: Record<string, PhrasePair[]> = JSON.parse(raw);
      for (const [phrase, pairs] of Object.entries(data)) {
        ppdbPhrases.set(phrase.toLowerCase(), pairs);
      }
      console.log(`[Stealth Dict] Loaded ${ppdbPhrases.size} PPDB phrase entries`);
    }
  } catch {
    console.warn('[Stealth Dict] PPDB phrases not found — using built-in phrase paraphrases only');
  }
  return ppdbPhrases;
}

/* ── Composite Dictionary Service (Public API) ───────────────────── */

/**
 * Get synonyms for a word. Checks PPDB -> Extended Dict -> WordNet -> Shared Dicts.
 */
export function getSynonyms(word: string): string[] {
  const key = word.toLowerCase();

  // Check cache
  if (phraseCache.has(key)) return phraseCache.get(key) ?? [];

  const results: Set<string> = new Set();

  // Layer 1: PPDB phrase paraphrases (if word is part of a phrase)
  const ppdb = loadPPDB();
  const ppdbEntry = ppdb.get(key);
  if (ppdbEntry) {
    for (const pair of ppdbEntry) {
      results.add(pair.target);
    }
  }

  // Layer 2: Extended dictionary
  const dict = loadExtendedDict();
  const dictEntry = dict.get(key);
  if (dictEntry) {
    for (const syn of dictEntry.synonyms) {
      results.add(syn);
    }
  }

  // Layer 3: Built-in WordNet
  const wordnetEntry = WORDNET_SYNONYMS[key];
  if (wordnetEntry) {
    for (const syn of wordnetEntry) {
      results.add(syn);
    }
  }

  // Layer 4: Shared dictionaries (AI_WORD_REPLACEMENTS)
  const sharedEntry = AI_WORD_REPLACEMENTS[key];
  if (sharedEntry) {
    for (const syn of sharedEntry) {
      results.add(syn);
    }
  }

  const arr = Array.from(results);
  phraseCache.set(key, arr);
  return arr;
}

/**
 * Get phrase paraphrases. Checks PPDB -> built-in phrase library.
 */
export function getParaphrases(phrase: string): string[] {
  const key = phrase.toLowerCase();
  if (phraseCache.has(`phrase:${key}`)) return phraseCache.get(`phrase:${key}`) ?? [];

  const results: Set<string> = new Set();

  // Layer 1: PPDB
  const ppdb = loadPPDB();
  const ppdbEntry = ppdb.get(key);
  if (ppdbEntry) {
    for (const pair of ppdbEntry) {
      results.add(pair.target);
    }
  }

  // Layer 2: Built-in phrase paraphrases
  const builtIn = PHRASE_PARAPHRASES[key];
  if (builtIn) {
    for (const p of builtIn) {
      results.add(p);
    }
  }

  const arr = Array.from(results);
  phraseCache.set(`phrase:${key}`, arr);
  return arr;
}

/**
 * Enrich a word/phrase with full dictionary data.
 */
export function enrichPhrase(phrase: string): DictionaryEntry | null {
  const key = phrase.toLowerCase();
  if (lookupCache.has(key)) return lookupCache.get(key) ?? null;

  const dict = loadExtendedDict();
  const dictEntry = dict.get(key);
  if (dictEntry) {
    lookupCache.set(key, dictEntry);
    return dictEntry;
  }

  // Build from WordNet
  const synonyms = getSynonyms(key);
  if (synonyms.length > 0) {
    const entry: DictionaryEntry = {
      word: key,
      pos: 'unknown',
      synonyms,
      paraphrases: getParaphrases(key),
      definition: '',
      frequency: 0.5,
      examples: [],
    };
    lookupCache.set(key, entry);
    return entry;
  }

  return null;
}

/**
 * Check if a word exists in any dictionary.
 */
export function isKnownWord(word: string): boolean {
  const key = word.toLowerCase();
  if (WORDNET_SYNONYMS[key]) return true;
  if (AI_WORD_REPLACEMENTS[key]) return true;
  const dict = loadExtendedDict();
  if (dict.has(key)) return true;
  return false;
}

/**
 * Get part of speech for a word.
 */
export function getPartOfSpeech(word: string): string {
  const key = word.toLowerCase();
  const dict = loadExtendedDict();
  const entry = dict.get(key);
  if (entry) return entry.pos;
  return 'unknown';
}

/**
 * Get best contextual replacement for a word given surrounding text.
 */
export function getBestReplacement(word: string, context: string): string | null {
  const synonyms = getSynonyms(word);
  if (synonyms.length === 0) return null;

  // Extended blacklist for contextually wrong WordNet senses
  const CONTEXT_BLACKLIST = new Set([
    'breeding', 'rearing', 'upbringing', 'infirmary', 'infirmaries',
    'asylum', 'asylums', 'clinic', 'clinics', 'dwelling', 'hut',
    'shanty', 'hovel', 'pedagogue', 'pedagogues', 'schoolmaster',
    'picture', 'painting', 'scenery', 'vista', 'panorama',
    'trim', 'prune', 'shave', 'clip', 'chop', 'snip', 'lop',
    'handle', 'handles', 'knob', 'grip', 'lever', 'crank',
    'budge', 'nudge', 'shove', 'haul', 'tow', 'drag',
    'breed', 'mate', 'spawn', 'hatch', 'sow', 'reap',
    'wield', 'brandish', 'clasp', 'clutch',
    'folk', 'kin', 'tribe', 'clan', 'mob', 'gang', 'bunch', 'pack',
    'lad', 'lass', 'chap', 'bloke', 'dude', 'guy', 'gal',
    'wee', 'tiny', 'itty', 'puny', 'dinky', 'teeny',
    'nifty', 'groovy', 'swell', 'dandy', 'peachy',
    'slay', 'smite', 'sever', 'cleave', 'hack', 'slash',
    'homo', 'hominid', 'mortal', 'soul', 'mod', 'waterway',
    'indoctrinate', 'brainwash', 'proselytize', 'sufferer', 'quieten',
    'hush', 'muffle', 'stifle', 'squelch', 'quash', 'quell',
    'lie', 'fib', 'falsehood', 'untruth', 'deceive',
    'construction', 'constructions', 'edifice', 'scaffold', 'scaffolding',
    'movement', 'movements', 'motion', 'locomotion', 'gesture',
    'environs', 'surroundings', 'locale', 'premises', 'precinct',
    'motif', 'motifs', 'ornament', 'embellishment', 'adornment',
    'persons', 'beings', 'creatures', 'mortals', 'souls',
    'immense', 'colossal', 'gargantuan', 'mammoth', 'titanic',
    'formula', 'formulas', 'recipe', 'recipes', 'concoction',
    'pastime', 'hobby', 'recreation',
    'anxiety', 'angst', 'distress', 'anguish',
    'specify', 'specified', 'specifyed', 'designate',
    // Catastrophic wrong-sense outputs found in testing
    'yangtze', 'yangtzes', 'botany', 'botanical', 'flora',
    'leash', 'quartet', 'trio', 'duet', 'solo', 'quintet',
    'capital', 'capitol', 'seasoned', 'molded', 'moulded',
    'happening', 'happenings', 'occurrence', 'occurrences',
    'argument', 'quarrel', 'feud', 'spat', 'brawl',
    'orient', 'oriental', 'occident', 'occidental',
    'stream', 'streams', 'creek', 'brook', 'rivulet', 'tributary',
    'rendering', 'renderings', 'rendition', 'portrayal', 'depiction',
    'outline', 'contour', 'silhouette', 'profile',
    'abundances', 'abundance', 'bounty', 'plethora', 'cornucopia',
    'meagreness', 'meagerness', 'scarcity', 'dearth', 'paucity',
    'entity', 'entities', 'organism', 'specimen',
    'poorness', 'richness', 'affluence',
    'renovation', 'refurbishment',
    'communal', 'communals',
    'aid', 'aided', 'aiding',
    'possible', 'probable', 'feasible', // wrong when replacing nouns
    'likely', 'prospective',
    'place', 'spot',
    // Extended dict wrong-sense outputs (found in paragraph testing)
    'severeness', 'severity', 'entrench', 'entrenched', 'entrenchment',
    'veteran', 'veterans', 'measured', 'unmeasured',
    'supplied', 'lent', 'brought', 'fortune', 'fortunes',
    'institution', 'institutions', 'fields',
    'variances', 'variance', 'ocean', 'oceans',
    'consignment', 'consignments', 'stated', 'pecuniary',
  ]);

  // Quality filtering: reject garbled or inappropriate synonyms
  const filtered = synonyms.filter(syn => {
    // Must be at least 2 characters
    if (syn.length < 2) return false;
    // Must be purely alphabetic (no apostrophes, numbers, special chars)
    // Allow hyphens inside words only
    if (!/^[a-zA-Z]+(?:-[a-zA-Z]+)*$/.test(syn)) return false;
    // Reject if too different in length (more than 2x longer/shorter)
    if (syn.length > word.length * 2 || syn.length < Math.max(2, word.length / 2.5)) return false;
    // Reject common garble patterns (repeated chars)
    if (/(.)\1{2,}/.test(syn)) return false;
    // Reject the input word itself
    if (syn.toLowerCase() === word.toLowerCase()) return false;
    // Reject single char words
    if (syn.trim().length < 2) return false;
    // Reject context blacklist
    if (CONTEXT_BLACKLIST.has(syn.toLowerCase())) return false;
    return true;
  });

  if (filtered.length === 0) return null;

  // Simple contextual scoring: prefer single words of similar length
  const scored = filtered.map(syn => ({
    word: syn,
    score: (Math.abs(syn.length - word.length) <= 3 ? 1.5 : 0) +  // Similar length
      (syn.includes('-') ? -0.3 : 0.3) +   // Slight preference for non-hyphenated
      (syn.length <= 12 ? 0.3 : 0) +         // Prefer reasonable length
      (Math.random() * 0.2),                  // Small randomness for variety
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.word ?? null;
}

export {
  WORDNET_SYNONYMS,
  PHRASE_PARAPHRASES,
  LRUCache,
};
