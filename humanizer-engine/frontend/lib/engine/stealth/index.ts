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
import { runFullDetectorForensicsCleanup } from './forensics';
import { detectDomain, getProtectedTermsForDomain } from '../domain-detector';
import { resolveStrategy, type DomainStrategy } from '../domain-strategies';

// Module-level strategy populated per-call by stealthHumanize
let _stealthStrategy: DomainStrategy | null = null;

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
  { pattern: /\bat the same time\b/gi, replacements: ['simultaneously', 'concurrently'] },
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
  { pattern: /\bplays a (?:significant |important |key |crucial |vital |critical |pivotal )?role in\b/gi, replacements: ['shapes', 'affects', 'influences'] },
  { pattern: /\bhave an impact on\b/gi, replacements: ['affect', 'influence'] },
  { pattern: /\bhas an impact on\b/gi, replacements: ['affects', 'influences'] },
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
  // ── Extended AI-tell patterns (borrowed from AntiPangram forensics) ──
  { pattern: /\bwhich contributes? to (?:better |improved |enhanced |greater |stronger |more effective )?/gi, replacements: [', improving', '. This supports'] },
  { pattern: /\bResearch has shown that\b/gi, replacements: ['Studies show', 'Evidence shows', 'Research shows'] },
  { pattern: /\bstudies have shown that\b/gi, replacements: ['Research shows', 'Evidence suggests'] },
  { pattern: /\bit is widely (?:recognized|acknowledged|accepted) that\b/gi, replacements: ['Most agree that', 'It is known that'] },
  { pattern: /\bone of the (?:major|key|most important|primary|greatest|significant) (?:strengths|advantages|benefits|features) of\b/gi, replacements: ['a strength of', 'a benefit of', 'an advantage of'] },
  { pattern: /\bprovides (?:a |an )?(?:comprehensive|holistic|thorough) (?:overview|understanding|analysis|examination) of\b/gi, replacements: ['covers', 'examines', 'looks closely at'] },
  { pattern: /\bhas (?:gained|garnered|received|attracted) (?:significant|considerable|substantial|growing|increasing) (?:attention|interest|focus|traction)\b/gi, replacements: ['has drawn attention', 'has become a topic of interest', 'has become more studied'] },
  { pattern: /\bthis (?:study|paper|research|analysis|article) (?:aims|seeks|attempts|endeavors) to\b/gi, replacements: ['this work looks to', 'the goal here is to', 'the focus is on'] },
  { pattern: /\bserves as (?:a |an )?(?:critical|crucial|vital|important|key|essential) (?:tool|mechanism|framework|foundation)\b/gi, replacements: ['works as a tool', 'acts as a base', 'functions as a framework'] },
  { pattern: /\bultimately (?:leads|leading) to\b/gi, replacements: ['eventually causing', 'resulting in'] },
  { pattern: /\bultimately (?:drives|driving)\b/gi, replacements: ['eventually pushing', 'helping push'] },
  { pattern: /\bthis is particularly (?:important|relevant|significant|notable|true) (?:because|since|as|given)\b/gi, replacements: ['this matters because', 'this stands out since'] },
  { pattern: /\bthis (?:highlights|underscores|emphasizes) the (?:importance|need|significance|value) of\b/gi, replacements: ['this points to the value of', 'this shows why it matters to focus on'] },
];

/* ── Evaluative Phrase Surgery (sentence-level AI signal removal) ── */

const EVALUATIVE_SURGERIES: Array<{ pattern: RegExp; replaceFn: (match: string, ...groups: string[]) => string }> = [
  {
    // "One of the major/key strengths/advantages of X is"
    pattern: /\b[Oo]ne of the (?:major|key|most important|primary|greatest|significant) (?:strengths|advantages|benefits|features) of (.+?) is (?:its |that it |the fact that it )?/gi,
    replaceFn: (_m, subject) => `${subject.trim()} `,
  },
  {
    // "It is widely used in the treatment of" → "It treats"
    pattern: /\b[Ii]t is widely used in the (?:treatment|management|handling) of\b/gi,
    replaceFn: () => {
      const alts = ['It treats', 'It is used to treat', 'It addresses'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "By understanding X, individuals can learn how to Y"
    pattern: /\b[Bb]y (?:understanding|recognizing|identifying|addressing|examining|exploring) (?:these |this |the )?([\w\s]+?),\s*(?:individuals|people|organizations|companies|teams) can (?:learn (?:how )?to |begin to |start to )?/gi,
    replaceFn: (_m, topic) => {
      const alts = [
        `Understanding ${topic.trim()} helps `,
        `Knowing about ${topic.trim()} means they can `,
        `With a grasp of ${topic.trim()}, it becomes easier to `,
      ];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "As a result, people become more confident in"
    pattern: /\b[Aa]s a result,?\s*(?:people|individuals|organizations) become (?:more )?/gi,
    replaceFn: () => {
      const alts = ['People end up ', 'This makes them ', 'So they get '];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "It is based on the idea that"
    pattern: /\b[Ii]t is based on the idea that\b/gi,
    replaceFn: () => {
      const alts = ['The idea is that', 'The premise is that', 'It works on the basis that'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
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
  // ASD / sensory integration / therapy domain terms
  'sensory', 'integration', 'autism', 'asd', 'spectrum', 'disorder',
  'occupational', 'therapy', 'therapist', 'therapists', 'intervention',
  'interventions', 'stimulation', 'hypersensitivity', 'hyposensitivity',
  'neuroimaging', 'wearable', 'sensors', 'fnirs', 'footscan',
  'caregivers', 'caregiver', 'neuroscience', 'psychology',
  'behavioral', 'developmental', 'cognitive', 'motor', 'executive',
  'longitudinal', 'interdisciplinary', 'standardized', 'protocols',
  'generalization', 'inclusive', 'personalized', 'individualized',
  'sustained', 'physiological', 'adaptive', 'interactive',
  'practitioner', 'practitioners', 'clinician', 'clinicians',
  'multi-sensory', 'multisensory',
  // Key academic terms that garble when replaced
  'processing', 'performance', 'relationships', 'environments',
  'development', 'populations', 'settings', 'evidence', 'outcomes',
  'community', 'practices', 'assessment', 'emerging', 'ensuring',
  'remaining', 'including', 'culturally', 'responsive', 'work',
  'tools', 'measures', 'profiles', 'frameworks', 'presents',
  'early', 'remains', 'academic',
  // Clinical/research vocab that morphology destroys
  'limited', 'validated', 'systems', 'establishing', 'developing',
  'improvements', 'examining', 'prioritize', 'methodologies',
  'personalize', 'outcome', 'methodology',
  // Terms whose replacements lose precision in academic context
  'research', 'profile', 'practice', 'current', 'existing',
  'ethical', 'insights', 'insight', 'validation', 'address',
  'educators', 'technologies', 'comprehensive', 'programs', 'areas',
  // Confusable word pairs — morphology can swap affect/effect
  'affect', 'affected', 'affecting', 'affects',
  'effect', 'effected', 'effecting', 'effects',
  // Medical/nursing domain terms
  'vital', 'monitoring', 'clinical', 'intervention', 'patient',
  'medication', 'chronic', 'diagnosis', 'therapeutic',
  'impacted', 'interaction', 'delivery',
  // Common words that garble when replaced across iterations
  'collection', 'collections', 'approach', 'approaches',
  'process', 'processes', 'level', 'levels',
  'opportunities', 'opportunity', 'produced', 'producing',
  'shifted', 'shifting', 'conversations', 'conversation',
  'education', 'educational', 'learning', 'teaching',
  'students', 'student', 'teachers', 'teacher',
  'pose', 'poses', 'posed', 'posing',
  'raise', 'raises', 'raised', 'raising',
  'change', 'changes', 'changed', 'changing',
  'focus', 'focused', 'focusing',
  'provide', 'provides', 'provided', 'providing',
  'concerns', 'concern', 'create', 'creates', 'created',
  // Analytics/data/financial domain terms
  'traffic', 'organic', 'conversion', 'engagement', 'metrics',
  'revenue', 'acquisition', 'channel', 'channels', 'dataset',
  'records', 'variables', 'variable', 'column', 'columns',
  'source', 'sources', 'referral', 'navigation', 'search',
  'optimization', 'keyword', 'keywords', 'visibility',
  'marketing', 'advertisers', 'advertising', 'expenditure',
  'credibility', 'personalization', 'leads', 'qualified',
  'sustainable', 'actionable',
]);

/* ── Helper: check if a token is a proper noun (capitalized, non-sentence-start) ── */

function isProperNoun(token: string, index: number, tokens: string[]): boolean {
  // If it starts with uppercase and is not just a normal word
  if (!/^[A-Z]/.test(token)) return false;
  // Citation names: word followed by "et" (as in "et al.") — look far ahead due to \b boundary tokens
  const ahead = tokens.slice(index + 1, Math.min(tokens.length, index + 12)).join('').trim().toLowerCase();
  if (ahead.startsWith('et al') || ahead.startsWith('et. al')) return true;
  // Preceded by "(" — likely citation
  for (let j = index - 1; j >= 0; j--) {
    const prev = tokens[j];
    if (prev === '' || /^\s+$/.test(prev)) continue;
    if (prev === '(') return true; // parenthetical citation
    break;
  }
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
  // affect/effect confusion prevention
  'effected', 'effecting', // almost always wrong (should be "affected"/"affecting")
  // Extended dict wrong-sense outputs (found in nuru testing)
  'wrongdoer', 'wrongdoers', 'apiece', 'didactics', 'pedagogics',
  'procession', 'processions', 'dispute', 'disputes',
  'person', // wrong sense for "machine"
  'rattling', // wrong register for academic
  'anticipate', 'anticipated', // wrong when replacing nouns like "potential"
  'frightful', 'awful', 'terrible', 'howling', // wrong register for "tremendous"
  'penury', 'indigence', 'impoverishment', // wrong for "needs"
  'plow', 'plowed', 'plowing', // wrong sense for "discuss"/"address"
  'treat', 'treated', // ambiguous sense
  'demand', 'demands', // wrong sense for "needs" (too aggressive)
  'foul', 'fouls', // wrong sense for "technical"
  'latest', // causes "more latest" double comparative
  'built', // wrong sense for "emerged/established"
  'raiss', 'holmed', 'poss', // known garbled morphology outputs
  // Meaning-distorting synonyms found in testing
  'critique', 'critiques', // wrong sense for "analysis" (implies negative review)
  'confronting', 'confront', 'confronted', // wrong for "handling" (too aggressive)
  'arrangement', 'arrangements', // wrong for "organization" (means layout, not company)
  'fortify', 'fortified', 'fortifying', // wrong register for academic "strengthen"
  'appreciate', // wrong for "understand" in technical context (means value, not comprehend)
  'employs', 'employ', 'employed', // overused replacement, creates repetition
  'locate', 'locating', // wrong for "identify" in analytical context
  'cover', 'covering', 'covers', // wrong for "contain" / "include" (too casual)
  'chief', // wrong for "main"/"primary" (old-fashioned for academic text)
  'tackle', 'tackling', 'tackled', // too informal for academic
  'oversee', 'overseeing', 'oversaw', // wrong sense for "handle"
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
  // ── Academic garble prevention ──
  'publication', 'workflow', 'workflowing', 'scheme', 'schemed',
  'tooling', 'toolings', 'zero', 'residents', 'citizenry',
  'stretch', 'boundary', 'organization', 'districts', 'surfacing',
  'dwelling', 'denizen', 'populace', 'edifice', 'pedagogue',
  'methoding', 'populaces', 'milieus', 'milieu', 'coursing',
  'operationing', 'proceduring', 'linger', 'lingering',
  'ceilinged', 'betterment', 'apparatus', 'inspect', 'initiatived',
]);

/* ── Extra Academic Replacements (fills gaps in AI_WORD_REPLACEMENTS) ── */

const EXTRA_REPLACEMENTS: Record<string, string[]> = {
  // ── High-frequency academic nouns (prevent bad WordNet senses) ──
  education: ['instruction', 'learning', 'schooling', 'teaching'],
  institution: ['organization', 'establishment', 'body', 'entity'],
  landscape: ['domain', 'sphere', 'arena', 'terrain'],
  student: ['learner', 'scholar', 'pupil', 'trainee'],
  teacher: ['educator', 'instructor', 'professor', 'mentor'],
  educator: ['instructor', 'teacher', 'mentor', 'trainer'],
  technology: ['innovation', 'advancement', 'technique', 'engineering'],
  society: ['community', 'populace', 'civilization', 'culture'],
  process: ['procedure', 'method', 'course', 'operation'],
  processes: ['procedures', 'methods', 'steps', 'operations'],
  system: ['framework', 'mechanism', 'apparatus', 'structure'],
  research: ['study', 'investigation', 'inquiry', 'analysis'],
  development: ['growth', 'progress', 'expansion', 'evolution'],
  environment: ['setting', 'context', 'surroundings', 'landscape'],
  experience: ['exposure', 'encounter', 'involvement', 'practice'],
  analysis: ['examination', 'assessment', 'evaluation', 'review'],
  strategy: ['approach', 'plan', 'tactic', 'method'],
  resource: ['asset', 'supply', 'material', 'means'],
  knowledge: ['understanding', 'awareness', 'expertise', 'insight'],
  information: ['data', 'details', 'facts', 'intelligence'],
  opportunity: ['prospect', 'opening', 'possibility', 'occasion'],
  community: ['group', 'network', 'collective', 'population'],
  individual: ['particular', 'distinct', 'specific', 'separate'],
  organization: ['institution', 'entity', 'company', 'firm'],
  program: ['initiative', 'plan', 'project', 'effort'],
  activity: ['task', 'endeavor', 'undertaking', 'pursuit'],
  improvement: ['enhancement', 'advancement', 'refinement', 'gain'],
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
  present: ['introduce', 'pose', 'show', 'display'],
  revolutionize: ['overhaul', 'reshape', 'redefine', 'modernize'],
  acknowledge: ['recognize', 'accept', 'concede', 'admit'],
  identify: ['detect', 'recognize', 'pinpoint', 'determine'],
  // ── More academic nouns that WordNet garbles ──
  care: ['treatment', 'attention', 'support', 'service'],
  setting: ['context', 'environment', 'domain', 'space'],
  challenge: ['difficulty', 'obstacle', 'hurdle', 'complication'],
  vast: ['large', 'extensive', 'broad', 'sweeping'],
  observer: ['reviewer', 'analyst', 'examiner', 'assessor'],
  integration: ['incorporation', 'blending', 'merging', 'unification'],
  potential: ['capacity', 'promise', 'capability', 'prospect'],
  adoption: ['uptake', 'acceptance', 'incorporation', 'implementation'],
  // ── Words that produce catastrophic WordNet garble ──
  federal: ['national', 'governmental', 'central', 'public'],
  investment: ['funding', 'spending', 'commitment', 'allocation'],
  investments: ['funds', 'expenditures', 'commitments', 'allocations'],
  population: ['populace', 'group', 'community', 'demographic'],
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
  especially: ['particularly', 'notably', 'specifically', 'mainly'],
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
  change: ['shift', 'alteration', 'adjustment', 'variation'],
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
  primary: ['main', 'leading', 'principal', 'foremost'],
  critical: ['vital', 'pivotal', 'essential', 'crucial'],
  comprehensive: ['thorough', 'complete', 'extensive', 'wide-ranging'],
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
  early: ['initial', 'preliminary', 'formative', 'foundational'],
  widespread: ['broad', 'extensive', 'pervasive', 'prevalent'],
  unfair: ['unjust', 'inequitable', 'uneven', 'lopsided'],
  ethical: ['moral', 'principled', 'responsible', 'sound'],
  technical: ['specialized', 'applied', 'practical', 'skilled'],
  experienced: ['encountered', 'witnessed', 'faced', 'undergone'],
  existing: ['current', 'present', 'prevailing', 'ongoing'],
  central: ['key', 'main', 'pivotal', 'core'],
  useful: ['helpful', 'valuable', 'practical', 'beneficial'],
  relevant: ['pertinent', 'applicable', 'fitting', 'suitable'],
  clear: ['definite', 'distinct', 'apparent', 'evident'],
  broad: ['wide', 'expansive', 'general', 'sweeping'],
  main: ['central', 'principal', 'primary', 'leading'],
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
  recent: ['new', 'current', 'fresh'],
  major: ['significant', 'principal', 'leading', 'primary'],
  numerous: ['many', 'several', 'multiple', 'abundant'],
  distinct: ['separate', 'unique', 'individual', 'different'],
  ongoing: ['continuing', 'persistent', 'sustained', 'active'],
  academic: ['scholarly', 'educational', 'intellectual', 'learned'],
  deeper: ['more thorough', 'richer', 'fuller', 'broader'],
  contemporary: ['current', 'present', 'modern', 'recent'],
  // ── Verbs (base forms — morphology handles -ed/-ing) ──
  transform: ['reshape', 'alter', 'shift', 'revamp'],
  demonstrate: ['show', 'reveal', 'illustrate', 'display'],
  establish: ['set up', 'build', 'found', 'institute'],
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
  handle: ['manage', 'address', 'deal with', 'process'],
  guide: ['steer', 'direct', 'lead', 'channel'],
  prompt: ['motivate', 'spur', 'encourage', 'push'],
  raise: ['pose', 'introduce', 'spark', 'bring'],
  serve: ['function', 'act', 'operate', 'work'],
  remain: ['stay', 'continue', 'persist', 'endure'],
  range: ['span', 'scope', 'breadth', 'spectrum'],
  limit: ['cap', 'ceiling', 'constraint', 'threshold'],
  exceed: ['surpass', 'outstrip', 'outpace', 'eclipse'],
  match: ['rival', 'equal', 'parallel', 'mirror'],
  emerge: ['arise', 'come about', 'appear', 'develop'],
  adopt: ['embrace', 'implement', 'accept', 'employ'],
  train: ['educate', 'prepare', 'instruct', 'develop'],
  perpetuate: ['sustain', 'prolong', 'continue', 'maintain'],
  amplify: ['intensify', 'magnify', 'heighten', 'increase'],
  combine: ['unite', 'merge', 'blend', 'fuse'],
  address: ['resolve', 'manage', 'deal with', 'work through'],
  assist: ['aid', 'support', 'help', 'facilitate'],
  help: ['aid', 'assist', 'support', 'enable'],
  understand: ['grasp', 'comprehend', 'recognize', 'follow'],
  discuss: ['examine', 'explore', 'consider', 'cover'],
  describe: ['depict', 'portray', 'outline', 'detail'],
  illustrate: ['show', 'demonstrate', 'highlight', 'display'],
  highlight: ['emphasize', 'underscore', 'showcase', 'stress'],
  examine: ['review', 'analyze', 'assess', 'study'],
  suggest: ['propose', 'imply', 'hint', 'indicate'],
  determine: ['decide', 'establish', 'figure', 'resolve'],
  develop: ['build', 'create', 'design', 'craft'],
  consider: ['weigh', 'assess', 'evaluate', 'contemplate'],
  engage: ['participate', 'involve', 'interact', 'partake'],
  follow: ['adhere', 'observe', 'track', 'pursue'],
  include: ['encompass', 'cover', 'incorporate', 'involve'],
  argue: ['contend', 'assert', 'claim', 'maintain'],
  note: ['observe', 'mention', 'remark', 'point'],
  focus: ['concentrate', 'center', 'emphasize', 'target'],
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
  strengthen: ['reinforce', 'bolster', 'improve', 'enhance'],
  lean: ['rely', 'depend', 'rest', 'count'],
  // ── Nouns ──
  rise: ['growth', 'surge', 'expansion', 'climb'],
  approach: ['method', 'strategy', 'technique', 'framework'],
  impact: ['consequence', 'outcome', 'result', 'influence'],
  framework: ['structure', 'model', 'system', 'scaffold'],
  perspective: ['viewpoint', 'angle', 'outlook', 'stance'],
  evidence: ['proof', 'data', 'findings', 'support'],
  outcome: ['result', 'finding', 'product', 'effect'],
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
  area: ['field', 'domain', 'sphere', 'sector'],
  areas: ['fields', 'domains', 'spheres', 'sectors'],
  choice: ['selection', 'option', 'pick', 'preference'],
  action: ['step', 'measure', 'move', 'initiative'],
  // "lack" removed — verb/noun ambiguity causes POS mismatches
  amount: ['volume', 'quantity', 'total', 'sum'],
  scholar: ['academic', 'intellectual', 'expert', 'specialist'],
  practitioner: ['professional', 'specialist', 'operator', 'expert'],
  expertise: ['skill', 'proficiency', 'competence', 'mastery'],
  question: ['inquiry', 'issue', 'matter', 'concern'],
  judgment: ['assessment', 'evaluation', 'appraisal', 'discernment'],
  innovation: ['advancement', 'breakthrough', 'progress', 'invention'],
  oversight: ['supervision', 'regulation', 'monitoring', 'governance'],
  barrier: ['obstacle', 'impediment', 'hurdle', 'hindrance'],
  analyst: ['examiner', 'evaluator', 'reviewer', 'assessor'],
  capacity: ['capability', 'ability', 'competence', 'aptitude'],
  review: ['assessment', 'evaluation', 'examination', 'appraisal'],
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
  issue: ['matter', 'concern', 'challenge', 'problem'],
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
  content: ['material', 'subject matter', 'information', 'subject'],
  debate: ['discussion', 'discourse', 'dialogue', 'deliberation'],
  field: ['area', 'domain', 'sector', 'discipline'],
  work: ['research', 'effort', 'study', 'contribution'],
  trust: ['confidence', 'faith', 'belief', 'reliance'],
  life: ['existence', 'experience', 'reality', 'livelihood'],
  freedom: ['liberty', 'autonomy', 'independence', 'right'],
  body: ['collection', 'volume', 'set', 'corpus'],
  // ── Adverbs ──
  significantly: ['markedly', 'considerably', 'substantially', 'notably'],
  particularly: ['especially', 'specifically', 'notably', 'chiefly'],
  effectively: ['efficiently', 'capably', 'productively', 'successfully'],
  increasingly: ['progressively', 'steadily', 'gradually', 'continually'],
  primarily: ['mainly', 'largely', 'mostly', 'predominantly'],
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
  // ── ASD / Sensory / Therapy domain verbs ──
  reinforce: ['strengthen', 'solidify', 'support', 'bolster'],
  validate: ['substantiate', 'verify', 'corroborate', 'support'],
  standardize: ['normalize', 'regulate', 'formalize', 'systematize'],
  monitor: ['track', 'observe', 'watch', 'follow'],
  tailor: ['customize', 'adapt', 'adjust', 'fine-tune'],
  collaborate: ['cooperate', 'partner', 'coordinate', 'work together'],
  promote: ['advance', 'encourage', 'support', 'further'],
  coordinate: ['organize', 'arrange', 'synchronize', 'harmonize'],
  // ── ASD / Sensory / Therapy domain nouns ──
  stimulus: ['trigger', 'prompt', 'cue', 'input'],
  stimuli: ['triggers', 'inputs', 'cues', 'prompts'],
  profile: ['outline', 'overview', 'description', 'snapshot'],
  profiles: ['patterns', 'makeups', 'configurations', 'compositions'],
  sensitivity: ['responsiveness', 'reactivity', 'susceptibility', 'awareness'],
  modality: ['mode', 'form', 'channel', 'medium'],
  deficit: ['shortfall', 'gap', 'weakness', 'impairment'],
  dysfunction: ['impairment', 'disruption', 'malfunction', 'irregularity'],
  engagement: ['involvement', 'participation', 'interaction', 'commitment'],
  exposure: ['contact', 'encounter', 'access', 'introduction'],
  consistency: ['uniformity', 'regularity', 'steadiness', 'stability'],
  validation: ['confirmation', 'verification', 'proof', 'corroboration'],
  protocol: ['procedure', 'guideline', 'standard', 'method'],
  frequency: ['rate', 'regularity', 'occurrence', 'recurrence'],
  intensity: ['strength', 'degree', 'force', 'magnitude'],
  duration: ['length', 'span', 'extent', 'period'],
  generalization: ['transfer', 'extension', 'application', 'spread'],
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
  const DOUBLE_FINAL = new Set(['outstrip', 'admit', 'commit', 'submit', 'permit', 'omit', 'emit', 'refer', 'occur', 'deter', 'prefer', 'regret', 'begin', 'control', 'equip', 'transfer', 'spur', 'spot', 'infer', 'confer', 'defer', 'incur', 'recur', 'compel', 'expel', 'propel']);

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
    // consonant+y → -ied (apply→applied), vowel+y → -ed (employ→employed)
    if (rep.endsWith('y') && !'aeiou'.includes(rep[rep.length - 2] || '')) return replacement.slice(0, -1) + 'ied';
    if (rep.endsWith('y')) return replacement + 'ed';
    if (needsDoubling(rep)) return replacement + rep[rep.length - 1] + 'ed';
    return replacement + 'ed';
  }

  // Gerund / present participle: -ing
  if (orig.endsWith('ing') && !rep.endsWith('ing') && orig.length > 5) {
    if (rep.endsWith('ie')) return replacement.slice(0, -2) + 'ying';
    // Double-e words: guarantee→guaranteeing, agree→agreeing (keep both e's)
    if (rep.endsWith('ee')) return replacement + 'ing';
    if (rep.endsWith('e')) return replacement.slice(0, -1) + 'ing';
    if (needsDoubling(rep)) return replacement + rep[rep.length - 1] + 'ing';
    return replacement + 'ing';
  }

  // 3rd person singular present: -s / -es (e.g. "examines" + "judge" → "judges")
  if ((orig.endsWith('es') || (orig.endsWith('s') && !orig.endsWith('ss'))) && !rep.endsWith('s') && orig.length > 4) {
    if (/(?:ch|sh|s|x|z)$/.test(rep)) return replacement + 'es';
    if (rep.endsWith('y') && !'aeiou'.includes(rep[rep.length - 2] || '')) return replacement.slice(0, -1) + 'ies';
    return replacement + 's';
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
  if (w.endsWith('es') && w.length > 4) {
    // Try dropping -s first (e.g. "poses" → "pose", "raises" → "raise")
    const dropS = w.slice(0, -1);
    if (EXTRA_REPLACEMENTS[dropS] || AI_WORD_REPLACEMENTS[dropS]) return dropS;
    return w.slice(0, -2);
  }
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

/* ── Readability Scorer ───────────────────────────────────────────
 * Scores a sentence's readability on a 0–1 scale.
 * High = readable/natural. Low = garbled/unnatural.
 * Used to select the BEST iteration, not just the most changed one.
 * ──────────────────────────────────────────────────────────────── */

// Common AI-tell patterns that detectors flag
const AI_TELL_PATTERNS = [
  /\bplays? a (?:crucial|vital|key|significant|pivotal|critical|important|essential|fundamental|central|major) role\b/i,
  /\bserves? as (?:a |an )?(?:crucial|vital|key|critical|important|essential) (?:tool|mechanism|framework|foundation|component)\b/i,
  /\bit is (?:important|essential|crucial|vital|worth noting|noteworthy|significant) (?:to|that)\b/i,
  /\bprovides? (?:a |an )?(?:comprehensive|holistic|thorough|detailed) (?:overview|understanding|analysis|framework|examination)\b/i,
  /\bhas (?:gained|garnered|received|attracted) (?:significant|considerable|substantial|growing|increasing) (?:attention|interest|focus|traction)\b/i,
  /\bthis (?:highlights|underscores|emphasizes|demonstrates) the (?:importance|need|significance|value|necessity) of\b/i,
  /\bultimately (?:leads?|leading|drives?|driving|results?|resulting) (?:to|in)\b/i,
  /\bin conclusion\b/i,
  /\bfurthermore\b/i,
  /\bmoreover\b/i,
  /\badditionally\b/i,
  /\bnevertheless\b/i,
  /\bconsequently\b/i,
  /\bdelves? into\b/i,
  /\btapestry\b/i,
  /\bseamlessly?\b/i,
  /\binnovative approach\b/i,
  /\boverall,?\s/i,
  /\bin today's (?:world|society|era|age|landscape)\b/i,
];

function scoreReadability(sentence: string, original: string): number {
  let score = 1.0;
  const words = sentence.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Penalize garbled morphology (e.g. "informationd", "analyzement")
  const garbledMorphology = /\b[a-z]+(?:ment|tion|sion)(?:ed|ing|ly)\b/gi;
  const garbleMatches = sentence.match(garbledMorphology);
  if (garbleMatches) score -= garbleMatches.length * 0.08;

  // 2. Penalize doubled words ("the the", "is is")
  const doubled = sentence.match(/\b(\w+)\s+\1\b/gi);
  if (doubled) score -= doubled.length * 0.15;

  // 3. Penalize sentences that are too short (<4 words) or too long (>45 words)
  if (wordCount < 4 && wordCount > 0) score -= 0.2;
  if (wordCount > 45) score -= 0.15;

  // 4. Penalize article mismatches ("a information", "an big")
  const badArticleA = sentence.match(/\ba\s+[aeiou]\w/gi);
  const badArticleAn = sentence.match(/\ban\s+[bcdfghjklmnpqrstvwxyz]\w/gi);
  if (badArticleA) score -= badArticleA.length * 0.08;
  if (badArticleAn) score -= badArticleAn.length * 0.08;

  // 5. Penalize AI-tell patterns still present
  let aiTells = 0;
  for (const pattern of AI_TELL_PATTERNS) {
    if (pattern.test(sentence)) aiTells++;
  }
  score -= aiTells * 0.10;

  // 6. Penalize contractions (academic must not have them)
  const contractions = sentence.match(/\b\w+[''\u2019](?:t|s|re|ve|ll|d|m)\b/gi);
  if (contractions) score -= contractions.length * 0.12;

  // 7. Reward meaning preservation — content overlap with original
  const overlap = contentOverlap(original, sentence);
  if (overlap < 0.20) score -= 0.25; // too far from original meaning
  if (overlap > 0.85) score -= 0.05; // not enough change

  // 8. Penalize consecutive rare/long words (3+ in a row with 8+ chars)
  let consecutiveLong = 0;
  let maxConsecutive = 0;
  for (const w of words) {
    if (w.replace(/[^a-zA-Z]/g, '').length >= 8) {
      consecutiveLong++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveLong);
    } else {
      consecutiveLong = 0;
    }
  }
  if (maxConsecutive >= 3) score -= 0.10;
  if (maxConsecutive >= 5) score -= 0.15;

  // 9. Penalize first person when not in original
  if (/\b(?:I|we|my|our|me|us)\b/.test(sentence) && !/\b(?:I|we|my|our|me|us)\b/.test(original)) {
    score -= 0.15;
  }

  // 10. Penalize rhetorical questions
  if (/\?\s*$/.test(sentence) && !/\?\s*$/.test(original)) {
    score -= 0.20;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Composite quality score for selecting the best iteration result.
 * Balances word-level change, readability, and AI signal absence.
 */
function compositeQualityScore(
  original: string,
  candidate: string,
): number {
  const changeRatio = wordChangeRatio(original, candidate);
  const readability = scoreReadability(candidate, original);

  // Change score: reward change up to 0.65, then diminishing returns
  // (over-changing hurts readability — thesaurus syndrome)
  const changeScore = changeRatio <= 0.65
    ? changeRatio / 0.65
    : 1.0 - (changeRatio - 0.65) * 0.5;

  // Weights: readability matters more than raw change
  return (changeScore * 0.40) + (readability * 0.60);
}

/* ── Sentence-Level Restructuring ─────────────────────────────────
 * Structural transforms that change sentence shape, not just words.
 * Applied before word replacement for deeper variety.
 * ──────────────────────────────────────────────────────────────── */

function applySentenceRestructuring(sentence: string, strategy: number): string {
  let text = sentence;

  // Strategy 0: No restructuring (word swap only)
  if (strategy === 0) return text;

  // All strategies: Apply evaluative phrase surgery
  for (const { pattern, replaceFn } of EVALUATIVE_SURGERIES) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, replaceFn);
  }

  // Strategy 1: Clause reorder (move prepositional phrase to front)
  // Only reorder when the main clause is a complete independent thought
  // to prevent orphaning fragments or creating meaningless sentences.
  if (strategy === 1 || strategy === 3) {
    const ppMatch = text.match(/^(.{20,}?)\s+((?:in|on|at|for|through|during|within|across|by|under|over|between|among|after|before|since|until|without)\s+[^,]+)[.!?]?\s*$/i);
    if (ppMatch && ppMatch[2].split(/\s+/).length >= 3 && ppMatch[2].split(/\s+/).length <= 10) {
      const pp = ppMatch[2].trim();
      const rest = ppMatch[1].trim().replace(/[,.]$/, '');
      // Only reorder if rest is a complete clause (has subject + verb + 5+ words)
      // and the PP doesn't contain sentence-ending punctuation
      if (isIndependentClause(rest) && !/[.!?]/.test(pp)) {
        text = pp.charAt(0).toUpperCase() + pp.slice(1) + ', ' + rest.charAt(0).toLowerCase() + rest.slice(1) + '.';
      }
    }
  }

  // Strategy 2: Passive ↔ Active voice toggle
  if (strategy === 2 || strategy === 4) {
    const passiveRe = /\b(\w[\w\s]{2,30}?)\s+(is|are|was|were)\s+(\w+ed)\s+by\s+(\w[\w\s]{2,30}?)([.,;])/i;
    const pm = text.match(passiveRe);
    if (pm) {
      const [full, subject, , verb, agent, punct] = pm;
      const activeVerb = verb.replace(/ed$/, 's');
      text = text.replace(full, agent.trim() + ' ' + activeVerb + ' ' + subject.trim() + punct);
    }
  }

  // Strategy 3: Break parallel structures — DISABLED
  // This was producing garbled output like "also uses also employs also applies"
  // and mangling numbers (52,446 → "52 and 446"). Parallel structure breaking
  // requires deep syntactic understanding that regex cannot provide safely.
  // if (strategy === 3) { ... }

  // Strategy 4: Connector disruption (strip or downgrade formal connectors)
  if (strategy >= 2) {
    const connectorRemovals: Record<string, string[]> = {
      'furthermore': [''], 'moreover': [''], 'additionally': [''],
      'consequently': ['so'], 'nevertheless': ['still'], 'nonetheless': ['still'],
      'subsequently': ['then'], 'accordingly': ['so'], 'therefore': ['so'],
      'hence': ['so'], 'indeed': [''], 'in contrast': ['but'],
      'as a result': ['so'], 'in addition': ['also'],
      'in conclusion': [''], 'in summary': [''], 'in essence': [''],
    };
    for (const [conn, repls] of Object.entries(connectorRemovals)) {
      const re = new RegExp(`^${conn}[,;]?\\s*`, 'i');
      if (re.test(text)) {
        const rep = repls[Math.floor(Math.random() * repls.length)];
        text = text.replace(re, '');
        if (rep) {
          text = rep.charAt(0).toUpperCase() + rep.slice(1) + ' ' + text.charAt(0).toLowerCase() + text.slice(1);
        } else {
          text = text.charAt(0).toUpperCase() + text.slice(1);
        }
        break;
      }
    }
  }

  // Ensure proper ending
  text = text.trim();
  if (text.length > 0 && !/[.!?]$/.test(text)) text += '.';
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

/* ── Burstiness Manager ───────────────────────────────────────────
 * Varies sentence lengths within a paragraph for natural rhythm.
 * ONLY splits at verified independent-clause boundaries where both
 * halves can stand alone as grammatical sentences.
 * Returns an array of { text, needsReprocess } — any newly created
 * sentence from a split/merge is flagged for re-processing through
 * processSentence so it gets full cleanup.
 * ──────────────────────────────────────────────────────────────── */

interface BurstResult { text: string; needsReprocess: boolean; }

/**
 * Check if a string fragment looks like a complete independent clause.
 * Must have: at least one subject-like word AND at least one verb.
 */
function isIndependentClause(fragment: string): boolean {
  const trimmed = fragment.trim().replace(/[.!?,;:]+$/, '').trim();
  const words = trimmed.split(/\s+/);
  if (words.length < 5) return false; // too short to be a real sentence

  // Must contain a finite verb (is/are/was/were/has/have/had/do/does/did/can/could/
  // will/would/may/might/shall/should OR a word ending in -s/-ed/-es for 3rd person/past)
  const hasVerb = /\b(is|are|was|were|has|have|had|does|did|do|can|could|will|would|may|might|shall|should|seems?|appears?|remains?|becomes?|provides?|includes?|requires?|involves?|suggests?|indicates?|shows?|demonstrates?|reveals?|represents?|offers?|creates?|makes?|takes?|gives?|leads?|allows?|enables?|helps?)\b/i.test(trimmed)
    || /\b\w+(?:ed|ied|ated|ized|ised)\b/i.test(trimmed); // past tense
  if (!hasVerb) return false;

  // Must start with something subject-like (noun phrase, pronoun, determiner + noun)
  const startsWithSubject = /^(?:the|a|an|this|that|these|those|it|they|he|she|we|its|their|his|her|most|many|some|all|each|both|such|every|several|various|certain|particular|specific|different|similar|other|further|additional|overall|general|key|new|recent|current|early|modern|traditional|digital|online|social|financial|commercial|economic|academic|professional|technical|statistical|analytical|empirical|practical|theoretical|significant|important|essential|critical|effective|efficient|successful|comprehensive|systematic|strategic|primary|secondary|initial|final|subsequent|previous|existing|available|relevant|potential|possible|necessary|sufficient|appropriate|suitable|common|frequent|typical|standard|normal|natural|basic|fundamental|central|main|major|minor|local|global|national|international|internal|external|direct|indirect|positive|negative|high|low|large|small|long|short)\b/i.test(trimmed);

  return startsWithSubject;
}

function manageBurstiness(sentences: string[]): BurstResult[] {
  const result: BurstResult[] = sentences.map(s => ({ text: s, needsReprocess: false }));

  // Pass 1: Smart-split sentences >30 words ONLY at verified clause boundaries
  for (let i = result.length - 1; i >= 0; i--) {
    const words = result[i].text.split(/\s+/);
    if (words.length <= 30) continue;

    let didSplit = false;

    // Strategy A: Split at ", which/where/who" (non-restrictive clause → "This ...")
    const relMatch = result[i].text.match(/^(.{30,}?),\s+(which|where|who)\s+(.+)$/i);
    if (relMatch) {
      const main = relMatch[1].trim().replace(/,$/, '').trim();
      const relWord = relMatch[2].toLowerCase();
      const rest = relMatch[3].trim();

      // Build the standalone second sentence
      const bridge = relWord === 'which' ? 'This' : relWord === 'where' ? 'There,' : 'They';
      let secondSent = bridge + ' ' + rest.charAt(0).toLowerCase() + rest.slice(1);
      if (!/[.!?]$/.test(secondSent)) secondSent += '.';
      const mainSent = /[.!?]$/.test(main) ? main : main + '.';

      // Validate BOTH halves are real sentences
      if (isIndependentClause(mainSent) && secondSent.split(/\s+/).length >= 5) {
        result.splice(i, 1,
          { text: mainSent, needsReprocess: false },
          { text: secondSent, needsReprocess: true }, // new sentence needs full cleanup
        );
        didSplit = true;
      }
    }

    if (didSplit) continue;

    // Strategy B: Split at ", and/but/so/yet" ONLY if BOTH sides are independent clauses
    const conjMatch = result[i].text.match(/^(.{25,}?),\s+(and|but|so|yet)\s+(.{15,})$/i);
    if (conjMatch) {
      const part1 = conjMatch[1].trim().replace(/,$/, '').trim();
      const part2 = conjMatch[3].trim();

      const sent1 = /[.!?]$/.test(part1) ? part1 : part1 + '.';
      let sent2 = part2.charAt(0).toUpperCase() + part2.slice(1);
      if (!/[.!?]$/.test(sent2)) sent2 += '.';

      // BOTH must be real independent clauses
      if (isIndependentClause(sent1) && isIndependentClause(sent2)) {
        result.splice(i, 1,
          { text: sent1, needsReprocess: false },
          { text: sent2, needsReprocess: true },
        );
        didSplit = true;
      }
    }

    // NO force-split fallback — if we can't find a clean clause boundary,
    // leave the long sentence intact. A long readable sentence is better
    // than two broken fragments.
  }

  // Pass 2: Merge adjacent very short sentences (<6 words each, combined ≤18)
  // ONLY merge if they share a topic (second sentence refers back to first)
  for (let i = 0; i < result.length - 1; i++) {
    const w1 = result[i].text.split(/\s+/).length;
    const w2 = result[i + 1].text.split(/\s+/).length;
    if (w1 > 6 || w2 > 6 || w1 + w2 > 18) continue;

    // Check if sentences are related (share at least one content word ≥4 chars)
    const words1 = new Set(result[i].text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length >= 4));
    const words2 = result[i + 1].text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length >= 4);
    const shared = words2.some(w => words1.has(w));
    if (!shared) continue; // unrelated short sentences — leave separate

    const s1 = result[i].text.replace(/[.!?]$/, '').trim();
    const s2Lower = result[i + 1].text.charAt(0).toLowerCase() + result[i + 1].text.slice(1);
    const merged = s1 + ', and ' + s2Lower;
    result.splice(i, 2, { text: merged, needsReprocess: true });
  }

  return result;
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

  // ─── Protection: shield numbers, brackets, abbreviations from mangling ───
  const protectionMap: Record<string, string> = {};
  let protIdx = 0;

  // Protect abbreviations like D.C., U.S., U.K., U.S.A.
  text = text.replace(/\b(?:[A-Z]\.){2,}/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect numbers with commas/decimals (e.g. 52,446 or 3.14 or 18,732)
  text = text.replace(/\b\d[\d,]+(?:\.\d+)?\b/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect percentages (e.g. 35.7%, 100%)
  text = text.replace(/\b\d+(?:\.\d+)?%/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect parenthetical abbreviation definitions: "word (ABBR)" or "phrase (abbr)"
  // e.g. "exploratory data analysis (EDA)" → protect "(EDA)"
  text = text.replace(/\(([A-Z]{2,}[a-z]?)\)/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect in-text citations: "(Author, Year)" or "(Author & Author, Year)"
  text = text.replace(/\([A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)?,?\s*\d{4}(?:[a-z])?\)/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect quoted terms: "organic", "Organic", "ORG"
  text = text.replace(/[\u201C\u201D"](.*?)[\u201C\u201D"]/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect variable names with underscores: traffic_source, traffic_channel
  text = text.replace(/\b[a-z]+_[a-z_]+\b/gi, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // ─── Step 0.5: Sentence-level restructuring ─────────────────
  // Pick a random restructuring strategy for variety across iterations.
  // Strategies: 0=none, 1=clause reorder, 2=voice toggle, 3=clause+parallel,
  //             4=voice toggle+connector disruption
  const restructureStrategy = Math.floor(Math.random() * 5);
  text = applySentenceRestructuring(text, restructureStrategy);

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
  const baseReplacementRate = strength === 'strong' ? 0.80 : 0.70;
  // Domain strategy can INCREASE replacement rate but NEVER reduce below baseline
  // (reducing replacement lets AI patterns survive → higher detection scores)
  const domainRate = _stealthStrategy ? _stealthStrategy.synonymIntensity + 0.15 : baseReplacementRate;
  const maxReplacements = Math.ceil(wordCount * Math.max(baseReplacementRate, domainRate));
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
  // Domain strategy can INCREASE structural rate but never reduce below 0.25 baseline
  const clauseReorderRate = _stealthStrategy ? Math.max(0.25, _stealthStrategy.structuralRate) : 0.25;
  if (Math.random() < clauseReorderRate && text.length > 40) {
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
  // Domain strategy can INCREASE voice toggle rate but never reduce below 0.15 baseline
  const voiceToggleRate = _stealthStrategy ? Math.max(0.15, _stealthStrategy.structuralRate * 0.6) : 0.15;
  if (Math.random() < voiceToggleRate && text.length > 30) {
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
  // ~5% chance, only if sentence doesn't already start with a varied opener
  const starterRoll = Math.random();
  const alreadyHasStarter = /^(However|Although|Though|Moreover|Furthermore|Thus|Therefore|Hence|Consequently|Because|Since|Yet|Meanwhile|Additionally|Instead|Despite|In spite|Driven by|As a|As the|Notably|Historically|Traditionally|In practice|In broad|From a|At its|On balance|By extension|In reality|Against|Under these|For instance|For example|To illustrate|In particular|More specifically)/i.test(text) || /^[A-Z][a-z]+,\s/.test(text);
  // Domain strategy can INCREASE starter rate but never reduce below 0.05 baseline
  const starterRate = _stealthStrategy ? Math.max(0.05, _stealthStrategy.starterInjectionRate) : 0.05;
  if (starterRoll < starterRate && !alreadyHasStarter && sentenceIndex > 0 && text.length > 30) {
    // Merge domain-specific starters with academic starters
    const domainStarters = _stealthStrategy ? _stealthStrategy.domainStarters : [];
    const allStarters = [...new Set([...STARTERS_ACADEMIC, ...domainStarters])];
    const available = allStarters.filter(s => !usedStarters.has(s));
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

  // Restore ALL protected tokens (numbers, brackets, abbreviations, citations, quotes)
  for (const [placeholder, original_text] of Object.entries(protectionMap)) {
    text = text.replace(new RegExp(placeholder, 'g'), original_text);
  }

  // ─── Fix double/triple dots (e.g. "services..." → "services.") ───
  text = text.replace(/\.{2,}/g, '.');

  // ─── Fix repeated words/phrases ("also uses also uses also employs") ───
  // Catch repeated 1-3 word phrases
  text = text.replace(/\b(\w+(?:\s+\w+){0,2})\s+(?:also\s+)?\1\b/gi, '$1');
  text = text.replace(/\b(also\s+\w+)\s+also\s+/gi, '$1 ');

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
  maxIterations: number = 15,
): string {
  const enforcedMaxIterations = Math.max(10, maxIterations);
  console.log('[NURU_V2] === NEW ENGINE ACTIVE === Input length:', text.length);
  if (!text || text.trim().length === 0) return text;

  // Detect domain and merge domain-specific protected terms into the static set
  const domainResult = detectDomain(text);
  const domainProtected = getProtectedTermsForDomain(domainResult);
  for (const term of domainProtected) PROTECTED.add(term.toLowerCase());
  _stealthStrategy = resolveStrategy(domainResult);
  console.log(`[NURU_V2] Domain: ${domainResult.primary} (${(domainResult.confidence * 100).toFixed(0)}%) — added ${domainProtected.size} protected terms, synInt=${_stealthStrategy.synonymIntensity.toFixed(2)}, structRate=${_stealthStrategy.structuralRate.toFixed(2)}`);

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
      let bestScore = compositeQualityScore(originalSent, best);

      // Iterative refinement: each pass starts from ORIGINAL to prevent
      // compounding garble. We keep the best result (highest composite score
      // balancing change ratio, readability, and AI signal absence).
      // Subsequent passes use sentenceIndex=0 to prevent duplicate starter injection.
      let iter = 1;
        while (iter <= enforcedMaxIterations) {
          const iterStrength = iter > 5 ? 'strong' : strength;
          const next = processSentence(
            originalSent, hasFirstPerson, iter === 1 ? globalSentenceIdx : 0,
            totalSentences, usedStarters, iterStrength as any
          );
          const nextScore = compositeQualityScore(originalSent, next);
          if (nextScore > bestScore) {
            best = next;
            bestScore = nextScore;
          }
          if (iter >= 10 && wordChangeRatio(originalSent, best) >= 0.65) break;
          iter++;
        }

      outputSentences.push(best);
      globalSentenceIdx++;
    }

    // Apply burstiness management — splits/merges get flagged for reprocessing
    const burstyResults = manageBurstiness(outputSentences);

    // Re-process any newly created sentences (from splits/merges) through
    // the full processSentence pipeline so they get proper cleanup, synonym
    // replacement, grammar fixes etc. This keeps everything sentence-by-sentence.
    const finalSentences: string[] = [];
    for (const item of burstyResults) {
      if (item.needsReprocess && item.text.trim().length >= 8) {
        // Run 3 iterations on the new sentence and pick the best
        let reprocessBest = processSentence(
          item.text, hasFirstPerson, 0, totalSentences, usedStarters, strength,
        );
        let reprocessBestScore = compositeQualityScore(item.text, reprocessBest);
        for (let ri = 0; ri < 3; ri++) {
          const candidate = processSentence(
            item.text, hasFirstPerson, 0, totalSentences, usedStarters, strength,
          );
          const score = compositeQualityScore(item.text, candidate);
          if (score > reprocessBestScore) {
            reprocessBest = candidate;
            reprocessBestScore = score;
          }
        }
        finalSentences.push(reprocessBest);
      } else {
        finalSentences.push(item.text);
      }
    }

    outputParagraphs.push(finalSentences.join(' '));
  }

  // Final post-processing: fix AI/acronym capitalization across all output
  let result = outputParagraphs.join('\n\n');
  result = result.replace(/\bAi\b/g, 'AI');
  result = result.replace(/\bai\b/g, 'AI');

  // Fix double/triple dots across entire output
  result = result.replace(/\.{2,}/g, '.');

  // Fix repeated word/phrase patterns across entire output
  result = result.replace(/\b(\w+)\s+\1\b/gi, '$1');

  // Fix spacing issues
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/\s+([.,;:!?])/g, '$1');
  
  // Independent detector specific deep cleaning phases
  result = runFullDetectorForensicsCleanup(result);

  return result;
}

export default stealthHumanize;

/* ── Phrase-Targeted Nuru Pass ────────────────────────────────────── */

/**
 * Run a single Nuru pass that focuses extra replacement effort on specific
 * flagged phrases/words identified by an AI detector. The function:
 *   1. Splits the sentence into tokens
 *   2. For tokens that overlap any flagged phrase, forces replacement even
 *      if the word would normally be protected or below the replacement cap
 *   3. Falls back to standard processSentence for the rest
 *
 * @param sentence  The sentence to reprocess
 * @param flaggedPhrases  Array of suspicious phrases/words (3-10 words max each)
 * @param strength  Humanization strength level
 * @returns Reprocessed sentence with targeted replacements
 */
export function stealthHumanizeTargeted(
  sentence: string,
  flaggedPhrases: string[],
  strength: string = 'medium',
): string {
  if (!sentence || sentence.trim().length < 8 || flaggedPhrases.length === 0) {
    // No phrases to target — fall back to standard single pass
    return stealthHumanize(sentence, strength, 'academic', 1);
  }

  // Build a set of lower-cased words from all flagged phrases for fast lookup
  const flaggedWords = new Set<string>();
  for (const phrase of flaggedPhrases) {
    for (const w of phrase.toLowerCase().split(/\s+/)) {
      if (w.length >= 3) flaggedWords.add(w);
    }
  }

  // Tokenize
  const tokens = sentence.split(/(\b)/);
  const resultTokens: string[] = [];
  let replacements = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!/^[a-zA-Z]{3,}$/.test(token)) {
      resultTokens.push(token);
      continue;
    }
    const lower = token.toLowerCase();

    // Skip proper nouns (capitalized mid-sentence words like citations)
    if (isProperNoun(token, i, tokens)) {
      resultTokens.push(token);
      continue;
    }

    // If this word is part of a flagged phrase, prioritize replacement
    if (flaggedWords.has(lower)) {
      // Still skip stopwords and protected words even for flagged phrases
      if (PROTECTED.has(lower) || STOPWORDS.has(lower)) {
        resultTokens.push(token);
        continue;
      }
      const stemmed = naiveStem(lower);
      const rep = EXTRA_REPLACEMENTS[lower] || EXTRA_REPLACEMENTS[stemmed]
                || AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[stemmed];
      if (rep) {
        const candidates = (Array.isArray(rep) ? rep : [rep])
          .filter(r => /^[a-zA-Z]+$/.test(r) && r.length >= 2
            && !REPLACEMENT_BLACKLIST.has(r.toLowerCase()) && r.toLowerCase() !== lower);
        if (candidates.length > 0) {
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          const final = /^[A-Z]/.test(token) ? chosen.charAt(0).toUpperCase() + chosen.slice(1) : chosen;
          resultTokens.push(final);
          replacements++;
          continue;
        }
      }
      // Skip extended dictionary fallback — it produces too many wrong-sense synonyms
      resultTokens.push(token);
      continue;
    }

    // Non-flagged words: standard replacement logic (lighter touch)
    if (PROTECTED.has(lower) || STOPWORDS.has(lower)) {
      resultTokens.push(token);
      continue;
    }
    const stemmed = naiveStem(lower);
    const aiRep = EXTRA_REPLACEMENTS[lower] || EXTRA_REPLACEMENTS[stemmed]
               || AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[stemmed];
    if (aiRep && Math.random() < 0.3) { // 30% chance for non-flagged words
      const candidates = (Array.isArray(aiRep) ? aiRep : [aiRep])
        .filter(r => /^[a-zA-Z]+$/.test(r) && r.length >= 2
          && !REPLACEMENT_BLACKLIST.has(r.toLowerCase()) && r.toLowerCase() !== lower);
      if (candidates.length > 0) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        const final = /^[A-Z]/.test(token) ? chosen.charAt(0).toUpperCase() + chosen.slice(1) : chosen;
        resultTokens.push(final);
        replacements++;
      } else {
        resultTokens.push(token);
      }
    } else {
      resultTokens.push(token);
    }
  }

  let result = resultTokens.join('');

  // Expand contractions (academic standard)
  for (const [contraction, expanded] of Object.entries(CONTRACTIONS)) {
    result = result.replace(new RegExp(`\\b${contraction}\\b`, 'gi'), expanded);
  }

  // Fix AI/acronym capitalization
  result = result.replace(/\bAi\b/g, 'AI');
  result = result.replace(/\bai\b/g, 'AI');

  return result;
}
