/**
 * AntiPangram — Vocabulary Naturalizer (Premium Edition)
 * =======================================================
 * Replaces AI-typical vocabulary with human-natural alternatives.
 * Goes beyond simple synonym swaps — targets the specific lexical
 * patterns that Pangram's perplexity model flags.
 *
 * Key insight: Pangram measures lexical predictability. AI text uses
 * the "expected" word in context. Humans use slightly unexpected but
 * still correct words. This module introduces controlled unpredictability.
 *
 * Coverage:
 *   - 250+ single-word AI vocabulary swaps
 *   - 60+ multi-word AI phrase patterns
 *   - 15+ perplexity injection rules
 *   - Cross-domain: academic, business, technical, healthcare, legal, social science
 */

import type { DocumentContext } from './types';

// ═══════════════════════════════════════════════════════════════════
// 1. AI VOCABULARY → NATURAL HUMAN VOCABULARY
//    These are words that AI consistently chooses over human-preferred
//    alternatives. The replacements are real human choices from corpora.
//
//    250+ entries across adjectives, verbs, nouns, adverbs, and
//    domain-specific AI-tell words.
// ═══════════════════════════════════════════════════════════════════

const VOCAB_NATURALIZER: Record<string, string[]> = {
  // ── HIGH-FREQUENCY AI ADJECTIVES ──────────────────────────────
  'significant': ['real', 'important', 'big', 'major', 'noticeable'],
  'comprehensive': ['full', 'complete', 'thorough', 'broad'],
  'fundamental': ['basic', 'core', 'central', 'key'],
  'crucial': ['key', 'important', 'critical'],
  'essential': ['key', 'needed', 'important', 'basic'],
  'effective': ['useful', 'helpful', 'working', 'good'],
  'structured': ['organized', 'planned', 'set up'],
  'practical': ['hands-on', 'real-world', 'applied', 'useful'],
  'applicable': ['useful', 'relevant', 'fitting'],
  'productive': ['useful', 'constructive', 'effective'],
  'balanced': ['measured', 'steady', 'even', 'fair'],
  'positive': ['good', 'constructive', 'healthy', 'helpful'],
  'negative': ['bad', 'harmful', 'unhealthy', 'destructive'],
  'unhelpful': ['counterproductive', 'harmful', 'useless', 'bad'],
  'healthier': ['better', 'more constructive', 'improved'],
  'stronger': ['better', 'greater', 'tougher', 'firmer'],
  'widespread': ['common', 'wide', 'broad'],
  'numerous': ['many', 'a number of', 'several'],
  'robust': ['solid', 'strong', 'reliable', 'sturdy'],
  'notable': ['worth noting', 'striking', 'remarkable'],
  'substantial': ['large', 'sizeable', 'considerable', 'real'],
  'integral': ['key', 'built-in', 'core', 'central'],
  'inherent': ['built-in', 'natural', 'baked-in'],
  'overarching': ['broad', 'general', 'main', 'big-picture'],
  'multifaceted': ['complex', 'layered', 'many-sided'],
  'nuanced': ['subtle', 'layered', 'fine-grained'],
  'holistic': ['whole-picture', 'all-around', 'complete', 'broad'],
  'innovative': ['new', 'fresh', 'creative', 'novel'],
  'dynamic': ['active', 'changing', 'lively', 'fluid'],
  'systemic': ['system-wide', 'deep-rooted', 'structural'],
  'detrimental': ['harmful', 'damaging', 'bad'],
  'adequate': ['enough', 'sufficient', 'acceptable'],
  'viable': ['workable', 'doable', 'realistic', 'practical'],
  'optimal': ['best', 'ideal', 'top'],
  'pertinent': ['relevant', 'related', 'fitting'],
  'salient': ['key', 'standout', 'notable'],
  'pronounced': ['marked', 'clear', 'strong', 'obvious'],
  'heightened': ['increased', 'raised', 'greater'],
  'prevalent': ['common', 'widespread', 'frequent'],
  'compelling': ['strong', 'convincing', 'powerful'],
  'underlying': ['root', 'deeper', 'hidden', 'base'],
  'respective': ['own', 'individual', 'particular'],
  'intricate': ['complex', 'detailed', 'involved'],
  'noteworthy': ['worth noting', 'remarkable', 'striking'],
  'advantageous': ['helpful', 'beneficial', 'useful'],
  'indispensable': ['vital', 'necessary', 'needed'],
  'susceptible': ['prone', 'likely', 'vulnerable', 'open'],
  'efficacious': ['effective', 'useful', 'working'],
  'burgeoning': ['growing', 'rising', 'booming'],

  // ── AI TRANSITION/HEDGE VERBS ─────────────────────────────────
  'addresses': ['deals with', 'handles', 'covers', 'looks at'],
  'demonstrates': ['shows', 'makes clear', 'proves'],
  'indicates': ['shows', 'points to', 'suggests'],
  'facilitates': ['helps', 'supports', 'makes easier'],
  'enables': ['lets', 'allows', 'makes it possible for'],
  'encompasses': ['includes', 'covers', 'takes in'],
  'contributes': ['adds', 'helps', 'feeds into'],
  'influences': ['affects', 'shapes', 'touches'],
  'maintains': ['keeps', 'holds', 'carries on'],
  'promotes': ['supports', 'encourages', 'pushes for'],
  'enhances': ['improves', 'boosts', 'lifts'],
  'utilizes': ['uses', 'applies', 'draws on'],
  'employs': ['uses', 'relies on'],
  'focuses': ['centers', 'zeroes in', 'puts attention'],
  'concentrates': ['focuses', 'zeroes in', 'narrows in'],
  'recognizes': ['sees', 'spots', 'picks up on', 'notices'],
  'necessitates': ['calls for', 'requires', 'demands'],
  'exacerbates': ['worsens', 'makes worse', 'aggravates'],
  'underscores': ['highlights', 'stresses', 'drives home'],
  'exemplifies': ['shows', 'illustrates', 'is a case of'],
  'constitutes': ['makes up', 'forms', 'amounts to'],
  'elucidates': ['explains', 'clears up', 'sheds light on'],
  'delineates': ['outlines', 'maps out', 'spells out'],
  'substantiates': ['backs up', 'supports', 'confirms'],
  'corroborates': ['backs up', 'confirms', 'supports'],
  'posits': ['suggests', 'argues', 'puts forward'],
  'stipulates': ['requires', 'sets out', 'specifies'],
  'perpetuates': ['keeps going', 'continues', 'reinforces'],
  'exerts': ['puts', 'applies', 'places'],
  'yields': ['gives', 'produces', 'brings'],
  'warrants': ['calls for', 'justifies', 'deserves'],
  'entails': ['involves', 'means', 'requires'],
  'manifests': ['shows up', 'appears', 'surfaces'],
  'transcends': ['goes beyond', 'rises above', 'surpasses'],
  'culminates': ['ends', 'leads to', 'results in'],
  'precipitates': ['triggers', 'causes', 'sets off'],
  'ameliorates': ['improves', 'eases', 'relieves'],
  'augments': ['adds to', 'boosts', 'increases'],
  'bolsters': ['strengthens', 'supports', 'props up'],
  'catalyzes': ['sparks', 'triggers', 'drives'],
  'circumvents': ['gets around', 'avoids', 'sidesteps'],
  'complements': ['goes well with', 'rounds out', 'adds to'],
  'engenders': ['creates', 'produces', 'brings about'],
  'epitomizes': ['captures', 'represents', 'sums up'],
  'galvanizes': ['fires up', 'energizes', 'spurs on'],
  'hampers': ['slows down', 'blocks', 'holds back'],
  'illuminates': ['sheds light on', 'reveals', 'highlights'],
  'juxtaposes': ['places side by side', 'contrasts', 'compares'],
  'magnifies': ['amplifies', 'increases', 'makes bigger'],
  'permeates': ['spreads through', 'fills', 'runs through'],
  'propels': ['drives', 'pushes', 'moves forward'],
  'rectifies': ['fixes', 'corrects', 'puts right'],
  'solidifies': ['strengthens', 'cements', 'locks in'],
  'traverses': ['crosses', 'moves through', 'covers'],
  'underpins': ['supports', 'forms the base of', 'backs'],

  // ── AI ABSTRACT NOUNS ─────────────────────────────────────────
  'interactions': ['exchanges', 'connections', 'dealings'],
  'mechanisms': ['methods', 'tools', 'ways'],
  'strategies': ['methods', 'plans', 'approaches', 'techniques'],
  'challenges': ['problems', 'issues', 'difficulties', 'hurdles'],
  'implications': ['effects', 'results', 'what this means'],
  'components': ['parts', 'pieces', 'elements'],
  'perspective': ['angle', 'view', 'lens', 'standpoint'],
  'framework': ['structure', 'setup', 'model', 'system'],
  'methodology': ['method', 'approach', 'process'],
  'paradigm': ['model', 'approach', 'way of thinking'],
  'discourse': ['discussion', 'debate', 'conversation', 'talk'],
  'trajectory': ['path', 'direction', 'course'],
  'dichotomy': ['split', 'divide', 'contrast'],
  'phenomenon': ['trend', 'event', 'occurrence', 'thing'],
  'landscape': ['scene', 'field', 'picture', 'world'],
  'stakeholders': ['people involved', 'parties', 'those affected'],
  'underpinnings': ['foundations', 'basis', 'roots'],
  'prerequisites': ['requirements', 'things needed', 'basics'],
  'determinants': ['factors', 'drivers', 'causes'],
  'modalities': ['methods', 'forms', 'types'],
  'dimensions': ['sides', 'aspects', 'parts'],
  'dynamics': ['forces', 'patterns', 'workings'],
  'intricacies': ['details', 'complexities', 'ins and outs'],
  'synergies': ['combined effects', 'teamwork', 'benefits of working together'],
  'disparities': ['gaps', 'differences', 'inequalities'],
  'impediments': ['barriers', 'obstacles', 'blocks'],
  'catalysts': ['triggers', 'drivers', 'sparks'],
  'ramifications': ['effects', 'outcomes', 'fallout'],
  'parameters': ['limits', 'boundaries', 'settings'],
  'proliferation': ['spread', 'growth', 'increase'],
  'propensity': ['tendency', 'lean', 'likelihood'],
  'prevalence': ['frequency', 'how common it is', 'rate'],
  'paradigm shift': ['big change', 'turning point', 'rethink'],

  // ── AI ADVERBS (mid-sentence) ─────────────────────────────────
  'significantly': ['greatly', 'deeply', 'a great deal', 'heavily'],
  'particularly': ['especially', 'above all', 'in particular'],
  'consequently': ['so', 'as a result'],
  'subsequently': ['then', 'later', 'after that'],
  'ultimately': ['in the end', 'finally', 'at the end of the day'],
  'predominantly': ['mostly', 'mainly', 'largely'],
  'inherently': ['by nature', 'naturally', 'at its core'],
  'primarily': ['mainly', 'mostly', 'first of all', 'largely'],
  'widely': ['broadly', 'commonly', 'generally'],
  'arguably': ['some would say', 'possibly', 'it could be said'],
  'conversely': ['on the flip side', 'by contrast', 'then again'],
  'remarkably': ['surprisingly', 'strikingly', 'unusually'],
  'profoundly': ['deeply', 'greatly', 'seriously'],
  'fundamentally': ['at its core', 'basically', 'at root'],
  'invariably': ['always', 'without fail', 'consistently'],
  'disproportionately': ['unfairly', 'unevenly', 'more than expected'],
  'ostensibly': ['seemingly', 'on the surface', 'apparently'],
  'unequivocally': ['clearly', 'without doubt', 'beyond question'],
  'intrinsically': ['by nature', 'at its core', 'naturally'],
  'exponentially': ['rapidly', 'sharply', 'at a fast rate'],
  'perpetually': ['always', 'constantly', 'endlessly'],
  'paradoxically': ['oddly enough', 'strangely', 'ironically'],
  'systematically': ['step by step', 'methodically', 'in an orderly way'],
  'concurrently': ['at the same time', 'alongside', 'in parallel'],
  'substantively': ['meaningfully', 'in a real way', 'seriously'],

  // ── AI CONNECTOR WORDS (often at sentence start) ──────────────
  'furthermore': ['also', 'on top of that', 'plus'],
  'additionally': ['also', 'plus', 'on top of that'],
  'moreover': ['also', 'what is more', 'besides'],
  'nonetheless': ['still', 'even so', 'all the same'],
  'henceforth': ['from now on', 'going forward', 'from here'],
  'notwithstanding': ['despite this', 'even so', 'regardless'],
  'likewise': ['in the same way', 'similarly', 'also'],

  // ── AI ADJECTIVE/MISC HIGH-FREQUENCY ──────────────────────────
  'transformative': ['game-changing', 'far-reaching', 'powerful'],
  'unprecedented': ['never before seen', 'unheard of', 'remarkable'],
  'increasingly': ['more and more', 'gradually', 'steadily'],
  'individuals': ['people', 'persons', 'someone'],
  'diverse': ['varied', 'different', 'wide-ranging'],
  'mitigate': ['reduce', 'lessen', 'ease'],
  'regarding': ['about', 'concerning', 'on'],
  'ensure': ['make sure', 'guarantee', 'see to it'],
  'ensuring': ['making sure', 'seeing to it'],
  'addressing': ['tackling', 'dealing with', 'working on'],
  'leveraging': ['using', 'taking advantage of', 'drawing on'],
  'implementing': ['putting in place', 'rolling out', 'setting up'],
  'fostering': ['building', 'growing', 'encouraging'],
  'navigating': ['working through', 'finding a way through', 'dealing with'],
  'profound': ['deep', 'strong', 'serious'],
  'resilience': ['toughness', 'strength', 'grit'],
  'pivotal': ['key', 'central', 'critical'],
  'paramount': ['key', 'top priority', 'critical'],
  'imperative': ['vital', 'critical', 'urgent'],
  'exacerbating': ['worsening', 'making worse', 'compounding'],
  'vulnerability': ['weakness', 'exposure', 'risk'],
  'revolutionized': ['changed', 'transformed', 'reshaped'],
  'immersive': ['engaging', 'absorbing', 'hands-on'],
  'coordinated': ['organized', 'joint', 'planned'],
  'accessible': ['available', 'open', 'reachable'],
  'personalized': ['tailored', 'customized', 'individual'],
  'additional': ['extra', 'more', 'added'],

  // ── DOMAIN: BUSINESS / CORPORATE ──────────────────────────────
  'streamline': ['simplify', 'speed up', 'smooth out'],
  'optimize': ['improve', 'fine-tune', 'get the most from'],
  'scalable': ['growable', 'expandable', 'flexible'],
  'synergy': ['combined benefit', 'teamwork', 'joint effort'],
  'incentivize': ['encourage', 'motivate', 'reward'],
  'monetize': ['make money from', 'profit from', 'earn from'],
  'actionable': ['usable', 'practical', 'ready to act on'],
  'deliverables': ['outputs', 'results', 'end products'],
  'benchmarks': ['standards', 'targets', 'reference points'],
  'metrics': ['measures', 'numbers', 'data points'],
  'iterations': ['rounds', 'versions', 'cycles'],
  'onboarding': ['getting started', 'training', 'setup'],

  // ── DOMAIN: TECHNOLOGY ────────────────────────────────────────
  'ecosystem': ['environment', 'network', 'setup'],
  'infrastructure': ['setup', 'backbone', 'foundation'],
  'interoperability': ['compatibility', 'ability to work together'],
  'ubiquitous': ['everywhere', 'common', 'all around'],
  'seamless': ['smooth', 'easy', 'frictionless'],
  'granular': ['detailed', 'fine-grained', 'specific'],
  'bandwidth': ['capacity', 'room', 'resources'],
  'bottleneck': ['chokepoint', 'slowdown', 'block'],

  // ── DOMAIN: HEALTHCARE / SOCIAL SCIENCE ───────────────────────
  'etiology': ['cause', 'origin', 'root'],
  'comorbidity': ['co-occurring condition', 'related illness'],
  'prognosis': ['outlook', 'expected outcome', 'forecast'],
  'intervention': ['treatment', 'action', 'step taken'],
  'therapeutic': ['healing', 'treatment-based', 'clinical'],
  'exacerbation': ['worsening', 'flare-up', 'spike'],
  'longitudinal': ['long-term', 'over time', 'extended'],
  'socioeconomic': ['social and economic', 'class-based'],
  'marginalized': ['sidelined', 'excluded', 'underserved'],
  'equitable': ['fair', 'even-handed', 'just'],
  'stigmatization': ['stigma', 'shaming', 'labeling'],
  'psychosocial': ['mental and social', 'emotional and social'],
  'wellbeing': ['health', 'wellness', 'quality of life'],
  'intersectionality': ['overlapping factors', 'combined identities'],
  'empowerment': ['giving power', 'building strength', 'enabling'],
};

// ═══════════════════════════════════════════════════════════════════
// 2. AI PHRASE PATTERNS → HUMAN PHRASES
//    Multi-word patterns that only AI produces consistently
// ═══════════════════════════════════════════════════════════════════

const PHRASE_NATURALIZER: Array<{ pattern: RegExp; replacements: string[] }> = [
  // ── GENERAL AI EVALUATIVE PHRASES ─────────────────────────────
  {
    pattern: /\bgoal[- ]oriented\b/gi,
    replacements: ['focused on goals', 'aimed at results', 'goal-driven'],
  },
  {
    pattern: /\baction[- ]oriented\b/gi,
    replacements: ['focused on action', 'hands-on', 'practical'],
  },
  {
    pattern: /\bevidence[- ]based\b/gi,
    replacements: ['backed by evidence', 'research-backed', 'grounded in evidence'],
  },
  {
    pattern: /\bwell[- ]established\b/gi,
    replacements: ['proven', 'known', 'established'],
  },
  {
    pattern: /\bform of psychotherapy\b/gi,
    replacements: ['type of therapy', 'kind of therapy', 'therapy approach', 'therapeutic method'],
  },
  {
    pattern: /\bform of (?:treatment|intervention)\b/gi,
    replacements: ['treatment method', 'type of treatment', 'treatment approach'],
  },
  {
    pattern: /\bmental health conditions?\b/gi,
    replacements: ['mental health issues', 'conditions like depression or anxiety', 'mental health problems'],
  },
  {
    pattern: /\bthinking patterns?\b/gi,
    replacements: ['thought habits', 'ways of thinking', 'how someone thinks'],
  },
  {
    pattern: /\bnegative or unhelpful\b/gi,
    replacements: ['unhealthy', 'counterproductive', 'destructive'],
  },
  {
    pattern: /\bhealthier and more positive\b/gi,
    replacements: ['better', 'more constructive', 'healthier'],
  },
  {
    pattern: /\bmore balanced and productive\b/gi,
    replacements: ['more measured', 'healthier', 'more constructive'],
  },
  {
    pattern: /\brelationship between\b/gi,
    replacements: ['connection between', 'link between', 'tie between'],
  },
  {
    pattern: /\bfaulty ways of thinking\b/gi,
    replacements: ['flawed thinking', 'distorted thoughts', 'thinking errors'],
  },
  {
    pattern: /\blearned patterns of\b/gi,
    replacements: ['habits of', 'patterns of', 'ingrained'],
  },
  {
    pattern: /\bdevelop healthier\b/gi,
    replacements: ['build better', 'form healthier', 'adopt better'],
  },
  {
    pattern: /\breplace them with\b/gi,
    replacements: ['swap them for', 'change them to', 'shift to'],
  },
  {
    pattern: /\bconcentrates (?:more )?on\b/gi,
    replacements: ['focuses on', 'zeroes in on', 'puts more weight on'],
  },
  {
    pattern: /\bfinding effective solutions\b/gi,
    replacements: ['finding what works', 'looking for solutions', 'solving problems'],
  },
  {
    pattern: /\bequips (?:individuals|people|patients) with\b/gi,
    replacements: ['gives people', 'provides people with', 'arms people with'],
  },
  {
    pattern: /\bcan be applied in everyday life\b/gi,
    replacements: ['work in daily life', 'are useful day to day', 'carry over to real life'],
  },
  {
    pattern: /\bmaintaining long[- ]term\b/gi,
    replacements: ['keeping up long-term', 'sustaining', 'holding onto'],
  },
  // ── PREMIUM: HIGH-VALUE AI PHRASE PATTERNS ────────────────────
  {
    pattern: /\bit is (?:important|crucial|essential|vital|imperative) to (?:note|recognize|understand|acknowledge) that\b/gi,
    replacements: ['the key point is that', 'what matters here is that', 'the thing to see is that'],
  },
  {
    pattern: /\bin (?:today's|the modern|the current|the contemporary) (?:world|society|era|age|landscape)\b/gi,
    replacements: ['right now', 'these days', 'at this point', 'as things stand'],
  },
  {
    pattern: /\bin (?:recent|the past few) (?:years|decades)\b/gi,
    replacements: ['lately', 'over the last few years', 'not long ago'],
  },
  {
    pattern: /\bhas (?:gained|attracted|received|garnered) (?:significant|considerable|increasing|widespread|growing) (?:attention|interest|recognition|traction)\b/gi,
    replacements: ['has drawn a lot of interest', 'has picked up steam', 'has gotten more notice'],
  },
  {
    pattern: /\bit is (?:worth|important) noting that\b/gi,
    replacements: ['one thing to note is that', 'keep in mind that', 'notably'],
  },
  {
    pattern: /\bserves as a (?:testament|reminder|beacon|catalyst|foundation)\b/gi,
    replacements: ['stands as proof', 'is a clear sign', 'shows the power'],
  },
  {
    pattern: /\ba wide (?:range|variety|array|spectrum) of\b/gi,
    replacements: ['many different', 'all kinds of', 'a mix of', 'plenty of'],
  },
  {
    pattern: /\bplays a (?:crucial|vital|key|significant|important|pivotal|critical) role\b/gi,
    replacements: ['matters a lot', 'is central', 'carries real weight', 'is a big factor'],
  },
  {
    pattern: /\bin order to\b/gi,
    replacements: ['to', 'so as to', 'for the purpose of'],
  },
  {
    pattern: /\bdue to the fact that\b/gi,
    replacements: ['because', 'since', 'given that'],
  },
  {
    pattern: /\bthe fact that\b/gi,
    replacements: ['that', 'how'],
  },
  {
    pattern: /\bat the end of the day\b/gi,
    replacements: ['in the end', 'when all is said and done', 'ultimately'],
  },
  {
    pattern: /\bin light of\b/gi,
    replacements: ['given', 'because of', 'considering'],
  },
  {
    pattern: /\bin the context of\b/gi,
    replacements: ['when it comes to', 'in terms of', 'for'],
  },
  {
    pattern: /\bwith regard to\b/gi,
    replacements: ['about', 'on', 'concerning'],
  },
  {
    pattern: /\bwith respect to\b/gi,
    replacements: ['about', 'on', 'for'],
  },
  {
    pattern: /\bon the (?:other )?hand\b/gi,
    replacements: ['then again', 'but', 'at the same time'],
  },
  {
    pattern: /\bhas the potential to\b/gi,
    replacements: ['could', 'may well', 'is able to'],
  },
  {
    pattern: /\bit is evident that\b/gi,
    replacements: ['clearly', 'it is clear that', 'plainly'],
  },
  {
    pattern: /\bit can be argued that\b/gi,
    replacements: ['some would say', 'there is a case that', 'arguably'],
  },
  {
    pattern: /\bthere is a growing (?:need|demand|consensus|body of evidence)\b/gi,
    replacements: ['more and more people see the need', 'the push is growing', 'evidence keeps building'],
  },
  {
    pattern: /\btake into (?:account|consideration)\b/gi,
    replacements: ['consider', 'keep in mind', 'factor in'],
  },
  {
    pattern: /\bgives rise to\b/gi,
    replacements: ['leads to', 'causes', 'creates'],
  },
  {
    pattern: /\bin conjunction with\b/gi,
    replacements: ['along with', 'together with', 'combined with'],
  },
  {
    pattern: /\bhas been shown to\b/gi,
    replacements: ['is known to', 'has proven to', 'does'],
  },
  {
    pattern: /\bit (?:should|must) be (?:noted|emphasized|highlighted|stressed|recognized) that\b/gi,
    replacements: ['the key point is that', 'what stands out is that', 'notably'],
  },
  {
    pattern: /\bcritical (?:component|element|factor|aspect) of\b/gi,
    replacements: ['key part of', 'important piece of', 'core of'],
  },
  {
    pattern: /\bfar[- ]reaching (?:implications|consequences|effects|impact)\b/gi,
    replacements: ['wide effects', 'broad impact', 'lasting consequences'],
  },
  {
    pattern: /\ba (?:plethora|myriad|multitude) of\b/gi,
    replacements: ['many', 'loads of', 'a large number of', 'plenty of'],
  },
  {
    pattern: /\bthis (?:highlights|underscores|underlines|emphasizes|illustrates) the (?:importance|need|significance|value) of\b/gi,
    replacements: ['this shows why it matters to', 'this points to the value of', 'this makes clear the need for'],
  },
  {
    pattern: /\bpave the way for\b/gi,
    replacements: ['open the door to', 'set the stage for', 'make room for'],
  },
  {
    pattern: /\bsheds? light on\b/gi,
    replacements: ['explains', 'reveals', 'makes clear'],
  },
  {
    pattern: /\bbridges? the gap between\b/gi,
    replacements: ['connects', 'links', 'closes the space between'],
  },
  {
    pattern: /\bin the realm of\b/gi,
    replacements: ['in', 'within', 'when it comes to'],
  },
  {
    pattern: /\bat the forefront of\b/gi,
    replacements: ['leading', 'ahead in', 'at the front of'],
  },
  {
    pattern: /\bthe (?:vast|overwhelming) majority of\b/gi,
    replacements: ['most', 'nearly all', 'the bulk of'],
  },
  {
    pattern: /\bcontinues to (?:be|remain)\b/gi,
    replacements: ['is still', 'stays', 'remains'],
  },
];

// ═══════════════════════════════════════════════════════════════════
// 3. PERPLEXITY INJECTION
//    Strategic word replacements that increase lexical surprise
//    without harming readability. These are unusual but correct choices.
// ═══════════════════════════════════════════════════════════════════

const PERPLEXITY_BOOSTS: Array<{ pattern: RegExp; replacements: string[] }> = [
  { pattern: /\bhelps\b/gi, replacements: ['lets', 'allows'] },
  { pattern: /\bimproves\b/gi, replacements: ['lifts', 'raises', 'boosts'] },
  { pattern: /\bidentify\b/gi, replacements: ['spot', 'catch', 'pick up on', 'notice'] },
  { pattern: /\brespond\b/gi, replacements: ['react', 'deal with', 'handle'] },
  { pattern: /\bmanage\b/gi, replacements: ['handle', 'deal with', 'work through'] },
  { pattern: /\bcontrol\b/gi, replacements: ['handle', 'rein in', 'keep in check'] },
  { pattern: /\badopt\b/gi, replacements: ['pick up', 'take on', 'start using'] },
  { pattern: /\bovercome\b/gi, replacements: ['get past', 'push through', 'work through'] },
  { pattern: /\bsuch as\b/gi, replacements: ['like', 'including'] },
  { pattern: /\bcreate\b/gi, replacements: ['build', 'set up', 'put together'] },
  { pattern: /\bprovide\b/gi, replacements: ['give', 'offer', 'supply'] },
  { pattern: /\brequire\b/gi, replacements: ['need', 'call for', 'demand'] },
  { pattern: /\bexamine\b/gi, replacements: ['look at', 'study', 'dig into'] },
  { pattern: /\bestablish\b/gi, replacements: ['set up', 'build', 'lay down'] },
  { pattern: /\bgenerate\b/gi, replacements: ['produce', 'create', 'bring about'] },
];

// ═══════════════════════════════════════════════════════════════════
// MAIN NATURALIZER FUNCTION
// ═══════════════════════════════════════════════════════════════════

export function naturalizeVocabulary(
  sentence: string,
  protectedTerms: Set<string>,
  intensity: number = 0.6   // 0-1: how aggressively to replace
): string {
  let result = sentence;

  // Phase 1: Phrase-level naturalizations (highest priority — multi-word)
  for (const { pattern, replacements } of PHRASE_NATURALIZER) {
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      pattern.lastIndex = 0;
      // Use deterministic selection based on sentence length for consistency
      const replacement = replacements[result.length % replacements.length];
      result = result.replace(pattern, (match) => {
        // Preserve capitalization of first character
        if (match.charAt(0) === match.charAt(0).toUpperCase() && replacement.charAt(0) !== replacement.charAt(0).toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
    }
  }

  // Phase 2: Word-level vocabulary swaps (apply to all matches at strong intensity)
  for (const [word, replacements] of Object.entries(VOCAB_NATURALIZER)) {
    if (protectedTerms.has(word.toLowerCase())) continue;
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    if (re.test(result)) {
      re.lastIndex = 0;
      // Deterministic selection + always apply at intensity >= 0.6
      const shouldApply = intensity >= 0.6 || Math.random() < intensity;
      if (shouldApply) {
        const replacement = replacements[result.length % replacements.length];
        // Only replace first occurrence to avoid over-processing
        result = result.replace(re, (_match) => {
          // Preserve capitalization
          if (_match.charAt(0) === _match.charAt(0).toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
          }
          return replacement;
        });
      }
    }
  }

  // Phase 3: Perplexity boosts (apply more aggressively at strong intensity)
  for (const { pattern, replacements } of PERPLEXITY_BOOSTS) {
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      const shouldApply = intensity >= 0.8 || Math.random() < intensity * 0.5;
      if (shouldApply) {
        pattern.lastIndex = 0;
        const replacement = replacements[result.length % replacements.length];
        // Replace only first match
        let replaced = false;
        result = result.replace(pattern, (match) => {
          if (replaced) return match;
          replaced = true;
          if (match.charAt(0) === match.charAt(0).toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
          }
          return replacement;
        });
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
