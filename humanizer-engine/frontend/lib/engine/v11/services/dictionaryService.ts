/**
 * V1.1 Dictionary Service
 * ========================
 * Loads and serves mega dictionaries (synonyms, AI kill words, phrase
 * transforms, connectors, sentence starters).
 *
 * Dictionaries are bundled as JSON in v11/data/. Falls back to empty
 * maps if not yet generated.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ---- Inline fallback dictionaries (used until Python-generated files are in place) ----

const FALLBACK_SYNONYMS: Record<string, string[]> = {
  utilize: ['use', 'employ', 'apply', 'leverage'],
  demonstrate: ['show', 'prove', 'reveal', 'display'],
  facilitate: ['help', 'enable', 'ease', 'support'],
  implement: ['carry out', 'execute', 'apply', 'put in place'],
  enhance: ['improve', 'boost', 'strengthen', 'upgrade'],
  significantly: ['greatly', 'notably', 'considerably', 'meaningfully'],
  comprehensive: ['thorough', 'complete', 'extensive', 'wide-ranging'],
  innovative: ['creative', 'novel', 'original', 'fresh'],
  leverage: ['use', 'harness', 'exploit', 'tap into'],
  optimize: ['improve', 'refine', 'fine-tune', 'streamline'],
  moreover: ['also', 'besides', 'on top of that', 'what is more'],
  furthermore: ['also', 'in addition', 'besides', 'equally'],
  consequently: ['as a result', 'therefore', 'so', 'because of this'],
  nevertheless: ['still', 'even so', 'regardless', 'all the same'],
  subsequently: ['later', 'afterward', 'then', 'next'],
  paramount: ['crucial', 'vital', 'key', 'critical'],
  exemplify: ['illustrate', 'show', 'typify', 'represent'],
  elucidate: ['clarify', 'explain', 'shed light on', 'spell out'],
  paradigm: ['model', 'framework', 'pattern', 'example'],
  multifaceted: ['complex', 'varied', 'diverse', 'many-sided'],
  underscore: ['highlight', 'stress', 'emphasize', 'bring out'],
  necessitate: ['require', 'demand', 'call for', 'make necessary'],
  encompass: ['include', 'cover', 'contain', 'span'],
  substantiate: ['support', 'back up', 'confirm', 'verify'],
  perpetuate: ['continue', 'maintain', 'sustain', 'keep alive'],
  juxtapose: ['compare', 'contrast', 'set side by side', 'place alongside'],
  mitigate: ['reduce', 'lessen', 'ease', 'soften'],
  propagate: ['spread', 'promote', 'disseminate', 'advance'],
  catalyze: ['trigger', 'spark', 'drive', 'start'],
  exacerbate: ['worsen', 'aggravate', 'intensify', 'magnify'],
  delineate: ['outline', 'describe', 'define', 'map out'],
  ascertain: ['find out', 'determine', 'discover', 'establish'],
  proliferate: ['spread', 'multiply', 'increase', 'expand'],
  amalgamate: ['combine', 'merge', 'blend', 'unite'],
  dichotomy: ['divide', 'split', 'contrast', 'gap'],
  inherently: ['naturally', 'by nature', 'fundamentally', 'at its core'],
  intrinsically: ['naturally', 'by nature', 'essentially', 'at heart'],
  methodology: ['method', 'approach', 'technique', 'process'],
  predominantly: ['mainly', 'mostly', 'largely', 'chiefly'],
  overarching: ['broad', 'overall', 'sweeping', 'main'],
  trajectory: ['path', 'course', 'direction', 'trend'],
  navigate: ['steer through', 'work through', 'handle', 'manage'],
  landscape: ['scene', 'setting', 'field', 'terrain'],
  robust: ['strong', 'solid', 'sturdy', 'reliable'],
  holistic: ['complete', 'whole', 'total', 'all-round'],
  synergy: ['teamwork', 'cooperation', 'harmony', 'union'],
  nuanced: ['subtle', 'detailed', 'fine', 'delicate'],
  articulate: ['express', 'voice', 'state', 'convey'],
  imperative: ['essential', 'vital', 'crucial', 'necessary'],
  profound: ['deep', 'intense', 'far-reaching', 'significant'],
  pivotal: ['crucial', 'key', 'central', 'critical'],
  integral: ['essential', 'key', 'core', 'vital'],
  dynamic: ['active', 'changing', 'lively', 'fluid'],
  realm: ['area', 'field', 'domain', 'sphere'],
  foster: ['encourage', 'promote', 'nurture', 'support'],
  delve: ['dig into', 'explore', 'examine', 'look into'],
  crucial: ['key', 'important', 'vital', 'critical'],
  essential: ['key', 'needed', 'important', 'vital'],
  various: ['different', 'several', 'many', 'a range of'],
  additionally: ['also', 'plus', 'as well', 'on top of that'],
  however: ['but', 'yet', 'still', 'on the other hand'],
  therefore: ['so', 'for this reason', 'as a result', 'thus'],
  specifically: ['in particular', 'namely', 'to be exact', 'precisely'],
  ultimately: ['in the end', 'finally', 'eventually', 'at last'],
  particularly: ['especially', 'notably', 'above all', 'in particular'],
  effectively: ['well', 'successfully', 'capably', 'efficiently'],
  continuously: ['always', 'nonstop', 'steadily', 'without pause'],
  consistently: ['always', 'reliably', 'steadily', 'regularly'],
  increasingly: ['more and more', 'ever more', 'steadily'],
  extremely: ['very', 'highly', 'hugely', 'remarkably'],
  absolutely: ['completely', 'totally', 'entirely', 'fully'],
  undeniably: ['clearly', 'certainly', 'without doubt', 'plainly'],
  inevitably: ['unavoidably', 'surely', 'naturally', 'of course'],
  remarkable: ['notable', 'striking', 'impressive', 'outstanding'],
  substantial: ['large', 'sizable', 'major', 'considerable'],
  fundamental: ['basic', 'core', 'central', 'primary'],
  exceptional: ['outstanding', 'superb', 'excellent', 'rare'],
  commendable: ['praiseworthy', 'admirable', 'laudable', 'worthy'],
  noteworthy: ['notable', 'significant', 'important', 'worth mentioning'],
  evident: ['clear', 'obvious', 'plain', 'apparent'],
  apparent: ['clear', 'obvious', 'evident', 'visible'],
  prominent: ['leading', 'major', 'notable', 'well-known'],
  commence: ['begin', 'start', 'launch', 'kick off'],
  conclude: ['end', 'finish', 'wrap up', 'close'],
  acquire: ['get', 'obtain', 'gain', 'pick up'],
  endeavor: ['try', 'attempt', 'effort', 'strive'],
  acknowledge: ['admit', 'recognize', 'accept', 'concede'],
  establish: ['set up', 'create', 'build', 'found'],
  generate: ['create', 'produce', 'make', 'bring about'],
  allocate: ['assign', 'distribute', 'set aside', 'devote'],
  evaluate: ['assess', 'judge', 'review', 'appraise'],
  contribute: ['add', 'provide', 'give', 'supply'],
  incorporate: ['include', 'add', 'blend in', 'integrate'],
  transform: ['change', 'alter', 'reshape', 'convert'],
  indicate: ['show', 'suggest', 'point to', 'signal'],
  sufficient: ['enough', 'adequate', 'ample', 'satisfactory'],
  adequate: ['enough', 'sufficient', 'acceptable', 'suitable'],
  appropriate: ['suitable', 'fitting', 'proper', 'right'],
  subsequent: ['later', 'following', 'next', 'ensuing'],
  preliminary: ['initial', 'early', 'first', 'opening'],
  potential: ['possible', 'likely', 'prospective', 'viable'],
  significant: ['major', 'important', 'notable', 'meaningful'],
  relevant: ['related', 'applicable', 'pertinent', 'connected'],
  considerable: ['large', 'major', 'substantial', 'sizable'],
  conventional: ['traditional', 'standard', 'usual', 'typical'],
  contemporary: ['modern', 'current', 'present-day', 'recent'],
  perspective: ['view', 'outlook', 'angle', 'standpoint'],
  initiative: ['plan', 'effort', 'project', 'move'],
  framework: ['structure', 'system', 'model', 'setup'],
  mechanism: ['process', 'system', 'method', 'means'],
  phenomenon: ['event', 'occurrence', 'trend', 'pattern'],
  component: ['part', 'element', 'piece', 'section'],
  dimension: ['aspect', 'side', 'angle', 'facet'],
  discourse: ['discussion', 'debate', 'talk', 'dialogue'],
  scrutiny: ['examination', 'review', 'inspection', 'study'],
  rationale: ['reason', 'logic', 'basis', 'grounds'],
  implication: ['effect', 'consequence', 'result', 'outcome'],
  constraint: ['limit', 'restriction', 'barrier', 'boundary'],
  disparity: ['gap', 'difference', 'inequality', 'imbalance'],
  coherent: ['logical', 'clear', 'consistent', 'unified'],
  empirical: ['observed', 'tested', 'practical', 'evidence-based'],
  tangible: ['real', 'concrete', 'solid', 'physical'],
  viable: ['workable', 'feasible', 'practical', 'realistic'],
  conducive: ['helpful', 'favorable', 'supportive', 'good for'],
  detrimental: ['harmful', 'damaging', 'negative', 'hurtful'],
  ubiquitous: ['widespread', 'everywhere', 'common', 'pervasive'],
  expedite: ['speed up', 'hasten', 'accelerate', 'fast-track'],
  augment: ['increase', 'boost', 'add to', 'supplement'],
  diminish: ['reduce', 'lessen', 'decrease', 'shrink'],
  permeate: ['spread through', 'fill', 'penetrate', 'infuse'],
  cultivate: ['develop', 'grow', 'build', 'nurture'],
  alleviate: ['ease', 'relieve', 'reduce', 'lighten'],
};

const FALLBACK_AI_KILLS: Record<string, string[]> = {
  'it is important to note that': ['keep in mind that', 'worth noting,', 'one thing to note:'],
  'in today\'s world': ['these days', 'right now', 'at present'],
  'it is worth noting that': ['notably,', 'it bears mention that', 'one key detail:'],
  'it is worth noting': ['notably,', 'it bears mention that', 'one point of note:'],
  'plays a crucial role': ['matters a lot', 'is key', 'really counts'],
  'in order to': ['to', 'so as to', 'for'],
  'due to the fact that': ['because', 'since', 'as'],
  'a wide range of': ['many', 'lots of', 'a variety of'],
  'on the other hand': ['then again', 'alternatively', 'that said'],
  'it is essential to': ['you need to', 'it\'s key to', 'make sure to'],
  'in the realm of': ['in', 'within', 'inside'],
  'it goes without saying': ['obviously', 'clearly', 'of course'],
  'first and foremost': ['first', 'above all', 'to begin with'],
  'serves as a': ['works as a', 'acts as a', 'is a'],
  'at the end of the day': ['ultimately', 'in the end', 'when it comes down to it'],
  'when it comes to': ['regarding', 'for', 'with'],
  'a plethora of': ['many', 'plenty of', 'a wealth of'],
  'the fact that': ['that', 'how', ''],
  'in light of': ['given', 'considering', 'because of'],
  'with respect to': ['about', 'regarding', 'on'],
  'as a matter of fact': ['actually', 'in fact', 'really'],
  'for the purpose of': ['to', 'for', 'in order to'],
  'in the context of': ['in', 'within', 'during'],
  'take into consideration': ['consider', 'think about', 'weigh'],
  'a myriad of': ['many', 'countless', 'lots of'],
  'in conjunction with': ['with', 'alongside', 'together with'],
  'with regard to': ['about', 'regarding', 'concerning'],
  'it should be noted that': ['note that', 'notably', 'keep in mind'],
  'in this day and age': ['today', 'now', 'these days'],
  'by and large': ['mostly', 'generally', 'on the whole'],
  'needless to say': ['obviously', 'clearly', 'of course'],
  'it can be argued that': ['arguably', 'some say', 'one could say'],
  'in the grand scheme of things': ['overall', 'in the big picture', 'all things considered'],
  'lends itself to': ['suits', 'fits', 'works well for'],
  'paves the way for': ['opens the door for', 'leads to', 'makes room for'],
  'sheds light on': ['explains', 'clarifies', 'reveals'],
  'stands as a testament to': ['proves', 'shows', 'demonstrates'],
  'strikes a balance between': ['balances', 'sits between', 'combines'],
  'lies at the heart of': ['is central to', 'is key to', 'drives'],
  'comes to the forefront': ['stands out', 'emerges', 'takes center stage'],
  'raises the question': ['makes you wonder', 'begs the question', 'brings up'],
};

const FALLBACK_PHRASE_TRANSFORMS: Record<string, string[]> = {
  'in conclusion': ['to sum up', 'all in all', 'in short'],
  'for instance': ['for example', 'like', 'say'],
  'as a result': ['so', 'because of this', 'consequently'],
  'on the contrary': ['in contrast', 'instead', 'but actually'],
  'in addition': ['also', 'plus', 'besides'],
  'as well as': ['and', 'along with', 'together with'],
  'in terms of': ['regarding', 'when it comes to', 'for'],
  'at this point': ['now', 'currently', 'right now'],
  'to a great extent': ['largely', 'mostly', 'a lot'],
  'more often than not': ['usually', 'typically', 'most of the time'],
  'as opposed to': ['unlike', 'rather than', 'instead of'],
  'to a certain degree': ['somewhat', 'partly', 'in a way'],
  'for the most part': ['mostly', 'generally', 'largely'],
  'all things considered': ['overall', 'in the end', 'on balance'],
  'to put it simply': ['simply put', 'in plain terms', 'basically'],
  'in other words': ['that is', 'meaning', 'put differently'],
  'as a whole': ['overall', 'generally', 'altogether'],
  'in the long run': ['eventually', 'over time', 'down the road'],
  'at the same time': ['meanwhile', 'simultaneously', 'also'],
  'to some extent': ['partly', 'somewhat', 'in some ways'],
};

const FALLBACK_CONNECTORS: Record<string, string[]> = {
  'Additionally': ['Also', 'Plus', 'Besides', 'On top of that'],
  'Furthermore': ['Moreover', 'In addition', 'What\'s more', 'Besides'],
  'However': ['But', 'Yet', 'Still', 'That said'],
  'Therefore': ['So', 'Thus', 'As a result', 'For this reason'],
  'Moreover': ['Also', 'Besides', 'In addition', 'What\'s more'],
  'Nevertheless': ['Still', 'Even so', 'Regardless', 'All the same'],
  'Consequently': ['As a result', 'So', 'Therefore', 'Because of this'],
  'Subsequently': ['Later', 'Afterward', 'Then', 'Next'],
  'Meanwhile': ['At the same time', 'In the meantime', 'Simultaneously'],
  'Nonetheless': ['Still', 'Even so', 'Yet', 'Regardless'],
  'Accordingly': ['So', 'Therefore', 'As a result', 'Consequently'],
  'Conversely': ['On the other hand', 'In contrast', 'Then again'],
  'Ultimately': ['In the end', 'Finally', 'Eventually'],
  'Notably': ['In particular', 'Especially', 'Particularly'],
  'Essentially': ['Basically', 'At its core', 'Fundamentally'],
  'Undoubtedly': ['Without a doubt', 'Certainly', 'Clearly'],
  'Evidently': ['Clearly', 'Obviously', 'Apparently'],
  'Inevitably': ['Unavoidably', 'Naturally', 'Of course'],
  'Admittedly': ['Granted', 'True', 'To be fair'],
  'Interestingly': ['Curiously', 'Surprisingly', 'Oddly enough'],
};

const FALLBACK_STARTERS: string[] = [
  'That said,', 'In practice,',
  'From a practical standpoint,', 'One point is clear:',
  'To put it another way,', 'At its core,', 'At first glance,',
  'On closer inspection,',
  'Worth mentioning is that', 'One key point here is that',
  'What stands out is that', 'Looking deeper,', 'To be fair,',
  'In many ways,', 'Broadly speaking,', 'In short,',
  'More to the point,', 'With that in mind,',
  'Taking a step back,', 'Speaking practically,',
];

// ---- Dynamic dictionary loading ----

let _synonyms: Record<string, string[]> | null = null;
let _aiKills: Record<string, string[]> | null = null;
let _phraseTransforms: Record<string, string[]> | null = null;
let _connectors: Record<string, string[]> | null = null;
let _starters: string[] | null = null;

async function tryLoadJSON<T>(path: string, fallback: T): Promise<T> {
  const candidates = [
    // When running from humanizer-engine/frontend as cwd (Render start/build scripts do this)
    join(/* turbopackIgnore: true */ process.cwd(), 'lib', 'engine', 'v11', 'data', path),
    // When running from repo root as cwd
    join(/* turbopackIgnore: true */ process.cwd(), 'humanizer-engine', 'frontend', 'lib', 'engine', 'v11', 'data', path),
  ];

  for (const fullPath of candidates) {
    if (!existsSync(fullPath)) continue;
    try {
      return JSON.parse(readFileSync(fullPath, 'utf-8')) as T;
    } catch {
      // ignore and fall back
    }
  }

  return fallback;
}

async function ensureLoaded() {
  if (_synonyms) return;
  [_synonyms, _aiKills, _phraseTransforms, _connectors, _starters] = await Promise.all([
    tryLoadJSON('mega_synonyms.json', FALLBACK_SYNONYMS),
    tryLoadJSON('ai_vocabulary_kill.json', FALLBACK_AI_KILLS),
    tryLoadJSON('phrase_transforms.json', FALLBACK_PHRASE_TRANSFORMS),
    tryLoadJSON('connector_alternatives.json', FALLBACK_CONNECTORS),
    tryLoadJSON('sentence_starters.json', FALLBACK_STARTERS),
  ]);
}

export async function getSynonyms(word: string): Promise<string[]> {
  await ensureLoaded();
  const key = word.toLowerCase();
  return _synonyms![key] ?? [];
}

export async function getAIKillAlternatives(phrase: string): Promise<string[]> {
  await ensureLoaded();
  const key = phrase.toLowerCase();
  return _aiKills![key] ?? [];
}

export async function getPhraseTransform(phrase: string): Promise<string[]> {
  await ensureLoaded();
  const key = phrase.toLowerCase();
  return _phraseTransforms![key] ?? [];
}

export async function getConnectorAlternative(connector: string): Promise<string[]> {
  await ensureLoaded();
  return _connectors![connector] ?? [];
}

export async function getRandomStarter(): Promise<string> {
  await ensureLoaded();
  return _starters![Math.floor(Math.random() * _starters!.length)];
}

export async function getAllAIKillPhrases(): Promise<string[]> {
  await ensureLoaded();
  return Object.keys(_aiKills!);
}

export async function getAllSynonymWords(): Promise<string[]> {
  await ensureLoaded();
  return Object.keys(_synonyms!);
}

export async function getAllPhraseKeys(): Promise<string[]> {
  await ensureLoaded();
  return Object.keys(_phraseTransforms!);
}

export async function getAllConnectors(): Promise<string[]> {
  await ensureLoaded();
  return Object.keys(_connectors!);
}
