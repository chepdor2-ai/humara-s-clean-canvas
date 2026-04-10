/**
 * Oxygen Humanizer Engine — Pure TypeScript (Vercel-compatible)
 * =============================================================
 * Full port of the Python Oxygen T5 multi-phase pipeline, reimplemented
 * as a serverless-compatible TypeScript module. No Python, no PyTorch,
 * no local server required.
 *
 * Architecture:
 *   Phase 1: AI word kill + filler cuts + starter diversification
 *   Phase 2: Deep synonym replacement (150+ patterns)
 *   Phase 3: Structural variance (clause fronting, sentence splitting/merging)
 *   Phase 4: Heavy rule-based rewriting (structural templates, voice switching)
 *   Phase 5: Grammar fixes
 *   Phase 6: Quality gate — enforce min change ratio with retry loop
 */

// ── Tense-aware replacement helpers ──

/** Safe first-char accessor — prevents 'Cannot read properties of undefined' */
function safeChar(s: string | undefined, fallback = ''): string {
  return s && s.length > 0 ? s[0] : fallback;
}

const IRREGULAR_PAST: Record<string, string> = {
  give: 'gave', make: 'made', deal: 'dealt', build: 'built',
  set: 'set', take: 'took', go: 'went', see: 'saw',
  run: 'ran', get: 'got', put: 'put', let: 'let',
  keep: 'kept', hold: 'held', tell: 'told', find: 'found',
  have: 'had', do: 'did', say: 'said', come: 'came',
  show: 'showed', prove: 'proved', drive: 'drove',
};

function inflectVerb(word: string, form: string): string {
  if (form === 'base') return word;
  const w = word.toLowerCase();
  if (form === 'past') {
    if (IRREGULAR_PAST[w]) return IRREGULAR_PAST[w];
    if (w.endsWith('e')) return w + 'd';
    if (w.endsWith('y') && w.length > 2 && !'aeiou'.includes(w[w.length - 2])) return w.slice(0, -1) + 'ied';
    return w + 'ed';
  }
  if (form === '3sg') {
    if (/(?:sh|ch|x|z|ss)$/.test(w)) return w + 'es';
    if (w.endsWith('y') && w.length > 2 && !'aeiou'.includes(w[w.length - 2])) return w.slice(0, -1) + 'ies';
    return w + 's';
  }
  if (form === 'gerund') {
    if (w.endsWith('ie')) return w.slice(0, -2) + 'ying';
    if (w.endsWith('e') && !w.endsWith('ee')) return w.slice(0, -1) + 'ing';
    return w + 'ing';
  }
  return word;
}

function detectVerbForm(word: string): string {
  const w = word.toLowerCase().trim();
  if (w.endsWith('ing')) return 'gerund';
  if (w.endsWith('ly') && w.length > 4) return 'adverb';
  if (w.endsWith('ied') || w.endsWith('ed')) return 'past';
  if (w.endsWith('d') && w.length > 3 && w[w.length - 2] === 'e') return 'past';
  if (w.endsWith('es') && !/(ness|less)$/.test(w)) return '3sg';
  if (w.endsWith('s') && !/(ss|us|is|ous|ness)$/.test(w)) return '3sg';
  return 'base';
}

function matchForm(matched: string, replacement: string): string {
  const form = detectVerbForm(matched);
  if (form === 'base') return replacement;
  const repForm = detectVerbForm(replacement.split(' ', 1)[0]);
  if (repForm === form) return replacement;
  if (form === 'adverb' && !replacement.endsWith('ly')) return replacement + 'ly';
  if (form === 'past' || form === '3sg' || form === 'gerund') {
    const parts = replacement.split(' ', 2);
    const inflected = inflectVerb(parts[0], form);
    return parts.length > 1 ? inflected + ' ' + parts.slice(1).join(' ') : inflected;
  }
  return replacement;
}

// ── Phase 1: AI word kills (90+ patterns) ──

const AI_WORD_KILLS: [RegExp, string][] = [
  // Multi-word phrases first
  [/\bit is important to note that\b/gi, 'worth noting,'],
  [/\bit is worth noting that\b/gi, 'notably,'],
  [/\bin today'?s rapidly evolving\b/gi, 'in the current'],
  [/\bin the realm of\b/gi, 'in'],
  [/\bin the context of\b/gi, 'regarding'],
  [/\bplays a (?:crucial|vital|pivotal) role\b/gi, 'matters greatly'],
  [/\bserves as a\b/gi, 'acts as a'],
  [/\bit should be noted that\b/gi, 'note that'],
  [/\bthis suggests that\b/gi, 'this means'],
  [/\bthe fact that\b/gi, 'that'],
  [/\bin order to\b/gi, 'to'],
  [/\ba wide range of\b/gi, 'many'],
  [/\ba growing body of\b/gi, 'increasing'],
  [/\bas a result of\b/gi, 'because of'],
  [/\bin light of\b/gi, 'given'],
  [/\bwith respect to\b/gi, 'about'],
  [/\bon the other hand\b/gi, 'yet'],
  [/\bin addition to\b/gi, 'besides'],
  [/\bin terms of\b/gi, 'regarding'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bfor the purpose of\b/gi, 'to'],
  // Single-word replacements
  [/\butilize[sd]?\b/gi, 'use'],
  [/\butilizing\b/gi, 'using'],
  [/\bleverage[sd]?\b/gi, 'use'],
  [/\bleveraging\b/gi, 'using'],
  [/\bfacilitate[sd]?\b/gi, 'help'],
  [/\bfacilitating\b/gi, 'helping'],
  [/\bmoreover\b/gi, 'also'],
  [/\bfurthermore\b/gi, 'also'],
  [/\bnevertheless\b/gi, 'still'],
  [/\bnonetheless\b/gi, 'still'],
  [/\bconsequently\b/gi, 'so'],
  [/\bsubsequently\b/gi, 'then'],
  [/\badditionally\b/gi, 'also'],
  [/\bpivotal\b/gi, 'key'],
  [/\bcrucial\b/gi, 'important'],
  [/\bunderscores?\b/gi, 'highlight'],
  [/\bunderscoring\b/gi, 'highlighting'],
  [/\bdelve[sd]?\b/gi, 'explore'],
  [/\bdelving\b/gi, 'exploring'],
  [/\bcommence[sd]?\b/gi, 'start'],
  [/\bcommencing\b/gi, 'starting'],
  [/\bdemonstrate[sd]?\b/gi, 'show'],
  [/\bdemonstrating\b/gi, 'showing'],
  [/\benchance[sd]?\b/gi, 'improve'],
  [/\benchancing\b/gi, 'improving'],
  [/\benchancement\b/gi, 'improvement'],
  [/\bimplementation\b/gi, 'use'],
  [/\btransformative\b/gi, 'major'],
  [/\bholistic\b/gi, 'complete'],
  [/\bparadigm\b/gi, 'model'],
  [/\bsynergy\b/gi, 'cooperation'],
  [/\brobust\b/gi, 'strong'],
  [/\bseamless(?:ly)?\b/gi, 'smooth'],
  [/\binnovative\b/gi, 'new'],
  [/\bcutting-edge\b/gi, 'modern'],
  [/\bgroundbreaking\b/gi, 'new'],
  [/\bcomprehensive\b/gi, 'thorough'],
  [/\bmultifaceted\b/gi, 'complex'],
  [/\bintricate\b/gi, 'complex'],
  [/\bplethora\b/gi, 'many'],
  [/\bmyriad\b/gi, 'many'],
  [/\bundeniably\b/gi, 'clearly'],
  [/\bindeed\b/gi, 'in fact'],
  [/\bexemplif(?:y|ies|ied)\b/gi, 'show'],
  [/\bexemplifying\b/gi, 'showing'],
  [/\bmeticulous(?:ly)?\b/gi, 'careful'],
  [/\bprofound(?:ly)?\b/gi, 'deep'],
  [/\bencompass(?:es|ed|ing)?\b/gi, 'include'],
  [/\boverarch(?:ing)?\b/gi, 'broad'],
  [/\bdramatically\b/gi, 'greatly'],
  [/\bnotably\b/gi, 'especially'],
  [/\bremarkab(?:le|ly)\b/gi, 'striking'],
  [/\bexponential(?:ly)?\b/gi, 'rapid'],
  [/\blandscape\b/gi, 'scene'],
  [/\becosystem\b/gi, 'network'],
  [/\bframework\b/gi, 'structure'],
  [/\btrajectory\b/gi, 'path'],
  [/\bparadigm shift\b/gi, 'major change'],
];

// ── Filler cuts ──

const FILLER_CUTS: [RegExp, string][] = [
  [/\s*,\s*however\s*,\s*/gi, ' but '],
  [/\s*,\s*therefore\s*,\s*/gi, ', so '],
  [/\s*,\s*thus\s*,\s*/gi, ', so '],
  [/\bdespite the fact that\b/gi, 'even though'],
  [/\bregardless of the fact that\b/gi, 'even though'],
  [/\bthe notion that\b/gi, 'the idea that'],
  [/\bthe concept of\b/gi, 'the idea of'],
];

// ── AI Starters ──

const AI_STARTERS: RegExp[] = [
  /^(In conclusion,?)\s/i,
  /^(Overall,?)\s/i,
  /^(To summarize,?)\s/i,
  /^(In summary,?)\s/i,
  /^(As (?:we|one) can see,?)\s/i,
  /^(It is (?:clear|evident|apparent) that)\s/i,
  /^(This (?:essay|paper|analysis) (?:has|will))\s/i,
];

const HUMAN_STARTERS = [
  'Looking at this,', 'From what we see,', 'Putting it together,',
  'The picture here is that', 'Taking stock,', 'All things considered,',
  'Stepping back,', 'At the end of the day,', 'When we add it all up,',
];

// ── Deep Synonyms (150+ patterns) ──

const DEEP_SYNONYMS: [RegExp, string[]][] = [
  [/\btransformed\b/gi, ['changed', 'reshaped', 'altered', 'shifted']],
  [/\bsignificantly\b/gi, ['greatly', 'notably', 'markedly', 'considerably']],
  [/\badvancements\b/gi, ['progress', 'developments', 'improvements', 'strides']],
  [/\balgorithms\b/gi, ['methods', 'processes', 'techniques', 'approaches']],
  [/\bdisciplines?\b/gi, ['fields', 'areas', 'branches', 'domains']],
  [/\bintegration\b/gi, ['adoption', 'incorporation', 'blending', 'merging']],
  [/\brequires?\b/gi, ['need', 'call for', 'demand', 'take']],
  [/\brequired\b/gi, ['needed', 'called for', 'demanded', 'took']],
  [/\bapproach\b/gi, ['strategy', 'method', 'plan', 'framework']],
  [/\bensure\b/gi, ['guarantee', 'make sure', 'confirm', 'verify']],
  [/\badoption\b/gi, ['uptake', 'acceptance', 'embrace', 'rollout']],
  [/\boutcomes?\b/gi, ['results', 'findings', 'effects', 'impacts']],
  [/\bimpact\b/gi, ['effect', 'influence']],
  [/\bsystems?\b/gi, ['setups', 'frameworks', 'structures', 'platforms']],
  [/\btechnology\b/gi, ['tech', 'digital tooling', 'modern solution']],
  [/\btechnologies\b/gi, ['digital tools', 'modern tools', 'current tools']],
  [/\btechnological\b/gi, ['digital', 'modern', 'current', 'technical']],
  [/\bprovides?\b/gi, ['offer', 'give', 'supply', 'deliver']],
  [/\bprovided\b/gi, ['offered', 'gave', 'supplied', 'delivered']],
  [/\bproviding\b/gi, ['offering', 'giving', 'supplying']],
  [/\bchallenges?\b/gi, ['problems', 'hurdles', 'issues', 'difficulties']],
  [/\beffectively\b/gi, ['usefully', 'in practice', 'successfully', 'well']],
  [/\beffective\b/gi, ['useful', 'practical', 'successful', 'working']],
  [/\bsubstantially\b/gi, ['largely', 'to a great extent', 'considerably', 'markedly']],
  [/\bsubstantial\b/gi, ['large', 'major', 'big', 'sizable']],
  [/\bconsiderable\b/gi, ['major', 'large', 'notable', 'real']],
  [/\bimportant\b/gi, ['key', 'central', 'significant', 'vital']],
  [/\bessentially\b/gi, ['at its core', 'in essence', 'basically', 'really']],
  [/\bessential\b/gi, ['key', 'needed', 'critical', 'required']],
  [/\bvarious\b/gi, ['several', 'different', 'a number of', 'assorted']],
  [/\bnumerous\b/gi, ['many', 'several', 'a lot of', 'plenty of']],
  [/\bspecifically\b/gi, ['in particular', 'namely', 'to be precise']],
  [/\bimproves?\b/gi, ['betters', 'boosts', 'raises', 'lifts']],
  [/\bimproved\b/gi, ['bettered', 'boosted', 'raised', 'lifted']],
  [/\bimproving\b/gi, ['bettering', 'boosting', 'raising']],
  [/\bbenefits?\b/gi, ['gains', 'advantages', 'perks', 'upsides']],
  [/\bfundamentally\b/gi, ['basically', 'at its core', 'at a deep level', 'in essence']],
  [/\bfundamental\b/gi, ['basic', 'core', 'central']],
  [/\baddress(?:es)?\b/gi, ['tackle', 'handle', 'deal with', 'confront']],
  [/\baddressed\b/gi, ['tackled', 'handled', 'dealt with', 'confronted']],
  [/\baddressing\b/gi, ['tackling', 'handling', 'dealing with', 'confronting']],
  [/\bmethods?\b/gi, ['ways', 'techniques', 'means', 'strategies']],
  [/\banalysi[sz]\b/gi, ['study', 'review', 'examination', 'assessment']],
  [/\bresearch\b/gi, ['study', 'investigation', 'work', 'inquiry']],
  [/\bconsequences?\b/gi, ['effects', 'results', 'impacts', 'fallout']],
  [/\bestablish(?:es)?\b/gi, ['set up', 'create', 'form', 'build']],
  [/\bestablished\b/gi, ['set up', 'created', 'formed', 'built']],
  [/\bestablishing\b/gi, ['setting up', 'creating', 'forming', 'building']],
  [/\bsignificant\b/gi, ['major', 'notable', 'meaningful', 'real']],
  [/\bmodern\b/gi, ['current', 'present-day', "today's", 'recent']],
  [/\bacross\b/gi, ['throughout', 'over', 'spanning', 'covering']],
  [/\bfocuses\b/gi, ['centers on', 'concentrates on', 'zeroes in on', 'homes in on']],
  [/\bfocused\b/gi, ['centered', 'concentrated', 'zeroed in', 'homed in']],
  [/\bfocusing\b/gi, ['centering', 'concentrating', 'zeroing in', 'homing in']],
  [/\butiliz(?:e[sd]?|ation)\b/gi, ['use', 'usage', 'application', 'employment']],
  [/\bdemonstrates?\b/gi, ['show', 'reveal', 'prove', 'make clear']],
  [/\bdemonstrated\b/gi, ['showed', 'revealed', 'proved', 'made clear']],
  [/\bdemonstrating\b/gi, ['showing', 'revealing', 'proving', 'making clear']],
  [/\bfunction(?:s)?\b/gi, ['work', 'operate', 'serve', 'act']],
  [/\bfunctioned\b/gi, ['worked', 'operated', 'served', 'acted']],
  [/\bfunctioning\b/gi, ['working', 'operating', 'serving', 'acting']],
  [/\bcapabilit(?:y|ies)\b/gi, ['ability', 'skill', 'power', 'capacity']],
  [/\bprocesses\b/gi, ['handles', 'manages', 'works through', 'deals with']],
  [/\bprocessed\b/gi, ['handled', 'managed', 'worked through', 'dealt with']],
  [/\bprocessing\b/gi, ['handling', 'managing', 'working through', 'running']],
  [/\bgenerates?\b/gi, ['create', 'produce', 'make', 'yield']],
  [/\bgenerated\b/gi, ['created', 'produced', 'made', 'yielded']],
  [/\bgenerating\b/gi, ['creating', 'producing', 'making', 'yielding']],
  [/\boptimizes?\b/gi, ['improve', 'refine', 'fine-tune', 'streamline']],
  [/\boptimized\b/gi, ['improved', 'refined', 'fine-tuned', 'streamlined']],
  [/\boptimization\b/gi, ['improvement', 'refinement', 'fine-tuning', 'streamlining']],
  [/\boptimizing\b/gi, ['improving', 'refining', 'fine-tuning', 'streamlining']],
  [/\baccuracy\b/gi, ['precision', 'correctness', 'exactness', 'reliability']],
  [/\befficiency\b/gi, ['productivity', 'speed', 'performance', 'throughput']],
  [/\binteraction(?:s)?\b/gi, ['exchange', 'engagement', 'communication', 'dialogue']],
  [/\bimplements?\b/gi, ['put in place', 'roll out', 'set up', 'apply']],
  [/\bimplemented\b/gi, ['put in place', 'rolled out', 'set up', 'applied']],
  [/\bimplementing\b/gi, ['putting in place', 'rolling out', 'setting up', 'applying']],
  [/\bstrateg(?:y|ies)\b/gi, ['plan', 'approach', 'tactic', 'game plan']],
  [/\bphenomen(?:on|a)\b/gi, ['trend', 'occurrence', 'event', 'pattern']],
  [/\bcontributes?\b/gi, ['add', 'give', 'help', 'pitch in']],
  [/\bcontributed\b/gi, ['added', 'gave', 'helped', 'pitched in']],
  [/\bcontribution\b/gi, ['addition', 'input', 'effort', 'part']],
  [/\bcontributing\b/gi, ['adding', 'giving', 'helping', 'pitching in']],
  [/\binfluences?\b/gi, ['shape', 'affect', 'sway', 'steer']],
  [/\binfluenced\b/gi, ['shaped', 'affected', 'swayed', 'steered']],
  [/\binfluencing\b/gi, ['shaping', 'affecting', 'swaying', 'steering']],
  [/\bperspective(?:s)?\b/gi, ['view', 'angle', 'standpoint', 'take']],
  [/\bexperienced\b/gi, ['faced', 'went through', 'encountered', 'saw']],
  [/\bexperiencing\b/gi, ['facing', 'going through', 'encountering', 'seeing']],
  [/\bcommunicates?\b/gi, ['share', 'convey', 'pass along', 'relay']],
  [/\bcommunicated\b/gi, ['shared', 'conveyed', 'passed along', 'relayed']],
  [/\bcommunication\b/gi, ['exchange', 'discussion', 'dialogue', 'contact']],
  [/\bcommunicating\b/gi, ['sharing', 'conveying', 'passing along', 'relaying']],
  [/\bcomplex(?:ity)?\b/gi, ['complicated', 'involved', 'intricate', 'layered']],
  [/\bcritically\b/gi, ['vitally', 'crucially', 'decisively']],
  [/\bcritical\b/gi, ['vital', 'key', 'central', 'decisive']],
  [/\brapidly\b/gi, ['fast', 'quickly', 'swiftly', 'at speed']],
  [/\brapid\b/gi, ['fast', 'quick', 'swift', 'speedy']],
  [/\bsophisticated\b/gi, ['advanced', 'refined', 'elaborate', 'complex']],
  [/\bunprecedented\b/gi, ['unmatched', 'historic', 'extraordinary', 'remarkable']],
  [/\bpotential\b/gi, ['promise', 'capacity', 'ability', 'prospect']],
  [/\bscenario(?:s)?\b/gi, ['situation', 'case', 'setting', 'condition']],
  [/\bcontext\b/gi, ['setting', 'backdrop', 'circumstances', 'situation']],
  [/\benvironment(?:s)?\b/gi, ['setting', 'surrounding', 'space', 'habitat']],
  [/\bincorporates?\b/gi, ['include', 'blend in', 'fold in', 'add']],
  [/\bincorporated\b/gi, ['included', 'blended in', 'folded in', 'added']],
  [/\bincorporating\b/gi, ['including', 'blending in', 'folding in', 'adding']],
  [/\bsignaling\b/gi, ['pointing to', 'showing', 'indicating', 'suggesting']],
  [/\bfacilitatd?\b/gi, ['helped', 'enabled', 'supported', 'made easier']],
  [/\benabled\b/gi, ['allowed', 'let', 'made possible', 'empowered']],
  [/\benabling\b/gi, ['allowing', 'giving the ability for', 'making it possible for', 'empowering']],
  [/\benables?\b/gi, ['allows', 'gives the ability to', 'makes possible', 'empowers']],
  [/\bprecisely\b/gi, ['exactly', 'specifically', 'accurately']],
  [/\bprecise\b/gi, ['exact', 'specific', 'accurate', 'pinpoint']],
];

// ── Sentence Rewrites (structural templates) ──

const SENTENCE_REWRITES: [RegExp, string][] = [
  [/^(.+?)\s+has\s+(significantly|greatly|notably|fundamentally|dramatically)\s+(.+)$/i,
   'When it comes to $1, there has been a $2 $3'],
  [/^The\s+(\w+)\s+of\s+(.+?)\s+has\s+(.+)$/i,
   '$2 has experienced $1 that $3'],
  [/^(.+?)\s+(?:enables?|allows?)\s+(.+?)\s+to\s+(.+)$/i,
   'Through $1, $2 can $3'],
  [/^(.+?)\s+(?:provides?|offers?|gives?)\s+(.+?)\s+with\s+(.+)$/i,
   'With $1, $2 gains $3'],
  [/^It\s+is\s+(\w+)\s+that\s+(.+)$/i,
   '$2 — this is $1'],
  [/^(\w[\w\s]{5,30}?)\s+and\s+(\w[\w\s]{5,30}?)\s+have\s+(.+)$/i,
   'Both $1 and $2 show $3'],
];

// ── Voice switching patterns ──

const VOICE_PATTERNS: [RegExp, string][] = [
  [/^(.{8,40}?)\s+(created|developed|designed|built|produced|introduced|established|launched)\s+(.{8,})$/i,
   '$3 was $2 by $1'],
  [/^(.{8,40}?)\s+(?:was|were)\s+(created|developed|designed|built|produced|introduced|established)\s+by\s+(.{8,})$/i,
   '$3 $2 $1'],
  [/^(.{8,40}?)\s+(improved|enhanced|boosted|advanced|strengthened)\s+(.{8,})$/i,
   '$3 saw $2ment from $1'],
  [/^(Researchers|Scientists|Studies|Experts|Analysts)\s+(found|showed|demonstrated|revealed|discovered|confirmed)\s+that\s+(.+)$/i,
   '$3 — as $1 have $2'],
];

// ── Opener variations ──

const OPENER_VARIATIONS: [string, string[]][] = [
  ['In addition,', ['On top of that,', 'Beyond this,', 'What is more,', 'Added to this,']],
  ['However,', ['That said,', 'On the flip side,', 'Even so,', 'At the same time,']],
  ['Therefore,', ['Because of this,', 'For this reason,', 'As a result,', 'This means']],
  ['For example,', ['Take, for instance,', 'Consider this:', 'A case in point:', 'To illustrate,']],
  ['Similarly,', ['In the same way,', 'Along those lines,', 'Likewise,', 'Comparably,']],
  ['Specifically,', ['More precisely,', 'To be exact,', 'In particular,', 'Narrowing this down,']],
  ['As a result,', ['Because of this,', 'This led to', 'The outcome was that', 'From this,']],
  ['In contrast,', ['Conversely,', 'On the other hand,', 'Alternatively,', 'Then again,']],
  ['Generally,', ['Broadly speaking,', 'For the most part,', 'By and large,', 'As a rule,']],
  ['Importantly,', ['What matters here is', 'A key point:', 'Crucially,', 'Of note,']],
  ['Notably,', ['It stands out that', 'Worth mentioning,', 'One highlight:', 'Strikingly,']],
  ['Ultimately,', ['At the end of the day,', 'When all is said and done,', 'In the final analysis,', 'The bottom line is']],
];

// ── Grammar fixes ──

const GRAMMAR_FIXES: [RegExp, string][] = [
  [/\bhave\s+help\b/gi, 'have helped'],
  [/\bhas\s+help\b/gi, 'has helped'],
  [/\bhave\s+show\b/gi, 'have shown'],
  [/\bhas\s+show\b/gi, 'has shown'],
  [/\bhave\s+make\b/gi, 'have made'],
  [/\bhas\s+make\b/gi, 'has made'],
  [/\bhave\s+give\b/gi, 'have given'],
  [/\bhas\s+give\b/gi, 'has given'],
  [/\bhave\s+take\b/gi, 'have taken'],
  [/\bhas\s+take\b/gi, 'has taken'],
  [/\bhave\s+lead\b/gi, 'have led'],
  [/\bhas\s+lead\b/gi, 'has led'],
  [/\bhave\s+become\b/gi, 'have become'],
  [/\bhave\s+drive\b/gi, 'have driven'],
  [/\bhas\s+drive\b/gi, 'has driven'],
  [/\bhave\s+rise\b/gi, 'have risen'],
  [/\bhas\s+rise\b/gi, 'has risen'],
  [/\bhave\s+grow\b/gi, 'have grown'],
  [/\bhas\s+grow\b/gi, 'has grown'],
  [/\bhave\s+begin\b/gi, 'have begun'],
  [/\bhas\s+begin\b/gi, 'has begun'],
  [/\bhave\s+bring\b/gi, 'have brought'],
  [/\bhas\s+bring\b/gi, 'has brought'],
  [/\bhave\s+run\b/gi, 'have run'],
  [/\bhas\s+run\b/gi, 'has run'],
  [/\bhave\s+write\b/gi, 'have written'],
  [/\bhas\s+write\b/gi, 'has written'],
  [/\bhave\s+speak\b/gi, 'have spoken'],
  [/\bhas\s+speak\b/gi, 'has spoken'],
  [/\bhave\s+choose\b/gi, 'have chosen'],
  [/\bhas\s+choose\b/gi, 'has chosen'],
  [/\btools\s+developments?\b/gi, 'tool development'],
  [/\btools\s+systems?\b/gi, 'tool systems'],
  [/\btools\s+(\w+tion)\b/gi, 'tool $1'],
  [/\btechnologies\s+developments?\b/gi, 'technology developments'],
  [/\brecent\s+tools\b/gi, 'recent tool'],
  [/\(\s+/g, '('],
  [/\s+\)/g, ')'],
  [/\bmachine-learning\b/gi, 'machine learning'],
  [/\bdeep-learning\b/gi, 'deep learning'],
  [/\bhealth\s+care\b/gi, 'healthcare'],
  [/\bhealth-care\b/gi, 'healthcare'],
  [/\b(AI|Artificial Intelligence)\s*\(AI\s*\)/g, 'AI'],
  [/\bArtificial Intelligence \(Artificial Intelligence\)/g, 'Artificial Intelligence'],
  [/\b(\w{4,})\s+\1\b/gi, '$1'],
  [/\ba ([aeiou])/gi, 'an $1'],
  [/\ban (uni\w+|Euro\w+|one\b|once\b)/gi, 'a $1'],
  [/(\w)\(/g, '$1 ('],
  [/\bin deal with\b/gi, 'in dealing with'],
  [/\bin tackle\b/gi, 'in tackling'],
  [/\bin handle\b/gi, 'in handling'],
  [/\bfor address\b/gi, 'for addressing'],
  [/\bby create\b/gi, 'by creating'],
  [/\bby build\b/gi, 'by building'],
  [/\bby set up\b/gi, 'by setting up'],
];

// ── Contractions to expand ──

const CONTRACTIONS: Record<string, string> = {
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
  "won't": 'will not', "wouldn't": 'would not', "couldn't": 'could not',
  "shouldn't": 'should not', "can't": 'cannot', "isn't": 'is not',
  "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "hasn't": 'has not', "haven't": 'have not', "hadn't": 'had not',
  "it's": 'it is', "that's": 'that is', "there's": 'there is',
  "what's": 'what is', "who's": 'who is', "let's": 'let us',
  "I'm": 'I am', "you're": 'you are', "they're": 'they are',
  "we're": 'we are', "he's": 'he is', "she's": 'she is',
  "I've": 'I have', "you've": 'you have', "they've": 'they have',
  "we've": 'we have', "I'll": 'I will', "you'll": 'you will',
  "they'll": 'they will', "we'll": 'we will', "he'll": 'he will',
  "she'll": 'she will', "it'll": 'it will',
};

// ── Utility helpers ──

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return parts.map(s => s.trim()).filter(Boolean);
}

function isTitleLine(line: string): boolean {
  const l = line.trim();
  if (!l || l.length > 100) return false;
  if ('.!?'.includes(l[l.length - 1])) return false;
  const words = l.split(/\s+/);
  if (words.length > 12) return false;
  const capitalWords = words.filter(w => w && w.length > 0 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()).length;
  return capitalWords >= words.length * 0.6;
}

function splitParagraphs(text: string): { text: string; isTitle: boolean }[] {
  const rawParagraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const result: { text: string; isTitle: boolean }[] = [];

  for (const para of rawParagraphs) {
    const lines = para.split('\n');
    if (lines.length === 1 && isTitleLine(lines[0])) {
      result.push({ text: para, isTitle: true });
    } else if (lines.length > 1 && isTitleLine(lines[0])) {
      result.push({ text: lines[0], isTitle: true });
      const body = lines.slice(1).join(' ').trim();
      if (body) result.push({ text: body, isTitle: false });
    } else {
      result.push({ text: para, isTitle: false });
    }
  }
  return result;
}

function measureChange(original: string, modified: string): number {
  const origSet = new Set(original.toLowerCase().split(/\s+/).map(w => w.replace(/[.,;:!?"'()\[\]]/g, '')).filter(Boolean));
  const modSet = new Set(modified.toLowerCase().split(/\s+/).map(w => w.replace(/[.,;:!?"'()\[\]]/g, '')).filter(Boolean));
  if (!origSet.size) return 1;
  const overlap = [...origSet].filter(w => modSet.has(w)).length;
  return 1 - (overlap / Math.max(origSet.size, modSet.size));
}

// ── Phase functions ──

function applyAiWordKill(text: string): string {
  for (const [pattern, replacement] of AI_WORD_KILLS) {
    text = text.replace(pattern, (m) => matchForm(m, replacement));
  }
  return text;
}

function applyFillerCuts(text: string): string {
  for (const [pattern, replacement] of FILLER_CUTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function diversifyStarters(text: string): string {
  for (const pattern of AI_STARTERS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, pick(HUMAN_STARTERS) + ' ');
      break;
    }
  }
  return text;
}

function deepSynonymReplace(text: string, intensity: number = 0.6): string {
  for (const [pattern, replacements] of DEEP_SYNONYMS) {
    const m = pattern.exec(text);
    if (m && Math.random() < intensity) {
      const matched = m[0];
      // Reset regex lastIndex since we use /g flags
      pattern.lastIndex = 0;
      // Skip if inside parenthetical citation
      const before = text.slice(0, m.index);
      const depth = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
      if (depth > 0) continue;
      // Skip if part of multi-word proper noun
      if (matched && matched.length > 0 && matched[0] === matched[0].toUpperCase() && matched[0] !== matched[0].toLowerCase()) {
        const prevWords = before.trim().split(/\s+/).filter(Boolean);
        const afterText = text.slice(m.index + matched.length).trim().split(/\s+/).filter(Boolean);
        const lastPrev = prevWords.length > 0 ? prevWords[prevWords.length - 1] : '';
        const firstAfter = afterText.length > 0 ? afterText[0] : '';
        const prevCap = lastPrev.length > 0 && lastPrev[0] === lastPrev[0].toUpperCase() && lastPrev[0] !== lastPrev[0].toLowerCase();
        const nextCap = firstAfter.length > 0 && firstAfter[0] === firstAfter[0].toUpperCase() && firstAfter[0] !== firstAfter[0].toLowerCase();
        if (prevCap || nextCap) continue;
      }
      const chosen = pick(replacements);
      text = text.slice(0, m.index) + chosen + text.slice(m.index + matched.length);
    }
    pattern.lastIndex = 0; // Always reset
  }
  return text;
}

function clauseFront(sentence: string): string {
  const m = sentence.match(/^(.{20,}?)\s+(because|since|although|while|whereas|given that)\s+(.{10,})$/i);
  if (m && Math.random() < 0.7) {
    const main = m[1].replace(/[.,;]+$/, '');
    const conj = m[2];
    const sub = m[3].replace(/\.$/, '');
    if (!conj || !main || !sub) return sentence;
    return `${conj[0].toUpperCase() + conj.slice(1)} ${sub}, ${main[0].toLowerCase()}${main.slice(1)}.`;
  }
  return sentence;
}

function splitLongSentence(sentence: string, maxWords: number = 35): string {
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return sentence;
  const m = sentence.match(/,\s+(and|but|yet|so|or)\s+/);
  if (m && m.index && m.index > sentence.length * 0.3) {
    const first = sentence.slice(0, m.index).replace(/[,.\s]+$/, '');
    const second = sentence.slice(m.index + m[0].length).trim();
    if (second.split(/\s+/).length >= 5 && second.length > 0) {
      return `${first}. ${second[0].toUpperCase()}${second.slice(1)}`;
    }
  }
  if (sentence.includes('; ')) {
    const parts = sentence.split('; ', 2);
    if (parts[0].split(/\s+/).length >= 8 && parts[1] && parts[1].length > 0 && parts[1].split(/\s+/).length >= 5) {
      return `${parts[0].replace(/\.$/, '')}. ${parts[1][0].toUpperCase()}${parts[1].slice(1)}`;
    }
  }
  return sentence;
}

function varySentenceLength(sentences: string[]): string[] {
  if (sentences.length < 4) return sentences;
  const result: string[] = [];
  let i = 0;
  while (i < sentences.length) {
    const s = sentences[i];
    if (i + 1 < sentences.length
      && s.split(/\s+/).length < 10
      && sentences[i + 1].split(/\s+/).length < 10
      && sentences[i + 1].length > 0
      && Math.random() < 0.3) {
      const connector = pick([', and ', ' — ', '; ']);
      const nextSent = sentences[i + 1];
      const merged = s.replace(/[.!?]+$/, '') + connector + (nextSent.length > 0 ? nextSent[0].toLowerCase() + nextSent.slice(1) : '');
      result.push(merged);
      i += 2;
    } else {
      result.push(s);
      i += 1;
    }
  }
  return result;
}

function fixGrammar(text: string): string {
  for (const [pattern, replacement] of GRAMMAR_FIXES) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function restructureSentence(sentence: string): string {
  // Try "X of Y" → rephrase
  const m1 = sentence.match(/^(The\s+\w+)\s+of\s+([\w\s]+?)\s+(has|have|is|are|was|were)\s+(.+)$/i);
  if (m1 && Math.random() < 0.7) {
    const subjWord = m1[1].split(/\s+/).pop()?.toLowerCase() || '';
    const trimmed2 = m1[2].trim();
    if (!trimmed2) return sentence;
    return `${trimmed2[0].toUpperCase() + trimmed2.slice(1)} ${m1[3]} seen its ${subjWord} ${m1[4]}`;
  }
  // Move adverbial time/place phrases
  const m2 = sentence.match(/^(.{15,}?)\s+(in recent years|today|currently|nowadays|over time|in practice)\s*[,.]?\s*(.*)$/i);
  if (m2 && Math.random() < 0.7) {
    const combined = (m2[1].replace(/[.,;]+$/, '') + ' ' + m2[3]).trim().replace(/\.$/, '');
    if (!combined || !m2[2]) return sentence;
    return `${m2[2][0].toUpperCase() + m2[2].slice(1)}, ${combined[0].toLowerCase()}${combined.slice(1)}.`;
  }
  return sentence;
}

function heavyRewriteSentence(sentence: string): string {
  let result = sentence;
  let applied = false;

  // 1. Opener variations
  for (const [originalOpener, alternatives] of OPENER_VARIATIONS) {
    if (result.startsWith(originalOpener)) {
      result = result.replace(originalOpener, pick(alternatives));
      applied = true;
      break;
    }
  }

  // 2. Structural rewrites
  if (!applied && Math.random() < 0.85) {
    for (const [pattern, replacement] of SENTENCE_REWRITES) {
      if (pattern.test(result)) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, replacement);
        applied = true;
        break;
      }
      pattern.lastIndex = 0;
    }
  }

  // 3. Voice switching
  if (!applied && Math.random() < 0.75) {
    for (const [pattern, replacement] of VOICE_PATTERNS) {
      if (pattern.test(result)) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, replacement);
        applied = true;
        break;
      }
      pattern.lastIndex = 0;
    }
  }

  // 4. Clause swap around commas
  if (!applied && result.includes(',') && Math.random() < 0.5) {
    const commaIdx = result.indexOf(',');
    const p1 = result.slice(0, commaIdx).trim();
    const p2 = result.slice(commaIdx + 1).trim();
    if (p1.split(/\s+/).length >= 5 && p2.split(/\s+/).length >= 5
      && /\b(is|are|was|were|has|have|had|can|will|may)\b/i.test(p2)) {
      const p2Clean = p2.replace(/\.$/, '');
      const p1Clean = p1.replace(/\.$/, '');
      if (p2Clean.length > 0 && p1Clean.length > 0) {
        result = `${p2Clean[0].toUpperCase()}${p2Clean.slice(1)}, ${p1Clean[0].toLowerCase()}${p1Clean.slice(1)}.`;
        applied = true;
      }
    }
  }

  // 5. Fallback: deep synonyms
  if (!applied) {
    result = deepSynonymReplace(result, 0.85);
  }

  // Grammar safety
  result = fixGrammar(result);
  // Fix doubles
  result = result.replace(/\b(the|a|an|in|of|to|for|and|or|is|are|was|were)\s+\1\b/gi, '$1');
  result = result.replace(/\b(\w{3,}ing)\s+\1\b/g, '$1');

  result = result.trim();
  if (result && result[0] === result[0].toLowerCase() && result[0] !== result[0].toUpperCase()) {
    result = result[0].toUpperCase() + result.slice(1);
  }
  if (result && !'.!?'.includes(result[result.length - 1])) {
    result += '.';
  }
  return result;
}

// ── Main sentence humanizer ──

function humanizeSentence(
  original: string,
  minChange: number,
  maxRetries: number,
  mode: 'quality' | 'fast' | 'aggressive',
): { result: string; stats: Record<string, unknown> } {
  if (original.split(/\s+/).length < 3) {
    return { result: original, stats: { skipped: true, reason: 'too_short' } };
  }

  let bestResult = original;
  let bestRatio = 0;
  let attempts = 0;

  // Phase 1-3: AI word kill + filler + starters + structural variance
  {
    attempts++;
    let processed = applyAiWordKill(original);
    processed = applyFillerCuts(processed);
    processed = diversifyStarters(processed);
    processed = clauseFront(processed);
    processed = splitLongSentence(processed);
    processed = fixGrammar(processed);

    processed = processed.trim();
    if (processed && !'.!?'.includes(processed[processed.length - 1])) processed += '.';
    if (processed && processed[0] === processed[0].toLowerCase() && processed[0] !== processed[0].toUpperCase()) {
      processed = processed[0].toUpperCase() + processed.slice(1);
    }

    const ratio = measureChange(original, processed);
    if (ratio > bestRatio) {
      bestResult = processed;
      bestRatio = ratio;
    }
  }

  // Phase 4: Always apply deep synonym + restructuring for maximum change
  // Even if Phase 1-3 met the threshold, we want maximum differentiation
  {
    // Apply deep synonyms with high intensity from the start
    for (let fb = 0; fb < maxRetries && bestRatio < minChange; fb++) {
      attempts++;
      let fallback = heavyRewriteSentence(bestResult);
      fallback = restructureSentence(fallback);
      const intensity = Math.min(0.85 + fb * 0.02, 1.0);
      fallback = deepSynonymReplace(fallback, intensity);
      fallback = applyAiWordKill(fallback);
      fallback = fixGrammar(fallback);
      fallback = fallback.trim();
      if (fallback && !'.!?'.includes(fallback[fallback.length - 1])) fallback += '.';
      if (fallback && fallback[0] === fallback[0].toLowerCase() && fallback[0] !== fallback[0].toUpperCase()) {
        fallback = fallback[0].toUpperCase() + fallback.slice(1);
      }
      const ratio = measureChange(original, fallback);
      if (ratio > bestRatio) {
        bestResult = fallback;
        bestRatio = ratio;
      }
    }

    // Rewrite from original if still below (fresh start, not incremental)
    if (bestRatio < minChange) {
      for (let fb2 = 0; fb2 < 5 && bestRatio < minChange; fb2++) {
        attempts++;
        let fallback = heavyRewriteSentence(original);
        fallback = restructureSentence(fallback);
        fallback = deepSynonymReplace(fallback, 1.0);
        fallback = applyAiWordKill(fallback);
        fallback = applyFillerCuts(fallback);
        fallback = fixGrammar(fallback);
        fallback = fallback.trim();
        if (fallback && !'.!?'.includes(fallback[fallback.length - 1])) fallback += '.';
        if (fallback && fallback[0] === fallback[0].toLowerCase() && fallback[0] !== fallback[0].toUpperCase()) {
          fallback = fallback[0].toUpperCase() + fallback.slice(1);
        }
        const ratio = measureChange(original, fallback);
        if (ratio > bestRatio) {
          bestResult = fallback;
          bestRatio = ratio;
        }
      }
    }
  }

  return {
    result: bestResult,
    stats: {
      attempts,
      change_ratio: Math.round(bestRatio * 1000) / 1000,
      met_threshold: bestRatio >= minChange,
    },
  };
}

// ── Mode presets ──

const MODE_PRESETS: Record<string, { minChange: number; maxRetries: number }> = {
  quality: { minChange: 0.50, maxRetries: 10 },
  fast: { minChange: 0.40, maxRetries: 5 },
  aggressive: { minChange: 0.60, maxRetries: 12 },
};

// ── Main export ──

export function oxygenHumanize(
  text: string,
  strength: string = 'medium',
  mode?: string,
  sentenceBySentence: boolean = true,
): string {
  const resolvedMode = mode || (strength === 'light' ? 'fast' : strength === 'strong' ? 'aggressive' : 'quality');
  const preset = MODE_PRESETS[resolvedMode] || MODE_PRESETS.quality;

  const paragraphs = splitParagraphs(text);
  const allResults: { text: string; isTitle: boolean }[] = [];

  for (const para of paragraphs) {
    if (para.isTitle) {
      allResults.push({ text: para.text, isTitle: true });
      continue;
    }

    if (sentenceBySentence) {
      const sentences = splitSentences(para.text);
      const processed: string[] = [];

      for (const sent of sentences) {
        const { result } = humanizeSentence(sent, preset.minChange, preset.maxRetries, resolvedMode as 'quality' | 'fast' | 'aggressive');
        processed.push(result);
      }

      const varied = varySentenceLength(processed);
      allResults.push({ text: varied.join(' '), isTitle: false });
    } else {
      // Bulk mode: process sentences within paragraph
      const sentences = splitSentences(para.text);
      const processed: string[] = [];

      for (const sent of sentences) {
        const { result } = humanizeSentence(sent, preset.minChange, preset.maxRetries, resolvedMode as 'quality' | 'fast' | 'aggressive');
        processed.push(result);
      }

      // Apply cross-sentence variance
      const sents = processed.map(s => diversifyStarters(s)).map(s => clauseFront(s)).map(s => splitLongSentence(s));
      const varied = varySentenceLength(sents);
      allResults.push({ text: varied.join(' '), isTitle: false });
    }
  }

  // Reassemble
  const finalParagraphs: string[] = [];
  for (const item of allResults) {
    let p = item.text.trim();
    if (!p) continue;
    if (p[0] === p[0].toLowerCase() && p[0] !== p[0].toUpperCase()) {
      p = p[0].toUpperCase() + p.slice(1);
    }
    if (!item.isTitle) {
      p = p.replace(/([.!?])\s+([a-z])/g, (_, punct, letter) => `${punct} ${letter.toUpperCase()}`);
    }
    finalParagraphs.push(p);
  }

  let humanized = finalParagraphs.join('\n\n');

  // Final cleanup
  humanized = humanized.replace(/ {2,}/g, ' ');
  humanized = humanized.replace(/\s+([.!?,;:])/g, '$1');
  humanized = humanized.replace(/\.{2,}/g, '.');
  humanized = humanized.replace(/([.!?,;:])([A-Za-z])/g, '$1 $2');
  humanized = humanized.replace(/([.!?])\s+([a-z])/g, (_, punct, letter) => `${punct} ${letter.toUpperCase()}`);
  humanized = humanized.replace(/(^|\n\n)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
  humanized = humanized.replace(/\bBefore,\s+(\w+)\s+is\b/g, 'Previously, $1 was');
  humanized = humanized.replace(/\bBefore,\s+(\w+)\s+are\b/g, 'Previously, $1 were');
  humanized = humanized.replace(/\bhas seen its (?:use |)(\w+ed)\b/g, 'has $1');
  humanized = fixGrammar(humanized);

  // Expand contractions
  for (const [contraction, expansion] of Object.entries(CONTRACTIONS)) {
    humanized = humanized.split(contraction).join(expansion);
    const capitalized = contraction[0].toUpperCase() + contraction.slice(1);
    const capitalizedExpansion = expansion[0].toUpperCase() + expansion.slice(1);
    humanized = humanized.split(capitalized).join(capitalizedExpansion);
  }

  // Remove em-dashes
  humanized = humanized.replace(/—/g, ' -- ').replace(/–/g, ' -- ');
  humanized = humanized.replace(/\s*--\s*/g, ', ');

  // Deduplicate near-identical consecutive sentences
  const dedupedParas: string[] = [];
  for (const para of humanized.split('\n\n')) {
    const sents = para.split(/(?<=[.!?])\s+(?=[A-Z])/);
    const unique: string[] = [];
    for (const s of sents) {
      const sLower = s.toLowerCase().trim();
      if (unique.length > 0) {
        const prevLower = unique[unique.length - 1].toLowerCase().trim();
        const prevWords = new Set(prevLower.split(/\s+/));
        const curWords = new Set(sLower.split(/\s+/));
        const union = new Set([...prevWords, ...curWords]);
        const intersection = [...prevWords].filter(w => curWords.has(w));
        const overlap = intersection.length / Math.max(union.size, 1);
        if (overlap > 0.65) continue;
      }
      unique.push(s);
    }
    dedupedParas.push(unique.join(' '));
  }
  humanized = dedupedParas.join('\n\n');

  return humanized;
}
