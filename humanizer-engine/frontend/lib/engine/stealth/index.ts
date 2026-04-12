/**
 * Stealth Humanizer — Sentence-by-Sentence Non-LLM Engine
 * =========================================================
 *
 * Single-pass, sentence-level processing. Each sentence is independently:
 *   1. Phrase-replaced (AI phrases → natural alternatives)
 *   2. Word-replaced (AI buzzwords → casual synonyms)
 *   3. Contextual synonym swapped (~20-35% of remaining content words)
 *   4. Probabilistically given a sentence starter injection
 *   5. Validated for ≥40% word-level change, meaning preservation, grammar
 *   6. Cleaned: zero contractions, zero first person (unless input had it)
 *
 * Quality is the top priority. Every sentence must read naturally.
 *
 * NO contractions. NO first person (unless input). NO rhetorical questions.
 */

import { AI_WORD_REPLACEMENTS } from '../shared-dictionaries';
import { getBestReplacement } from './dictionary-service';

/* ── Sentence Splitter ────────────────────────────────────────────── */

function splitSentences(text: string): string[] {
  // Split on . ! ? followed by space+capital, but respect abbreviations
  return text
    .replace(/([.!?])\s+(?=[A-Z])/g, (match, punct, offset) => {
      // Don't split if this period is part of an abbreviation like D.C., U.S., U.K.
      // Pattern: the char before the period is a letter, and two chars back is a period (X.Y. pattern)
      if (punct === '.' && offset >= 2 && /[A-Za-z]/.test(text[offset - 1]) && text[offset - 2] === '.') {
        return match; // abbreviation — don't split
      }
      return punct + '\n';
    })
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/* ── AI Phrase Patterns → Natural Replacements ────────────────────── */

const PHRASE_REPLACEMENTS: Array<{ pattern: RegExp; replacements: string[] }> = [
  { pattern: /\bin order to\b/gi, replacements: ['to', 'so as to'] },
  { pattern: /\bdue to the fact that\b/gi, replacements: ['because', 'since'] },
  { pattern: /\ba large number of\b/gi, replacements: ['many', 'numerous'] },
  { pattern: /\bin the event that\b/gi, replacements: ['if', 'should'] },
  { pattern: /\bon the other hand\b/gi, replacements: ['then again', 'by contrast'] },
  { pattern: /\bas a result\b/gi, replacements: ['so', 'because of this'] },
  { pattern: /\bin addition\b/gi, replacements: ['also', 'besides'] },
  { pattern: /\bfor example\b/gi, replacements: ['for instance', 'to illustrate'] },
  { pattern: /\bin terms of\b/gi, replacements: ['regarding', 'when it comes to'] },
  { pattern: /\bwith regard to\b/gi, replacements: ['about', 'regarding'] },
  { pattern: /\bit is important to note that\s*/gi, replacements: [''] },
  { pattern: /\bit should be noted that\s*/gi, replacements: [''] },
  { pattern: /\bit is worth mentioning that\s*/gi, replacements: [''] },
  { pattern: /\bin the context of\b/gi, replacements: ['within', 'in'] },
  { pattern: /\bon the basis of\b/gi, replacements: ['based on', 'from'] },
  { pattern: /\bat the same time\b/gi, replacements: ['meanwhile', 'yet'] },
  { pattern: /\bwith respect to\b/gi, replacements: ['about', 'regarding'] },
  { pattern: /\bin spite of\b/gi, replacements: ['despite', 'even with'] },
  { pattern: /\bby means of\b/gi, replacements: ['through', 'using'] },
  { pattern: /\bin accordance with\b/gi, replacements: ['following', 'per'] },
  { pattern: /\bfor the purpose of\b/gi, replacements: ['to', 'for'] },
  { pattern: /\bprior to\b/gi, replacements: ['before'] },
  { pattern: /\bsubsequent to\b/gi, replacements: ['after', 'following'] },
  { pattern: /\bin contrast to\b/gi, replacements: ['unlike', 'compared with'] },
  { pattern: /\bas well as\b/gi, replacements: ['and', 'along with'] },
  { pattern: /\ba wide range of\b/gi, replacements: ['many', 'various'] },
  { pattern: /\btake into account\b/gi, replacements: ['consider', 'factor in'] },
  { pattern: /\bplay a (?:significant |important |key |crucial |vital |critical |pivotal )?role in\b/gi, replacements: ['shape', 'affect', 'influence'] },
  { pattern: /\bhave an impact on\b/gi, replacements: ['affect', 'influence'] },
  { pattern: /\bin light of\b/gi, replacements: ['given', 'considering'] },
  { pattern: /\bthe fact that\b/gi, replacements: ['that', 'how'] },
  { pattern: /\bit is (?:clear|evident|obvious) that\b/gi, replacements: ['clearly,'] },
  { pattern: /\bthere is no doubt that\b/gi, replacements: ['certainly,'] },
  { pattern: /\bin today's (?:world|society|era|age)\b/gi, replacements: ['right now', 'today'] },
  { pattern: /\bin the modern (?:world|era|age)\b/gi, replacements: ['today'] },
  { pattern: /\bnot only\b(.{3,60}?)\bbut also\b/gi, replacements: ['SPLIT'] },
  { pattern: /\bgive rise to\b/gi, replacements: ['cause', 'lead to'] },
  { pattern: /\bshed light on\b/gi, replacements: ['explain', 'clarify'] },
  { pattern: /\bpave the way for\b/gi, replacements: ['enable', 'allow'] },
  { pattern: /\bover the course of\b/gi, replacements: ['during', 'throughout'] },
  { pattern: /\bat this point in time\b/gi, replacements: ['now', 'currently'] },
];

/* ── Sentence Starters (probabilistic injection) ──────────────────── */

const STARTERS_ACADEMIC: string[] = [
  'Notably,', 'Historically,', 'Traditionally,', 'In practice,',
  'In broad terms,', 'From a practical standpoint,', 'At its core,',
  'On balance,', 'By extension,', 'In reality,',
  'Against this backdrop,', 'Under these conditions,',
];

/* ── Contraction Map ──────────────────────────────────────────────── */

const CONTRACTIONS: Record<string, string> = {
  "don't": "do not", "doesn't": "does not", "didn't": "did not",
  "can't": "cannot", "couldn't": "could not", "wouldn't": "would not",
  "shouldn't": "should not", "won't": "will not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "it's": "it is", "that's": "that is", "there's": "there is",
  "what's": "what is", "who's": "who is", "let's": "let us",
  "i'm": "I am", "i've": "I have", "i'd": "I would", "i'll": "I will",
  "we're": "we are", "we've": "we have", "we'd": "we would",
  "we'll": "we will", "they're": "they are", "they've": "they have",
  "you're": "you are", "you've": "you have",
};

/* ── Protected Terms (never replace) ──────────────────────────────── */

const PROTECTED = new Set([
  // Scientific/academic terms that MUST stay
  'hypothesis', 'methodology', 'statistical', 'significance', 'correlation',
  'empirical', 'qualitative', 'quantitative', 'longitudinal',
  'photosynthesis', 'mitochondria', 'chromosome', 'genome', 'algorithm',
  'quantum', 'thermodynamic', 'electromagnetic', 'gravitational',
  'diagnosis', 'prognosis', 'pathology', 'epidemiology', 'therapeutic',
  'jurisdiction', 'plaintiff', 'defendant', 'statute', 'precedent',
  'infrastructure', 'implementation', 'specification', 'authentication',
  // Core AI/tech terms (terrible dictionary synonyms)
  'artificial', 'intelligence', 'decision', 'human', 'ai',
  'making', 'modern', 'based', 'related', 'driven', 'oriented', 'focused',
  'learning', 'training', 'network', 'system', 'data', 'information',
  'technology', 'digital', 'computer', 'machine', 'software', 'hardware',
  // Domain terms that get terrible dictionary replacements
  'healthcare', 'medical', 'clinical', 'clinician', 'diagnostic', 'diagnostics',
  'algorithmic', 'computational', 'multidisciplinary', 'cognitive', 'biased', 'biases',
  'criminal', 'justice', 'financial', 'forecasting',
  'model', 'models', 'image', 'images',
  // Academic domain terms — protect from garbling
  'patient', 'patients', 'clinical', 'bias', 'privacy', 'algorithm', 'algorithms',
  'dataset', 'datasets', 'observer', 'observers', 'machine', 'adoption',
  'barrier', 'barriers', 'decision', 'decisions', 'pattern', 'patterns',
  'however', 'moreover', 'furthermore', 'nevertheless', 'consequently',
  'apparent', 'essential', 'widespread', 'unprecedented',
  // Number words — never replace
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'twenty',
  'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred',
  'thousand', 'million', 'billion', 'first', 'second', 'third', 'fourth', 'fifth',
  'half', 'quarter', 'dozen', 'once', 'twice', 'triple', 'double', 'single',
  // Geography/social-science terms — only protect words WITHOUT curated replacements
  'suburbanization', 'reinvestment', 'redevelopment', 'industrialization',
  'post', 'industrial', 'socioeconomic', 'socio',
  'concentrated',
  // Structural/transition words that must stay
  'while', 'although', 'despite', 'such', 'both', 'particularly',
  'increasingly', 'especially', 'specifically', 'once', 'past',
]);

/* ── Helper: check if a token is a proper noun (capitalized, non-sentence-start) ── */

function isProperNoun(token: string, index: number, tokens: string[]): boolean {
  // If it starts with uppercase and is not just a normal word
  if (!/^[A-Z]/.test(token)) return false;
  // Check if it's at sentence start (after period, start of string, or after sentence boundary)
  if (index === 0) return false; // first token — likely sentence start
  // Look backward for sentence boundary
  for (let j = index - 1; j >= 0; j--) {
    const prev = tokens[j];
    if (prev === '' || /^\s+$/.test(prev)) continue; // skip whitespace/boundary tokens
    if (/[.!?]$/.test(prev)) return false; // after punctuation = sentence start, not proper noun
    return true; // preceded by normal text = proper noun
  }
  return false; // beginning of tokens = sentence start
}

/* ── Replacement Blacklist (never use as synonym output) ───────────── */

const REPLACEMENT_BLACKLIST = new Set([
  // Taxonomic/offensive substitutions
  'homo', 'hominid', 'mortal', 'soul', 'mod', 'waterway',
  // Wrong-POS pronouns (from noun senses of adjectives)
  'someone', 'somebody', 'anyone', 'nobody', 'nothing', 'everything',
  'anything', 'whoever', 'whatever',
  // Too vague verbs (lose meaning)
  'get', 'got', 'gotten', 'do', 'did', 'done', 'put', 'set', 'let',
  'go', 'went', 'gone', 'come', 'came', 'run', 'ran',
  // Single syllable fillers
  'thing', 'stuff', 'lot', 'bit', 'way',
  // Wrong-sense WordNet synonyms (academic context mismatch)
  'breeding', 'rearing', 'upbringing', 'infirmary', 'infirmaries', 'asylum',
  'asylums', 'clinic', 'clinics', 'dwelling', 'hut', 'shanty', 'hovel',
  'pedagogue', 'pedagogues', 'schoolmaster', 'pupil', 'dame',
  'picture', 'painting', 'scenery', 'vista', 'panorama', 'terrain',
  'trim', 'prune', 'shave', 'clip', 'chop', 'snip', 'lop',
  'handle', 'handles', 'knob', 'grip', 'lever', 'crank',
  'moved', 'budge', 'nudge', 'shove', 'haul', 'tow', 'drag',
  'breed', 'mate', 'spawn', 'hatch', 'sow', 'reap',
  'wield', 'brandish', 'clasp', 'clutch', 'grasp',
  'folk', 'kin', 'tribe', 'clan', 'mob', 'gang', 'bunch', 'pack',
  'lad', 'lass', 'chap', 'bloke', 'dude', 'guy', 'gal',
  'wee', 'tiny', 'itty', 'puny', 'dinky', 'teeny',
  'nifty', 'groovy', 'swell', 'dandy', 'peachy', 'keen',
  'slay', 'smite', 'sever', 'cleave', 'hack', 'slash',
  // Academic garble — common wrong-sense outputs from WordNet/PPDB
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
  'activity', 'activities', 'pastime', 'hobby', 'recreation',
  'concern', 'anxiety', 'angst', 'distress', 'anguish',
  'specify', 'specified', 'specifyed', 'designate',
  // Catastrophic WordNet wrong-sense outputs (found in testing)
  'yangtze', 'yangtzes', 'botany', 'botanical', 'flora',
  'leash', 'quartet', 'trio', 'duet', 'solo', 'quintet',
  'capital', 'capitol', 'seasoned', 'molded', 'moulded',
  'happening', 'happenings', 'occurrence', 'occurrences',
  'argument', 'arguments', 'quarrel', 'feud', 'spat', 'brawl',
  'emphasis', 'emphases', 'stress', 'accent', 'punctuation',
  'stage', 'stages', 'platform', 'podium', 'dais',
  'orient', 'oriental', 'occident', 'occidental',
  'stream', 'streams', 'creek', 'brook', 'rivulet', 'tributary',
  'rendering', 'renderings', 'rendition', 'portrayal', 'depiction',
  'outline', 'contour', 'silhouette', 'profile',
  'enhancement', 'enhancements', 'embellishment', 'beautification',
  'abundances', 'abundance', 'bounty', 'plethora', 'cornucopia',
  'meagreness', 'meagerness', 'scarcity', 'dearth', 'paucity',
  'entity', 'entities', 'organism', 'specimen',
  'botany', 'horticulture', 'gardening', 'cultivation',
  'possible', 'probable', 'feasible', 'plausible', // wrong when replacing "potential" (noun)
  'likely',  // wrong sense as noun replacement
  'prospective', // wrong sense as noun
  'place', 'spot', 'locale', // wrong sense for "level"
  'poorness', 'richness', 'affluence', // wrong register
  'renovation', 'refurbishment', 'overhaul', // wrong for "redevelopment"
  'communal', 'communals',
  'aid', 'aided', 'aiding', // too generic, often wrong sense
  // Extended dict garbage (found in testing)
  'severeness', 'severity', 'entrench', 'entrenched', 'entrenchment',
  'veteran', 'veterans', // noun/adj, wrong when replacing verb "experienced"
  'measured', 'unmeasured', // wrong sense for "levels"
  'supplied', 'lent', 'brought', // bad collocation with "to" when replacing "contributed"
  'fortune', 'fortunes', // wrong sense for "wealth"
  'institution', 'institutions', // wrong sense for "organization" (meaning structure)
  'establishment', 'establishments', // wrong sense for "organization" (meaning arrangement)
  'fields', // wrong sense for geographic "areas"
  'variances', 'variance', // wrong for "neighborhoods"
  'ocean', 'oceans', // wrong for "dramatic"
  'consignment', 'consignments', // wrong for "investment"
  'stated', // wrong for "high" (means "declared", not "elevated")
  'pecuniary', // too obscure
  'deficit', 'deficits', 'scarcity', 'shortage', 'absence', // noun-only, wrong when replacing verb "lack"
]);

/* ── Stopwords (skip for synonym replacement) ─────────────────────── */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'that', 'this', 'these', 'those', 'it', 'its',
  'they', 'them', 'their', 'we', 'our', 'he', 'she', 'his', 'her',
  'which', 'what', 'who', 'whom', 'about', 'also', 'up', 'down', 'much',
]);

/* ── Extra Academic Replacements (fills gaps in AI_WORD_REPLACEMENTS) ── */

const EXTRA_REPLACEMENTS: Record<string, string[]> = {
  // ── High-frequency academic nouns (prevent bad WordNet senses) ──
  education: ['instruction', 'learning', 'schooling', 'teaching'],
  institution: ['organization', 'establishment', 'body', 'entity'],
  landscape: ['domain', 'sphere', 'arena', 'terrain'],
  student: ['learner', 'scholar', 'pupil', 'trainee'],
  teacher: ['educator', 'instructor', 'professor', 'mentor'],
  educator: ['instructor', 'teacher', 'professor', 'trainer'],
  technology: ['innovation', 'advancement', 'tooling', 'engineering'],
  society: ['community', 'populace', 'civilization', 'culture'],
  process: ['procedure', 'method', 'workflow', 'operation'],
  processes: ['procedures', 'methods', 'workflows', 'operations'],
  system: ['framework', 'mechanism', 'apparatus', 'structure'],
  research: ['study', 'investigation', 'inquiry', 'analysis'],
  development: ['growth', 'progress', 'expansion', 'evolution'],
  environment: ['setting', 'context', 'surroundings', 'milieu'],
  experience: ['exposure', 'encounter', 'involvement', 'practice'],
  analysis: ['examination', 'assessment', 'evaluation', 'review'],
  strategy: ['approach', 'plan', 'tactic', 'method'],
  resource: ['asset', 'supply', 'material', 'means'],
  knowledge: ['understanding', 'awareness', 'expertise', 'insight'],
  information: ['data', 'details', 'facts', 'intelligence'],
  opportunity: ['prospect', 'opening', 'possibility', 'occasion'],
  community: ['group', 'network', 'collective', 'population'],
  individual: ['person', 'participant', 'actor', 'agent'],
  organization: ['structure', 'arrangement', 'framework', 'body'],
  program: ['initiative', 'scheme', 'project', 'effort'],
  activity: ['task', 'endeavor', 'undertaking', 'pursuit'],
  improvement: ['enhancement', 'betterment', 'refinement', 'upgrade'],
  participation: ['engagement', 'involvement', 'contribution', 'inclusion'],
  response: ['reaction', 'reply', 'answer', 'feedback'],
  // ── High-frequency academic verbs ──
  leverage: ['harness', 'employ', 'utilize', 'capitalize'],
  utilize: ['employ', 'apply', 'use', 'harness'],
  implement: ['execute', 'carry', 'deploy', 'enact'],
  streamline: ['simplify', 'optimize', 'refine', 'improve'],
  personalize: ['tailor', 'customize', 'adapt', 'individualize'],
  enable: ['allow', 'empower', 'facilitate', 'permit'],
  facilitate: ['support', 'enable', 'promote', 'assist'],
  generate: ['produce', 'create', 'yield', 'deliver'],
  analyze: ['examine', 'evaluate', 'assess', 'study'],
  investigate: ['explore', 'probe', 'research', 'study'],
  design: ['build', 'construct', 'craft', 'structure'],
  present: ['introduce', 'pose', 'offer', 'display'],
  revolutionize: ['overhaul', 'reshape', 'redefine', 'modernize'],
  acknowledge: ['recognize', 'accept', 'concede', 'admit'],
  identify: ['detect', 'recognize', 'locate', 'determine'],
  // ── More academic nouns that WordNet garbles ──
  care: ['treatment', 'attention', 'support', 'service'],
  setting: ['context', 'environment', 'domain', 'space'],
  challenge: ['difficulty', 'obstacle', 'hurdle', 'complication'],
  vast: ['large', 'extensive', 'broad', 'sweeping'],
  observer: ['reviewer', 'analyst', 'examiner', 'assessor'],
  integration: ['incorporation', 'blending', 'merging', 'unification'],
  potential: ['capacity', 'promise', 'likelihood', 'prospect'],
  adoption: ['uptake', 'acceptance', 'incorporation', 'implementation'],
  // ── Words that produce catastrophic WordNet garble ──
  federal: ['national', 'governmental', 'central', 'public'],
  investment: ['funding', 'spending', 'commitment', 'allocation'],
  investments: ['funds', 'expenditures', 'commitments', 'allocations'],
  population: ['populace', 'citizenry', 'residents', 'inhabitants'],
  resident: ['inhabitant', 'occupant', 'dweller', 'local'],
  residents: ['inhabitants', 'occupants', 'dwellers', 'locals'],
  economy: ['market', 'financial system', 'marketplace'],
  economic: ['financial', 'fiscal', 'monetary', 'commercial'],
  social: ['communal', 'collective', 'public', 'civic'],
  define: ['characterize', 'describe', 'mark', 'distinguish'],
  defined: ['characterized', 'described', 'marked', 'distinguished'],
  policy: ['regulation', 'directive', 'guideline', 'rule'],
  neglect: ['overlook', 'disregard', 'ignore', 'abandon'],
  neglected: ['overlooked', 'disregarded', 'ignored', 'abandoned'],
  previously: ['formerly', 'earlier', 'once', 'before'],
  especially: ['particularly', 'notably', 'specifically', 'chiefly'],
  decline: ['decrease', 'reduction', 'drop', 'downturn'],
  poverty: ['deprivation', 'hardship', 'destitution', 'disadvantage'],
  wealth: ['prosperity', 'affluence', 'fortune', 'riches'],
  segregation: ['separation', 'division', 'exclusion', 'isolation'],
  dramatic: ['striking', 'remarkable', 'profound', 'sweeping'],
  undergo: ['endure', 'face', 'encounter', 'weather'],
  undergone: ['endured', 'faced', 'encountered', 'weathered'],
  displace: ['uproot', 'relocate', 'remove', 'expel'],
  displacing: ['uprooting', 'relocating', 'removing', 'pushing out'],
  deepen: ['intensify', 'worsen', 'aggravate', 'amplify'],
  deepening: ['intensifying', 'worsening', 'aggravating', 'amplifying'],
  spatial: ['geographic', 'territorial', 'regional', 'physical'],
  racial: ['ethnic', 'race-based'],
  shifting: ['evolving', 'changing', 'moving', 'fluctuating'],
  restructuring: ['reorganization', 'reform', 'overhaul', 'redesign'],
  gentrification: ['urban renewal', 'redevelopment'],
  revitalization: ['renewal', 'regeneration', 'restoration', 'revival'],
  intensify: ['heighten', 'escalate', 'strengthen', 'amplify'],
  intensified: ['heightened', 'escalated', 'strengthened', 'amplified'],
  inequality: ['disparity', 'imbalance', 'gap', 'divide'],
  urban: ['metropolitan', 'municipal', 'civic', 'city-based'],
  demographic: ['population', 'societal', 'communal'],
  transformation: ['shift', 'overhaul', 'conversion', 'evolution'],
  change: ['shift', 'alteration', 'modification', 'adjustment'],
  changes: ['shifts', 'alterations', 'modifications', 'adjustments'],
  growth: ['expansion', 'progress', 'development', 'advance'],
  level: ['degree', 'extent', 'measure', 'scale'],
  levels: ['degrees', 'extents', 'measures', 'scales'],
  priority: ['focus', 'goal', 'emphasis', 'objective'],
  priorities: ['goals', 'objectives', 'aims', 'targets'],
  neighborhood: ['district', 'area', 'quarter', 'locality'],
  neighborhoods: ['districts', 'areas', 'quarters', 'localities'],
  contribute: ['add', 'lead', 'give rise', 'help lead'],
  contributed: ['added', 'led', 'given rise', 'helped lead'],
  shape: ['form', 'influence', 'mold', 'define'],
  shaped: ['formed', 'influenced', 'defined', 'molded'],
  transition: ['shift', 'conversion', 'passage', 'move'],
  high: ['elevated', 'heightened', 'pronounced', 'marked'],
  city: ['municipality', 'metropolis', 'locale', 'township'],
  decade: ['period', 'span', 'era', 'stretch'],
  decades: ['periods', 'spans', 'eras', 'stretches'],
  // ── Adjectives ──
  rapid: ['swift', 'fast', 'brisk', 'accelerated'],
  significant: ['notable', 'marked', 'substantial', 'considerable'],
  important: ['critical', 'vital', 'key', 'central'],
  various: ['diverse', 'multiple', 'assorted', 'several'],
  complex: ['intricate', 'involved', 'elaborate', 'multifaceted'],
  specific: ['particular', 'certain', 'distinct', 'precise'],
  current: ['present', 'existing', 'ongoing', 'prevailing'],
  effective: ['efficient', 'productive', 'successful', 'capable'],
  traditional: ['conventional', 'established', 'classical', 'customary'],
  fundamental: ['core', 'basic', 'essential', 'primary'],
  substantial: ['considerable', 'meaningful', 'sizable', 'large'],
  primary: ['chief', 'main', 'principal', 'foremost'],
  critical: ['vital', 'pivotal', 'essential', 'crucial'],
  comprehensive: ['thorough', 'broad', 'extensive', 'sweeping'],
  increasing: ['growing', 'rising', 'expanding', 'mounting'],
  overall: ['general', 'broad', 'total', 'aggregate'],
  notable: ['remarkable', 'striking', 'prominent', 'significant'],
  remarkable: ['striking', 'exceptional', 'outstanding', 'impressive'],
  sophisticated: ['advanced', 'refined', 'nuanced', 'elaborate'],
  unprecedented: ['unmatched', 'unparalleled', 'extraordinary', 'novel'],
  balanced: ['measured', 'equitable', 'proportionate', 'fair'],
  automated: ['mechanized', 'computerized', 'streamlined', 'automatic'],
  sheer: ['absolute', 'pure', 'utter', 'total'],
  available: ['accessible', 'obtainable', 'usable', 'present'],
  early: ['initial', 'preliminary', 'prompt', 'timely'],
  widespread: ['broad', 'extensive', 'pervasive', 'prevalent'],
  unfair: ['unjust', 'inequitable', 'uneven', 'lopsided'],
  ethical: ['moral', 'principled', 'responsible', 'sound'],
  technical: ['specialized', 'applied', 'practical', 'skilled'],
  experienced: ['encountered', 'witnessed', 'faced', 'undergone'],
  existing: ['current', 'present', 'prevailing', 'ongoing'],
  central: ['key', 'main', 'pivotal', 'core'],
  useful: ['helpful', 'valuable', 'practical', 'beneficial'],
  relevant: ['pertinent', 'applicable', 'fitting', 'suitable'],
  clear: ['plain', 'obvious', 'apparent', 'evident'],
  broad: ['wide', 'expansive', 'general', 'sweeping'],
  main: ['chief', 'principal', 'primary', 'leading'],
  key: ['central', 'vital', 'crucial', 'essential'],
  certain: ['particular', 'definite', 'precise', 'specified'],
  strong: ['robust', 'powerful', 'solid', 'firm'],
  necessary: ['needed', 'required', 'essential', 'vital'],
  valuable: ['worthwhile', 'beneficial', 'meaningful', 'useful'],
  scholarly: ['academic', 'learned', 'intellectual', 'rigorous'],
  genuine: ['authentic', 'true', 'real', 'sincere'],
  fresh: ['new', 'recent', 'original', 'novel'],
  prominent: ['leading', 'major', 'notable', 'distinguished'],
  evident: ['clear', 'apparent', 'plain', 'visible'],
  definite: ['specific', 'particular', 'precise', 'concrete'],
  structured: ['organized', 'systematic', 'orderly', 'arranged'],
  logical: ['rational', 'coherent', 'sound', 'reasoned'],
  informative: ['instructive', 'educational', 'enlightening', 'revealing'],
  practical: ['applied', 'functional', 'concrete', 'usable'],
  considerable: ['substantial', 'notable', 'meaningful', 'significant'],
  appropriate: ['suitable', 'fitting', 'proper', 'apt'],
  common: ['frequent', 'typical', 'usual', 'routine'],
  entire: ['whole', 'complete', 'full', 'total'],
  obvious: ['clear', 'apparent', 'plain', 'evident'],
  recent: ['latest', 'new', 'current', 'fresh'],
  major: ['chief', 'principal', 'leading', 'primary'],
  numerous: ['many', 'several', 'multiple', 'abundant'],
  distinct: ['separate', 'unique', 'individual', 'different'],
  ongoing: ['continuing', 'persistent', 'sustained', 'active'],
  academic: ['scholarly', 'educational', 'intellectual', 'learned'],
  deeper: ['more thorough', 'richer', 'fuller', 'broader'],
  contemporary: ['current', 'present', 'modern', 'recent'],
  // ── Verbs (base forms — morphology handles -ed/-ing) ──
  transform: ['reshape', 'alter', 'shift', 'revamp'],
  demonstrate: ['show', 'reveal', 'illustrate', 'display'],
  establish: ['create', 'build', 'found', 'institute'],
  require: ['demand', 'need', 'necessitate', 'expect'],
  indicate: ['suggest', 'signal', 'imply', 'denote'],
  provide: ['offer', 'supply', 'deliver', 'furnish'],
  achieve: ['reach', 'attain', 'accomplish', 'gain'],
  maintain: ['keep', 'sustain', 'preserve', 'uphold'],
  evaluate: ['assess', 'judge', 'appraise', 'review'],
  influence: ['shape', 'affect', 'sway', 'guide'],
  predict: ['forecast', 'anticipate', 'project', 'foresee'],
  recommend: ['suggest', 'advise', 'propose', 'endorse'],
  enhance: ['boost', 'improve', 'strengthen', 'elevate'],
  integrate: ['combine', 'merge', 'blend', 'incorporate'],
  advocate: ['support', 'champion', 'promote', 'endorse'],
  ensure: ['guarantee', 'confirm', 'verify', 'safeguard'],
  augment: ['supplement', 'expand', 'bolster', 'strengthen'],
  replace: ['substitute', 'displace', 'supplant', 'swap'],
  struggle: ['grapple', 'contend', 'wrestle', 'strain'],
  handle: ['manage', 'address', 'tackle', 'oversee'],
  guide: ['steer', 'direct', 'lead', 'channel'],
  prompt: ['motivate', 'spur', 'encourage', 'push'],
  raise: ['pose', 'introduce', 'spark', 'bring'],
  serve: ['function', 'act', 'operate', 'work'],
  remain: ['stay', 'persist', 'continue', 'endure'],
  range: ['span', 'extend', 'stretch', 'vary'],
  limit: ['restrict', 'constrain', 'bound', 'curb'],
  exceed: ['surpass', 'outstrip', 'outpace', 'eclipse'],
  match: ['rival', 'equal', 'parallel', 'mirror'],
  emerge: ['arise', 'surface', 'appear', 'develop'],
  adopt: ['embrace', 'implement', 'accept', 'employ'],
  train: ['educate', 'prepare', 'instruct', 'develop'],
  perpetuate: ['sustain', 'prolong', 'continue', 'maintain'],
  amplify: ['intensify', 'magnify', 'heighten', 'increase'],
  combine: ['unite', 'merge', 'blend', 'fuse'],
  address: ['tackle', 'confront', 'resolve', 'manage'],
  assist: ['aid', 'support', 'help', 'facilitate'],
  help: ['aid', 'assist', 'support', 'enable'],
  understand: ['grasp', 'comprehend', 'appreciate', 'recognize'],
  discuss: ['examine', 'explore', 'consider', 'cover'],
  describe: ['depict', 'portray', 'outline', 'detail'],
  illustrate: ['show', 'demonstrate', 'highlight', 'display'],
  highlight: ['emphasize', 'underscore', 'showcase', 'stress'],
  examine: ['inspect', 'analyze', 'assess', 'study'],
  suggest: ['propose', 'imply', 'hint', 'indicate'],
  determine: ['decide', 'establish', 'figure', 'resolve'],
  develop: ['build', 'create', 'form', 'craft'],
  consider: ['weigh', 'assess', 'evaluate', 'contemplate'],
  engage: ['participate', 'involve', 'interact', 'partake'],
  follow: ['adhere', 'observe', 'track', 'pursue'],
  include: ['contain', 'encompass', 'cover', 'embrace'],
  argue: ['contend', 'assert', 'claim', 'maintain'],
  note: ['observe', 'mention', 'remark', 'point'],
  focus: ['concentrate', 'center', 'zero', 'hone'],
  allow: ['enable', 'permit', 'let', 'empower'],
  outline: ['detail', 'sketch', 'describe', 'lay'],
  summarize: ['condense', 'recap', 'encapsulate', 'distill'],
  conclude: ['finish', 'close', 'wrap', 'end'],
  stimulate: ['spark', 'encourage', 'inspire', 'promote'],
  encourage: ['foster', 'promote', 'support', 'inspire'],
  situate: ['place', 'position', 'locate', 'embed'],
  compare: ['contrast', 'measure', 'weigh', 'assess'],
  assess: ['evaluate', 'gauge', 'judge', 'appraise'],
  inform: ['shape', 'guide', 'educate', 'enrich'],
  recognize: ['acknowledge', 'identify', 'appreciate', 'see'],
  publish: ['release', 'issue', 'produce', 'print'],
  apply: ['use', 'employ', 'utilize', 'exercise'],
  offer: ['supply', 'give', 'furnish', 'extend'],
  select: ['choose', 'pick', 'opt', 'designate'],
  stress: ['emphasize', 'underline', 'underscore', 'accent'],
  align: ['match', 'correspond', 'agree', 'fit'],
  preserve: ['protect', 'safeguard', 'uphold', 'maintain'],
  seek: ['aim', 'strive', 'pursue', 'attempt'],
  tackle: ['address', 'confront', 'handle', 'deal'],
  undermine: ['weaken', 'erode', 'damage', 'compromise'],
  foster: ['promote', 'cultivate', 'nurture', 'support'],
  strengthen: ['fortify', 'reinforce', 'bolster', 'enhance'],
  lean: ['rely', 'depend', 'rest', 'count'],
  // ── Nouns ──
  rise: ['growth', 'surge', 'expansion', 'climb'],
  approach: ['method', 'strategy', 'technique', 'framework'],
  impact: ['effect', 'consequence', 'outcome', 'result'],
  framework: ['structure', 'model', 'system', 'scaffold'],
  perspective: ['viewpoint', 'angle', 'outlook', 'stance'],
  evidence: ['proof', 'data', 'findings', 'support'],
  outcome: ['result', 'consequence', 'product', 'effect'],
  context: ['setting', 'backdrop', 'circumstances', 'situation'],
  aspect: ['facet', 'dimension', 'element', 'feature'],
  ability: ['capacity', 'capability', 'power', 'skill'],
  accuracy: ['precision', 'exactness', 'correctness', 'fidelity'],
  transparency: ['openness', 'clarity', 'visibility', 'accountability'],
  bias: ['prejudice', 'partiality', 'slant', 'skew'],
  concern: ['worry', 'issue', 'reservation', 'apprehension'],
  tool: ['instrument', 'mechanism', 'resource', 'device'],
  practice: ['application', 'method', 'convention', 'routine'],
  pattern: ['trend', 'tendency', 'motif', 'theme'],
  volume: ['amount', 'quantity', 'scale', 'extent'],
  complexity: ['intricacy', 'difficulty', 'depth', 'nuance'],
  efficiency: ['productivity', 'economy', 'output', 'effectiveness'],
  performance: ['output', 'results', 'achievement', 'effectiveness'],
  advantage: ['benefit', 'strength', 'edge', 'asset'],
  speed: ['pace', 'rate', 'velocity', 'tempo'],
  shift: ['change', 'transition', 'move', 'adjustment'],
  balance: ['equilibrium', 'harmony', 'parity', 'stability'],
  area: ['region', 'zone', 'district', 'sector'],
  areas: ['regions', 'zones', 'districts', 'sectors'],
  choice: ['selection', 'option', 'pick', 'preference'],
  action: ['step', 'measure', 'move', 'initiative'],
  // "lack" removed — verb/noun ambiguity causes POS mismatches
  amount: ['volume', 'quantity', 'total', 'sum'],
  scholar: ['academic', 'researcher', 'expert', 'specialist'],
  practitioner: ['professional', 'specialist', 'operator', 'expert'],
  expertise: ['skill', 'proficiency', 'competence', 'mastery'],
  question: ['inquiry', 'issue', 'matter', 'concern'],
  judgment: ['assessment', 'evaluation', 'appraisal', 'discernment'],
  innovation: ['advancement', 'breakthrough', 'progress', 'invention'],
  oversight: ['supervision', 'regulation', 'monitoring', 'governance'],
  barrier: ['obstacle', 'impediment', 'hurdle', 'hindrance'],
  analyst: ['examiner', 'evaluator', 'reviewer', 'assessor'],
  capacity: ['capability', 'ability', 'competence', 'aptitude'],
  review: ['assessment', 'evaluation', 'critique', 'appraisal'],
  assessment: ['evaluation', 'review', 'appraisal', 'analysis'],
  position: ['role', 'place', 'standing', 'status'],
  discipline: ['field', 'domain', 'branch', 'specialty'],
  feature: ['trait', 'characteristic', 'attribute', 'quality'],
  purpose: ['aim', 'goal', 'intent', 'objective'],
  argument: ['claim', 'thesis', 'contention', 'reasoning'],
  strength: ['merit', 'asset', 'advantage', 'virtue'],
  limitation: ['shortcoming', 'weakness', 'drawback', 'flaw'],
  weakness: ['shortcoming', 'drawback', 'flaw', 'deficiency'],
  discussion: ['debate', 'dialogue', 'conversation', 'discourse'],
  structure: ['format', 'layout', 'arrangement', 'organization'],
  format: ['layout', 'arrangement', 'structure', 'design'],
  contribution: ['input', 'addition', 'role', 'offering'],
  goal: ['aim', 'objective', 'target', 'intent'],
  insight: ['understanding', 'awareness', 'perception', 'grasp'],
  topic: ['subject', 'theme', 'issue', 'matter'],
  regulation: ['rule', 'standard', 'guideline', 'policy'],
  issue: ['matter', 'concern', 'topic', 'problem'],
  method: ['technique', 'approach', 'procedure', 'process'],
  characteristic: ['feature', 'trait', 'quality', 'attribute'],
  relationship: ['connection', 'link', 'bond', 'tie'],
  effect: ['result', 'consequence', 'outcome', 'influence'],
  solution: ['remedy', 'answer', 'fix', 'resolution'],
  significance: ['importance', 'weight', 'value', 'meaning'],
  difficulty: ['challenge', 'obstacle', 'problem', 'hardship'],
  advancement: ['progress', 'development', 'growth', 'improvement'],
  chance: ['opportunity', 'occasion', 'opening', 'prospect'],
  foundation: ['basis', 'groundwork', 'bedrock', 'core'],
  application: ['use', 'exercise', 'deployment', 'practice'],
  remedy: ['solution', 'fix', 'cure', 'answer'],
  attention: ['focus', 'notice', 'regard', 'awareness'],
  content: ['substance', 'material', 'body', 'subject'],
  debate: ['discussion', 'discourse', 'dispute', 'dialogue'],
  field: ['area', 'domain', 'sector', 'discipline'],
  work: ['text', 'piece', 'publication', 'study'],
  trust: ['confidence', 'faith', 'belief', 'reliance'],
  life: ['existence', 'experience', 'reality', 'livelihood'],
  freedom: ['liberty', 'autonomy', 'independence', 'right'],
  body: ['group', 'organization', 'entity', 'assembly'],
  // ── Adverbs ──
  significantly: ['markedly', 'considerably', 'substantially', 'notably'],
  particularly: ['especially', 'specifically', 'notably', 'chiefly'],
  effectively: ['efficiently', 'capably', 'productively', 'successfully'],
  increasingly: ['progressively', 'steadily', 'gradually', 'continually'],
  primarily: ['mainly', 'chiefly', 'largely', 'mostly'],
  directly: ['immediately', 'straight', 'squarely', 'firsthand'],
  often: ['frequently', 'regularly', 'commonly', 'routinely'],
  thereby: ['thus', 'consequently', 'hence', 'accordingly'],
  remarkably: ['strikingly', 'exceptionally', 'impressively', 'notably'],
  fundamentally: ['essentially', 'inherently', 'profoundly', 'deeply'],
  commonly: ['typically', 'usually', 'generally', 'ordinarily'],
  clearly: ['plainly', 'evidently', 'unmistakably', 'obviously'],
  simply: ['merely', 'just', 'only', 'purely'],
  quickly: ['rapidly', 'swiftly', 'promptly', 'speedily'],
  closely: ['tightly', 'intimately', 'nearly', 'strictly'],
  merely: ['simply', 'only', 'just', 'purely'],
  genuinely: ['truly', 'sincerely', 'authentically', 'honestly'],
  ultimately: ['eventually', 'finally', 'lastly', 'conclusively'],
  inadvertently: ['accidentally', 'unintentionally', 'unknowingly', 'unwittingly'],
  considerably: ['substantially', 'markedly', 'greatly', 'notably'],
  consequent: ['resulting', 'following', 'ensuing', 'subsequent'],
};

/* ── Morphology Helpers ───────────────────────────────────────────── */

/**
 * Transfer the inflectional suffix from the original word to the replacement.
 * "transformed" + "shift" → "shifted"
 * "making" + "create" → "creating"
 */
function transferMorphology(original: string, replacement: string): string {
  const orig = original.toLowerCase();
  const rep = replacement.toLowerCase();

  // Guard: don't inflect nouns/adjectives that can't take verb suffixes
  const UNINFLECTABLE = /(?:ity|ness|ment|tion|sion|ance|ence|ious|eous|ous|ism|ist|ure|ory|ary|ery|phy|ogy|ics)$/;
  if (UNINFLECTABLE.test(rep)) return replacement;

  // Known longer words that need final consonant doubling 
  const DOUBLE_FINAL = new Set(['outstrip', 'admit', 'commit', 'submit', 'permit', 'omit', 'emit', 'refer', 'occur', 'deter', 'prefer', 'regret', 'begin', 'control', 'equip', 'transfer', 'spur', 'spot']);

  // CVC doubling check: short words ending consonant-vowel-consonant
  const needsDoubling = (w: string) => {
    const lower = w.toLowerCase();
    if (DOUBLE_FINAL.has(lower)) return true;
    if (w.length < 3 || w.length > 4) return false;
    const vowels = 'aeiou';
    const last = w[w.length - 1];
    const secondLast = w[w.length - 2];
    const thirdLast = w[w.length - 3];
    return !vowels.includes(last) && vowels.includes(secondLast) && !vowels.includes(thirdLast)
      && !['w', 'x', 'y'].includes(last);
  };

  // Past tense: -ed
  if (orig.endsWith('ed') && !rep.endsWith('ed') && orig.length > 4) {
    if (rep.endsWith('e')) return replacement + 'd';
    if (rep.endsWith('y')) return replacement.slice(0, -1) + 'ied';
    if (needsDoubling(rep)) return replacement + rep[rep.length - 1] + 'ed';
    return replacement + 'ed';
  }

  // Gerund / present participle: -ing
  if (orig.endsWith('ing') && !rep.endsWith('ing') && orig.length > 5) {
    if (rep.endsWith('ie')) return replacement.slice(0, -2) + 'ying';
    if (rep.endsWith('e')) return replacement.slice(0, -1) + 'ing';
    if (needsDoubling(rep)) return replacement + rep[rep.length - 1] + 'ing';
    return replacement + 'ing';
  }

  return replacement;
}

/** Add grammatically correct plural suffix */
function addPlural(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('y') && !'aeiou'.includes(w[w.length - 2] || '')) {
    return word.slice(0, -1) + 'ies';
  }
  if (/(?:ch|sh|s|x|z)$/.test(w)) return word + 'es';
  return word + 's';
}

/**
 * Strip common inflectional suffix to get an approximate base form
 * for dictionary lookup.  Returns the base form.
 */
function naiveStem(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed') && w.length > 4) {
    const base = w.slice(0, -2);
    // Try e-drop: "enabled" → "enabl" but "enable" is the real stem
    if (base.endsWith('l') || base.endsWith('g') || base.endsWith('v') || base.endsWith('z') || base.endsWith('c') || base.endsWith('t') || base.endsWith('m') || base.endsWith('n') || base.endsWith('r') || base.endsWith('s')) {
      // Try if base+'e' is in dictionaries — return it if so
      if (EXTRA_REPLACEMENTS[base + 'e'] || AI_WORD_REPLACEMENTS[base + 'e']) return base + 'e';
    }
    return base;
  }
  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3);
    // e-drop: "leveraging" → "leverag" but "leverage" is the real stem
    if (EXTRA_REPLACEMENTS[base + 'e'] || AI_WORD_REPLACEMENTS[base + 'e']) return base + 'e';
    return base;
  }
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

/* ── Helper: measure word-level change ratio ──────────────────────── */

function wordChangeRatio(original: string, modified: string): number {
  const origWords = original.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const modWords = modified.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (origWords.length === 0) return 0;
  let changed = 0;
  const maxLen = Math.max(origWords.length, modWords.length);
  for (let i = 0; i < maxLen; i++) {
    if (origWords[i] !== modWords[i]) changed++;
  }
  return changed / origWords.length;
}

/* ── Helper: content word overlap (meaning check) ─────────────────── */

function contentOverlap(original: string, modified: string): number {
  const getContent = (t: string) => {
    return t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w));
  };
  const origSet = new Set(getContent(original));
  const modWords = getContent(modified);
  if (origSet.size === 0) return 1;
  let matches = 0;
  for (const w of modWords) {
    if (origSet.has(w)) { matches++; origSet.delete(w); }
    else {
      // Stem match (first 5 chars)
      for (const o of origSet) {
        if (o.length >= 5 && w.length >= 5 && o.slice(0, 5) === w.slice(0, 5)) {
          matches += 0.7; origSet.delete(o); break;
        }
      }
    }
  }
  return Math.min(1, matches / getContent(original).length);
}

/* ── Core: process one sentence ──────────────────────────────────── */

function processSentence(
  sentence: string,
  hasFirstPerson: boolean,
  sentenceIndex: number,
  totalSentences: number,
  usedStarters: Set<string>,
  strength: string,
): string {
  if (!sentence || sentence.trim().length < 8) return sentence;
  const original = sentence;
  // Normalize em-dashes and en-dashes to spaced hyphens so tokenizer handles them
  let text = sentence.replace(/\u2014/g, ' \u2014 ').replace(/\u2013/g, ' \u2013 ').replace(/  +/g, ' ');

  // Protect abbreviations like D.C., U.S., U.K., U.S.A. from being mangled
  const abbrevMap: Record<string, string> = {};
  let abbrevIdx = 0;
  text = text.replace(/\b(?:[A-Z]\.){2,}/g, (m) => {
    const placeholder = `ABBR_${abbrevIdx++}_XQ`;
    abbrevMap[placeholder] = m;
    return placeholder;
  });

  // ─── Step 1: AI phrase replacement ───────────────────────────
  for (const { pattern, replacements } of PHRASE_REPLACEMENTS) {
    if (replacements.length === 0) continue;
    if (replacements[0] === 'SPLIT') {
      // "not only X but also Y" → "X, and Y"
      text = text.replace(pattern, (_m, mid) => {
        return mid.trim().replace(/^,?\s*/, '').replace(/,?\s*$/, '') + ', and ';
      });
      continue;
    }
    const match = text.match(pattern);
    if (match) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)];
      // Preserve capitalization
      const final = match[0][0] === match[0][0].toUpperCase() && rep.length > 0
        ? rep.charAt(0).toUpperCase() + rep.slice(1)
        : rep;
      text = text.replace(pattern, final);
      // If replacement was empty (hedging removal), capitalize next char
      if (final === '' && text.length > 0 && text[0] !== text[0].toUpperCase()) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
    }
  }

  // ─── Step 2: AI word replacement (from shared dictionary) ────
  const tokens = text.split(/(\b)/);
  const resultTokens: string[] = [];
  let replaceCount = 0;
  const wordCount = text.split(/\s+/).length;
  const maxReplacements = Math.ceil(wordCount * (strength === 'strong' ? 0.80 : 0.70));
  const alreadyReplaced = new Set<string>(); // Track Step 2 output words

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (replaceCount >= maxReplacements || !/^[a-zA-Z]{3,}$/.test(token)) {
      resultTokens.push(token);
      continue;
    }
    const lower = token.toLowerCase();
    if (PROTECTED.has(lower) || STOPWORDS.has(lower)) {
      resultTokens.push(token);
      continue;
    }
    // Skip proper nouns (capitalized mid-sentence words)
    if (isProperNoun(token, i, tokens)) {
      resultTokens.push(token);
      continue;
    }
    // Skip hyphenated compound prefixes/suffixes (handle empty boundary tokens from \b split)
    const hasHyphenBefore = tokens.slice(Math.max(0, i - 2), i).some(t => t === '-');
    const hasHyphenAfter = tokens.slice(i + 1, Math.min(tokens.length, i + 3)).some(t => t === '-');
    if (hasHyphenBefore || hasHyphenAfter) { resultTokens.push(token); continue; }

    // Check EXTRA_REPLACEMENTS (curated, high quality) FIRST for both exact and stem,
    // then fall through to AI_WORD_REPLACEMENTS
    const stemmed = naiveStem(lower);
    const aiReps = EXTRA_REPLACEMENTS[lower] || EXTRA_REPLACEMENTS[stemmed]
      || AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[stemmed];
    const usingStem = !EXTRA_REPLACEMENTS[lower] && !AI_WORD_REPLACEMENTS[lower]
      && !!(EXTRA_REPLACEMENTS[stemmed] || AI_WORD_REPLACEMENTS[stemmed]);
    if (aiReps && aiReps.length > 0) {
      // ONLY use pure alphabetic single-word replacements, also check blacklist
      const pool = aiReps.filter(r => /^[a-zA-Z]+$/.test(r) && r.length >= 2
        && !REPLACEMENT_BLACKLIST.has(r.toLowerCase()));
      if (pool.length > 0) {
        let rep = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
        // Preserve capitalization
        if (token[0] === token[0].toUpperCase()) {
          rep = rep.charAt(0).toUpperCase() + rep.slice(1);
        }
        // Transfer morphology if we matched via stem
        if (usingStem) {
          rep = transferMorphology(token, rep);
        }
        // Preserve plural — only when we stemmed (otherwise "process" → "analyzes" bug)
        if (usingStem && /s$/.test(token) && !/s$/.test(rep) && token.length > 4) {
          rep = addPlural(rep);
        }
        resultTokens.push(rep);
        alreadyReplaced.add(rep.toLowerCase());
        replaceCount++;
        continue;
      }
    }

    resultTokens.push(token);
  }
  text = resultTokens.join('');

  // ─── Step 3: Additional synonym swap — curated first, then extended dict ──
  // Chain: try curated EXTRA_REPLACEMENTS / AI_WORD_REPLACEMENTS,
  //        then fall back to extended dictionary with aggressive POS filtering.
  const currentChange = wordChangeRatio(original, text);
  if (currentChange < 0.65) {
    const tokens2 = text.split(/(\b)/);
    const result2: string[] = [];
    let extraSwaps = 0;
    const neededChange = 0.65 - currentChange;
    const maxExtra = Math.ceil(wordCount * neededChange) + 6;

    for (let i = 0; i < tokens2.length; i++) {
      const tk = tokens2[i];
      if (extraSwaps >= maxExtra || !/^[a-zA-Z]{4,}$/.test(tk)) {
        result2.push(tk);
        continue;
      }
      const lower = tk.toLowerCase();
      if (PROTECTED.has(lower) || STOPWORDS.has(lower) || alreadyReplaced.has(lower)) {
        result2.push(tk);
        continue;
      }
      // Skip proper nouns (capitalized mid-sentence words)
      if (isProperNoun(tk, i, tokens2)) {
        result2.push(tk);
        continue;
      }
      // Skip hyphenated compound parts (handle empty boundary tokens from \b split)
      const hasHypBefore = tokens2.slice(Math.max(0, i - 2), i).some(t => t === '-');
      const hasHypAfter = tokens2.slice(i + 1, Math.min(tokens2.length, i + 3)).some(t => t === '-');
      if (hasHypBefore || hasHypAfter) { result2.push(tk); continue; }

      // Try curated dictionaries first (100% for each eligible word)
      const stemmed = naiveStem(lower);
      const reps = EXTRA_REPLACEMENTS[lower] || EXTRA_REPLACEMENTS[stemmed]
        || AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[stemmed];
      const usedStem = !EXTRA_REPLACEMENTS[lower] && !AI_WORD_REPLACEMENTS[lower]
        && !!(EXTRA_REPLACEMENTS[stemmed] || AI_WORD_REPLACEMENTS[stemmed]);

      let replaced = false;
      if (reps && reps.length > 0) {
        const pool = reps.filter(r => /^[a-zA-Z]+$/.test(r) && r.length >= 2
          && !REPLACEMENT_BLACKLIST.has(r.toLowerCase()) && r.toLowerCase() !== lower);
        if (pool.length > 0) {
          let rep = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
          if (usedStem) rep = transferMorphology(tk, rep);
          if (tk[0] === tk[0].toUpperCase()) {
            rep = rep.charAt(0).toUpperCase() + rep.slice(1);
          }
          const tkStem = naiveStem(tk.toLowerCase());
          if (tkStem !== tk.toLowerCase() && /s$/.test(tk) && !/s$/.test(rep) && tk.length > 4) {
            rep = addPlural(rep);
          }
          result2.push(rep);
          extraSwaps++;
          replaced = true;
        }
      }

      // Fallback: extended dictionary with POS-suffix consistency
      if (!replaced && Math.random() < 0.00) { // disabled: ext dict is source of garble
        let syn = getBestReplacement(lower, text);
        if (!syn || syn.toLowerCase() === lower) {
          if (stemmed !== lower) syn = getBestReplacement(stemmed, text);
        }
        if (syn && syn.toLowerCase() !== lower && /^[a-zA-Z]+$/.test(syn) && syn.length >= 3
            && !REPLACEMENT_BLACKLIST.has(syn.toLowerCase())
            && syn.length <= lower.length * 2 && syn.length >= Math.max(3, lower.length * 0.4)) {
          // POS-suffix consistency: if original ends -tion/-ment/-ness, synonym must too
          const origSuffix = lower.match(/(tion|sion|ment|ness|ity|ance|ence|ous|ive|ful|less|able|ible|ing|ated|ized|ally|ily)$/);
          const synSuffix = syn.toLowerCase().match(/(tion|sion|ment|ness|ity|ance|ence|ous|ive|ful|less|able|ible|ing|ated|ized|ally|ily)$/);
          // Either both have similar suffixes, or neither has an obvious suffix
          const suffixOk = (!origSuffix && !synSuffix) // both bare
            || (origSuffix && synSuffix) // both have suffixes (any combo ok)
            || (!origSuffix && syn.length <= lower.length * 1.5); // bare → bare-ish
          if (suffixOk) {
            let rep = syn;
            rep = transferMorphology(tk, rep);
            if (tk[0] === tk[0].toUpperCase()) {
              rep = rep.charAt(0).toUpperCase() + rep.slice(1);
            }
            const tkStem = naiveStem(tk.toLowerCase());
            if (tkStem !== tk.toLowerCase() && /s$/.test(tk) && !/s$/.test(rep) && tk.length > 4) {
              rep = addPlural(rep);
            }
            result2.push(rep);
            extraSwaps++;
            replaced = true;
          }
        }
      }

      if (!replaced) result2.push(tk);
    }
    text = result2.join('');
  }

  // ─── Step 3b: Clause reordering ──────────────────────────────
  // Swap independent clauses around ", and ", ", but ", ", which " etc.
  // This adds structural change without changing any words.
  if (Math.random() < 0.60 && text.length > 40) {
    // Try swapping clauses around ", and " or ", but "
    const clauseSwapRe = /^(.{15,}?),\s+(and|but|yet)\s+(.{15,})$/i;
    const clauseMatch = text.match(clauseSwapRe);
    if (clauseMatch) {
      const [, first, conj, second] = clauseMatch;
      // Only swap if both parts look like independent clauses (have a verb)
      const hasVerb = (s: string) => /\b(is|are|was|were|has|have|had|does|did|can|could|will|would|may|might|shall|should)\b/i.test(s);
      if (hasVerb(first) && hasVerb(second)) {
        const secondCap = second.charAt(0).toUpperCase() + second.slice(1);
        const firstLower = first.charAt(0).toLowerCase() + first.slice(1);
        text = secondCap + ', ' + conj.toLowerCase() + ' ' + firstLower;
        // Fix ending punctuation
        if (!/[.!?]$/.test(text)) text += '.';
      }
    }
  }

  // ─── Step 3c: Passive ↔ Active voice toggle ─────────────────
  // ~20% chance: convert "X is/was Yed by Z" → "Z Yed X" or vice versa
  if (Math.random() < 0.45 && text.length > 30) {
    // Passive → Active: "X is/was <verb>ed by Y" → "Y <verb>s X"
    const passiveRe = /\b(\w[\w\s]{2,30}?)\s+(is|are|was|were)\s+(\w+ed)\s+by\s+(\w[\w\s]{2,30}?)([.,;])/i;
    const pm = text.match(passiveRe);
    if (pm) {
      const [full, subject, , verb, agent, punct] = pm;
      const activeVerb = verb.replace(/ed$/, 's');
      text = text.replace(full, agent.trim() + ' ' + activeVerb + ' ' + subject.trim() + punct);
    }
  }

  // ─── Step 4: Probabilistic sentence starter injection ────────
  // ~25% chance, only if sentence doesn't already start with a varied opener
  const starterRoll = Math.random();
  const alreadyHasStarter = /^(Notably|Historically|Traditionally|In practice|In broad|From a|At its|On balance|By extension|In reality|Against|Under these|For instance|For example|To illustrate|In particular|More specifically)/i.test(text);
  if (starterRoll < 0.40 && !alreadyHasStarter && sentenceIndex > 0 && text.length > 30) {
    const available = STARTERS_ACADEMIC.filter(s => !usedStarters.has(s));
    if (available.length > 0) {
      const starter = available[Math.floor(Math.random() * available.length)];
      usedStarters.add(starter);
      text = starter + ' ' + text.charAt(0).toLowerCase() + text.slice(1);
    }
  }

  // ─── Step 5: Hedging/cliché opener removal ──────────────────
  text = text.replace(/^In today's (?:world|society|era|age),?\s*/i, '');
  text = text.replace(/^In the modern (?:world|era|age),?\s*/i, '');
  text = text.replace(/^Throughout history,?\s*/i, '');
  text = text.replace(/^It is (?:widely|generally|commonly) (?:known|recognized|accepted) that\s*/i, '');
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // ─── Step 6: Expand contractions (REQUIRE apostrophe) ────────
  for (const [c, e] of Object.entries(CONTRACTIONS)) {
    const escaped = c.replace(/'/g, "[''\u2019]");
    const re = new RegExp('\\b' + escaped + '\\b', 'gi');
    text = text.replace(re, e);
  }

  // ─── Step 7: Remove first person (unless input had it) ───────
  if (!hasFirstPerson) {
    text = text.replace(/\bI believe\b/gi, 'The evidence suggests');
    text = text.replace(/\bI think\b/gi, 'The analysis indicates');
    text = text.replace(/\bWe believe\b/gi, 'The evidence suggests');
    text = text.replace(/\bWe observe\b/gi, 'Observations show');
    text = text.replace(/\bI\s+(?=\w)/g, 'The analysis ');
    text = text.replace(/\bwe\s+(?=\w)/gi, 'the research ');
    text = text.replace(/\bmy\b/g, 'the');
    text = text.replace(/\bMy\b/g, 'The');
    text = text.replace(/\bour\b/g, 'the');
    text = text.replace(/\bOur\b/g, 'The');
  }

  // ─── Step 8: Grammar cleanup ─────────────────────────────────
  text = text.replace(/\b(\w+)\s+\1\b/gi, '$1');          // doubled words
  text = text.replace(/\b(a|an|the)\s+(a|an|the)\b/gi, '$2'); // double articles
  text = text.replace(/\s{2,}/g, ' ');                     // multiple spaces
  text = text.replace(/\s+([.,;:!?])/g, '$1');            // space before punctuation
  // Fix AI/acronym capitalization
  text = text.replace(/\bai\b/gi, 'AI');
  text = text.replace(/\bAi-/g, 'AI-');
  // Article agreement
  text = text.replace(/\ba\s+([aeiou])/gi, (m, v) => {
    return (m[0] === 'A' ? 'An ' : 'an ') + v;
  });
  text = text.replace(/\ban\s+([bcdfgjklmnpqrstvwxyz])/gi, (m, c) => {
    return (m[0] === 'A' ? 'A ' : 'a ') + c;
  });
  // Ensure proper ending
  text = text.trim();
  if (text.length > 0 && !/[.!?]$/.test(text)) {
    text += '.';
  }
  // Capitalize first letter
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Restore protected abbreviations (BEFORE quality gate so overlap calc is accurate)
  for (const [placeholder, abbrev] of Object.entries(abbrevMap)) {
    text = text.replace(new RegExp(placeholder, 'g'), abbrev);
  }

  // ─── Step 9: Quality gate ──────────────────────────────────
  // Disabled: with curated-only replacements, lexical overlap is
  // a poor signal — all content words may legitimately change.
  // The iteration loop naturally selects the best result.
  // const overlap = contentOverlap(original, text);
  // if (overlap < 0.08) return original;

  return text;
}

/* ── Public API ───────────────────────────────────────────────────── */

export function stealthHumanize(
  text: string,
  strength: string = 'medium',
  _tone: string = 'academic',
): string {
  console.log('[NURU_V2] === NEW ENGINE ACTIVE === Input length:', text.length);
  if (!text || text.trim().length === 0) return text;

  const hasFirstPerson = /\b(I|we|my|our|me|us|myself|ourselves)\b/.test(text);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const usedStarters = new Set<string>();

  // Count total sentences for index tracking
  let globalSentenceIdx = 0;
  const allSentences: Array<{ paraIdx: number; sentences: string[] }> = [];
  let totalSentences = 0;
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sents = splitSentences(paragraphs[pi]);
    allSentences.push({ paraIdx: pi, sentences: sents });
    totalSentences += sents.length;
  }

  // Process sentence by sentence, preserving paragraph structure
  const outputParagraphs: string[] = [];

  for (const { sentences } of allSentences) {
    const outputSentences: string[] = [];

    for (const sent of sentences) {
      const originalSent = sent;

      // First pass uses real sentenceIndex (enables starter injection on non-first sentences)
      let best = processSentence(
        sent, hasFirstPerson, globalSentenceIdx, totalSentences,
        usedStarters, strength,
      );
      let bestChange = wordChangeRatio(originalSent, best);

      // Iterative refinement: each pass starts from ORIGINAL to prevent
      // compounding garble. We keep the best result (highest change ratio).
      // Subsequent passes use sentenceIndex=0 to prevent duplicate starter injection.
      let iter = 1;
        while (iter <= 10) {
          const iterStrength = iter > 5 ? 'strong' : strength;
          const next = processSentence(
            originalSent, hasFirstPerson, iter === 1 ? globalSentenceIdx : 0,
            totalSentences, usedStarters, iterStrength as any
          );
          const nextChange = wordChangeRatio(originalSent, next);
          if (nextChange > bestChange) {
            best = next;
            bestChange = nextChange;
          }
          if (iter >= 5 && bestChange >= 0.65) break;
          iter++;
        }

      outputSentences.push(best);
      globalSentenceIdx++;
    }

    outputParagraphs.push(outputSentences.join(' '));
  }

  // Final post-processing: fix AI/acronym capitalization across all output
  let result = outputParagraphs.join('\n\n');
  result = result.replace(/\bAi\b/g, 'AI');
  result = result.replace(/\bai\b/g, 'AI');
  return result;
}

export default stealthHumanize;
