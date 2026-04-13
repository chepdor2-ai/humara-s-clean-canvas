/**
 * grammar-corrector.ts — Aggressive Non-LLM Grammar Engine
 *
 * Pipeline: Normalize → Segment → Tokenize → POS tag → Analyze structure →
 *           Run 20+ rule groups → Score naturalness/clarity/flow → Rank
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'style';

export interface Issue {
  ruleId: string;
  message: string;
  severity: Severity;
  start: number;
  end: number;
  replacements: string[];
  confidence: number;
  category: string;
  sentenceIndex: number;
  aiDetected?: boolean;
}

export interface SentenceAnalysis {
  text: string;
  start: number;
  end: number;
  issues: Issue[];
  score: number;
  tense: string;
  isPassive: boolean;
  isFragment: boolean;
  isRunOn: boolean;
  wordCount: number;
}

export interface ScoreBreakdown {
  grammar: number;
  naturalness: number;
  clarity: number;
  flow: number;
  overall: number;
}

export interface CorrectionResult {
  input: string;
  output: string;
  issues: Issue[];
  sentences: SentenceAnalysis[];
  scores: ScoreBreakdown;
  stats: { errors: number; warnings: number; style: number };
}

type POS =
  | 'PRON' | 'VERB' | 'NOUN' | 'ADV' | 'ADJ'
  | 'DET'  | 'PREP' | 'CONJ' | 'AUX' | 'PUNCT'
  | 'NUM'  | 'ABBR' | 'UNKNOWN';

interface Token {
  text: string;
  norm: string;
  start: number;
  end: number;
  kind: 'word' | 'punct' | 'number' | 'space' | 'symbol' | 'abbr';
  pos: POS;
  lemma: string;
}

interface Sentence {
  text: string;
  start: number;
  end: number;
  tokens: Token[];
  subject: Token | null;
  mainVerb: Token | null;
  tense: 'past' | 'present' | 'future' | 'unknown';
  isPassive: boolean;
}

// ── Dictionaries ─────────────────────────────────────────────────────────────

const PRONOUNS = new Set([
  'i','me','my','myself','mine','you','your','yourself','yours','yourselves',
  'he','him','his','himself','she','her','hers','herself',
  'it','its','itself','we','us','our','ourselves','ours',
  'they','them','their','theirs','themselves','who','whom','whose',
]);

const SINGULAR_PRONOUNS = new Set(['he','she','it','this','that','everyone','everybody','someone','somebody','anyone','anybody','nobody','each','either','neither']);
const PLURAL_PRONOUNS   = new Set(['we','they','you','these','those','both','few','many','several']);
const FIRST_PERSON_SINGULAR = new Set(['i','me','my','myself','mine']);

const AUXILIARIES = new Set([
  'is','are','was','were','be','been','being',
  'have','has','had','do','does','did',
  'will','would','shall','should','may','might','must','can','could',
]);

const MODALS = new Set(['will','would','shall','should','may','might','must','can','could']);

const PREPOSITIONS = new Set([
  'in','on','at','to','for','of','with','by','from','into','onto',
  'about','above','below','between','through','during','before','after',
  'around','along','under','over','against','among','until','since',
  'without','within','beyond','upon','beside','behind','beneath','toward',
  'towards','across','past','except','near',
]);

const CONJUNCTIONS = new Set([
  'and','but','or','nor','for','yet','so','because','although','while',
  'if','when','that','though','unless','whereas','whether','since','once',
  'than','as','however','moreover','furthermore','nevertheless','therefore',
]);

const DETERMINERS = new Set([
  'a','an','the','this','that','these','those',
  'my','your','his','her','its','our','their',
  'some','any','many','much','few','little',
  'every','each','all','both','either','neither',
  'no','several','enough','such',
]);

const UNCOUNTABLE_NOUNS = new Set([
  'water','rice','music','air','milk','flour','sand','sugar','butter','oil',
  'money','information','news','advice','knowledge','furniture','luggage',
  'traffic','weather','work','homework','equipment','growth','research',
  'evidence','progress','education','health','safety','justice','freedom',
  'pollution','electricity','software','hardware','data','feedback','content',
  'staff','fiction','poetry','scenery','machinery','wildlife','offspring',
  'chaos','mathematics','physics','economics','politics','ethics',
]);

// ── Abbreviation dictionary ──────────────────────────────────────────────────

const ABBREVIATIONS = new Set([
  'mr','mrs','ms','dr','prof','sr','jr','st','ave','blvd','rd',
  'dept','div','est','govt','corp','inc','ltd','co',
  'jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec',
  'mon','tue','wed','thu','fri','sat','sun',
  'vs','etc','approx','appt','apt','assn','assoc',
  'vol','rev','gen','sgt','cpl','pvt','capt','lt','cmdr','adm',
  'fig','eq','no','nos','ref','refs','pg','pp','ch','sec',
  // Academic
  'al','ed','eds','trans','dept',
]);

const UPPERCASE_ABBREVIATIONS = /^[A-Z]{2,}\.?$/;
const ABBREVIATION_WITH_PERIODS = /^([A-Za-z]\.){2,}$/; // U.S., e.g., i.e.

// ── Irregular verbs ──────────────────────────────────────────────────────────

const IRREGULAR_VERBS: Record<string, { past: string; pp: string; third: string }> = {
  be:{past:'was',pp:'been',third:'is'},have:{past:'had',pp:'had',third:'has'},
  do:{past:'did',pp:'done',third:'does'},go:{past:'went',pp:'gone',third:'goes'},
  get:{past:'got',pp:'gotten',third:'gets'},make:{past:'made',pp:'made',third:'makes'},
  take:{past:'took',pp:'taken',third:'takes'},come:{past:'came',pp:'come',third:'comes'},
  see:{past:'saw',pp:'seen',third:'sees'},know:{past:'knew',pp:'known',third:'knows'},
  give:{past:'gave',pp:'given',third:'gives'},find:{past:'found',pp:'found',third:'finds'},
  think:{past:'thought',pp:'thought',third:'thinks'},tell:{past:'told',pp:'told',third:'tells'},
  say:{past:'said',pp:'said',third:'says'},buy:{past:'bought',pp:'bought',third:'buys'},
  bring:{past:'brought',pp:'brought',third:'brings'},write:{past:'wrote',pp:'written',third:'writes'},
  read:{past:'read',pp:'read',third:'reads'},run:{past:'ran',pp:'run',third:'runs'},
  eat:{past:'ate',pp:'eaten',third:'eats'},drink:{past:'drank',pp:'drunk',third:'drinks'},
  sleep:{past:'slept',pp:'slept',third:'sleeps'},sit:{past:'sat',pp:'sat',third:'sits'},
  stand:{past:'stood',pp:'stood',third:'stands'},speak:{past:'spoke',pp:'spoken',third:'speaks'},
  meet:{past:'met',pp:'met',third:'meets'},leave:{past:'left',pp:'left',third:'leaves'},
  put:{past:'put',pp:'put',third:'puts'},show:{past:'showed',pp:'shown',third:'shows'},
  feel:{past:'felt',pp:'felt',third:'feels'},keep:{past:'kept',pp:'kept',third:'keeps'},
  begin:{past:'began',pp:'begun',third:'begins'},forget:{past:'forgot',pp:'forgotten',third:'forgets'},
  choose:{past:'chose',pp:'chosen',third:'chooses'},break:{past:'broke',pp:'broken',third:'breaks'},
  win:{past:'won',pp:'won',third:'wins'},send:{past:'sent',pp:'sent',third:'sends'},
  pay:{past:'paid',pp:'paid',third:'pays'},sell:{past:'sold',pp:'sold',third:'sells'},
  cut:{past:'cut',pp:'cut',third:'cuts'},fly:{past:'flew',pp:'flown',third:'flies'},
  fall:{past:'fell',pp:'fallen',third:'falls'},grow:{past:'grew',pp:'grown',third:'grows'},
  draw:{past:'drew',pp:'drawn',third:'draws'},drive:{past:'drove',pp:'driven',third:'drives'},
  ride:{past:'rode',pp:'ridden',third:'rides'},sing:{past:'sang',pp:'sung',third:'sings'},
  swim:{past:'swam',pp:'swum',third:'swims'},teach:{past:'taught',pp:'taught',third:'teaches'},
  catch:{past:'caught',pp:'caught',third:'catches'},build:{past:'built',pp:'built',third:'builds'},
  hear:{past:'heard',pp:'heard',third:'hears'},hold:{past:'held',pp:'held',third:'holds'},
  lead:{past:'led',pp:'led',third:'leads'},lose:{past:'lost',pp:'lost',third:'loses'},
  mean:{past:'meant',pp:'meant',third:'means'},spend:{past:'spent',pp:'spent',third:'spends'},
  understand:{past:'understood',pp:'understood',third:'understands'},
  set:{past:'set',pp:'set',third:'sets'},let:{past:'let',pp:'let',third:'lets'},
  hang:{past:'hung',pp:'hung',third:'hangs'},lay:{past:'laid',pp:'laid',third:'lays'},
  lie:{past:'lay',pp:'lain',third:'lies'},rise:{past:'rose',pp:'risen',third:'rises'},
  wear:{past:'wore',pp:'worn',third:'wears'},hide:{past:'hid',pp:'hidden',third:'hides'},
  bite:{past:'bit',pp:'bitten',third:'bites'},tear:{past:'tore',pp:'torn',third:'tears'},
  shake:{past:'shook',pp:'shaken',third:'shakes'},steal:{past:'stole',pp:'stolen',third:'steals'},
  strike:{past:'struck',pp:'struck',third:'strikes'},throw:{past:'threw',pp:'thrown',third:'throws'},
  wake:{past:'woke',pp:'woken',third:'wakes'},freeze:{past:'froze',pp:'frozen',third:'freezes'},
  swear:{past:'swore',pp:'sworn',third:'swears'},
};

const FORM_TO_BASE = new Map<string, string>();
for (const [base, forms] of Object.entries(IRREGULAR_VERBS)) {
  FORM_TO_BASE.set(forms.past, base);
  FORM_TO_BASE.set(forms.pp, base);
  FORM_TO_BASE.set(forms.third, base);
  FORM_TO_BASE.set(base, base);
}

// ── Confusion pairs & misspellings ───────────────────────────────────────────

const CONFUSION_PAIRS: Record<string, { correct: string; context: string; message: string }> = {
  // Always-wrong misspellings
  'alot':        { correct:'a lot',       context:'always', message:'"alot" should be "a lot".' },
  'definately':  { correct:'definitely',  context:'always', message:'Misspelling: "definitely".' },
  'seperate':    { correct:'separate',    context:'always', message:'Misspelling: "separate".' },
  'occured':     { correct:'occurred',    context:'always', message:'Misspelling: "occurred".' },
  'recieve':     { correct:'receive',     context:'always', message:'Misspelling: "receive".' },
  'acheive':     { correct:'achieve',     context:'always', message:'Misspelling: "achieve".' },
  'accomodate':  { correct:'accommodate', context:'always', message:'Misspelling: "accommodate".' },
  'occurence':   { correct:'occurrence',  context:'always', message:'Misspelling: "occurrence".' },
  'neccessary':  { correct:'necessary',   context:'always', message:'Misspelling: "necessary".' },
  'untill':      { correct:'until',       context:'always', message:'Misspelling: "until".' },
  'begining':    { correct:'beginning',   context:'always', message:'Misspelling: "beginning".' },
  'writting':    { correct:'writing',     context:'always', message:'Misspelling: "writing".' },
  'beleive':     { correct:'believe',     context:'always', message:'Misspelling: "believe".' },
  'arguement':   { correct:'argument',    context:'always', message:'Misspelling: "argument".' },
  'tommorow':    { correct:'tomorrow',    context:'always', message:'Misspelling: "tomorrow".' },
  'goverment':   { correct:'government',  context:'always', message:'Misspelling: "government".' },
  'enviroment':  { correct:'environment', context:'always', message:'Misspelling: "environment".' },
  'independant': { correct:'independent', context:'always', message:'Misspelling: "independent".' },
  'wierd':       { correct:'weird',       context:'always', message:'Misspelling: "weird".' },
  'priviledge':  { correct:'privilege',   context:'always', message:'Misspelling: "privilege".' },
  'concious':    { correct:'conscious',   context:'always', message:'Misspelling: "conscious".' },
  'succesful':   { correct:'successful',  context:'always', message:'Misspelling: "successful".' },
  'thier':       { correct:'their',       context:'always', message:'Misspelling: "their".' },
  'teh':         { correct:'the',         context:'always', message:'Misspelling: "the".' },
  'hte':         { correct:'the',         context:'always', message:'Misspelling: "the".' },
  'adn':         { correct:'and',         context:'always', message:'Misspelling: "and".' },
  'doesnt':      { correct:"doesn't",     context:'always', message:'Missing apostrophe: "doesn\'t".' },
  'dont':        { correct:"don't",       context:'always', message:'Missing apostrophe: "don\'t".' },
  'cant':        { correct:"can't",       context:'always', message:'Missing apostrophe: "can\'t".' },
  'wont':        { correct:"won't",       context:'always', message:'Missing apostrophe: "won\'t".' },
  'isnt':        { correct:"isn't",       context:'always', message:'Missing apostrophe: "isn\'t".' },
  'wasnt':       { correct:"wasn't",      context:'always', message:'Missing apostrophe: "wasn\'t".' },
  'arent':       { correct:"aren't",      context:'always', message:'Missing apostrophe: "aren\'t".' },
  'werent':      { correct:"weren't",     context:'always', message:'Missing apostrophe: "weren\'t".' },
  'havent':      { correct:"haven't",     context:'always', message:'Missing apostrophe: "haven\'t".' },
  'hasnt':       { correct:"hasn't",      context:'always', message:'Missing apostrophe: "hasn\'t".' },
  'didnt':       { correct:"didn't",      context:'always', message:'Missing apostrophe: "didn\'t".' },
  'shouldnt':    { correct:"shouldn't",   context:'always', message:'Missing apostrophe: "shouldn\'t".' },
  'couldnt':     { correct:"couldn't",    context:'always', message:'Missing apostrophe: "couldn\'t".' },
  'wouldnt':     { correct:"wouldn't",    context:'always', message:'Missing apostrophe: "wouldn\'t".' },
  'im':          { correct:"I'm",         context:'always', message:'Missing apostrophe: "I\'m".' },
  'ive':         { correct:"I've",        context:'always', message:'Missing apostrophe: "I\'ve".' },
  'youre':       { correct:"you're",      context:'always', message:'Missing apostrophe: "you\'re".' },
  'theyre':      { correct:"they're",     context:'always', message:'Missing apostrophe: "they\'re".' },
  'hes':         { correct:"he's",        context:'always', message:'Missing apostrophe: "he\'s".' },
  'shes':        { correct:"she's",       context:'always', message:'Missing apostrophe: "she\'s".' },
  'its':         { correct:"it's",        context:'before_verb', message:'Did you mean "it\'s" (it is)?' },
  "it's":        { correct:'its',         context:'before_noun',  message:'Did you mean "its" (possessive)?' },
  'your':        { correct:"you're",      context:'before_verb',  message:'Did you mean "you\'re" (you are)?' },
  "you're":      { correct:'your',        context:'before_noun',  message:'Did you mean "your" (possessive)?' },
  'their':       { correct:"they're",     context:'before_verb',  message:'Did you mean "they\'re" (they are)?' },
  "they're":     { correct:'their',       context:'before_noun',  message:'Did you mean "their" (possessive)?' },
  'there':       { correct:'their',       context:'before_noun',  message:'Did you mean "their" (possessive)?' },
  'then':        { correct:'than',        context:'comparison',   message:'Did you mean "than" (comparison)?' },
  'affect':      { correct:'effect',      context:'noun',         message:'Did you mean "effect" (noun)?' },
  'effect':      { correct:'affect',      context:'verb',         message:'Did you mean "affect" (verb)?' },
  'loose':       { correct:'lose',        context:'verb',         message:'Did you mean "lose" (to misplace)?' },
  'weather':     { correct:'whether',     context:'conjunction',  message:'Did you mean "whether" (if)?' },
  'principle':   { correct:'principal',   context:'adjective',    message:'Did you mean "principal" (main/head)?' },
  'principal':   { correct:'principle',   context:'noun_abstract', message:'Did you mean "principle" (rule/belief)?' },
  'complement':  { correct:'compliment',  context:'praise',       message:'Did you mean "compliment" (praise)?' },
  'compliment':  { correct:'complement',  context:'complete',     message:'Did you mean "complement" (go with)?' },
  'stationary':  { correct:'stationery',  context:'writing',      message:'Did you mean "stationery" (paper/pens)?' },
  'stationery':  { correct:'stationary',  context:'still',        message:'Did you mean "stationary" (not moving)?' },
};

const VOWELS = new Set(['a','e','i','o','u']);
const VOWEL_SOUND_EXCEPTIONS = new Set(['hour','honor','honest','heir','herb','homage']);
const CONSONANT_SOUND_EXCEPTIONS = new Set([
  'university','uniform','unique','unit','union','united','universal','user',
  'usual','utility','european','one','once','ubiquitous','unicorn','uranium',
  'uterus','utensil','usurp',
]);

const TRANSITION_WORDS = new Set([
  'however','moreover','furthermore','therefore','consequently','nevertheless',
  'additionally','meanwhile','subsequently','similarly','conversely','likewise',
  'accordingly','hence','thus','indeed','specifically','notably','alternatively',
  'finally','firstly','secondly','thirdly','lastly','overall','in conclusion',
]);

// ── Layer 1: Normalization ───────────────────────────────────────────────────

function normalize(text: string): string {
  let t = text;
  t = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  t = t.replace(/\u2013/g, '–').replace(/\u2014/g, '—');
  t = t.replace(/ {2,}/g, ' ');
  t = t.replace(/ +([,;:!?.])/g, '$1');
  t = t.replace(/([,;:!?])([A-Za-z])/g, '$1 $2');
  t = t.replace(/\.([A-Z][a-z]{2,})/g, '. $1');
  return t.trim();
}

// ── Layer 2: Abbreviation-aware sentence segmentation ────────────────────────

const PROTECTED = /(?:https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+|\d+[,.]?\d*%?)/g;

function isAbbreviation(text: string, dotIndex: number): boolean {
  // Walk backward to find the word before the dot
  let wordStart = dotIndex - 1;
  while (wordStart >= 0 && /[A-Za-z.]/.test(text[wordStart])) wordStart--;
  wordStart++;
  const word = text.slice(wordStart, dotIndex).toLowerCase().replace(/\./g, '');
  if (ABBREVIATIONS.has(word)) return true;
  // U.S.A. style
  const withDot = text.slice(wordStart, dotIndex + 1);
  if (ABBREVIATION_WITH_PERIODS.test(withDot)) return true;
  // ALL CAPS like "U.S."
  if (UPPERCASE_ABBREVIATIONS.test(text.slice(wordStart, dotIndex + 1))) return true;
  // Single capital letter dot: "A." "J." etc (initials)
  if (dotIndex - wordStart === 1 && /[A-Z]/.test(text[wordStart])) return true;
  return false;
}

function segmentSentences(text: string): string[] {
  const protectedSpans: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  const p = new RegExp(PROTECTED.source, 'g');
  while ((m = p.exec(text)) !== null) {
    protectedSpans.push({ start: m.index, end: m.index + m[0].length });
  }
  const isProtected = (idx: number) => protectedSpans.some(s => idx >= s.start && idx < s.end);

  const sentences: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if ((text[i] === '.' || text[i] === '!' || text[i] === '?') && !isProtected(i)) {
      if (text[i] === '.' && isAbbreviation(text, i)) continue;
      const next = text[i + 1];
      const nextNext = text[i + 2];
      if (!next || next === '\n' || (next === ' ' && (!nextNext || /[A-Z"\u201C(]/.test(nextNext)))) {
        sentences.push(current.trim());
        current = '';
      }
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

// ── Layer 3: Tokenization ────────────────────────────────────────────────────

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /([A-Za-z'\u2019]+(?:\.[A-Za-z])*\.?|\d+(?:[.,]\d+)*%?|[.,;:!?—–\-"'()[\]{}])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1];
    const start = match.index;
    const end = start + raw.length;
    const norm = raw.toLowerCase().replace(/[\u2019]/g, "'");

    let kind: Token['kind'] = 'word';
    if (/^[.,;:!?—–\-"'()[\]{}]+$/.test(raw)) kind = 'punct';
    else if (/^\d/.test(raw)) kind = 'number';
    else if (ABBREVIATION_WITH_PERIODS.test(raw) || (raw.endsWith('.') && ABBREVIATIONS.has(norm.replace(/\./g, '')))) kind = 'abbr';

    const pos = kind === 'punct' ? 'PUNCT' as POS : kind === 'number' ? 'NUM' as POS : kind === 'abbr' ? 'ABBR' as POS : tagPOS(norm);
    const lemma = kind === 'word' ? getLemma(norm) : norm;

    tokens.push({ text: raw, norm, start, end, kind, pos, lemma });
  }
  return tokens;
}

// ── Layer 4: POS tagging ─────────────────────────────────────────────────────

function tagPOS(word: string): POS {
  const w = word.toLowerCase();
  if (PRONOUNS.has(w)) return 'PRON';
  if (MODALS.has(w)) return 'AUX';
  if (AUXILIARIES.has(w)) return 'AUX';
  if (DETERMINERS.has(w)) return 'DET';
  if (PREPOSITIONS.has(w)) return 'PREP';
  if (CONJUNCTIONS.has(w)) return 'CONJ';
  if (FORM_TO_BASE.has(w)) return 'VERB';
  if (w.endsWith('ly') && w.length > 4) return 'ADV';
  if (/(?:ness|ment|tion|sion|ity|ance|ence|ism|ist|ology|ship|dom)$/.test(w)) return 'NOUN';
  if (/(?:ful|ous|ive|ible|able|ical|less|ish)$/.test(w)) return 'ADJ';
  if (w.endsWith('ing')) return 'VERB';
  if (w.endsWith('ed') && w.length > 3) return 'VERB';
  return 'NOUN';
}

function getLemma(word: string): string {
  const w = word.toLowerCase();
  if (FORM_TO_BASE.has(w)) return FORM_TO_BASE.get(w)!;
  if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed') && w.length > 4) {
    const stem = w.slice(0, -2);
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) return stem.slice(0, -1);
    return stem.endsWith('e') ? stem : stem + 'e';
  }
  if (w.endsWith('ing') && w.length > 5) {
    const stem = w.slice(0, -3);
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) return stem.slice(0, -1);
    return stem + 'e';
  }
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && w.length > 3) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

// ── Layer 5: Sentence structure analysis ─────────────────────────────────────

function findSubject(tokens: Token[]): Token | null {
  const words = tokens.filter(t => t.kind === 'word' || t.kind === 'abbr');
  // Skip leading adverbs/conjunctions
  let i = 0;
  while (i < words.length && (words[i].pos === 'ADV' || words[i].pos === 'CONJ')) i++;
  // Subject is first PRON, NOUN, or DET+NOUN sequence
  // Skip through DET and ADJ to find head noun
  let subject: Token | null = null;
  while (i < words.length) {
    const t = words[i];
    if (t.pos === 'PRON') return t;
    if (t.pos === 'DET' || t.pos === 'ADJ') { i++; continue; }
    if (t.pos === 'NOUN' || t.pos === 'VERB') {
      subject = t;
      // Skip prepositional phrases to find the HEAD noun
      // "The results of the study" → head = results
      if (i + 1 < words.length && words[i + 1].pos === 'PREP') {
        return t; // Return noun before preposition as the head
      }
      return t;
    }
    break;
  }
  return subject;
}

function findMainVerb(tokens: Token[]): Token | null {
  const words = tokens.filter(t => t.kind === 'word');
  // Find first verb after subject phase
  let pastSubject = false;
  for (const t of words) {
    if (!pastSubject && (t.pos === 'PRON' || t.pos === 'NOUN')) {
      pastSubject = true;
      continue;
    }
    if (pastSubject && t.pos === 'PREP') {
      // Skip prepositional phrase
      continue;
    }
    if (pastSubject && (t.pos === 'DET' || t.pos === 'ADJ' || t.pos === 'NOUN')) {
      // Still in prepositional phrase noun
      continue;
    }
    if (pastSubject && (t.pos === 'VERB' || t.pos === 'AUX')) {
      return t;
    }
  }
  return null;
}

function detectTense(tokens: Token[]): 'past' | 'present' | 'future' | 'unknown' {
  const verbs = tokens.filter(t => t.pos === 'VERB' || t.pos === 'AUX');
  for (const v of verbs) {
    const w = v.norm;
    if (w === 'will' || w === 'shall' || w === "won't" || w === "shan't") return 'future';
    if (w === 'was' || w === 'were' || w === 'had' || w === 'did') return 'past';
    // Check if it's a past form of irregular verb
    for (const forms of Object.values(IRREGULAR_VERBS)) {
      if (forms.past === w) return 'past';
    }
    if (w.endsWith('ed')) return 'past';
    if (w === 'is' || w === 'are' || w === 'am' || w === 'has' || w === 'have' || w === 'does' || w === 'do') return 'present';
  }
  return 'unknown';
}

function isPassiveVoice(tokens: Token[]): boolean {
  const words = tokens.filter(t => t.kind === 'word');
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i].norm;
    if ((w === 'is' || w === 'are' || w === 'was' || w === 'were' || w === 'been' || w === 'be' || w === 'being') &&
        (words[i + 1].norm.endsWith('ed') || FORM_TO_BASE.has(words[i + 1].norm))) {
      // Check if next word is a past participle
      const base = FORM_TO_BASE.get(words[i + 1].norm);
      if (base) {
        const entry = IRREGULAR_VERBS[base];
        if (entry && words[i + 1].norm === entry.pp) return true;
      }
      if (words[i + 1].norm.endsWith('ed')) return true;
    }
  }
  return false;
}

function parseSentences(text: string): Sentence[] {
  const rawSegments = segmentSentences(text);
  let offset = 0;
  const result: Sentence[] = [];
  for (const raw of rawSegments) {
    const idx = text.indexOf(raw, offset);
    const start = idx >= 0 ? idx : offset;
    const end = start + raw.length;
    const tokens = tokenize(raw);
    for (const t of tokens) { t.start += start; t.end += start; }
    const subject = findSubject(tokens);
    const mainVerb = findMainVerb(tokens);
    const tense = detectTense(tokens);
    const passive = isPassiveVoice(tokens);
    result.push({ text: raw, start, end, tokens, subject, mainVerb, tense, isPassive: passive });
    offset = end;
  }
  return result;
}

// ── Scoring helpers ──────────────────────────────────────────────────────────

function computeNaturalness(sentences: Sentence[]): number {
  if (sentences.length === 0) return 100;
  // Sentence length variance (diverse = natural)
  const lengths = sentences.map(s => s.tokens.filter(t => t.kind === 'word').length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, l) => a + Math.pow(l - avg, 2), 0) / lengths.length;
  const varianceScore = Math.min(100, variance * 3);

  // Vocabulary diversity
  const allWords = sentences.flatMap(s => s.tokens.filter(t => t.kind === 'word').map(t => t.norm));
  const unique = new Set(allWords).size;
  const diversityRatio = allWords.length > 0 ? unique / allWords.length : 1;
  const diversityScore = diversityRatio * 100;

  // Sentence start variety (don't start every sentence the same way)
  const starts = sentences.map(s => {
    const firstWord = s.tokens.find(t => t.kind === 'word');
    return firstWord?.norm || '';
  });
  const uniqueStarts = new Set(starts).size;
  const startVariety = sentences.length > 0 ? (uniqueStarts / sentences.length) * 100 : 100;

  return Math.round((varianceScore * 0.3 + diversityScore * 0.4 + startVariety * 0.3));
}

function computeClarity(sentences: Sentence[], issues: Issue[]): number {
  if (sentences.length === 0) return 100;
  let score = 100;
  // Penalize passive voice
  const passiveCount = sentences.filter(s => s.isPassive).length;
  const passiveRatio = passiveCount / sentences.length;
  if (passiveRatio > 0.5) score -= 20;
  else if (passiveRatio > 0.3) score -= 10;

  // Penalize very long sentences (>35 words)
  for (const s of sentences) {
    const wc = s.tokens.filter(t => t.kind === 'word').length;
    if (wc > 40) score -= 8;
    else if (wc > 30) score -= 4;
  }
  // Penalize grammar errors
  const errCount = issues.filter(i => i.severity === 'error').length;
  score -= errCount * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeFlow(sentences: Sentence[]): number {
  if (sentences.length <= 1) return 100;
  let score = 80; // Start at 80, add points for good flow signals

  // Transition words between sentences
  let transitionCount = 0;
  for (const s of sentences) {
    const firstWord = s.tokens.find(t => t.kind === 'word');
    if (firstWord && TRANSITION_WORDS.has(firstWord.norm)) transitionCount++;
  }
  const transitionRatio = transitionCount / (sentences.length - 1);
  if (transitionRatio >= 0.2 && transitionRatio <= 0.6) score += 15;
  else if (transitionRatio > 0) score += 8;

  // Sentence length flow (no huge jumps)
  const lengths = sentences.map(s => s.tokens.filter(t => t.kind === 'word').length);
  let bigJumps = 0;
  for (let i = 1; i < lengths.length; i++) {
    if (Math.abs(lengths[i] - lengths[i - 1]) > 15) bigJumps++;
  }
  score -= bigJumps * 5;

  // Tense consistency
  const tenses = sentences.map(s => s.tense).filter(t => t !== 'unknown');
  if (tenses.length > 1) {
    const dominant = tenses.sort((a, b) =>
      tenses.filter(t => t === b).length - tenses.filter(t => t === a).length
    )[0];
    const inconsistent = tenses.filter(t => t !== dominant).length;
    score -= inconsistent * 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Rule Engine ──────────────────────────────────────────────────────────────

export class GrammarChecker {
  private issues: Issue[] = [];
  private sentenceIndex = 0;

  private add(
    ruleId: string, message: string, severity: Severity,
    start: number, end: number, replacements: string[],
    confidence: number, category: string,
  ) {
    const exists = this.issues.some(i => i.ruleId === ruleId && i.start === start && i.end === end);
    if (!exists) {
      this.issues.push({ ruleId, message, severity, start, end, replacements, confidence, category, sentenceIndex: this.sentenceIndex });
    }
  }

  // ── R1: Repeated words ────────────────────────────────────────────────────
  private checkRepeatedWords(sent: Sentence) {
    const words = sent.tokens.filter(t => t.kind === 'word');
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].norm === words[i + 1].norm) {
        if (words[i].norm === 'that' || words[i].norm === 'had') continue;
        this.add('repeated_word', `Repeated word: "${words[i].text}"`, 'error',
          words[i].start, words[i + 1].end, [words[i].text], 0.95, 'Repetition');
      }
    }
  }

  // ── R2: Article a/an ──────────────────────────────────────────────────────
  private checkArticles(sent: Sentence) {
    const words = sent.tokens.filter(t => t.kind === 'word');
    for (let i = 0; i < words.length - 1; i++) {
      const art = words[i].norm;
      const next = words[i + 1].norm;
      if (art !== 'a' && art !== 'an') continue;
      const vowelSound = VOWELS.has(next[0]) || VOWEL_SOUND_EXCEPTIONS.has(next);
      const consonantSound = !vowelSound || CONSONANT_SOUND_EXCEPTIONS.has(next);
      // Check abbreviations: "a FBI agent" → "an FBI agent"
      if (words[i + 1].kind === 'abbr' || /^[A-Z]{2,}/.test(words[i + 1].text)) {
        // Abbreviation pronunciation by first letter
        const firstLetter = words[i + 1].text[0].toLowerCase();
        const abbrVowelSound = 'aefhilmnorsx'.includes(firstLetter);
        if (art === 'a' && abbrVowelSound) {
          this.add('article_abbr', `Use "an" before abbreviation "${words[i + 1].text}".`, 'error',
            words[i].start, words[i].end, ['an'], 0.92, 'Articles');
        } else if (art === 'an' && !abbrVowelSound) {
          this.add('article_abbr', `Use "a" before abbreviation "${words[i + 1].text}".`, 'error',
            words[i].start, words[i].end, ['a'], 0.92, 'Articles');
        }
        continue;
      }
      if (art === 'a' && vowelSound && !CONSONANT_SOUND_EXCEPTIONS.has(next)) {
        this.add('article_a_an', `Use "an" before "${words[i + 1].text}" (vowel sound).`, 'error',
          words[i].start, words[i].end, ['an'], 0.9, 'Articles');
      } else if (art === 'an' && consonantSound && !VOWEL_SOUND_EXCEPTIONS.has(next)) {
        this.add('article_a_an', `Use "a" before "${words[i + 1].text}" (consonant sound).`, 'error',
          words[i].start, words[i].end, ['a'], 0.9, 'Articles');
      }
    }
  }

  // ── R3: Capitalization ────────────────────────────────────────────────────
  private checkCapitalization(sent: Sentence) {
    const words = sent.tokens.filter(t => t.kind === 'word' || t.kind === 'abbr');
    if (words.length === 0) return;
    // First word must be capitalized
    const first = words[0];
    if (first.text[0] !== first.text[0].toUpperCase()) {
      this.add('cap_sentence_start', 'Sentence should start with a capital letter.', 'error',
        first.start, first.end, [first.text[0].toUpperCase() + first.text.slice(1)], 0.98, 'Capitalization');
    }
    // "I" always capitalized
    for (const t of words) {
      if (t.norm === 'i' && t.text === 'i') {
        this.add('cap_i', 'The pronoun "I" should always be capitalized.', 'error',
          t.start, t.end, ['I'], 0.99, 'Capitalization');
      }
    }
    // Proper nouns after "Mr./Dr./Mrs." should be capitalized
    for (let i = 0; i < words.length - 1; i++) {
      const norm = words[i].norm.replace(/\./g, '');
      if (ABBREVIATIONS.has(norm) && ['mr','mrs','ms','dr','prof'].includes(norm)) {
        const next = words[i + 1];
        if (next.text[0] !== next.text[0].toUpperCase()) {
          this.add('cap_after_title', `Name after "${words[i].text}" should be capitalized.`, 'error',
            next.start, next.end, [next.text[0].toUpperCase() + next.text.slice(1)], 0.95, 'Capitalization');
        }
      }
    }
    // ALL CAPS detection (shouting): if word is >3 chars and all caps mid-sentence
    for (let i = 1; i < words.length; i++) {
      const t = words[i];
      if (t.text.length > 3 && t.text === t.text.toUpperCase() && /^[A-Z]+$/.test(t.text) && t.kind === 'word') {
        const lower = t.text[0] + t.text.slice(1).toLowerCase();
        this.add('cap_shouting', `Avoid all-caps: "${t.text}" → "${lower}"`, 'style',
          t.start, t.end, [lower], 0.7, 'Capitalization');
      }
    }
  }

  // ── R4: Punctuation spacing & issues ──────────────────────────────────────
  private checkPunctuation(text: string, sent: Sentence) {
    const raw = text.slice(sent.start, sent.end);
    const base = sent.start;
    let match: RegExpExecArray | null;

    // Extra spaces
    const multiSpace = /  +/g;
    while ((match = multiSpace.exec(raw)) !== null) {
      this.add('extra_spaces', 'Remove extra spaces.', 'style',
        base + match.index, base + match.index + match[0].length, [' '], 0.99, 'Spacing');
    }
    // Space before punctuation
    const spaceBefore = / ([,;:!?.])/g;
    while ((match = spaceBefore.exec(raw)) !== null) {
      this.add('space_before_punct', 'Remove space before punctuation.', 'style',
        base + match.index, base + match.index + match[0].length, [match[1]], 0.97, 'Spacing');
    }
    // Missing space after punctuation (not abbreviations)
    const noSpaceAfter = /([,;:!?])([A-Za-z])/g;
    while ((match = noSpaceAfter.exec(raw)) !== null) {
      this.add('missing_space_after_punct', `Add space after "${match[1]}".`, 'error',
        base + match.index, base + match.index + match[0].length,
        [match[1] + ' ' + match[2]], 0.95, 'Spacing');
    }
    // Duplicate punctuation (not ellipsis)
    const dupPunct = /([.!?,;:])\1+/g;
    while ((match = dupPunct.exec(raw)) !== null) {
      if (match[1] === '.' && match[0].length === 3) continue; // ellipsis
      this.add('dup_punct', `Duplicate punctuation: "${match[0]}"`, 'warning',
        base + match.index, base + match.index + match[0].length, [match[1]], 0.95, 'Punctuation');
    }
    // Missing comma after introductory word
    const introWords = ['however','moreover','furthermore','therefore','consequently',
      'nevertheless','additionally','meanwhile','unfortunately','fortunately',
      'surprisingly','interestingly','obviously','clearly','apparently'];
    for (const w of introWords) {
      const pattern = new RegExp(`^${w}\\s+[a-z]`, 'i');
      if (pattern.test(raw)) {
        const end = w.length;
        if (raw[end] !== ',') {
          this.add('missing_intro_comma', `Add comma after introductory word "${w}".`, 'warning',
            base + end, base + end, [','], 0.85, 'Punctuation');
        }
      }
    }
  }

  // ── R5: Sentence-final punctuation ────────────────────────────────────────
  private checkSentenceEnd(sent: Sentence) {
    const trimmed = sent.text.trim();
    if (trimmed.length > 3 && !/[.!?]$/.test(trimmed)) {
      this.add('missing_end_punct', 'Sentence missing final punctuation.', 'warning',
        sent.end - 1, sent.end, [trimmed + '.'], 0.7, 'Punctuation');
    }
  }

  // ── R6: Subject-verb agreement (deep) ─────────────────────────────────────
  private checkSubjectVerbAgreement(sent: Sentence) {
    const words = sent.tokens.filter(t => t.kind === 'word');
    // Direct pronoun + verb adjacency
    for (let i = 0; i < words.length - 1; i++) {
      const subj = words[i].norm;
      const verb = words[i + 1].norm;

      if (SINGULAR_PRONOUNS.has(subj)) {
        if (verb === 'have' && subj !== 'i') {
          this.add('sv_agree', `"${words[i].text} ${words[i+1].text}" → "${words[i].text} has"`, 'error',
            words[i+1].start, words[i+1].end, ['has'], 0.95, 'Agreement');
        }
        if (verb === 'are') {
          this.add('sv_agree', `"${words[i].text} ${words[i+1].text}" → "${words[i].text} is"`, 'error',
            words[i+1].start, words[i+1].end, ['is'], 0.95, 'Agreement');
        }
        if (verb === "don't") {
          this.add('sv_agree', `"${words[i].text} don't" → "${words[i].text} doesn't"`, 'error',
            words[i+1].start, words[i+1].end, ["doesn't"], 0.9, 'Agreement');
        }
      }

      if (PLURAL_PRONOUNS.has(subj) || FIRST_PERSON_SINGULAR.has(subj)) {
        if (verb === 'has' && !SINGULAR_PRONOUNS.has(subj)) {
          this.add('sv_agree', `"${words[i].text} ${words[i+1].text}" → "${words[i].text} have"`, 'error',
            words[i+1].start, words[i+1].end, ['have'], 0.95, 'Agreement');
        }
        if (verb === 'is' && !SINGULAR_PRONOUNS.has(subj)) {
          const fix = FIRST_PERSON_SINGULAR.has(subj) ? 'am' : 'are';
          this.add('sv_agree', `"${words[i].text} ${words[i+1].text}" → "${words[i].text} ${fix}"`, 'error',
            words[i+1].start, words[i+1].end, [fix], 0.95, 'Agreement');
        }
        if (verb === "doesn't" && !SINGULAR_PRONOUNS.has(subj)) {
          this.add('sv_agree', `"${words[i].text} doesn't" → "${words[i].text} don't"`, 'error',
            words[i+1].start, words[i+1].end, ["don't"], 0.9, 'Agreement');
        }
      }
    }

    // Deep: "The results of the study is clear" — head noun through prepositions
    if (sent.subject && sent.mainVerb) {
      const subjNorm = sent.subject.norm;
      const verbNorm = sent.mainVerb.norm;
      const subjIsPlural = subjNorm.endsWith('s') && !UNCOUNTABLE_NOUNS.has(subjNorm) && !SINGULAR_PRONOUNS.has(subjNorm);
      if (subjIsPlural && verbNorm === 'is') {
        this.add('sv_agree_deep', `Subject "${sent.subject.text}" is plural but verb is singular. Use "are".`, 'error',
          sent.mainVerb.start, sent.mainVerb.end, ['are'], 0.88, 'Agreement');
      }
      if (subjIsPlural && verbNorm === 'was') {
        this.add('sv_agree_deep', `Subject "${sent.subject.text}" is plural but verb is singular. Use "were".`, 'error',
          sent.mainVerb.start, sent.mainVerb.end, ['were'], 0.85, 'Agreement');
      }
      if (subjIsPlural && verbNorm === 'has') {
        this.add('sv_agree_deep', `Subject "${sent.subject.text}" is plural. Use "have".`, 'error',
          sent.mainVerb.start, sent.mainVerb.end, ['have'], 0.85, 'Agreement');
      }
    }
  }

  // ── R7: Auxiliary + verb form ─────────────────────────────────────────────
  private checkAuxVerbForm(sent: Sentence) {
    const words = sent.tokens.filter(t => t.kind === 'word');
    for (let i = 0; i < words.length - 1; i++) {
      const aux = words[i].norm;
      const verb = words[i + 1];
      if (verb.kind !== 'word') continue;
      const vn = verb.norm;

      // have/has/had + past (not past participle)
      if ((aux === 'have' || aux === 'has' || aux === 'had') && FORM_TO_BASE.has(vn)) {
        const base = FORM_TO_BASE.get(vn)!;
        const entry = IRREGULAR_VERBS[base];
        if (entry && vn === entry.past && vn !== entry.pp) {
          this.add('aux_verb', `After "${words[i].text}", use "${entry.pp}" (past participle).`, 'error',
            verb.start, verb.end, [entry.pp], 0.92, 'Verb Form');
        }
      }
      // did + past → base
      if (aux === 'did' && FORM_TO_BASE.has(vn)) {
        const base = FORM_TO_BASE.get(vn)!;
        const entry = IRREGULAR_VERBS[base];
        if (entry && (vn === entry.past || vn === entry.pp) && vn !== base) {
          this.add('aux_verb', `After "did", use base form "${base}".`, 'error',
            verb.start, verb.end, [base], 0.93, 'Verb Form');
        }
      }
      // modal + non-base
      if (MODALS.has(aux) && FORM_TO_BASE.has(vn)) {
        const base = FORM_TO_BASE.get(vn)!;
        const entry = IRREGULAR_VERBS[base];
        if (entry && (vn === entry.past || vn === entry.third) && vn !== base) {
          this.add('modal_verb', `After "${words[i].text}", use base form "${base}".`, 'error',
            verb.start, verb.end, [base], 0.88, 'Verb Form');
        }
      }
    }
  }

  // ── R8: Confusion pairs ───────────────────────────────────────────────────
  private checkConfusionPairs(sent: Sentence) {
    for (let i = 0; i < sent.tokens.length; i++) {
      const token = sent.tokens[i];
      if (token.kind !== 'word') continue;
      const entry = CONFUSION_PAIRS[token.norm];
      if (!entry) continue;

      if (entry.context === 'always') {
        this.add('confusion', entry.message, 'error',
          token.start, token.end, [entry.correct], 0.95, 'Spelling');
        continue;
      }

      // Context-dependent
      const nextToken = sent.tokens.slice(i + 1).find(t => t.kind === 'word');
      if (!nextToken) continue;

      if (entry.context === 'before_verb' && (nextToken.pos === 'VERB' || nextToken.pos === 'AUX' || nextToken.norm === 'going' || nextToken.norm === 'not')) {
        this.add('confusion_ctx', entry.message, 'warning',
          token.start, token.end, [entry.correct], 0.75, 'Confusion');
      }
      if (entry.context === 'before_noun' && (nextToken.pos === 'NOUN' || nextToken.pos === 'ADJ' || nextToken.pos === 'DET')) {
        this.add('confusion_ctx', entry.message, 'warning',
          token.start, token.end, [entry.correct], 0.75, 'Confusion');
      }
    }
  }

  // ── R9: Comma splices ─────────────────────────────────────────────────────
  private checkCommaSplice(text: string, sent: Sentence) {
    const raw = text.slice(sent.start, sent.end);
    const base = sent.start;
    const pattern = /([a-z]+),\s+(he|she|it|they|we|i|you)\s+(is|are|was|were|has|have|had|will|would|can|could|shall|should|may|might|must|do|does|did)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      this.add('comma_splice', 'Possible comma splice. Use a period, semicolon, or conjunction.', 'warning',
        base + match.index + match[1].length, base + match.index + match[1].length + 1,
        ['.', ';', ', and'], 0.7, 'Sentence Structure');
    }
  }

  // ── R10: Sentence fragments ───────────────────────────────────────────────
  private checkFragment(sent: Sentence): boolean {
    const words = sent.tokens.filter(t => t.kind === 'word');
    if (words.length < 2) return false; // Too short to matter
    if (words.length > 15) return false; // Long enough to not be a fragment usually
    // Check if sentence has any verb
    const hasVerb = words.some(t => t.pos === 'VERB' || t.pos === 'AUX');
    if (!hasVerb && words.length >= 3) {
      this.add('fragment', 'This may be a sentence fragment (no verb detected).', 'warning',
        sent.start, sent.end, [], 0.65, 'Sentence Structure');
      return true;
    }
    return false;
  }

  // ── R11: Run-on sentences ─────────────────────────────────────────────────
  private checkRunOn(sent: Sentence): boolean {
    const wordCount = sent.tokens.filter(t => t.kind === 'word').length;
    const commaCount = sent.tokens.filter(t => t.text === ',').length;
    const conjCount = sent.tokens.filter(t => t.pos === 'CONJ').length;
    // Very long sentence with multiple clauses
    if (wordCount > 40 && commaCount < 2 && conjCount < 2) {
      this.add('run_on', 'This sentence is very long. Consider splitting it.', 'style',
        sent.start, sent.end, [], 0.6, 'Sentence Structure');
      return true;
    }
    if (wordCount > 50) {
      this.add('run_on', 'Very long sentence (50+ words). Break into shorter sentences for clarity.', 'warning',
        sent.start, sent.end, [], 0.75, 'Sentence Structure');
      return true;
    }
    return false;
  }

  // ── R12: Passive voice ────────────────────────────────────────────────────
  private checkPassiveVoice(sent: Sentence) {
    if (sent.isPassive) {
      // Find the passive construction
      const words = sent.tokens.filter(t => t.kind === 'word');
      for (let i = 0; i < words.length - 1; i++) {
        const w = words[i].norm;
        if ((w === 'is' || w === 'are' || w === 'was' || w === 'were' || w === 'been' || w === 'be') &&
            (words[i + 1].norm.endsWith('ed') || FORM_TO_BASE.has(words[i + 1].norm))) {
          this.add('passive_voice', 'Consider using active voice for clearer writing.', 'style',
            words[i].start, words[i + 1].end, [], 0.5, 'Style');
          break;
        }
      }
    }
  }

  // ── R13: Tense consistency between sentences ──────────────────────────────
  private checkTenseConsistency(sentences: Sentence[]) {
    const detectedTenses = sentences.map(s => s.tense).filter(t => t !== 'unknown');
    if (detectedTenses.length < 3) return;
    // Find dominant tense
    const counts: Record<string, number> = {};
    for (const t of detectedTenses) counts[t] = (counts[t] || 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!dominant) return;

    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s.tense !== 'unknown' && s.tense !== dominant) {
        this.add('tense_consistency',
          `This sentence uses ${s.tense} tense while most text uses ${dominant} tense.`, 'style',
          s.start, s.end, [], 0.55, 'Consistency');
      }
    }
  }

  // ── R14: Double negatives ─────────────────────────────────────────────────
  private checkDoubleNegative(sent: Sentence) {
    const words = sent.tokens.filter(t => t.kind === 'word');
    const negatives = new Set(["not","n't","no","never","nobody","nothing","nowhere","neither","nor","hardly","scarcely","barely"]);
    let negCount = 0;
    let firstNeg: Token | null = null;
    for (const w of words) {
      if (negatives.has(w.norm) || w.norm.endsWith("n't")) {
        negCount++;
        if (!firstNeg) firstNeg = w;
      }
    }
    if (negCount >= 2 && firstNeg) {
      this.add('double_negative', 'Double negative detected. This may reverse meaning unintentionally.', 'warning',
        sent.start, sent.end, [], 0.7, 'Grammar');
    }
  }

  // ── R15: Pronoun case (me vs I) ───────────────────────────────────────────
  private checkPronounCase(sent: Sentence) {
    const raw = sent.text;
    // "Me and him went" → "He and I went"
    if (/\bme and (him|her|them)\b/i.test(raw) || /\b(him|her|them) and me\b/i.test(raw)) {
      const match = raw.match(/\b(me and (?:him|her|them)|(?:him|her|them) and me)\b/i);
      if (match) {
        const idx = raw.indexOf(match[0]);
        this.add('pronoun_case', `"${match[0]}" in subject position should be "he/she/they and I".`, 'warning',
          sent.start + idx, sent.start + idx + match[0].length, [], 0.75, 'Grammar');
      }
    }
    // "between you and I" → "between you and me"
    if (/\bbetween you and i\b/i.test(raw)) {
      const idx = raw.toLowerCase().indexOf('between you and i');
      this.add('pronoun_case', '"between you and I" should be "between you and me".', 'error',
        sent.start + idx, sent.start + idx + 'between you and i'.length,
        ['between you and me'], 0.9, 'Grammar');
    }
  }

  // ── R16: Missing words (common patterns) ──────────────────────────────────
  private checkMissingWords(sent: Sentence) {
    const words = sent.tokens.filter(t => t.kind === 'word');
    for (let i = 0; i < words.length - 1; i++) {
      // "going" without "to" before destination
      if (words[i].norm === 'going' && i + 1 < words.length) {
        const next = words[i + 1];
        if (next.pos === 'DET' || next.pos === 'NOUN' || next.pos === 'ADJ') {
          // Check if "to" is missing: "I am going the store"
          if (i > 0 && (words[i - 1].norm === 'am' || words[i - 1].norm === 'is' || words[i - 1].norm === 'are' ||
                        words[i - 1].norm === 'was' || words[i - 1].norm === 'were')) {
            // Verify "to" isn't already there
            const actualNext = sent.tokens[sent.tokens.indexOf(words[i]) + 1];
            if (actualNext && actualNext.norm !== 'to') {
              this.add('missing_to', `Missing "to" after "going".`, 'error',
                words[i].end, words[i].end, [' to'], 0.85, 'Grammar');
            }
          }
        }
      }
    }
  }

  // ── R17: Word order issues ────────────────────────────────────────────────
  private checkWordOrder(sent: Sentence) {
    const words = sent.tokens.filter(t => t.kind === 'word');
    for (let i = 0; i < words.length - 2; i++) {
      // Adjective after noun: "car big" instead of "big car"
      if (words[i].pos === 'NOUN' && words[i + 1].pos === 'ADJ' &&
          !PREPOSITIONS.has(words[i].norm) && words[i + 1].norm !== 'enough') {
        // Exception: predicate adjective "the car is big"
        if (i > 0 && (words[i - 1].norm === 'is' || words[i - 1].norm === 'are' ||
                      words[i - 1].norm === 'was' || words[i - 1].norm === 'were')) continue;
        this.add('word_order', `Consider "${words[i + 1].text} ${words[i].text}" (adjective before noun).`, 'style',
          words[i].start, words[i + 1].end,
          [words[i + 1].text + ' ' + words[i].text], 0.55, 'Word Order');
      }
    }
  }

  // ── Apply auto-fixes ──────────────────────────────────────────────────────
  private applyFixes(text: string, issues: Issue[]): string {
    const fixable = issues
      .filter(i => i.replacements.length > 0 && i.confidence >= 0.85)
      .sort((a, b) => b.start - a.start);
    let result = text;
    for (const issue of fixable) {
      result = result.slice(0, issue.start) + issue.replacements[0] + result.slice(issue.end);
    }
    return result;
  }

  // ── Merge AI issues ───────────────────────────────────────────────────────
  mergeAiIssues(aiIssues: Array<{ start: number; end: number; message: string; severity: Severity; category: string }>) {
    for (const ai of aiIssues) {
      const exists = this.issues.some(i => Math.abs(i.start - ai.start) < 3 && Math.abs(i.end - ai.end) < 3);
      if (!exists) {
        this.issues.push({
          ruleId: 'ai_detected', message: ai.message, severity: ai.severity,
          start: ai.start, end: ai.end, replacements: [], confidence: 0.8,
          category: ai.category, sentenceIndex: 0, aiDetected: true,
        });
      }
    }
    this.issues.sort((a, b) => a.start - b.start);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  check(text: string): CorrectionResult {
    this.issues = [];
    if (!text.trim()) {
      return {
        input: text, output: text, issues: [], sentences: [],
        scores: { grammar: 100, naturalness: 100, clarity: 100, flow: 100, overall: 100 },
        stats: { errors: 0, warnings: 0, style: 0 },
      };
    }

    const normalized = normalize(text);
    const sentences = parseSentences(normalized);

    // Run all rules per sentence
    const sentAnalyses: SentenceAnalysis[] = [];
    for (let si = 0; si < sentences.length; si++) {
      this.sentenceIndex = si;
      const s = sentences[si];
      this.checkRepeatedWords(s);
      this.checkArticles(s);
      this.checkCapitalization(s);
      this.checkPunctuation(normalized, s);
      this.checkSentenceEnd(s);
      this.checkSubjectVerbAgreement(s);
      this.checkAuxVerbForm(s);
      this.checkConfusionPairs(s);
      this.checkCommaSplice(normalized, s);
      const isFragment = this.checkFragment(s);
      const isRunOn = this.checkRunOn(s);
      this.checkPassiveVoice(s);
      this.checkDoubleNegative(s);
      this.checkPronounCase(s);
      this.checkMissingWords(s);
      this.checkWordOrder(s);

      const sentIssues = this.issues.filter(i => i.sentenceIndex === si);
      const sentErrors = sentIssues.filter(i => i.severity === 'error').length;
      const sentScore = Math.max(0, 100 - sentErrors * 12 - sentIssues.filter(i => i.severity === 'warning').length * 6 - sentIssues.filter(i => i.severity === 'style').length * 2);

      sentAnalyses.push({
        text: s.text, start: s.start, end: s.end, issues: sentIssues,
        score: sentScore, tense: s.tense, isPassive: s.isPassive,
        isFragment, isRunOn, wordCount: s.tokens.filter(t => t.kind === 'word').length,
      });
    }

    // Cross-sentence checks
    this.checkTenseConsistency(sentences);

    // Sort all issues
    this.issues.sort((a, b) => a.start - b.start);

    // Auto-fix
    const output = this.applyFixes(normalized, this.issues);

    // Compute scores
    const errors   = this.issues.filter(i => i.severity === 'error').length;
    const warnings = this.issues.filter(i => i.severity === 'warning').length;
    const style    = this.issues.filter(i => i.severity === 'style').length;

    const grammarScore = Math.max(0, Math.min(100, 100 - errors * 8 - warnings * 4 - style * 1));
    const naturalness = computeNaturalness(sentences);
    const clarity = computeClarity(sentences, this.issues);
    const flow = computeFlow(sentences);
    const overall = Math.round(grammarScore * 0.4 + naturalness * 0.2 + clarity * 0.2 + flow * 0.2);

    return {
      input: text, output, issues: this.issues, sentences: sentAnalyses,
      scores: { grammar: grammarScore, naturalness, clarity, flow, overall },
      stats: { errors, warnings, style },
    };
  }
}
/**
 * grammar-corrector.ts
 * Full non-LLM Grammar & Sentence Correction Pipeline
 *
 * Architecture:
 *   1. Text normalization
 *   2. Sentence segmentation & tokenization
 *   3. Lexicon / morphology layer
 *   4. POS tagging & phrase chunking
 *   5. Rule engine (high-precision, layered)
 *   6. Exception & anti-pattern layer
 *   7. Suggestion generator
 *   8. Confidence ranking
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'style';

export interface Issue {
  ruleId: string;
  message: string;
  severity: Severity;
  start: number;
  end: number;
  replacements: string[];
  confidence: number;
  category: string;
}

export interface CorrectionResult {
  input: string;
  output: string;
  issues: Issue[];
  stats: { errors: number; warnings: number; style: number; score: number };
}

type POS =
  | 'PRON' | 'VERB' | 'NOUN' | 'ADV' | 'ADJ'
  | 'DET'  | 'PREP' | 'CONJ' | 'AUX' | 'PUNCT'
  | 'NUM'  | 'UNKNOWN';

interface Token {
  text: string;
  norm: string;
  start: number;
  end: number;
  kind: 'word' | 'punct' | 'number' | 'space' | 'symbol';
  pos: POS;
  lemma: string;
}

interface Sentence {
  text: string;
  start: number;
  end: number;
  tokens: Token[];
}

// ── Dictionaries ─────────────────────────────────────────────────────────────

const PRONOUNS = new Set([
  'i','me','my','myself','mine',
  'you','your','yourself','yours','yourselves',
  'he','him','his','himself',
  'she','her','hers','herself',
  'it','its','itself',
  'we','us','our','ourselves','ours',
  'they','them','their','theirs','themselves',
]);

const SINGULAR_PRONOUNS = new Set(['he','she','it']);
const PLURAL_PRONOUNS   = new Set(['we','they','you']);

const AUXILIARIES = new Set([
  'is','are','was','were','be','been','being',
  'have','has','had',
  'do','does','did',
  'will','would','shall','should',
  'may','might','must','can','could',
]);

const MODALS = new Set([
  'will','would','shall','should','may','might','must','can','could',
]);

const PREPOSITIONS = new Set([
  'in','on','at','to','for','of','with','by','from','into','onto',
  'about','above','below','between','through','during','before','after',
  'around','along','under','over','against','among','until','since',
  'without','within','beyond','upon','beside','behind','beneath','toward',
  'towards','across','past','except','near',
]);

const CONJUNCTIONS = new Set([
  'and','but','or','nor','for','yet','so','because','although','while',
  'if','when','that','though','unless','whereas','whether','since','once',
  'than','as',
]);

const DETERMINERS = new Set([
  'a','an','the','this','that','these','those',
  'my','your','his','her','its','our','their',
  'some','any','many','much','few','little',
  'every','each','all','both','either','neither',
  'no','several','enough','such',
]);

const UNCOUNTABLE_NOUNS = new Set([
  'water','rice','music','air','milk','flour','sand','sugar','butter','oil',
  'money','information','news','advice','knowledge','furniture','luggage',
  'traffic','weather','work','homework','equipment','growth','research',
  'evidence','progress','education','health','safety','justice','freedom',
  'pollution','electricity','software','hardware','data','feedback','content',
  'staff','fiction','poetry','scenery','machinery','wildlife','offspring',
]);

const IRREGULAR_VERBS: Record<string, { past: string; pp: string; third: string }> = {
  be:   { past:'was',     pp:'been',      third:'is'        },
  have: { past:'had',     pp:'had',       third:'has'       },
  do:   { past:'did',     pp:'done',      third:'does'      },
  go:   { past:'went',    pp:'gone',      third:'goes'      },
  get:  { past:'got',     pp:'gotten',    third:'gets'      },
  make: { past:'made',    pp:'made',      third:'makes'     },
  take: { past:'took',    pp:'taken',     third:'takes'     },
  come: { past:'came',    pp:'come',      third:'comes'     },
  see:  { past:'saw',     pp:'seen',      third:'sees'      },
  know: { past:'knew',    pp:'known',     third:'knows'     },
  give: { past:'gave',    pp:'given',     third:'gives'     },
  find: { past:'found',   pp:'found',     third:'finds'     },
  think:{ past:'thought', pp:'thought',   third:'thinks'    },
  tell: { past:'told',    pp:'told',      third:'tells'     },
  say:  { past:'said',    pp:'said',      third:'says'      },
  buy:  { past:'bought',  pp:'bought',    third:'buys'      },
  bring:{ past:'brought', pp:'brought',   third:'brings'    },
  write:{ past:'wrote',   pp:'written',   third:'writes'    },
  read: { past:'read',    pp:'read',      third:'reads'     },
  run:  { past:'ran',     pp:'run',       third:'runs'      },
  eat:  { past:'ate',     pp:'eaten',     third:'eats'      },
  drink:{ past:'drank',   pp:'drunk',     third:'drinks'    },
  sleep:{ past:'slept',   pp:'slept',     third:'sleeps'    },
  sit:  { past:'sat',     pp:'sat',       third:'sits'      },
  stand:{ past:'stood',   pp:'stood',     third:'stands'    },
  speak:{ past:'spoke',   pp:'spoken',    third:'speaks'    },
  meet: { past:'met',     pp:'met',       third:'meets'     },
  leave:{ past:'left',    pp:'left',      third:'leaves'    },
  put:  { past:'put',     pp:'put',       third:'puts'      },
  show: { past:'showed',  pp:'shown',     third:'shows'     },
  feel: { past:'felt',    pp:'felt',      third:'feels'     },
  keep: { past:'kept',    pp:'kept',      third:'keeps'     },
  begin:{ past:'began',   pp:'begun',     third:'begins'    },
  forget:{past:'forgot',  pp:'forgotten', third:'forgets'   },
  choose:{past:'chose',   pp:'chosen',    third:'chooses'   },
  break:{ past:'broke',   pp:'broken',    third:'breaks'    },
  win:  { past:'won',     pp:'won',       third:'wins'      },
  send: { past:'sent',    pp:'sent',      third:'sends'     },
  pay:  { past:'paid',    pp:'paid',      third:'pays'      },
  sell: { past:'sold',    pp:'sold',      third:'sells'     },
  cut:  { past:'cut',     pp:'cut',       third:'cuts'      },
  fly:  { past:'flew',    pp:'flown',     third:'flies'     },
  fall: { past:'fell',    pp:'fallen',    third:'falls'     },
  grow: { past:'grew',    pp:'grown',     third:'grows'     },
  draw: { past:'drew',    pp:'drawn',     third:'draws'     },
  drive:{ past:'drove',   pp:'driven',    third:'drives'    },
  ride: { past:'rode',    pp:'ridden',    third:'rides'     },
  sing: { past:'sang',    pp:'sung',      third:'sings'     },
  swim: { past:'swam',    pp:'swum',      third:'swims'     },
  teach:{ past:'taught',  pp:'taught',    third:'teaches'   },
  catch:{ past:'caught',  pp:'caught',    third:'catches'   },
  build:{ past:'built',   pp:'built',     third:'builds'    },
  hear: { past:'heard',   pp:'heard',     third:'hears'     },
  hold: { past:'held',    pp:'held',      third:'holds'     },
  lead: { past:'led',     pp:'led',       third:'leads'     },
  lose: { past:'lost',    pp:'lost',      third:'loses'     },
  mean: { past:'meant',   pp:'meant',     third:'means'     },
  spend:{ past:'spent',   pp:'spent',     third:'spends'    },
  understand:{past:'understood',pp:'understood',third:'understands'},
  set:  { past:'set',     pp:'set',       third:'sets'      },
  let:  { past:'let',     pp:'let',       third:'lets'      },
  hang: { past:'hung',    pp:'hung',      third:'hangs'     },
  lay:  { past:'laid',    pp:'laid',      third:'lays'      },
  lie:  { past:'lay',     pp:'lain',      third:'lies'      },
  rise: { past:'rose',    pp:'risen',     third:'rises'     },
  wear: { past:'wore',    pp:'worn',      third:'wears'     },
  hide: { past:'hid',     pp:'hidden',    third:'hides'     },
  bite: { past:'bit',     pp:'bitten',    third:'bites'     },
  tear: { past:'tore',    pp:'torn',      third:'tears'     },
  shake:{ past:'shook',   pp:'shaken',    third:'shakes'    },
  steal:{ past:'stole',   pp:'stolen',    third:'steals'    },
  strike:{past:'struck',  pp:'struck',    third:'strikes'   },
  throw:{ past:'threw',   pp:'thrown',    third:'throws'    },
  wake: { past:'woke',    pp:'woken',     third:'wakes'     },
  freeze:{past:'froze',   pp:'frozen',    third:'freezes'   },
  swear:{ past:'swore',   pp:'sworn',     third:'swears'    },
};

/** Reverse lookup: past/pp/third → base */
const FORM_TO_BASE = new Map<string, string>();
for (const [base, forms] of Object.entries(IRREGULAR_VERBS)) {
  FORM_TO_BASE.set(forms.past, base);
  FORM_TO_BASE.set(forms.pp, base);
  FORM_TO_BASE.set(forms.third, base);
  FORM_TO_BASE.set(base, base);
}

const CONFUSION_PAIRS: Record<string, { correct: string; context: string; message: string }> = {
  'your':    { correct: "you're", context: 'before_verb',   message: 'Did you mean "you\'re" (you are)?' },
  "you're":  { correct: 'your',   context: 'before_noun',   message: 'Did you mean "your" (possessive)?' },
  'their':   { correct: "they're",context: 'before_verb',   message: 'Did you mean "they\'re" (they are)?' },
  "they're": { correct: 'their',  context: 'before_noun',   message: 'Did you mean "their" (possessive)?' },
  'its':     { correct: "it's",   context: 'before_verb',   message: 'Did you mean "it\'s" (it is)?' },
  "it's":    { correct: 'its',    context: 'before_noun',   message: 'Did you mean "its" (possessive)?' },
  'there':   { correct: "their",  context: 'before_noun',   message: 'Did you mean "their" (possessive)?' },
  'then':    { correct: 'than',   context: 'comparison',    message: 'Did you mean "than" (comparison)?' },
  'than':    { correct: 'then',   context: 'sequence',      message: 'Did you mean "then" (sequence)?' },
  'affect':  { correct: 'effect', context: 'noun',          message: 'Did you mean "effect" (noun)?' },
  'effect':  { correct: 'affect', context: 'verb',          message: 'Did you mean "affect" (verb)?' },
  'loose':   { correct: 'lose',   context: 'verb',          message: 'Did you mean "lose" (to misplace)?' },
  'alot':    { correct: 'a lot',  context: 'always',        message: '"alot" should be "a lot".' },
  'definately':  { correct: 'definitely', context: 'always', message: 'Misspelling: "definitely".' },
  'seperate':    { correct: 'separate',   context: 'always', message: 'Misspelling: "separate".' },
  'occured':     { correct: 'occurred',   context: 'always', message: 'Misspelling: "occurred".' },
  'recieve':     { correct: 'receive',    context: 'always', message: 'Misspelling: "receive".' },
  'acheive':     { correct: 'achieve',    context: 'always', message: 'Misspelling: "achieve".' },
  'accomodate':  { correct: 'accommodate',context: 'always', message: 'Misspelling: "accommodate".' },
  'occurence':   { correct: 'occurrence', context: 'always', message: 'Misspelling: "occurrence".' },
  'neccessary':  { correct: 'necessary',  context: 'always', message: 'Misspelling: "necessary".' },
  'untill':      { correct: 'until',      context: 'always', message: 'Misspelling: "until".' },
  'begining':    { correct: 'beginning',  context: 'always', message: 'Misspelling: "beginning".' },
  'writting':    { correct: 'writing',    context: 'always', message: 'Misspelling: "writing".' },
  'beleive':     { correct: 'believe',    context: 'always', message: 'Misspelling: "believe".' },
  'arguement':   { correct: 'argument',   context: 'always', message: 'Misspelling: "argument".' },
  'tommorow':    { correct: 'tomorrow',   context: 'always', message: 'Misspelling: "tomorrow".' },
  'goverment':   { correct: 'government', context: 'always', message: 'Misspelling: "government".' },
  'enviroment':  { correct: 'environment',context: 'always', message: 'Misspelling: "environment".' },
  'independant': { correct: 'independent',context: 'always', message: 'Misspelling: "independent".' },
  'wierd':       { correct: 'weird',      context: 'always', message: 'Misspelling: "weird".' },
  'priviledge':  { correct: 'privilege',  context: 'always', message: 'Misspelling: "privilege".' },
  'concious':    { correct: 'conscious',  context: 'always', message: 'Misspelling: "conscious".' },
  'succesful':   { correct: 'successful', context: 'always', message: 'Misspelling: "successful".' },
};

const VOWELS = new Set(['a','e','i','o','u']);
const VOWEL_SOUND_EXCEPTIONS = new Set(['hour','honor','honest','heir','herb']);
const CONSONANT_SOUND_EXCEPTIONS = new Set([
  'university','uniform','unique','unit','union','united','universal','user','usual','utility',
  'european','one','once',
]);

// ── Layer 1: Normalization ───────────────────────────────────────────────────

function normalize(text: string): string {
  let t = text;
  // Smart quotes → straight quotes
  t = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // En-dash / em-dash normalize
  t = t.replace(/\u2013/g, '–').replace(/\u2014/g, '—');
  // Multiple spaces
  t = t.replace(/ {2,}/g, ' ');
  // Space before punctuation
  t = t.replace(/ +([,;:!?.])/g, '$1');
  // Missing space after punctuation (not within abbreviations like U.S.)
  t = t.replace(/([,;:!?])([A-Za-z])/g, '$1 $2');
  t = t.replace(/\.([A-Z][a-z]{2,})/g, '. $1');
  // Trim
  t = t.trim();
  return t;
}

// ── Layer 2: Sentence segmentation & Tokenization ────────────────────────────

/** URL / email / number patterns to protect */
const PROTECTED_PATTERN = /(?:https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+|\d+[,.]?\d*%?)/g;

function segmentSentences(text: string): string[] {
  // Protect URLs, emails, numbers with periods
  const protectedSpans: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  const p = new RegExp(PROTECTED_PATTERN.source, 'g');
  while ((m = p.exec(text)) !== null) {
    protectedSpans.push({ start: m.index, end: m.index + m[0].length });
  }

  const isProtected = (idx: number) => protectedSpans.some(s => idx >= s.start && idx < s.end);

  const sentences: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if ((text[i] === '.' || text[i] === '!' || text[i] === '?') && !isProtected(i)) {
      // Look ahead: next char should be space + uppercase, or end of text
      const next = text[i + 1];
      const nextNext = text[i + 2];
      if (!next || next === '\n' || (next === ' ' && (!nextNext || nextNext === nextNext.toUpperCase()))) {
        sentences.push(current.trim());
        current = '';
      }
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Match words, punctuation, numbers, symbols
  const regex = /([A-Za-z'\u2019]+|\d+(?:[.,]\d+)*%?|[.,;:!?—–\-"'()[\]{}])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1];
    const start = match.index;
    const end = start + raw.length;
    const norm = raw.toLowerCase().replace(/[\u2019]/g, "'");

    let kind: Token['kind'] = 'word';
    if (/^[.,;:!?—–\-"'()[\]{}]+$/.test(raw)) kind = 'punct';
    else if (/^\d/.test(raw)) kind = 'number';

    const pos = kind === 'punct' ? 'PUNCT' as POS : kind === 'number' ? 'NUM' as POS : tagPOS(norm);
    const lemma = kind === 'word' ? getLemma(norm) : norm;

    tokens.push({ text: raw, norm, start, end, kind, pos, lemma });
  }
  return tokens;
}

// ── Layer 3: POS tagging (lightweight rule-based) ────────────────────────────

function tagPOS(word: string): POS {
  const w = word.toLowerCase();
  if (PRONOUNS.has(w)) return 'PRON';
  if (MODALS.has(w)) return 'AUX';
  if (AUXILIARIES.has(w)) return 'AUX';
  if (DETERMINERS.has(w)) return 'DET';
  if (PREPOSITIONS.has(w)) return 'PREP';
  if (CONJUNCTIONS.has(w)) return 'CONJ';

  // Check irregular verb table
  if (FORM_TO_BASE.has(w)) return 'VERB';

  // Morphological heuristics
  if (w.endsWith('ly') && w.length > 4) return 'ADV';
  if (w.endsWith('ness') || w.endsWith('ment') || w.endsWith('tion') ||
      w.endsWith('sion') || w.endsWith('ity') || w.endsWith('ance') ||
      w.endsWith('ence') || w.endsWith('ism') || w.endsWith('ist') ||
      w.endsWith('ology') || w.endsWith('ship') || w.endsWith('dom')) return 'NOUN';
  if (w.endsWith('ful') || w.endsWith('ous') || w.endsWith('ive') ||
      w.endsWith('ible') || w.endsWith('able') || w.endsWith('ical') ||
      w.endsWith('less') || w.endsWith('ish')) return 'ADJ';
  if ((w.endsWith('ing') || w.endsWith('ed') || w.endsWith('es') || w.endsWith('s')) && w.length > 3) {
    // Could be verb or noun — default verb for -ing/-ed, noun for -s in some cases
    if (w.endsWith('ing')) return 'VERB';
    if (w.endsWith('ed'))  return 'VERB';
  }
  return 'NOUN'; // default
}

function getLemma(word: string): string {
  const w = word.toLowerCase();
  if (FORM_TO_BASE.has(w)) return FORM_TO_BASE.get(w)!;
  // Simple stemming for regular verbs
  if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed') && w.length > 4) {
    const stem = w.slice(0, -2);
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) return stem.slice(0, -1);
    return stem.endsWith('e') ? stem : stem + 'e';
  }
  if (w.endsWith('ing') && w.length > 5) {
    const stem = w.slice(0, -3);
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) return stem.slice(0, -1);
    return stem + 'e';
  }
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && w.length > 3) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

// ── Layer 4: Sentence analysis ───────────────────────────────────────────────

function parseSentences(text: string): Sentence[] {
  const rawSentences = segmentSentences(text);
  let offset = 0;
  const result: Sentence[] = [];
  for (const raw of rawSentences) {
    const idx = text.indexOf(raw, offset);
    const start = idx >= 0 ? idx : offset;
    const end = start + raw.length;
    const tokens = tokenize(raw);
    // Adjust token offsets to be global
    for (const t of tokens) {
      t.start += start;
      t.end += start;
    }
    result.push({ text: raw, start, end, tokens });
    offset = end;
  }
  return result;
}

// ── Layer 5–8: Rule Engine + Suggestion Generator ────────────────────────────

export class GrammarChecker {
  private issues: Issue[] = [];

  private addIssue(
    ruleId: string,
    message: string,
    severity: Severity,
    start: number,
    end: number,
    replacements: string[],
    confidence: number,
    category: string,
  ) {
    // Dedupe: don't add if overlapping issue with same rule already exists
    const exists = this.issues.some(
      i => i.ruleId === ruleId && i.start === start && i.end === end,
    );
    if (!exists) {
      this.issues.push({ ruleId, message, severity, start, end, replacements, confidence, category });
    }
  }

  // ── Rule: Repeated words ──────────────────────────────────────────────────

  private checkRepeatedWords(sentences: Sentence[]) {
    for (const sent of sentences) {
      const words = sent.tokens.filter(t => t.kind === 'word');
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i].norm === words[i + 1].norm) {
          // Exception: "that that" in some constructions like "I know that that is true"
          if (words[i].norm === 'that') continue;
          // Exception: "had had" is valid (past perfect of "have")
          if (words[i].norm === 'had') continue;

          this.addIssue(
            'repeated_word',
            `Repeated word: "${words[i].text}"`,
            'error',
            words[i].start,
            words[i + 1].end,
            [words[i].text],
            0.95,
            'Repetition',
          );
        }
      }
    }
  }

  // ── Rule: Article a/an ────────────────────────────────────────────────────

  private checkArticles(sentences: Sentence[]) {
    for (const sent of sentences) {
      const words = sent.tokens.filter(t => t.kind === 'word');
      for (let i = 0; i < words.length - 1; i++) {
        const article = words[i].norm;
        const nextWord = words[i + 1].norm;
        if (article !== 'a' && article !== 'an') continue;

        const startsVowelSound = VOWELS.has(nextWord[0]) || VOWEL_SOUND_EXCEPTIONS.has(nextWord);
        const startsConsonantSound = !startsVowelSound || CONSONANT_SOUND_EXCEPTIONS.has(nextWord);

        if (article === 'a' && startsVowelSound && !CONSONANT_SOUND_EXCEPTIONS.has(nextWord)) {
          this.addIssue(
            'article_a_an',
            `Use "an" before "${words[i + 1].text}" (vowel sound).`,
            'error',
            words[i].start,
            words[i].end,
            ['an'],
            0.9,
            'Articles',
          );
        } else if (article === 'an' && startsConsonantSound && !VOWEL_SOUND_EXCEPTIONS.has(nextWord)) {
          this.addIssue(
            'article_a_an',
            `Use "a" before "${words[i + 1].text}" (consonant sound).`,
            'error',
            words[i].start,
            words[i].end,
            ['a'],
            0.9,
            'Articles',
          );
        }
      }
    }
  }

  // ── Rule: Capitalization ──────────────────────────────────────────────────

  private checkCapitalization(sentences: Sentence[]) {
    for (const sent of sentences) {
      const words = sent.tokens.filter(t => t.kind === 'word');
      if (words.length === 0) continue;
      const first = words[0];
      if (first.text[0] !== first.text[0].toUpperCase()) {
        this.addIssue(
          'capitalization_sentence_start',
          'Sentence should start with a capital letter.',
          'error',
          first.start,
          first.end,
          [first.text[0].toUpperCase() + first.text.slice(1)],
          0.98,
          'Capitalization',
        );
      }

      // "I" should always be capitalized
      for (const token of words) {
        if (token.norm === 'i' && token.text === 'i') {
          this.addIssue(
            'capitalization_i',
            'The pronoun "I" should always be capitalized.',
            'error',
            token.start,
            token.end,
            ['I'],
            0.99,
            'Capitalization',
          );
        }
      }
    }
  }

  // ── Rule: Punctuation spacing ─────────────────────────────────────────────

  private checkPunctuationSpacing(text: string) {
    // Multiple spaces
    const multiSpace = /  +/g;
    let match: RegExpExecArray | null;
    while ((match = multiSpace.exec(text)) !== null) {
      this.addIssue(
        'extra_spaces',
        'Remove extra spaces.',
        'style',
        match.index,
        match.index + match[0].length,
        [' '],
        0.99,
        'Spacing',
      );
    }

    // Space before comma/period
    const spaceBeforePunct = / ([,;:!?.])/g;
    while ((match = spaceBeforePunct.exec(text)) !== null) {
      this.addIssue(
        'space_before_punctuation',
        'Remove space before punctuation.',
        'style',
        match.index,
        match.index + match[0].length,
        [match[1]],
        0.97,
        'Spacing',
      );
    }
  }

  // ── Rule: Sentence-final punctuation ──────────────────────────────────────

  private checkSentenceFinalPunctuation(sentences: Sentence[]) {
    for (const sent of sentences) {
      const trimmed = sent.text.trim();
      if (trimmed.length > 0 && !/[.!?]$/.test(trimmed)) {
        this.addIssue(
          'missing_final_punctuation',
          'Sentence appears to be missing final punctuation.',
          'warning',
          sent.end - 1,
          sent.end,
          [trimmed + '.'],
          0.7,
          'Punctuation',
        );
      }
    }
  }

  // ── Rule: Subject–verb agreement ──────────────────────────────────────────

  private checkSubjectVerbAgreement(sentences: Sentence[]) {
    for (const sent of sentences) {
      const words = sent.tokens.filter(t => t.kind === 'word');
      for (let i = 0; i < words.length - 1; i++) {
        const subj = words[i].norm;
        const verb = words[i + 1].norm;

        // he/she/it + plural base verb form (not 3rd person)
        if (SINGULAR_PRONOUNS.has(subj)) {
          // "he have" → "he has"
          if (verb === 'have') {
            this.addIssue('sv_agreement', `"${words[i].text} ${words[i+1].text}" → "${words[i].text} has"`, 'error',
              words[i+1].start, words[i+1].end, ['has'], 0.95, 'Agreement');
          }
          // "she are" → "she is"
          if (verb === 'are') {
            this.addIssue('sv_agreement', `"${words[i].text} ${words[i+1].text}" → "${words[i].text} is"`, 'error',
              words[i+1].start, words[i+1].end, ['is'], 0.95, 'Agreement');
          }
          // "he don't" → "he doesn't"
          if (verb === "don't") {
            this.addIssue('sv_agreement', `"${words[i].text} don't" → "${words[i].text} doesn't"`, 'error',
              words[i+1].start, words[i+1].end, ["doesn't"], 0.9, 'Agreement');
          }
        }

        // they/we + singular verb
        if (PLURAL_PRONOUNS.has(subj) || subj === 'i') {
          if (verb === 'has' && subj !== 'it') {
            this.addIssue('sv_agreement', `"${words[i].text} ${words[i+1].text}" → "${words[i].text} have"`, 'error',
              words[i+1].start, words[i+1].end, ['have'], 0.95, 'Agreement');
          }
          if (verb === 'is' && subj !== 'it') {
            const fix = subj === 'i' ? 'am' : 'are';
            this.addIssue('sv_agreement', `"${words[i].text} ${words[i+1].text}" → "${words[i].text} ${fix}"`, 'error',
              words[i+1].start, words[i+1].end, [fix], 0.95, 'Agreement');
          }
          if (verb === "doesn't" && subj !== 'it') {
            this.addIssue('sv_agreement', `"${words[i].text} doesn't" → "${words[i].text} don't"`, 'error',
              words[i+1].start, words[i+1].end, ["don't"], 0.9, 'Agreement');
          }
        }
      }
    }
  }

  // ── Rule: Auxiliary + verb form ───────────────────────────────────────────

  private checkAuxiliaryVerbForm(sentences: Sentence[]) {
    for (const sent of sentences) {
      const words = sent.tokens.filter(t => t.kind === 'word');
      for (let i = 0; i < words.length - 1; i++) {
        const aux = words[i].norm;
        const verb = words[i + 1];
        if (verb.kind !== 'word') continue;
        const vNorm = verb.norm;

        // "have/has/had" + past tense (not past participle)
        if ((aux === 'have' || aux === 'has' || aux === 'had') && FORM_TO_BASE.has(vNorm)) {
          const base = FORM_TO_BASE.get(vNorm)!;
          const entry = IRREGULAR_VERBS[base];
          if (entry && vNorm === entry.past && vNorm !== entry.pp) {
            this.addIssue(
              'aux_verb_form',
              `After "${words[i].text}", use the past participle "${entry.pp}" instead of "${verb.text}".`,
              'error',
              verb.start,
              verb.end,
              [entry.pp],
              0.92,
              'Verb Form',
            );
          }
        }

        // "did" + past tense → base form
        if (aux === 'did' && FORM_TO_BASE.has(vNorm)) {
          const base = FORM_TO_BASE.get(vNorm)!;
          const entry = IRREGULAR_VERBS[base];
          if (entry && (vNorm === entry.past || vNorm === entry.pp) && vNorm !== base) {
            this.addIssue(
              'aux_verb_form',
              `After "did", use the base form "${base}" instead of "${verb.text}".`,
              'error',
              verb.start,
              verb.end,
              [base],
              0.93,
              'Verb Form',
            );
          }
        }

        // Modal + non-base form
        if (MODALS.has(aux) && FORM_TO_BASE.has(vNorm)) {
          const base = FORM_TO_BASE.get(vNorm)!;
          const entry = IRREGULAR_VERBS[base];
          if (entry && (vNorm === entry.past || vNorm === entry.third) && vNorm !== base) {
            this.addIssue(
              'modal_verb_form',
              `After "${words[i].text}", use the base form "${base}" instead of "${verb.text}".`,
              'error',
              verb.start,
              verb.end,
              [base],
              0.88,
              'Verb Form',
            );
          }
        }
      }
    }
  }

  // ── Rule: Confusion pairs ────────────────────────────────────────────────

  private checkConfusionPairs(sentences: Sentence[]) {
    for (const sent of sentences) {
      for (const token of sent.tokens) {
        if (token.kind !== 'word') continue;
        const entry = CONFUSION_PAIRS[token.norm];
        if (!entry) continue;

        // Always-wrong spellings
        if (entry.context === 'always') {
          this.addIssue(
            'confusion_pair',
            entry.message,
            'error',
            token.start,
            token.end,
            [entry.correct],
            0.95,
            'Spelling',
          );
        }
        // Context-dependent pairs are trickier — only flag with lower confidence
        // For now, flag your/you're, their/they're, its/it's based on next token
      }
    }
  }

  // ── Rule: Comma splice detection ──────────────────────────────────────────

  private checkCommaSplices(text: string) {
    // Pattern: word, + pronoun/proper noun + verb → likely comma splice
    const pattern = /([a-z]+),\s+(he|she|it|they|we|i|you)\s+(is|are|was|were|has|have|had|will|would|can|could|shall|should|may|might|must|do|does|did)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      this.addIssue(
        'comma_splice',
        'Possible comma splice. Consider using a period, semicolon, or conjunction.',
        'warning',
        match.index + match[1].length,
        match.index + match[1].length + 1,
        ['.', ';', ', and'],
        0.7,
        'Sentence Structure',
      );
    }
  }

  // ── Rule: Duplicate punctuation ───────────────────────────────────────────

  private checkDuplicatePunctuation(text: string) {
    const pattern = /([.!?,;:])\1+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Exception: ellipsis "..."
      if (match[1] === '.' && match[0].length === 3) continue;
      this.addIssue(
        'duplicate_punctuation',
        `Duplicate punctuation: "${match[0]}"`,
        'warning',
        match.index,
        match.index + match[0].length,
        [match[1]],
        0.95,
        'Punctuation',
      );
    }
  }

  // ── Apply auto-fix ────────────────────────────────────────────────────────

  private applyFixes(text: string, issues: Issue[]): string {
    // Sort issues by start position descending to apply from end to start
    const fixable = issues
      .filter(i => i.replacements.length > 0 && i.confidence >= 0.85)
      .sort((a, b) => b.start - a.start);

    let result = text;
    for (const issue of fixable) {
      const before = result.slice(0, issue.start);
      const after  = result.slice(issue.end);
      result = before + issue.replacements[0] + after;
    }
    return result;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  check(text: string): CorrectionResult {
    this.issues = [];
    if (!text.trim()) {
      return { input: text, output: text, issues: [], stats: { errors: 0, warnings: 0, style: 0, score: 100 } };
    }

    const normalized = normalize(text);
    const sentences = parseSentences(normalized);

    // Run all rule checks
    this.checkRepeatedWords(sentences);
    this.checkArticles(sentences);
    this.checkCapitalization(sentences);
    this.checkPunctuationSpacing(normalized);
    this.checkSentenceFinalPunctuation(sentences);
    this.checkSubjectVerbAgreement(sentences);
    this.checkAuxiliaryVerbForm(sentences);
    this.checkConfusionPairs(sentences);
    this.checkCommaSplices(normalized);
    this.checkDuplicatePunctuation(normalized);

    // Sort issues by position
    this.issues.sort((a, b) => a.start - b.start);

    // Auto-fix high-confidence issues
    const output = this.applyFixes(normalized, this.issues);

    // Compute stats
    const errors   = this.issues.filter(i => i.severity === 'error').length;
    const warnings = this.issues.filter(i => i.severity === 'warning').length;
    const style    = this.issues.filter(i => i.severity === 'style').length;
    // Score: 100 minus weighted penalties
    const score = Math.max(0, Math.min(100,
      100 - (errors * 8) - (warnings * 4) - (style * 1),
    ));

    return {
      input: text,
      output,
      issues: this.issues,
      stats: { errors, warnings, style, score },
    };
  }
}
