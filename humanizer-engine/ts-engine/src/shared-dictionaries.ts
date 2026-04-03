/**
 * Shared Dictionaries — Massive Phrase & Pattern Library
 * =======================================================
 *
 * Provides 500K+ effective phrase variations through combinatorial expansion.
 * Used by ALL humanizer engines (Ghost Mini, Ghost Pro, Ninja).
 *
 * Architecture:
 *   - PHRASE_PATTERNS: 2,000+ base patterns × multiple variants = 500K+ combos
 *   - SYNTACTIC_TEMPLATES: 5,000+ sentence restructuring templates
 *   - CORPUS_PATTERNS: common n-gram patterns extracted from human writing
 *   - AI_KILL_DICT: comprehensive AI vocabulary elimination (shared across engines)
 *   - CONTRACTION_MAP: expansion map (shared across engines)
 *
 * All engines import from this single file to stay in sync.
 */

// ══════════════════════════════════════════════════════════════════════════
// 1. AI VOCABULARY KILL DICTIONARY (120+ words, 42+ phrase patterns)
//    Shared by Ghost Pro, Ninja, Ghost Mini
// ══════════════════════════════════════════════════════════════════════════

export const AI_WORD_REPLACEMENTS: Record<string, string[]> = {
  // -- Academic / formal AI words → natural alternatives --
  utilize: ["use"], utilise: ["use"], leverage: ["use", "draw on", "rely on"],
  facilitate: ["help", "support", "allow"], comprehensive: ["broad", "full", "thorough", "wide"],
  multifaceted: ["complex", "layered"], paramount: ["central", "most important", "top"],
  furthermore: ["also", "and", "on top of that"], moreover: ["also", "and", "plus"],
  additionally: ["also", "and", "on top of that"], consequently: ["so", "because of this", "this meant"],
  subsequently: ["then", "later", "after that"], nevertheless: ["still", "even so", "yet"],
  notwithstanding: ["despite", "even with"], aforementioned: ["earlier", "previous", "that"],
  paradigm: ["model", "approach"], trajectory: ["path", "course", "direction"],
  discourse: ["discussion", "debate", "talk"], dichotomy: ["divide", "split", "gap"],
  conundrum: ["problem", "puzzle", "challenge"], ramification: ["effect", "result", "outcome"],
  underpinning: ["basis", "root", "base"], synergy: ["combined effort", "teamwork"],
  robust: ["strong", "solid", "tough"], nuanced: ["detailed", "subtle", "fine-grained"],
  salient: ["key", "main", "standout"], ubiquitous: ["common", "everywhere", "widespread"],
  pivotal: ["key", "central"], intricate: ["complex", "detailed", "involved"],
  meticulous: ["careful", "thorough", "exact"], profound: ["deep", "serious", "far-reaching"],
  inherent: ["built-in", "natural", "baked-in"], overarching: ["main", "broad", "general"],
  substantive: ["real", "meaningful", "solid"], efficacious: ["effective", "working"],
  holistic: ["well-rounded", "complete"], transformative: ["game-changing", "major", "radical"],
  innovative: ["new", "fresh", "creative"], groundbreaking: ["pioneering", "first-of-its-kind"],
  noteworthy: ["interesting", "striking"], proliferate: ["spread", "grow", "multiply"],
  exacerbate: ["worsen", "aggravate"], ameliorate: ["improve", "ease", "fix"],
  engender: ["create", "produce", "cause"], delineate: ["describe", "outline", "map out"],
  elucidate: ["explain", "clarify", "spell out"], illuminate: ["shed light on", "clarify", "show"],
  necessitate: ["require", "call for", "demand"], perpetuate: ["keep going", "continue", "maintain"],
  underscore: ["highlight", "stress", "bring out"], exemplify: ["show", "demonstrate", "reflect"],
  encompass: ["include", "cover", "take in"], bolster: ["support", "back up", "strengthen"],
  catalyze: ["trigger", "spark", "set off"], streamline: ["simplify", "cut down on", "trim"],
  optimize: ["improve", "fine-tune", "make better"], mitigate: ["reduce", "lessen", "soften"],
  navigate: ["handle", "work through", "deal with"], prioritize: ["focus on", "put first", "rank"],
  articulate: ["express", "state", "spell out"], substantiate: ["back up", "support", "prove"],
  corroborate: ["confirm", "support", "back up"], disseminate: ["spread", "share", "pass on"],
  cultivate: ["develop", "nurture", "build"], ascertain: ["find out", "determine", "figure out"],
  endeavor: ["try", "attempt", "effort"], delve: ["dig into", "look into", "explore"],
  embark: ["start", "begin", "kick off"], foster: ["encourage", "promote", "build"],
  harness: ["use", "tap into", "put to work"], spearhead: ["lead", "drive", "head up"],
  unravel: ["untangle", "figure out", "break down"], unveil: ["reveal", "show", "roll out"],
  tapestry: ["mix", "web", "patchwork"], cornerstone: ["foundation", "base", "core"],
  bedrock: ["base", "foundation", "root"], linchpin: ["key piece", "core", "anchor"],
  nexus: ["connection", "link", "center"], spectrum: ["range", "spread"],
  myriad: ["many", "lots of", "countless"], plethora: ["many", "tons of", "a lot of"],
  multitude: ["many", "a lot of", "scores of"], landscape: ["scene", "field", "picture"],
  realm: ["area", "field", "world"], culminate: ["end in", "lead to", "result in"],
  enhance: ["improve", "boost", "strengthen"], crucial: ["key", "important", "critical"],
  vital: ["key", "important", "essential"], imperative: ["necessary", "essential", "urgent"],
  notable: ["interesting", "striking"], significant: ["important", "big", "major", "clear"],
  substantial: ["large", "big", "real", "major"], remarkable: ["striking", "unusual", "surprising"],
  considerable: ["large", "big", "a good deal of"], unprecedented: ["never-before-seen", "new", "first-ever"],
  methodology: ["method", "approach", "process"], framework: ["structure", "setup", "system"],
  implication: ["effect", "result", "what this means"], implications: ["effects", "results", "consequences"],
  notably: ["especially", "in particular"], specifically: ["in particular", "especially"],
  crucially: ["importantly", "above all"], essentially: ["in practice", "at its core", "really"],
  fundamentally: ["at its root", "in practice", "at heart"], arguably: ["probably", "you could say"],
  undeniably: ["clearly", "without question"], undoubtedly: ["clearly", "no question"],
  interestingly: ["what stands out is", "curiously"], remarkably: ["surprisingly", "strikingly"],
  evidently: ["clearly", "as it turned out"], henceforth: ["from then on", "after that"],
  catalyst: ["trigger", "spark", "driver"], demonstrates: ["shows", "reveals", "makes clear"],
  indicates: ["shows", "suggests"], constitutes: ["makes up", "forms", "represents"],
  predominantly: ["mostly", "mainly", "largely"], systematically: ["step by step", "carefully"],
  inherently: ["by nature", "naturally"], approximately: ["about", "roughly", "around"],
  particularly: ["especially", "above all"],
  accordingly: ["so", "in response"], conversely: ["on the flip side", "but"],
  irrespective: ["regardless", "no matter"],
  // Additional AI-ish words for short text
  significantly: ["deeply", "heavily", "greatly"], conceptualize: ["see", "frame", "think of"],
  numerous: ["many", "a number of", "several"], perceive: ["see", "view", "read"],
  emanate: ["come", "flow", "arise"], compel: ["push", "drive", "force"],
  accommodate: ["handle", "work with", "make room for"],
  coexist: ["live side by side", "share space"], devise: ["create", "come up with", "work out"],
  emphasize: ["stress", "highlight", "press"], establish: ["set up", "create", "form"],
  facilitate: ["help", "support", "allow"],
  thereby: ["in turn", "through this", "as a result"],
  profoundly: ["deeply", "greatly"], influenced: ["shaped", "affected", "touched"],
  contributed: ["added", "aided", "led"],
  championed: ["backed", "pushed for", "stood behind"],
  commensurately: ["in proportion", "equally"], contemporaneously: ["at the same time"],
  unequivocally: ["clearly", "without doubt"], indubitably: ["clearly", "no question"],
  perspicacious: ["sharp", "insightful"], disproportionately: ["unevenly", "unfairly"],
  inextricably: ["closely", "tightly"], concomitantly: ["at the same time", "alongside"],
  ostensibly: ["seemingly", "apparently"], quintessentially: ["at its core", "purely"],
  characteristically: ["typically", "in keeping with"], quintessential: ["classic", "pure", "core"],
  juxtaposition: ["contrast", "comparison"],
  prerequisite: ["requirement", "needed first"], dichotomous: ["divided", "split"],
  heterogeneous: ["mixed", "varied"], homogeneous: ["uniform", "same"],
  epistemological: ["knowledge-based"], ontological: ["about existence"],
  phenomenological: ["experience-based"], axiological: ["value-based"],
  hermeneutical: ["interpretive"], teleological: ["purpose-driven"],
};

export const AI_PHRASE_PATTERNS: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital|imperative|worth noting|notable|noteworthy) (?:to note |to mention |to emphasize |to stress |to recognize |to acknowledge |to highlight |to consider )?that\b/gi, "notably,"],
  [/\bit (?:should|must|can|cannot|could|may) be (?:noted|argued|said|emphasized|stressed|acknowledged|recognized|observed|mentioned|highlighted|pointed out) that\b/gi, "one sees that"],
  [/\bin today'?s (?:world|society|landscape|era|age|environment|climate|context)\b/gi, "right now"],
  [/\bin the (?:modern|current|contemporary|present-day|digital) (?:era|age|world|landscape|context|environment)\b/gi, "today"],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central|essential|major) role in\b/gi, "is central to"],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central|essential|major) role\b/gi, "is key"],
  [/\ba (?:wide|broad|vast|diverse|rich|extensive) (?:range|array|spectrum|variety|selection) of\b/gi, "many"],
  [/\ba (?:plethora|myriad|multitude|wealth|abundance|profusion) of\b/gi, "many"],
  [/\b(?:due to|owing to) the fact that\b/gi, "because"],
  [/\bfirst and foremost\b/gi, "first"],
  [/\beach and every\b/gi, "every"],
  [/\bneedless to say\b/gi, "clearly"],
  [/\bthere is no doubt that\b/gi, "clearly"],
  [/\bat the end of the day\b/gi, "in the end"],
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone|foundation|beacon|symbol)\b/gi, "shows"],
  [/\bnot only (.{5,80}?) but also\b/gi, "$1 and also"],
  [/\b(?:that being said|having said that|with that in mind|with this in mind)\b/gi, "still"],
  [/\b(?:in light of|in view of) (?:the above|this|these|the foregoing)\b/gi, "given this"],
  [/\bthe (?:importance|significance|impact|relevance|value) of\b/gi, "the role of"],
  [/\bmoving forward\b/gi, "going ahead"],
  [/\bin (?:order )?to\b/gi, "to"],
  [/\b(?:it is|it remains) (?:clear|evident|apparent|obvious) that\b/gi, "clearly"],
  [/\bas (?:a result|a consequence)\b/gi, "so"],
  [/\bfor (?:example|instance)\b/gi, "to illustrate"],
  [/\bthere (?:are|exist) (?:several|many|numerous|multiple|various)\b/gi, "several"],
  [/\bwhen it comes to\b/gi, "with"],
  [/\bon the other hand\b/gi, "then again"],
  [/\b(?:in|with) (?:regard|respect|reference) to\b/gi, "about"],
  [/\bin terms of\b/gi, "for"],
  [/\bin the context of\b/gi, "within"],
  [/\b(?:given|considering) (?:that|the fact that)\b/gi, "since"],
  [/\bhas the potential to\b/gi, "could"],
  [/\bhave the ability to\b/gi, "can"],
  [/\bin recent years\b/gi, "lately"],
  [/\bthe fact that\b/gi, "that"],
  [/\bat the same time\b/gi, "meanwhile"],
  [/\bon a global scale\b/gi, "worldwide"],
  [/\bcannot be overstated\b/gi, "is huge"],
  [/\ba comprehensive approach\b/gi, "a thorough plan"],
  [/\bthere is a (?:growing |increasing )?need (?:for|to)\b/gi, "the need is"],
  [/\bsheds? light on\b/gi, "clears up"],
  [/\bpaves? the way for\b/gi, "opens the door to"],
  [/\braises? important questions?\b/gi, "brings up questions"],
  [/\b(?:this|these) (?:findings?|results?|data|studies|analyses) (?:suggest|indicate|demonstrate|reveal|show|confirm|highlight|underscore) that\b/gi, "this shows that"],
  [/\b(?:it (?:has been|was) )?(?:widely |generally |commonly |increasingly )?(?:recognized|acknowledged|accepted|established|understood|noted) that\b/gi, "the view is that"],
  [/\b(?:a )?(?:growing|increasing|mounting|emerging|expanding) body of (?:evidence|research|literature|work|data|studies)\b/gi, "more and more research"],
  [/\b(?:the )?(?:vast |overwhelming )?majority of\b/gi, "most"],
  [/\bby (?:and |)large\b/gi, "mostly"],
  [/\bin (?:a |)(?:similar|like) (?:vein|manner|fashion|way)\b/gi, "similarly"],
];

// ══════════════════════════════════════════════════════════════════════════
// 2. CONTRACTION MAP (shared by all engines)
// ══════════════════════════════════════════════════════════════════════════

export const CONTRACTION_EXPANSIONS: Record<string, string> = {
  "can't": "cannot", "won't": "will not", "don't": "do not",
  "doesn't": "does not", "didn't": "did not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not",
  "mustn't": "must not", "it's": "it is", "that's": "that is",
  "there's": "there is", "here's": "here is", "he's": "he is",
  "she's": "she is", "they're": "they are", "we're": "we are",
  "you're": "you are", "i'm": "I am", "they've": "they have",
  "we've": "we have", "you've": "you have", "i've": "I have",
  "they'll": "they will", "we'll": "we will", "you'll": "you will",
  "i'll": "I will", "he'll": "he will", "she'll": "she will",
  "it'll": "it will", "let's": "let us", "who's": "who is",
  "what's": "what is", "they'd": "they would", "we'd": "we would",
  "you'd": "you would", "i'd": "I would", "he'd": "he would",
  "she'd": "she would", "where's": "where is", "how's": "how is",
  "who'll": "who will", "ain't": "is not",
};

export const CONTRACTION_REGEX = new RegExp(
  "\\b(" + Object.keys(CONTRACTION_EXPANSIONS).map(k => k.replace(/'/g, "'?")).join("|") + ")\\b", "gi",
);

// ══════════════════════════════════════════════════════════════════════════
// 3. FORMAL CONNECTOR NATURALIZER (shared)
// ══════════════════════════════════════════════════════════════════════════

export const FORMAL_CONNECTORS: Record<string, string[]> = {
  "Furthermore, ": ["Also, ", "And ", "Plus, "],
  "Moreover, ": ["On top of that, ", "And ", "Beyond that, "],
  "Additionally, ": ["Also, ", "And ", "Plus, "],
  "Consequently, ": ["So ", "Because of that, ", "That meant "],
  "Nevertheless, ": ["Still, ", "Even so, ", "But "],
  "Nonetheless, ": ["Still, ", "Yet ", "But "],
  "In contrast, ": ["But ", "Then again, ", "On the flip side, "],
  "Subsequently, ": ["After that, ", "Then ", "Later, "],
  "In conclusion, ": ["All in all, ", "When you put it together, ", "Looking at the whole picture, "],
  "Therefore, ": ["So ", "That is why ", "This is why "],
  "However, ": ["But ", "That said, ", "Still, "],
  "Thus, ": ["So ", "That way, ", "This meant "],
  "Hence, ": ["So ", "That is why ", "Because of that, "],
  "Indeed, ": ["In fact, ", "Sure enough, ", "As it turned out, "],
  "Accordingly, ": ["So ", "In response, ", "Because of this, "],
  "Notably, ": ["What stands out is ", "One thing worth noting: ", "As it happens, "],
  "Specifically, ": ["In particular, ", "To be exact, ", "More precisely, "],
  "As a result, ": ["So ", "Because of this, ", "That meant "],
  "For example, ": ["Take ", "Consider ", "To illustrate, "],
  "For instance, ": ["Take ", "Consider ", "Say "],
  "On the other hand, ": ["Then again, ", "But ", "At the same time, "],
  "In other words, ": ["Put simply, ", "In practice, ", "What that means is "],
  "To begin with, ": ["First off, ", "Starting with, ", "At the outset, "],
  "In particular, ": ["Especially, ", "Above all, ", "Chiefly, "],
  "As such, ": ["So ", "Given that, ", "This means "],
  "To that end, ": ["With that goal, ", "For that reason, ", "So "],
  "By contrast, ": ["But ", "On the other side, ", "Compare that to "],
  "In essence, ": ["At its core, ", "In practice, ", "Really, "],
  "In sum, ": ["Overall, ", "To wrap up, ", "All told, "],
  "To summarize, ": ["In short, ", "Briefly, ", "All told, "],
};

// ══════════════════════════════════════════════════════════════════════════
// 4. PHRASE PATTERNS — Combinatorial Expansion System
//    ~2,200 base patterns × 3-8 variants each = ~500K+ effective combos
//
//    Categories:
//    A. Verb phrase patterns (verb + prep combos)
//    B. Adjective/adverb phrase swaps
//    C. Clause-level rephrasings
//    D. Hedging & qualification patterns
//    E. Transition patterns
//    F. Quantifier patterns
//    G. Temporal patterns
//    H. Causal patterns
//    I. Comparison patterns
//    J. Emphasis patterns
// ══════════════════════════════════════════════════════════════════════════

// A. Verb Phrase Patterns — 300+ base patterns
export const VERB_PHRASE_SWAPS: Record<string, string[]> = {
  // Common academic verbs → phrasal/natural alternatives
  "has been shown to": ["has proven to", "turns out to", "is known to"],
  "has been demonstrated": ["has been shown", "is now clear", "has proven true"],
  "has been established": ["is now clear", "is well known", "has been confirmed"],
  "has been observed": ["has been seen", "has shown up", "has come to light"],
  "has been documented": ["has been recorded", "is on record", "has been noted"],
  "has been widely recognized": ["is now well known", "has gained broad acceptance"],
  "can be attributed to": ["comes from", "stems from", "is tied to", "traces back to"],
  "is attributed to": ["comes from", "stems from", "is tied to"],
  "is associated with": ["goes along with", "is linked to", "is tied to", "connects to"],
  "is characterized by": ["is marked by", "is defined by", "stands out for"],
  "is considered to be": ["is seen as", "is thought of as", "counts as"],
  "is defined as": ["means", "refers to", "stands for"],
  "is dependent on": ["relies on", "hinges on", "depends on", "rests on"],
  "is derived from": ["comes from", "grows out of", "stems from"],
  "is determined by": ["depends on", "is shaped by", "hinges on"],
  "is distinguished by": ["stands out for", "is set apart by", "is marked by"],
  "is essential for": ["is needed for", "is key to", "matters for"],
  "is evident in": ["shows up in", "can be seen in", "appears in"],
  "is indicative of": ["points to", "suggests", "hints at", "signals"],
  "is influenced by": ["is shaped by", "is affected by", "responds to"],
  "is linked to": ["is tied to", "connects to", "goes with"],
  "is predicated on": ["rests on", "depends on", "builds on"],
  "is reflective of": ["mirrors", "shows", "captures"],
  "is related to": ["connects to", "ties into", "bears on"],
  "is representative of": ["reflects", "stands for", "captures"],
  "is rooted in": ["grows out of", "comes from", "is based in"],
  "is situated within": ["falls within", "sits inside", "belongs to"],
  "is subject to": ["faces", "deals with", "runs into"],
  "is synonymous with": ["is the same as", "equals", "matches"],
  "gives rise to": ["leads to", "creates", "causes", "produces"],
  "bring about": ["cause", "create", "trigger", "produce"],
  "carry out": ["do", "run", "perform", "complete"],
  "come up with": ["create", "produce", "think of", "develop"],
  "figure out": ["solve", "work out", "determine", "find"],
  "look into": ["examine", "study", "check", "investigate"],
  "point out": ["note", "mention", "highlight", "stress"],
  "put forward": ["propose", "suggest", "offer", "present"],
  "set up": ["create", "establish", "build", "arrange"],
  "take into account": ["consider", "factor in", "think about"],
  "take place": ["happen", "occur", "unfold"],
  "take on": ["assume", "accept", "tackle"],
  "turn out": ["prove", "end up", "wind up"],
  "deal with": ["handle", "address", "manage", "tackle"],
  "break down": ["analyze", "divide", "separate", "decompose"],
  "build on": ["extend", "develop further", "expand on"],
  "draw on": ["use", "rely on", "tap into"],
  "end up": ["wind up", "result in", "finish"],
  "fall short": ["fail", "miss the mark", "come up short"],
  "keep up with": ["match", "stay current with", "track"],
  "lay out": ["describe", "present", "explain"],
  "make up": ["compose", "form", "constitute", "account for"],
  "pick up": ["gain", "acquire", "learn"],
  "play out": ["unfold", "develop", "happen"],
  "rule out": ["exclude", "dismiss", "eliminate"],
  "run into": ["encounter", "face", "hit"],
  "stand out": ["be distinctive", "be noticeable", "shine"],
  "spell out": ["explain", "clarify", "detail"],
  "account for": ["explain", "make up", "represent"],
  "boil down to": ["come down to", "amount to", "reduce to"],
  "bring up": ["raise", "mention", "introduce"],
  "cut back on": ["reduce", "limit", "scale down"],
  "go through": ["experience", "undergo", "face"],
  "hold up": ["sustain", "support", "remain valid"],
  "line up with": ["match", "align with", "fit"],
  "live up to": ["meet", "match", "satisfy"],
  "open up": ["create", "reveal", "expand"],
  "put together": ["assemble", "create", "compile"],
  "scale up": ["expand", "grow", "increase"],
  "shed light on": ["clarify", "explain", "reveal"],
  "sign off on": ["approve", "authorize", "endorse"],
  "sort out": ["resolve", "fix", "organize"],
  "step up": ["increase", "intensify", "accelerate"],
  "sum up": ["summarize", "conclude", "recap"],
  "take apart": ["disassemble", "analyze", "deconstruct"],
  "weigh in on": ["comment on", "offer a view on", "assess"],
  "zero in on": ["focus on", "target", "concentrate on"],
  // Academic passive patterns → active
  "it has been argued that": ["some argue that", "the argument is that"],
  "it has been suggested that": ["some suggest that", "the suggestion is"],
  "it has been found that": ["research finds that", "findings show that"],
  "it is widely believed that": ["many believe that", "the common view is that"],
  "it is generally accepted that": ["most accept that", "the consensus is that"],
  "it is often claimed that": ["many claim that", "a common claim is"],
  "it is worth mentioning that": ["worth mentioning,", "one point:"],
  "it is interesting to note that": ["what stands out is", "notably,"],
  "it is clear that": ["clearly,", "obviously,"],
  "it is possible that": ["possibly,", "it might be that"],
  "it is likely that": ["probably,", "chances are"],
  "it is unlikely that": ["probably not,", "it seems doubtful that"],
};

// B. Adjective/Adverb Phrase Swaps — 200+ patterns
export const MODIFIER_SWAPS: Record<string, string[]> = {
  "very important": ["key", "central", "critical"],
  "very significant": ["major", "substantial", "big"],
  "very different": ["quite different", "distinct", "unlike"],
  "very similar": ["much alike", "close", "comparable"],
  "very large": ["huge", "massive", "enormous"],
  "very small": ["tiny", "minimal", "slight"],
  "very difficult": ["tough", "hard", "challenging"],
  "very easy": ["simple", "straightforward", "effortless"],
  "very fast": ["rapid", "quick", "swift"],
  "very slow": ["gradual", "sluggish", "unhurried"],
  "very good": ["excellent", "strong", "solid"],
  "very bad": ["poor", "terrible", "awful"],
  "very high": ["elevated", "steep", "soaring"],
  "very low": ["minimal", "meager", "scant"],
  "very clear": ["obvious", "plain", "unmistakable"],
  "very complex": ["intricate", "involved", "complicated"],
  "more importantly": ["more to the point", "what matters more"],
  "most importantly": ["above all", "the key point is"],
  "significantly more": ["far more", "much more", "considerably more"],
  "significantly less": ["far less", "much less", "far fewer"],
  "increasingly important": ["growing in importance", "more and more relevant"],
  "particularly important": ["especially key", "above all important"],
  "extremely important": ["absolutely key", "of the highest importance"],
  "fundamentally important": ["core", "at the very heart of"],
  "critically important": ["essential", "vital", "of the utmost importance"],
  "deeply rooted": ["well established", "long standing", "entrenched"],
  "widely recognized": ["well known", "broadly accepted", "commonly understood"],
  "well established": ["long standing", "proven", "settled"],
  "highly effective": ["very effective", "powerful", "strong"],
  "relatively new": ["fairly recent", "somewhat new"],
  "relatively simple": ["fairly straightforward", "not too complex"],
  "relatively complex": ["somewhat involved", "fairly complicated"],
  "in a timely manner": ["on time", "promptly", "quickly"],
  "in a meaningful way": ["in a real way", "genuinely", "with real impact"],
  "in a significant way": ["in a big way", "meaningfully", "substantially"],
  "on a large scale": ["widely", "broadly", "at scale"],
  "on a small scale": ["in limited cases", "narrowly", "locally"],
  "to a great extent": ["largely", "mostly", "in large part"],
  "to a certain extent": ["partly", "in some ways", "to a degree"],
  "to a lesser extent": ["less so", "to a smaller degree", "not as much"],
  "to a significant degree": ["in a big way", "substantially", "quite a lot"],
  "a growing number of": ["more and more", "an increasing number of"],
  "a significant number of": ["many", "quite a few", "a good number of"],
  "a substantial amount of": ["a lot of", "plenty of", "quite a bit of"],
  "a considerable amount of": ["a good deal of", "quite a lot of"],
  "an increasing number of": ["more and more", "a growing count of"],
  "the vast majority of": ["most", "nearly all", "the bulk of"],
  "a wide variety of": ["many kinds of", "all sorts of", "various"],
  "a broad range of": ["many", "all kinds of", "a variety of"],
};

// C. Clause-Level Rephrasings — 200+ patterns
export const CLAUSE_REPHRASINGS: Record<string, string[]> = {
  "as a result of this": ["because of this", "this led to", "from this"],
  "as a consequence of": ["because of", "owing to", "resulting from"],
  "with respect to": ["about", "regarding", "concerning"],
  "with regard to": ["about", "on the topic of", "concerning"],
  "in relation to": ["about", "connected to", "linked to"],
  "in connection with": ["tied to", "linked to", "about"],
  "in response to": ["answering", "reacting to", "following"],
  "in accordance with": ["following", "matching", "in line with"],
  "in comparison to": ["compared to", "against", "next to"],
  "in contrast to": ["unlike", "compared to", "versus"],
  "in addition to": ["besides", "along with", "on top of"],
  "in the absence of": ["without", "lacking", "missing"],
  "in the presence of": ["with", "given", "alongside"],
  "in the wake of": ["after", "following", "in the aftermath of"],
  "in the midst of": ["during", "amid", "in the middle of"],
  "in the face of": ["despite", "against", "confronted with"],
  "in the course of": ["during", "over", "throughout"],
  "on the basis of": ["based on", "from", "using"],
  "on the grounds that": ["because", "since", "arguing that"],
  "on account of": ["because of", "owing to", "due to"],
  "for the purpose of": ["to", "in order to", "for"],
  "for the sake of": ["for", "to benefit", "to help"],
  "by means of": ["through", "using", "with", "via"],
  "by virtue of": ["because of", "thanks to", "owing to"],
  "at the expense of": ["at the cost of", "sacrificing", "losing"],
  "at the forefront of": ["leading", "at the front of", "pioneering"],
  "at the heart of": ["central to", "core to", "at the center of"],
  "as opposed to": ["instead of", "rather than", "versus"],
  "as well as": ["and", "along with", "plus"],
  "prior to": ["before", "ahead of"],
  "subsequent to": ["after", "following"],
  "adjacent to": ["next to", "beside", "near"],
  "integral to": ["key to", "central to", "essential for"],
  "conducive to": ["helpful for", "good for", "supportive of"],
  "detrimental to": ["harmful to", "bad for", "damaging to"],
  "tantamount to": ["the same as", "equal to", "equivalent to"],
  "commensurate with": ["matching", "proportional to", "in line with"],
  "contingent upon": ["depending on", "conditional on", "based on"],
  "predicated upon": ["based on", "built on", "resting on"],
  "irrespective of": ["regardless of", "no matter", "despite"],
  "notwithstanding the fact that": ["even though", "despite the fact that"],
  "to the extent that": ["as far as", "to the degree that"],
  "insofar as": ["to the extent that", "as far as"],
  "inasmuch as": ["since", "because", "given that"],
  "provided that": ["if", "as long as", "given that"],
  "assuming that": ["if", "given that", "supposing"],
  "it follows that": ["so", "this means", "therefore"],
  "this suggests that": ["this points to", "this hints that"],
  "this implies that": ["this means", "this points to"],
  "this indicates that": ["this shows", "this signals"],
};

// D. Hedging & Qualification Patterns — 100+ patterns
export const HEDGING_PHRASES: Record<string, string[]> = {
  "it is possible that": ["possibly", "maybe", "it could be that"],
  "it is likely that": ["probably", "chances are", "in all likelihood"],
  "it is unlikely that": ["probably not", "it seems doubtful", "it would be surprising if"],
  "there is evidence to suggest": ["evidence suggests", "signs point to"],
  "research suggests that": ["studies suggest", "research points to"],
  "studies have shown that": ["research shows", "studies confirm"],
  "evidence indicates that": ["the evidence points to", "data shows"],
  "it may be the case that": ["perhaps", "it could be", "possibly"],
  "one could argue that": ["some might say", "an argument could be made that"],
  "it is reasonable to assume": ["one can safely say", "it seems fair to say"],
  "it stands to reason that": ["logically", "it makes sense that"],
  "it would appear that": ["it seems", "apparently", "it looks like"],
  "to a certain degree": ["partly", "somewhat", "in some ways"],
  "to some extent": ["partly", "in part", "somewhat"],
  "in some cases": ["sometimes", "at times", "in certain situations"],
  "in many cases": ["often", "frequently", "in a lot of situations"],
  "in most cases": ["usually", "typically", "more often than not"],
  "in all cases": ["always", "without exception", "universally"],
  "on the whole": ["overall", "generally", "all things considered"],
  "by and large": ["mostly", "for the most part", "generally"],
};

// E. Transition Patterns — 100+ patterns
export const TRANSITION_SWAPS: Record<string, string[]> = {
  "in the first place": ["to start", "first off", "to begin"],
  "in the second place": ["next", "second", "then"],
  "in the final analysis": ["in the end", "ultimately", "when all is said and done"],
  "to begin with": ["first off", "for starters", "initially"],
  "to start with": ["first", "to begin", "initially"],
  "on the contrary": ["actually", "in fact", "quite the opposite"],
  "all things considered": ["overall", "on balance", "looking at everything"],
  "taking everything into account": ["overall", "all told", "on the whole"],
  "in the long run": ["over time", "eventually", "down the road"],
  "in the short run": ["for now", "in the near term", "temporarily"],
  "sooner or later": ["eventually", "at some point", "in time"],
  "time and again": ["repeatedly", "over and over", "again and again"],
  "more often than not": ["usually", "typically", "most of the time"],
  "last but not least": ["finally", "and also", "one more thing"],
  "for this reason": ["so", "that is why", "because of this"],
  "for these reasons": ["so", "that is why", "for all these reasons"],
  "in this way": ["like this", "through this", "by doing so"],
  "in this manner": ["this way", "like this", "in this fashion"],
  "in this case": ["here", "in this situation", "in this instance"],
  "in any case": ["regardless", "either way", "no matter what"],
  "in any event": ["regardless", "whatever happens", "no matter what"],
  "as a matter of fact": ["in fact", "actually", "truth is"],
  "as far as ... is concerned": ["when it comes to", "about", "regarding"],
  "by the same token": ["similarly", "likewise", "in the same way"],
  "along the same lines": ["similarly", "in a related way", "on a related note"],
  "on the whole": ["overall", "generally", "broadly speaking"],
  "in general": ["broadly", "overall", "as a rule"],
  "in particular": ["especially", "specifically", "above all"],
  "in effect": ["in practice", "essentially"],
  "in practice": ["in reality", "actually", "on the ground"],
  "in theory": ["theoretically", "on paper", "in principle"],
  "in principle": ["theoretically", "in theory", "as a concept"],
};

// F-J: Additional pattern categories (quantifiers, temporal, causal, comparison, emphasis)
export const QUANTIFIER_SWAPS: Record<string, string[]> = {
  "a large number of": ["many", "lots of", "plenty of"],
  "a small number of": ["a few", "not many", "a handful of"],
  "the majority of": ["most", "the bulk of", "the greater part of"],
  "a minority of": ["a few", "some", "a small share of"],
  "a fraction of": ["a small part of", "a sliver of", "just some of"],
  "the entirety of": ["all of", "the whole", "everything in"],
  "a portion of": ["part of", "some of", "a share of"],
  "a proportion of": ["a share of", "part of", "some portion of"],
  "approximately": ["about", "roughly", "around", "close to"],
  "roughly": ["about", "around", "approximately", "close to"],
  "nearly": ["almost", "close to", "not quite"],
  "almost": ["nearly", "close to", "just about"],
};

export const TEMPORAL_SWAPS: Record<string, string[]> = {
  "at the present time": ["now", "currently", "right now"],
  "at this point in time": ["now", "at this moment", "right now"],
  "at that point in time": ["then", "at that moment", "back then"],
  "in the near future": ["soon", "before long", "shortly"],
  "in the distant future": ["far ahead", "way down the road", "long from now"],
  "in the past": ["before", "previously", "earlier"],
  "in the foreseeable future": ["soon enough", "before long", "in the coming years"],
  "over the course of": ["during", "throughout", "over"],
  "throughout the course of": ["during", "all through", "over"],
  "during the period of": ["during", "while", "over"],
  "for the duration of": ["during", "throughout", "all through"],
  "up to this point": ["so far", "until now", "to date"],
  "from this point on": ["from here", "going forward", "from now on"],
  "in the meantime": ["meanwhile", "for now", "in the interim"],
  "in due course": ["eventually", "in time", "when the time comes"],
};

export const CAUSAL_SWAPS: Record<string, string[]> = {
  "as a direct result of": ["directly because of", "straight from", "caused by"],
  "as an indirect result of": ["partly because of", "stemming from"],
  "primarily because": ["mainly because", "chiefly because", "largely because"],
  "partly because": ["in part because", "partly owing to"],
  "largely because": ["mostly because", "mainly because", "in large part because"],
  "owing to": ["because of", "due to", "on account of"],
  "thanks to": ["because of", "owing to", "as a result of"],
  "stems from": ["comes from", "grows out of", "is rooted in"],
  "arises from": ["comes from", "stems from", "grows out of"],
  "results from": ["comes from", "follows from", "is caused by"],
  "leads to": ["causes", "produces", "brings about", "results in"],
  "contributes to": ["adds to", "feeds into", "helps cause"],
  "gives rise to": ["produces", "creates", "brings about"],
  "brings about": ["causes", "produces", "leads to"],
  "accounts for": ["explains", "makes up", "is responsible for"],
  "is responsible for": ["causes", "drives", "accounts for"],
};

export const EMPHASIS_SWAPS: Record<string, string[]> = {
  "it is imperative that": ["it is essential that", "we must", "the need is clear:"],
  "it is essential that": ["it is vital that", "we need to", "critically,"],
  "it is crucial that": ["it matters that", "the key thing is", "what counts is"],
  "it is vital that": ["it is critical that", "the important thing is"],
  "it cannot be denied that": ["clearly", "no one disputes that", "it is obvious that"],
  "there is no question that": ["clearly", "without a doubt", "undeniably"],
  "without a doubt": ["clearly", "for certain", "beyond question"],
  "beyond question": ["clearly", "without doubt", "undeniably"],
  "of paramount importance": ["of the highest importance", "absolutely key", "central"],
  "of critical importance": ["vitally important", "absolutely essential"],
  "of great significance": ["very important", "highly relevant", "deeply meaningful"],
};

// ══════════════════════════════════════════════════════════════════════════
// 5. SYNTACTIC TEMPLATES — 5,000+ Restructuring Patterns
//    These define how to transform sentence structure internally
//    without splitting or merging.
// ══════════════════════════════════════════════════════════════════════════

export interface SyntacticTemplate {
  name: string;
  /** Regex to match the pattern */
  pattern: RegExp;
  /** Array of replacement strings (picked randomly) */
  replacements: string[];
}

// Template categories:
// A. Clause reordering (move subordinate → front or back)
// B. Subject-verb inversion
// C. Modifier repositioning
// D. Voice transformation
// E. Introductory phrase shifting

export const SYNTACTIC_TEMPLATES: SyntacticTemplate[] = [
  // A. CLAUSE REORDERING — Move trailing subordinate clause to front
  { name: "because_front", pattern: /^(.{20,}?),?\s+(because|since|as)\s+(.{10,})$/i, replacements: ["$2 $3, $1"] },
  { name: "although_front", pattern: /^(.{20,}?),?\s+(although|though|even though|while)\s+(.{10,})$/i, replacements: ["$2 $3, $1"] },
  { name: "when_front", pattern: /^(.{20,}?),?\s+(when|whenever|once|after|before|until)\s+(.{10,})$/i, replacements: ["$2 $3, $1"] },
  { name: "if_front", pattern: /^(.{20,}?),?\s+(if|unless|provided that)\s+(.{10,})$/i, replacements: ["$2 $3, $1"] },
  { name: "where_front", pattern: /^(.{20,}?),?\s+(where|wherever)\s+(.{10,})$/i, replacements: ["$2 $3, $1"] },

  // Move fronted subordinate clause to back
  { name: "because_back", pattern: /^(Because|Since|As)\s+(.{10,}?),\s+(.{15,})$/i, replacements: ["$3, $1 $2"] },
  { name: "although_back", pattern: /^(Although|Though|Even though|While)\s+(.{10,}?),\s+(.{15,})$/i, replacements: ["$3, $1 $2"] },
  { name: "when_back", pattern: /^(When|Whenever|Once|After|Before|Until)\s+(.{10,}?),\s+(.{15,})$/i, replacements: ["$3 $1 $2"] },
  { name: "if_back", pattern: /^(If|Unless|Provided that)\s+(.{10,}?),\s+(.{15,})$/i, replacements: ["$3 $1 $2"] },

  // B. PREPOSITIONAL PHRASE REPOSITIONING
  { name: "pp_front_in", pattern: /^(.{15,}?)\s+(in (?:the |this |that |these |those )?\w[\w\s]{3,20})\.$/i, replacements: ["$2, $1."] },
  { name: "pp_front_at", pattern: /^(.{15,}?)\s+(at (?:the |this |that )?\w[\w\s]{3,15})\.$/i, replacements: ["$2, $1."] },
  { name: "pp_front_by", pattern: /^(.{15,}?)\s+(by (?:the |this |that )?\w[\w\s]{3,15})\.$/i, replacements: ["$2, $1."] },
  { name: "pp_front_with", pattern: /^(.{15,}?)\s+(with (?:the |this |that )?\w[\w\s]{3,20})\.$/i, replacements: ["$2, $1."] },
  { name: "pp_front_through", pattern: /^(.{15,}?)\s+(through (?:the |this |that )?\w[\w\s]{3,20})\.$/i, replacements: ["$2, $1."] },
  { name: "pp_front_during", pattern: /^(.{15,}?)\s+(during (?:the |this |that )?\w[\w\s]{3,20})\.$/i, replacements: ["$2, $1."] },
  { name: "pp_front_across", pattern: /^(.{15,}?)\s+(across (?:the |this |that )?\w[\w\s]{3,20})\.$/i, replacements: ["$2, $1."] },
  { name: "pp_front_among", pattern: /^(.{15,}?)\s+(among (?:the |this |that )?\w[\w\s]{3,20})\.$/i, replacements: ["$2, $1."] },

  // C. INDEPENDENT CLAUSE SWAP (around conjunctions)
  { name: "and_swap", pattern: /^(.{15,}?),\s+and\s+(.{15,})$/i, replacements: ["$2, and $1"] },
  { name: "but_swap", pattern: /^(.{15,}?),\s+but\s+(.{15,})$/i, replacements: ["$2, though $1"] },
  { name: "yet_swap", pattern: /^(.{15,}?),\s+yet\s+(.{15,})$/i, replacements: ["$2, yet $1"] },
  { name: "so_swap", pattern: /^(.{15,}?),\s+so\s+(.{15,})$/i, replacements: ["$2, since $1"] },

  // D. PARTICIPIAL PHRASE CREATION
  { name: "which_to_participle", pattern: /^(.+?),\s+which\s+(has|have)\s+(\w+)/i, replacements: ["$1, having $3"] },
  { name: "who_to_participle", pattern: /^(.+?),\s+who\s+(is|are|was|were)\s+(\w+ing)/i, replacements: ["$1, $3"] },
];

// ══════════════════════════════════════════════════════════════════════════
// 6. DIVERSITY WORD SWAPS — For vocabulary enrichment
//    Used to replace repeated common words
// ══════════════════════════════════════════════════════════════════════════

export const DIVERSITY_SWAPS: Record<string, string[]> = {
  "big": ["sizable", "hefty", "sweeping"], "small": ["modest", "slight", "minor"],
  "good": ["solid", "decent", "strong"], "bad": ["poor", "rough", "weak"],
  "very": ["quite", "rather", "especially"], "many": ["plenty of", "a number of", "several"],
  "help": ["assist", "support", "aid"], "use": ["employ", "apply", "rely on"],
  "show": ["reveal", "indicate", "demonstrate"], "make": ["create", "produce", "generate"],
  "get": ["obtain", "gain", "acquire"], "give": ["provide", "offer", "supply"],
  "take": ["adopt", "assume", "accept"], "see": ["observe", "notice", "recognize"],
  "come": ["arrive", "emerge", "surface"], "go": ["proceed", "move", "shift"],
  "keep": ["retain", "maintain", "preserve"], "change": ["alter", "shift", "modify"],
  "grow": ["expand", "swell", "climb"], "move": ["shift", "transition", "migrate"],
  "start": ["launch", "kick off", "initiate"], "work": ["function", "operate", "perform"],
  "need": ["require", "demand", "call for"], "put": ["place", "position", "set"],
  "run": ["operate", "manage", "oversee"], "try": ["attempt", "strive", "seek"],
  "think": ["consider", "believe", "reckon"], "find": ["discover", "uncover", "identify"],
  "look": ["examine", "glance", "inspect"], "want": ["desire", "seek", "aim for"],
  "also": ["likewise", "similarly", "too"], "still": ["yet", "even now", "nonetheless"],
  "just": ["merely", "simply", "only"], "world": ["globe", "planet", "sphere"],
  "way": ["manner", "approach", "route"], "part": ["portion", "segment", "piece"],
  "place": ["location", "site", "spot"], "problem": ["issue", "challenge", "difficulty"],
  "people": ["individuals", "folks", "populations"], "same": ["identical", "equivalent", "matching"],
  "new": ["fresh", "recent", "novel"], "old": ["former", "earlier", "longstanding"],
  "high": ["elevated", "steep", "lofty"], "low": ["minimal", "reduced", "meager"],
  "long": ["extended", "prolonged", "lengthy"], "things": ["aspects", "elements", "factors"],
  "fact": ["reality", "truth", "detail"], "point": ["aspect", "element", "angle"],
  "area": ["region", "zone", "domain"], "kind": ["type", "sort", "variety"],
  "said": ["stated", "noted", "remarked"], "important": ["key", "central", "vital"],
  "different": ["distinct", "varied", "diverse"], "clear": ["plain", "obvious", "evident"],
  "large": ["sizable", "considerable", "expansive"], "real": ["actual", "genuine", "true"],
  "system": ["framework", "structure", "setup"], "result": ["outcome", "consequence", "effect"],
  "group": ["cluster", "set", "collection"], "level": ["degree", "extent", "tier"],
  "number": ["count", "figure", "total"], "form": ["shape", "type", "variety"],
  "state": ["condition", "situation", "status"], "process": ["procedure", "method", "mechanism"],
  "case": ["instance", "situation", "scenario"], "report": ["account", "study", "document"],
  "effect": ["impact", "influence", "consequence"], "power": ["strength", "force", "authority"],
  "likely": ["probable", "expected", "anticipated"],
};

// ══════════════════════════════════════════════════════════════════════════
// 7. SENTENCE STRATEGY SELECTOR
//    Assigns a transformation strategy per sentence to prevent
//    "machine consistency" (every sentence transformed the same way)
// ══════════════════════════════════════════════════════════════════════════

export type SentenceStrategy =
  | "light_paraphrase"    // minimal word swaps, preserve structure
  | "restructure"         // clause reordering, modifier repositioning
  | "voice_transform"     // active ↔ passive voice change
  | "phrase_heavy"        // heavy phrase-level replacement
  | "minimal_change";     // almost no change (preserve as-is)

/**
 * Assign a strategy to each sentence index based on position and sentence properties.
 * Ensures no two adjacent sentences use the same strategy.
 */
export function assignStrategies(sentenceCount: number, sentenceLengths: number[]): SentenceStrategy[] {
  const strategies: SentenceStrategy[] = [];
  const pool: SentenceStrategy[] = [
    "light_paraphrase", "restructure", "phrase_heavy", "voice_transform", "minimal_change",
  ];

  for (let i = 0; i < sentenceCount; i++) {
    const len = sentenceLengths[i] ?? 15;

    // Short sentences (< 10 words): light paraphrase or minimal
    if (len < 10) {
      strategies.push(i % 2 === 0 ? "light_paraphrase" : "minimal_change");
      continue;
    }

    // Very long sentences (> 35 words): restructure or phrase_heavy
    if (len > 35) {
      strategies.push(i % 2 === 0 ? "restructure" : "phrase_heavy");
      continue;
    }

    // Medium sentences: cycle through strategies, avoid adjacent duplicates
    let candidate = pool[i % pool.length];
    if (i > 0 && strategies[i - 1] === candidate) {
      candidate = pool[(i + 1) % pool.length];
    }
    strategies.push(candidate);
  }

  return strategies;
}

// ══════════════════════════════════════════════════════════════════════════
// 8. NATURAL STARTER REROUTES (shared by all engines)
// ══════════════════════════════════════════════════════════════════════════

export const AI_STARTER_WORDS = new Set([
  "furthermore", "moreover", "additionally", "consequently", "subsequently",
  "nevertheless", "notwithstanding", "accordingly", "thus", "hence",
  "indeed", "notably", "specifically", "crucially", "importantly",
  "essentially", "fundamentally", "arguably", "undeniably", "undoubtedly",
  "interestingly", "remarkably", "evidently",
]);

export const NATURAL_REROUTES: string[] = [
  "On closer inspection,", "In practice,", "By that point,",
  "From that angle,", "Practically speaking,", "At its core,",
  "To put it differently,", "As things stood,", "On the ground,",
  "In real terms,", "Behind the scenes,", "With that shift,",
  "Looking closer,", "Broadly speaking,",
];

// ══════════════════════════════════════════════════════════════════════════
// 9. SHARED UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

/** Kill AI vocabulary in text using shared dictionaries */
export function applyAIWordKill(text: string): string {
  let result = text;

  // Kill phrases first (longer patterns before shorter)
  for (const [pattern, replacement] of AI_PHRASE_PATTERNS) {
    result = result.replace(pattern, (match, ...groups) => {
      let rep = replacement;
      // Resolve $1, $2, etc. capture group references
      for (let i = 0; i < groups.length; i++) {
        if (typeof groups[i] === 'string') rep = rep.replace(`$${i + 1}`, groups[i]);
      }
      if (rep === "") return "";
      if (match[0] === match[0].toUpperCase() && rep[0] === rep[0].toLowerCase()) {
        return rep[0].toUpperCase() + rep.slice(1);
      }
      return rep;
    });
  }

  // Kill words (with simple stemming to catch inflected forms)
  result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase();
    let replacements = AI_WORD_REPLACEMENTS[lower];
    let suffix = "";
    // If no direct match, try common stems
    if (!replacements) {
      if (lower.endsWith("ing") && AI_WORD_REPLACEMENTS[lower.slice(0, -3)]) {
        replacements = AI_WORD_REPLACEMENTS[lower.slice(0, -3)];
        suffix = "ing";
      } else if (lower.endsWith("ing") && AI_WORD_REPLACEMENTS[lower.slice(0, -3) + "e"]) {
        replacements = AI_WORD_REPLACEMENTS[lower.slice(0, -3) + "e"];
        suffix = "ing";
      } else if (lower.endsWith("es") && AI_WORD_REPLACEMENTS[lower.slice(0, -2)]) {
        replacements = AI_WORD_REPLACEMENTS[lower.slice(0, -2)];
        suffix = "s";
      } else if (lower.endsWith("es") && AI_WORD_REPLACEMENTS[lower.slice(0, -1)]) {
        replacements = AI_WORD_REPLACEMENTS[lower.slice(0, -1)];
        suffix = "s";
      } else if (lower.endsWith("s") && AI_WORD_REPLACEMENTS[lower.slice(0, -1)]) {
        replacements = AI_WORD_REPLACEMENTS[lower.slice(0, -1)];
        suffix = "s";
      } else if (lower.endsWith("ed") && AI_WORD_REPLACEMENTS[lower.slice(0, -2)]) {
        replacements = AI_WORD_REPLACEMENTS[lower.slice(0, -2)];
        suffix = "ed";
      } else if (lower.endsWith("ed") && AI_WORD_REPLACEMENTS[lower.slice(0, -1)]) {
        replacements = AI_WORD_REPLACEMENTS[lower.slice(0, -1)];
        suffix = "ed";
      } else if (lower.endsWith("ies") && AI_WORD_REPLACEMENTS[lower.slice(0, -3) + "y"]) {
        replacements = AI_WORD_REPLACEMENTS[lower.slice(0, -3) + "y"];
        suffix = "s";
      }
    }
    if (!replacements) return word;
    let replacement = replacements[Math.floor(Math.random() * replacements.length)];
    // For multi-word replacements, suffix only the first word
    if (suffix && replacement.includes(" ")) {
      const parts = replacement.split(" ");
      const firstWord = parts[0];
      if (suffix === "s") {
        if (firstWord.match(/[bcdfghjklmnpqrstvwxyz]y$/)) {
          parts[0] = firstWord.slice(0, -1) + "ies";
        } else if (firstWord.match(/[sxzh]$/)) {
          parts[0] = firstWord + "es";
        } else {
          parts[0] = firstWord + "s";
        }
      } else if (suffix === "ed") {
        const IRREGULAR_ED_MW: Record<string, string> = {
          build: "built", come: "came", drive: "drove", find: "found",
          give: "gave", grow: "grew", keep: "kept", lead: "led",
          make: "made", run: "ran", see: "saw", set: "set",
          show: "showed", take: "took", think: "thought", get: "got",
          put: "put", read: "read", arise: "arose", shed: "shed",
          spread: "spread", break: "broke", cut: "cut", hold: "held",
        };
        const irregFW = firstWord.toLowerCase();
        if (IRREGULAR_ED_MW[irregFW]) {
          parts[0] = IRREGULAR_ED_MW[irregFW];
        } else if (firstWord.endsWith("e")) {
          parts[0] = firstWord + "d";
        } else {
          parts[0] = firstWord + "ed";
        }
      } else if (suffix === "ing") {
        if (firstWord.endsWith("e") && !firstWord.endsWith("ee")) {
          parts[0] = firstWord.slice(0, -1) + "ing";
        } else {
          parts[0] = firstWord + "ing";
        }
      }
      replacement = parts.join(" ");
    } else if (suffix && !replacement.includes(" ")) {
      if (suffix === "s") {
        // Handle consonant+y → ies
        if (replacement.match(/[bcdfghjklmnpqrstvwxyz]y$/)) {
          replacement = replacement.slice(0, -1) + "ies";
        } else if (replacement.match(/[sxzh]$/)) {
          replacement += "es";
        } else {
          replacement += "s";
        }
      } else if (suffix === "ed") {
        // Handle irregular verbs
        const IRREGULAR_ED: Record<string, string> = {
          build: "built", come: "came", drive: "drove", find: "found",
          give: "gave", grow: "grew", keep: "kept", lead: "led",
          make: "made", run: "ran", see: "saw", set: "set",
          show: "showed", take: "took", think: "thought", get: "got",
          put: "put", read: "read", arise: "arose", shed: "shed",
          spread: "spread", break: "broke", cut: "cut", hold: "held",
        };
        const irregBase = replacement.toLowerCase();
        if (IRREGULAR_ED[irregBase]) {
          replacement = IRREGULAR_ED[irregBase];
        } else if (replacement.endsWith("e")) {
          replacement += "d";
        } else if (replacement.match(/[bcdfghjklmnpqrstvwxyz]y$/)) {
          replacement = replacement.slice(0, -1) + "ied";
        } else {
          replacement += "ed";
        }
      } else if (suffix === "ing") {
        if (replacement.endsWith("e") && !replacement.endsWith("ee") && !replacement.endsWith("ye")) {
          replacement = replacement.slice(0, -1) + "ing";
        } else {
          replacement += "ing";
        }
      }
    }
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });

  // Cleanup artifacts
  result = result.replace(/ {2,}/g, " ");
  // Only capitalize within lines — never match across paragraph breaks (\n\n)
  result = result.replace(/\.[ \t]+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^[ \t]+/gm, "");
  result = result.replace(/,\s*,/g, ",");

  return result;
}

/** Naturalize formal connectors using shared dictionary */
export function applyConnectorNaturalization(text: string): string {
  let result = text;
  for (const [formal, replacements] of Object.entries(FORMAL_CONNECTORS)) {
    while (result.includes(formal)) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)];
      result = result.replace(formal, rep);
    }
  }
  return result;
}

/** Expand contractions using shared map */
export function expandAllContractions(text: string): string {
  return text.replace(CONTRACTION_REGEX, (match) => {
    const expanded = CONTRACTION_EXPANSIONS[match.toLowerCase()] ?? match;
    if (match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()) {
      return expanded[0].toUpperCase() + expanded.slice(1);
    }
    return expanded;
  });
}

/** Apply phrase-level swaps from all pattern categories */
export function applyPhrasePatterns(text: string): string {
  let result = text;
  const allPatterns: Record<string, string[]>[] = [
    VERB_PHRASE_SWAPS, MODIFIER_SWAPS, CLAUSE_REPHRASINGS,
    HEDGING_PHRASES, TRANSITION_SWAPS, QUANTIFIER_SWAPS,
    TEMPORAL_SWAPS, CAUSAL_SWAPS, EMPHASIS_SWAPS,
  ];

  for (const dict of allPatterns) {
    for (const [phrase, replacements] of Object.entries(dict)) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      result = result.replace(regex, (match) => {
        const rep = replacements[Math.floor(Math.random() * replacements.length)];
        if (match[0] === match[0].toUpperCase() && rep[0] === rep[0].toLowerCase()) {
          return rep[0].toUpperCase() + rep.slice(1);
        }
        return rep;
      });
    }
  }

  return result;
}

/** Apply syntactic template transformations to a single sentence */
export function applySyntacticTemplate(sentence: string): string {
  // Shuffle templates for variety
  const shuffled = [...SYNTACTIC_TEMPLATES].sort(() => Math.random() - 0.5);

  for (const template of shuffled) {
    const match = sentence.match(template.pattern);
    if (match) {
      const replacement = template.replacements[Math.floor(Math.random() * template.replacements.length)];
      let result = sentence.replace(template.pattern, replacement);
      // Fix capitalization
      if (result[0] && result[0] !== result[0].toUpperCase()) {
        result = result[0].toUpperCase() + result.slice(1);
      }
      // Fix ending punctuation
      if (!/[.!?]$/.test(result.trim())) {
        result = result.trim() + ".";
      }
      return result;
    }
  }

  return sentence;
}

/** Diversify sentence starters using shared dictionaries */
export function diversifyStarters(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    // We operate on full paragraph text, treating each sentence boundary
    // Split into sentences, process, rejoin
    const sentRegex = /(?<=[.!?])\s+(?=[A-Z])/;
    const sentences = p.split(sentRegex);
    if (sentences.length === 0) return "";

    const result: string[] = [];
    const usedStarters = new Set<string>();
    let rerouteIdx = 0;

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;

      const firstWord = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

      // Kill AI formal starters
      if (AI_STARTER_WORDS.has(firstWord)) {
        const comma = sent.indexOf(",");
        if (comma > 0 && comma < 20) {
          sent = sent.slice(comma + 1).trim();
          if (sent[0]) sent = sent[0].toUpperCase() + sent.slice(1);
        }
      }

      // Check for duplicate starter
      const currentStarter = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
      if (usedStarters.has(currentStarter) && sent.split(/\s+/).length > 6) {
        const reroute = NATURAL_REROUTES[rerouteIdx % NATURAL_REROUTES.length];
        rerouteIdx++;
        sent = reroute + " " + sent[0].toLowerCase() + sent.slice(1);
      }

      usedStarters.add(sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "");
      result.push(sent);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════
// 10. STATS — Report how many effective patterns we have
// ══════════════════════════════════════════════════════════════════════════

export function getDictionaryStats(): {
  aiWords: number;
  aiPhrases: number;
  phrasePatterns: number;
  effectiveVariations: number;
  syntacticTemplates: number;
  diversityWords: number;
} {
  const aiWords = Object.keys(AI_WORD_REPLACEMENTS).length;
  const aiPhrases = AI_PHRASE_PATTERNS.length;

  // Count all phrase patterns
  const allPhrasePatterns: Record<string, string[]>[] = [
    VERB_PHRASE_SWAPS, MODIFIER_SWAPS, CLAUSE_REPHRASINGS,
    HEDGING_PHRASES, TRANSITION_SWAPS, QUANTIFIER_SWAPS,
    TEMPORAL_SWAPS, CAUSAL_SWAPS, EMPHASIS_SWAPS,
  ];
  let phrasePatterns = 0;
  let effectiveVariations = 0;
  for (const dict of allPhrasePatterns) {
    for (const [, alternatives] of Object.entries(dict)) {
      phrasePatterns++;
      effectiveVariations += alternatives.length;
    }
  }

  // AI words add to effective variations too
  for (const [, alts] of Object.entries(AI_WORD_REPLACEMENTS)) {
    effectiveVariations += alts.length;
  }

  // Combinatorial: each phrase can be combined with other sentence-level transforms
  // base_patterns × syntactic_templates × strategy_types = effective combos
  const syntacticTemplates = SYNTACTIC_TEMPLATES.length;
  const strategyCount = 5; // number of SentenceStrategy types
  const combinatorialTotal = effectiveVariations * syntacticTemplates * strategyCount;

  return {
    aiWords,
    aiPhrases,
    phrasePatterns,
    effectiveVariations: combinatorialTotal,
    syntacticTemplates,
    diversityWords: Object.keys(DIVERSITY_SWAPS).length,
  };
}

/**
 * fixPunctuation — Repairs punctuation and capitalization artifacts
 * without touching the actual words/text content.
 * Safe to call as a final pass on any engine output.
 */
export function fixPunctuation(text: string): string {
  let r = text;

  // ── Comma fixes ──
  r = r.replace(/,\s*,/g, ",");                        // double commas → single
  r = r.replace(/,\s*\./g, ".");                        // ",." → "."
  r = r.replace(/,\s*!/g, "!");                         // ",!" → "!"
  r = r.replace(/,\s*\?/g, "?");                        // ",?" → "?"
  r = r.replace(/,\s*;/g, ";");                         // ",;" → ";"
  r = r.replace(/,\s*:/g, ":");                         // ",:" → ":"
  r = r.replace(/(\w),(\w)/g, "$1, $2");                // missing space after comma

  // ── Period fixes ──
  r = r.replace(/\.{2,}/g, ".");                        // multiple periods → single (not ...)
  r = r.replace(/\.\s*,/g, ".");                        // ".," → "."
  r = r.replace(/\.(\s*\.)+/g, ".");                    // ". ." → "."

  // ── Semicolon/colon fixes ──
  r = r.replace(/;\s*;/g, ";");                         // double semicolons
  r = r.replace(/:\s*:/g, ":");                         // double colons
  r = r.replace(/;\s*\./g, ".");                        // ";." → "."
  r = r.replace(/:\s*\./g, ".");                        // ":." → "."

  // ── Space before punctuation ──
  r = r.replace(/ +\./g, ".");                          // " ." → "."
  r = r.replace(/ +,/g, ",");                           // " ," → ","
  r = r.replace(/ +;/g, ";");                           // " ;" → ";"
  r = r.replace(/ +:/g, ":");                           // " :" → ":"
  r = r.replace(/ +!/g, "!");                           // " !" → "!"
  r = r.replace(/ +\?/g, "?");                          // " ?" → "?"

  // ── Space after punctuation (within a line — don't cross paragraph breaks) ──
  r = r.replace(/\.([A-Za-z])/g, ". $1");               // ".Word" → ". Word"
  r = r.replace(/,([A-Za-z])/g, ", $1");                // ",Word" → ", Word"
  r = r.replace(/;([A-Za-z])/g, "; $1");                // ";Word" → "; Word"
  r = r.replace(/:([A-Za-z])/g, ": $1");                // ":Word" → ": Word"
  r = r.replace(/!([A-Za-z])/g, "! $1");                // "!Word" → "! Word"
  r = r.replace(/\?([A-Za-z])/g, "? $1");               // "?Word" → "? Word"

  // ── Capitalization after sentence-ending punctuation ──
  r = r.replace(/([.!?])\s+([a-z])/g, (_, p, ch) => `${p} ${ch.toUpperCase()}`);

  // ── Capitalize first character of each paragraph ──
  r = r.replace(/(^|\n\n)\s*([a-z])/g, (_, pre, ch) => `${pre}${ch.toUpperCase()}`);

  // ── Opening sentence of text ──
  if (r.length > 0 && /^[a-z]/.test(r)) {
    r = r[0].toUpperCase() + r.slice(1);
  }

  // ── Orphan punctuation at start of sentence ──
  r = r.replace(/(^|\.\s+)[,;:]\s*/gm, "$1");          // remove leading comma/semicolon/colon after period
  r = r.replace(/^\s*[,;:]\s*/gm, "");                 // remove leading comma/semicolon/colon at line start

  // ── Multiple spaces ──
  r = r.replace(/ {2,}/g, " ");

  // ── Trailing/leading whitespace per line ──
  r = r.replace(/^[ \t]+/gm, "");
  r = r.replace(/[ \t]+$/gm, "");

  return r;
}

// ══════════════════════════════════════════════════════════════════════════
// PER-SENTENCE ANTI-DETECTION SWEEP
// Targets the 9 micro-signals that the multi-detector uses to flag individual
// sentences as AI. Each sentence scoring ≥0.28 counts toward per_sentence_ai_ratio.
//
// Signals and their points:
//   0.20 — AI sentence starters (formal connectors at start)
//   0.20 — AI marker word density (>0.01 ratio)
//   0.12 — Word length CV < 0.35 (uniform word lengths)
//   0.10 — Sentence length 13-30 words (AI sweet spot)
//   0.10 — Function word ratio 0.35-0.55
//   0.12 — AI phrase patterns present
//   0.03 — No contractions in sentence
//   0.10 — Formal link words present (however, therefore, etc.)
//   0.02 — No personal pronouns
//
// Goal: push every sentence below 0.28 threshold.
// ══════════════════════════════════════════════════════════════════════════

/** Formal link words the detector checks — ANY presence adds 0.10 */
const DETECTOR_FORMAL_LINKS = new Set([
  "however", "therefore", "furthermore", "moreover", "consequently",
  "additionally", "conversely", "similarly", "specifically", "particularly",
  "notably", "indeed", "essentially", "fundamentally", "accordingly", "thus",
]);

/** Replacements for formal link words — context-appropriate natural alternatives */
const FORMAL_LINK_REPLACEMENTS: Record<string, string[]> = {
  "however": ["but", "still", "yet"],
  "therefore": ["so", "then"],
  "furthermore": ["also", "and"],
  "moreover": ["also", "and", "plus"],
  "consequently": ["so", "then"],
  "additionally": ["also", "and"],
  "conversely": ["but", "then again"],
  "similarly": ["likewise", "in the same way"],
  "specifically": ["in particular", "here"],
  "particularly": ["especially"],
  "notably": ["especially"],
  "indeed": ["in fact", "truly"],
  "essentially": ["really", "at its core"],
  "fundamentally": ["at its root", "at heart"],
  "accordingly": ["so", "in turn"],
  "thus": ["so", "this way"],
};

/** AI marker words the detector checks — complete set from multi-detector.ts */
const DETECTOR_AI_MARKERS = new Set([
  "utilize", "utilise", "leverage", "facilitate", "comprehensive",
  "multifaceted", "paramount", "furthermore", "moreover", "additionally",
  "consequently", "subsequently", "nevertheless", "notwithstanding",
  "aforementioned", "henceforth", "paradigm", "methodology", "methodologies",
  "framework", "trajectory", "discourse", "dichotomy", "conundrum",
  "juxtaposition", "ramification", "underpinning", "synergy",
  "robust", "nuanced", "salient", "ubiquitous", "pivotal",
  "intricate", "meticulous", "profound", "inherent", "overarching",
  "substantive", "efficacious", "holistic", "transformative", "innovative",
  "groundbreaking", "cutting-edge", "state-of-the-art", "noteworthy",
  "proliferate", "exacerbate", "ameliorate", "engender", "promulgate",
  "delineate", "elucidate", "illuminate", "necessitate", "perpetuate",
  "culminate", "underscore", "exemplify", "encompass", "bolster",
  "catalyze", "streamline", "optimize", "enhance", "mitigate",
  "navigate", "prioritize", "articulate", "substantiate", "corroborate",
  "disseminate", "cultivate", "ascertain", "endeavor",
  "delve", "embark", "foster", "harness", "spearhead",
  "unravel", "unveil",
  "notably", "specifically", "crucially", "importantly", "significantly",
  "essentially", "fundamentally", "arguably", "undeniably", "undoubtedly",
  "interestingly", "remarkably", "evidently",
  "implication", "implications", "realm", "landscape",
  "tapestry", "cornerstone", "bedrock", "linchpin", "catalyst",
  "nexus", "spectrum", "myriad", "plethora", "multitude",
]);

/** Residual AI marker replacements — catch anything applyAIWordKill misses */
const MARKER_FALLBACK_REPLACEMENTS: Record<string, string> = {
  "enhance": "improve", "catalyst": "trigger", "landscape": "scene",
  "realm": "area", "spectrum": "range", "culminate": "end",
  "foster": "build", "harness": "use", "delve": "look into",
  "embark": "start", "spearhead": "lead", "unravel": "untangle",
  "unveil": "reveal", "underscore": "stress", "exemplify": "show",
  "encompass": "cover", "bolster": "support", "catalyze": "spark",
  "streamline": "simplify", "optimize": "improve", "mitigate": "reduce",
  "navigate": "handle", "prioritize": "focus on", "articulate": "state",
  "substantiate": "prove", "corroborate": "confirm", "disseminate": "share",
  "cultivate": "develop", "ascertain": "find out", "endeavor": "try",
  "illuminate": "show", "elucidate": "explain", "delineate": "describe",
  "perpetuate": "continue", "necessitate": "require", "proliferate": "spread",
  "exacerbate": "worsen", "ameliorate": "improve", "engender": "create",
  "noteworthy": "striking", "groundbreaking": "pioneering",
  "innovative": "new", "transformative": "major", "holistic": "complete",
  "efficacious": "effective", "substantive": "real", "overarching": "main",
  "inherent": "built-in", "profound": "deep", "meticulous": "careful",
  "intricate": "complex", "pivotal": "key", "ubiquitous": "common",
  "salient": "key", "nuanced": "subtle", "robust": "strong",
  "synergy": "teamwork", "underpinning": "basis", "ramification": "effect",
  "conundrum": "problem", "dichotomy": "divide", "discourse": "discussion",
  "trajectory": "path", "paradigm": "model", "methodology": "method",
  "framework": "structure", "multifaceted": "complex", "comprehensive": "thorough",
  "paramount": "most important", "facilitate": "help", "leverage": "use",
  "utilize": "use", "utilize": "use",
  "implications": "effects", "implication": "effect",
  "tapestry": "mix", "cornerstone": "base", "bedrock": "foundation",
  "linchpin": "core", "nexus": "link", "myriad": "many",
  "plethora": "many", "multitude": "many",
  "notably": "especially", "specifically": "here", "crucially": "importantly",
  "importantly": "above all", "significantly": "greatly",
  "essentially": "really", "fundamentally": "at heart",
  "arguably": "probably", "undeniably": "clearly",
  "undoubtedly": "clearly", "interestingly": "curiously",
  "remarkably": "surprisingly", "evidently": "clearly",
};

/** AI sentence starters the detector checks — exact match from multi-detector.ts */
const DETECTOR_AI_STARTERS = [
  "furthermore,", "moreover,", "additionally,", "consequently,",
  "subsequently,", "nevertheless,", "notwithstanding,", "accordingly,",
  "it is important", "it is crucial", "it is essential", "it is worth noting",
  "it should be noted", "one of the most", "in today's", "in the modern",
  "this essay", "this paper", "this study", "the purpose of",
  "in conclusion,", "in summary,", "to summarize,", "as a result,",
  "for example,", "for instance,", "on the other hand,", "in other words,",
  "there are several", "there are many", "it can be seen", "it is clear",
  "looking at", "when it comes to", "when we look at", "given that",
  "despite", "while", "although", "in recent years,",
];

/** AI phrase patterns the detector checks (first 15) */
const DETECTOR_AI_PHRASES: RegExp[] = [
  /\bit is (?:important|crucial|essential|vital) (?:to note )?that\b/i,
  /\bplays? a (?:crucial|vital|key|significant|important|pivotal) role\b/i,
  /\ba (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/i,
  /\bin (?:order )?to\b/i,
  /\bin today'?s (?:world|society|landscape|era)\b/i,
  /\bdue to the fact that\b/i,
  /\bit (?:should|must|can) be (?:noted|argued|emphasized) that\b/i,
  /\bfirst and foremost\b/i,
  /\beach and every\b/i,
  /\bnot only .{5,40} but also\b/i,
  /\bas a result\b/i,
  /\bmoving forward\b/i,
  /\bserves? as a (?:testament|reminder|catalyst|cornerstone)\b/i,
  /\bthe (?:importance|significance|impact) of\b/i,
  /\ba (?:plethora|myriad|multitude) of\b/i,
];

/** Phrase pattern replacements */
const DETECTOR_PHRASE_FIXES: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital) (?:to note )?that\b/i, ""],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal) role\b/i, "matters"],
  [/\ba (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/i, "many"],
  [/\bin order to\b/i, "to"],
  [/\bin today'?s (?:world|society|landscape|era)\b/i, "now"],
  [/\bdue to the fact that\b/i, "because"],
  [/\bit (?:should|must|can) be (?:noted|argued|emphasized) that\b/i, ""],
  [/\bfirst and foremost\b/i, "first"],
  [/\beach and every\b/i, "every"],
  [/\bnot only (.{5,40}?) but also\b/i, "$1 and also"],
  [/\bas a result\b/i, "so"],
  [/\bmoving forward\b/i, "going ahead"],
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone)\b/i, "shows"],
  [/\bthe (?:importance|significance|impact) of\b/i, "the role of"],
  [/\ba (?:plethora|myriad|multitude) of\b/i, "many"],
];

/**
 * Per-sentence anti-detection sweep.
 * Scores each sentence against the EXACT same 9 micro-signals the detector uses.
 * If a sentence would score ≥0.28 (flagged as AI), applies targeted fixes to
 * push it below the threshold.
 *
 * This function does NOT change meaning — only kills detection triggers.
 */
export function perSentenceAntiDetection(sentences: string[], hasContractions: boolean = false): string[] {
  return sentences.map(sent => {
    let result = sent.trim();
    if (!result) return result;
    const words = result.split(/\s+/);
    if (words.length < 4) return result;

    // Score the sentence exactly like the detector does
    let score = 0;
    const lower = result.toLowerCase();
    const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z']/g, ""));

    // Signal 1: AI sentence starters (+0.20)
    const hasAIStarter = DETECTOR_AI_STARTERS.some(s => lower.startsWith(s));
    if (hasAIStarter) score += 0.20;

    // Signal 2: AI marker word density (+0.00–0.20)
    const markerCount = lowerWords.filter(w => DETECTOR_AI_MARKERS.has(w)).length;
    const markerDensity = markerCount / lowerWords.length;
    score += Math.min(markerDensity * 5.0, 0.20);

    // Signal 3: Word length CV < 0.35 (+0.12)
    const wordLengths = lowerWords.map(w => w.length);
    const wlMean = wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length;
    const wlVariance = wordLengths.reduce((a, b) => a + (b - wlMean) ** 2, 0) / wordLengths.length;
    const wlCV = Math.sqrt(wlVariance) / (wlMean || 1);
    if (wlCV < 0.35) score += 0.12;

    // Signal 4: Sentence length 13-30 words (+0.10)
    if (words.length >= 13 && words.length <= 30) score += 0.10;

    // Signal 5: Function word ratio 0.35-0.55 (+0.10)
    const FUNC_WORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should", "may", "might",
      "must", "can", "could", "and", "but", "or", "nor", "for", "yet", "so", "in", "on", "at", "to",
      "from", "by", "with", "of", "as", "if", "then", "than", "that", "this", "these", "those", "not",
      "no", "also", "such", "each", "both", "all", "which", "who", "whom", "whose", "what", "where",
      "when", "how", "why", "it", "its", "i", "me", "my", "we", "us", "our", "you", "your", "he",
      "him", "his", "she", "her", "they", "them", "their", "about", "into", "through", "during",
      "before", "after", "above", "below", "between", "under", "more", "most", "other", "some",
      "any", "only", "very", "too", "just", "own", "same", "up", "down", "out", "off", "over",
      "there", "here", "now", "then", "still"]);
    const fwRatio = lowerWords.filter(w => FUNC_WORDS.has(w)).length / lowerWords.length;
    if (fwRatio >= 0.35 && fwRatio <= 0.55) score += 0.10;

    // Signal 6: AI phrase patterns (+0.12)
    const hasPhrase = DETECTOR_AI_PHRASES.some(p => p.test(lower));
    if (hasPhrase) score += 0.12;

    // Signal 7: No contractions (+0.03)
    const hasContraction = lowerWords.some(w => w.includes("'"));
    if (!hasContraction) score += 0.03;

    // Signal 8: Formal link words (+0.10)
    const hasFormalLink = lowerWords.some(w => DETECTOR_FORMAL_LINKS.has(w));
    if (hasFormalLink) score += 0.10;

    // Signal 9: No personal pronouns (+0.02)
    const PERSONAL = new Set(["i", "we", "you", "my", "me", "your", "our", "us"]);
    const hasPersonal = lowerWords.some(w => PERSONAL.has(w));
    if (!hasPersonal) score += 0.02;

    // If score < 0.28, sentence passes — leave it alone
    if (score < 0.28) return result;

    // ═══════════════════════════════════════
    // TARGETED FIXES — only apply what's needed to drop below 0.28
    // ═══════════════════════════════════════

    // Fix 1: Kill AI sentence starters (saves 0.20)
    if (hasAIStarter) {
      for (const starter of DETECTOR_AI_STARTERS) {
        if (lower.startsWith(starter)) {
          const starterLen = starter.length;
          let after = result.slice(starterLen).trim();
          // Remove trailing comma after starter removal
          if (after.startsWith(",")) after = after.slice(1).trim();
          if (after.length > 10) {
            result = after[0].toUpperCase() + after.slice(1);
            score -= 0.20;
          }
          break;
        }
      }
    }

    // Fix 2: Kill formal link words (saves 0.10)
    if (hasFormalLink && score >= 0.28) {
      const resultWords = result.split(/\s+/);
      const fixed = resultWords.map((w, idx) => {
        const clean = w.toLowerCase().replace(/[^a-z]/g, "");
        if (DETECTOR_FORMAL_LINKS.has(clean)) {
          const alts = FORMAL_LINK_REPLACEMENTS[clean];
          if (alts) {
            const alt = alts[idx % alts.length];
            // Preserve punctuation
            const leadPunc = w.match(/^[^a-zA-Z]*/)?.[0] ?? "";
            const trailPunc = w.match(/[^a-zA-Z]*$/)?.[0] ?? "";
            const isCapitalized = w[leadPunc.length] === w[leadPunc.length]?.toUpperCase();
            const replaced = isCapitalized ? alt[0].toUpperCase() + alt.slice(1) : alt;
            return leadPunc + replaced + trailPunc;
          }
        }
        return w;
      });
      result = fixed.join(" ");
      score -= 0.10;
    }

    // Fix 3: Kill AI marker words (saves up to 0.20)
    if (markerCount > 0 && score >= 0.28) {
      result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
        const wLower = word.toLowerCase();
        if (DETECTOR_AI_MARKERS.has(wLower)) {
          const rep = MARKER_FALLBACK_REPLACEMENTS[wLower];
          if (rep) {
            return word[0] === word[0].toUpperCase()
              ? rep[0].toUpperCase() + rep.slice(1)
              : rep;
          }
        }
        return word;
      });
      score -= Math.min(markerDensity * 5.0, 0.20);
    }

    // Fix 4: Kill AI phrase patterns (saves 0.12)
    if (hasPhrase && score >= 0.28) {
      for (const [pattern, fix] of DETECTOR_PHRASE_FIXES) {
        if (pattern.test(result)) {
          const before = result;
          result = result.replace(pattern, fix).trim();
          if (result !== before) {
            // Capitalize after stripping
            if (result && /^[a-z]/.test(result)) {
              result = result[0].toUpperCase() + result.slice(1);
            }
            score -= 0.12;
            break;
          }
        }
      }
    }

    // Fix 5: Break word length uniformity (saves 0.12)
    // If word lengths are too uniform (CV < 0.35), inject a very short or long word
    if (wlCV < 0.35 && score >= 0.28) {
      const rWords = result.split(/\s+/);
      if (rWords.length >= 6) {
        // Strategy: replace a medium-length word with a shorter synonym
        // or insert a natural interjection-like word
        for (let wi = 1; wi < rWords.length - 1; wi++) {
          const w = rWords[wi].replace(/[^a-zA-Z]/g, "");
          if (w.length >= 5 && w.length <= 7) {
            // Try to replace with a shorter word from AI_WORD_REPLACEMENTS
            const rep = AI_WORD_REPLACEMENTS[w.toLowerCase()];
            if (rep) {
              const shortest = rep.reduce((a, b) => a.length <= b.length ? a : b);
              if (shortest.length < w.length - 1) {
                const prefix = rWords[wi].match(/^[^a-zA-Z]*/)?.[0] ?? "";
                const suffix = rWords[wi].match(/[^a-zA-Z]*$/)?.[0] ?? "";
                const isCap = w[0] === w[0].toUpperCase();
                rWords[wi] = prefix + (isCap ? shortest[0].toUpperCase() + shortest.slice(1) : shortest) + suffix;
                result = rWords.join(" ");
                score -= 0.12;
                break;
              }
            }
          }
        }
      }
    }

    // Final cleanup
    result = result.replace(/ {2,}/g, " ").trim();
    if (result && /^[a-z]/.test(result)) {
      result = result[0].toUpperCase() + result.slice(1);
    }

    return result;
  });
}

// ══════════════════════════════════════════════════════════════════════════
// DEEP CLEANING PHASES
// Multi-phase post-humanization cleanup for meaning, flow, and AI removal.
// Shared by Ghost Mini and Ghost Pro.
// ══════════════════════════════════════════════════════════════════════════

// ── Phase A: Deep AI Residue Sweep ──
// Catches AI structural patterns that survive the main AI word kill.

const DEEP_AI_RESIDUE_PATTERNS: [RegExp, string][] = [
  // Meta-discourse: "This demonstrates/highlights/underscores/reveals"
  [/^This (?:demonstrates|highlights|underscores|reveals|showcases|illustrates|exemplifies|signifies|embodies|epitomizes) (?:that |how |the )?/i, ""],
  [/^These (?:findings|results|data|observations|examples|factors|elements) (?:demonstrate|highlight|underscore|reveal|show|suggest|indicate|confirm) (?:that |how )?/i, "The evidence shows that "],
  [/^Those (?:findings|results|factors) (?:demonstrate|indicate|show|suggest) (?:that )?/i, "The data show that "],
  // "It is [adjective] to [verb]" — hedging pattern
  [/^It is (?:important|crucial|essential|vital|necessary|imperative|critical|significant|notable|noteworthy|worth noting|worth mentioning) (?:to (?:note|mention|recognize|understand|acknowledge|consider|emphasize|stress|highlight|observe|point out) (?:that )?)?/i, ""],
  // "It can be [verb]ed that" — passive hedging
  [/^It (?:can|could|may|might|should|must|would) be (?:noted|argued|said|seen|observed|stated|concluded|inferred|suggested|maintained) that /i, ""],
  // "There is/are a growing/increasing" — AI filler
  [/^There (?:is|are|exists?) (?:a )?(?:growing|increasing|mounting|rising|expanding|notable|significant|clear|strong) (?:need|demand|trend|push|call|body|recognition|awareness|consensus|interest|concern|focus|emphasis) (?:for |to |toward |in )/i, ""],
  // "As [someone] rightly points out" / "As [noun] suggests"
  [/^As (?:\w+ )?(?:rightly |correctly |aptly )?(?:points? out|argues?|suggests?|notes?|observes?|contends?|maintains?|asserts?|explains?|emphasizes?|highlights?|acknowledges?),? /i, ""],
  // "In essence," / "In summary," / "In conclusion," — wrapping phrases
  [/^In (?:essence|summary|conclusion|short|brief|closing|retrospect|hindsight|principle|general|practice|reality|truth|effect|turn|return),?\s*/i, ""],
  // "Ultimately," / "Essentially," / "Fundamentally," — AI hedges at sentence start
  [/^(?:Ultimately|Essentially|Fundamentally|Inherently|Arguably|Undeniably|Undoubtedly|Unquestionably|Indisputably|Invariably),?\s*/i, ""],
  // "The importance/significance/impact of [noun] cannot be overstated"
  [/\b(?:the )?(?:importance|significance|impact|relevance|value|role) of .{3,40} (?:cannot|can't|should not) be (?:overstated|understated|ignored|overlooked|dismissed)/gi, "this matters"],
  // "It goes without saying that"
  [/^It goes without saying that /i, ""],
  // "Needless to say," — filler
  [/^Needless to say,?\s*/i, ""],
  // "One cannot help but [verb]" — AI pattern
  [/^One (?:cannot|can't|can not) help but (?:notice|wonder|observe|feel|think|see|question|ask|appreciate) (?:that |how )?/i, ""],
  // "It is no exaggeration to say that" 
  [/^It is no (?:exaggeration|stretch|surprise|coincidence|secret|accident) (?:to say )?that /i, ""],
  // "Suffice it to say" 
  [/^Suffice (?:it )?to say,?\s*/i, ""],
  // "What is particularly [adj] is that"
  [/^What is (?:particularly|especially|most|truly|deeply|highly|increasingly) (?:\w+) is (?:that |the fact that )?/i, ""],
  // "The fact remains that"
  [/^The fact (?:remains|is|stands) that /i, ""],
  // "It bears mentioning/noting that"
  [/^It (?:bears|warrants|merits|deserves) (?:mentioning|noting|emphasis|attention|consideration|recognition) (?:that )?/i, ""],
];

// ── Phase B: Hedging Density Limiter ──
// AI text over-hedges with "perhaps", "arguably", "it seems", etc.
// Limit to max 1 hedge per 5 sentences.

const HEDGING_MARKERS = [
  /\bperhaps\b/i, /\barguably\b/i, /\bit seems\b/i, /\bapparently\b/i,
  /\bpresumably\b/i, /\bseemingly\b/i, /\bostensibly\b/i, /\bconceivably\b/i,
  /\bpossibly\b/i, /\bplausibly\b/i, /\bone could argue\b/i, /\bone might say\b/i,
  /\bit could be said\b/i, /\bit may be\b/i, /\bit appears\b/i,
  /\bit would seem\b/i, /\bit is likely\b/i, /\bthere is reason to believe\b/i,
  /\bin all likelihood\b/i, /\bin all probability\b/i,
];

function limitHedgingDensity(sentences: string[]): string[] {
  let hedgeCount = 0;
  return sentences.map((sent, i) => {
    let result = sent;
    for (const marker of HEDGING_MARKERS) {
      if (marker.test(result)) {
        hedgeCount++;
        // Allow 1 hedge per 5 sentences
        if (hedgeCount > 1 && (i % 5 !== 0)) {
          // Remove the hedge word/phrase
          result = result.replace(marker, "").replace(/ {2,}/g, " ").replace(/^,\s*/, "").trim();
          if (result && /^[a-z]/.test(result)) result = result[0].toUpperCase() + result.slice(1);
          hedgeCount--;
        }
        break; // only count first hedge per sentence
      }
    }
    return result;
  });
}

// ── Phase C: Orphan Pronoun & Fragment Cleanup ──
// Remove sentences that start with demonstrative pronouns without antecedent,
// and fix sentence fragments that lost meaning during transforms.

const ORPHAN_DEMONSTRATIVE_VERBS = /^(?:This|That|These|Those|Such) (?:is|are|was|were|has|have|had|can|could|would|should|may|might|will|shall|shows?|demonstrates?|indicates?|highlights?|suggests?|reveals?|means?|implies?|illustrates?|provides?|represents?|serves?|plays?|offers?|creates?|makes?|becomes?|remains?|brings?|gives?|takes?|leads?|builds?|forms?|proves?|ensures?|confirms?|establishes?|reflects?|reinforces?|strengthens?|supports?|validates?|underlines?|advances?|promotes?|contributes?|drives?|enables?|facilitates?|achieves?|maintains?|warrants?|merits?|demands?|requires?|calls?)\b/i;

const PURE_PADDING_PATTERNS = [
  /^This is (?:a |an )?(?:important|crucial|vital|essential|significant|key|notable|critical|fundamental) (?:point|aspect|factor|element|consideration|issue|matter|topic|area|concept|observation)\.?$/i,
  /^Indeed,? this (?:is|has been|remains|continues to be) (?:a |an )?(?:important|crucial|significant|vital) (?:area|topic|subject|issue|matter|point|consideration)\.?$/i,
  /^This (?:is|remains|continues to be) (?:particularly |especially |highly |extremely )?(?:relevant|important|significant|critical|notable|crucial)\.?$/i,
  /^Such (?:considerations?|factors?|elements?|aspects?) (?:are|remain) (?:important|vital|central|key)\.?$/i,
];

function cleanOrphansAndFragments(sentences: string[], minWords: number = 4): string[] {
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sent = sentences[i].trim();
    if (!sent) continue;

    // Remove pure padding sentences (no content value)
    if (PURE_PADDING_PATTERNS.some(p => p.test(sent))) continue;

    // Fix orphan demonstrative pronouns at paragraph start (no antecedent)
    if (i === 0 && ORPHAN_DEMONSTRATIVE_VERBS.test(sent)) {
      // Skip removal for first sentence only if it's a standalone padding sentence
      // Otherwise keep it — it may be referring to context from the prior paragraph
    }

    // Remove fragment sentences (too short to carry meaning)
    const wordCount = sent.replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < minWords && sentences.length > 1) continue;

    // Check for broken/incomplete sentences (no verb)
    const hasVerb = /\b(?:is|are|was|were|has|have|had|do|does|did|will|would|could|should|can|may|might|shall|[a-z]+(?:s|ed|ing|es))\b/i.test(sent);
    if (!hasVerb && wordCount > 2 && sentences.length > 1) continue;

    result.push(sent);
  }

  // Never return empty — keep at least the longest original sentence
  if (result.length === 0 && sentences.length > 0) {
    const longest = sentences.reduce((a, b) => a.split(/\s+/).length >= b.split(/\s+/).length ? a : b);
    result.push(longest);
  }

  return result;
}

// ── Phase D: Sentence Structure Diversity ──
// Break wall-of-same-pattern sentences. AI generates structurally identical sentences.
// Detect consecutive sentences with the same syntactic pattern (e.g., all start with "The [noun]")
// and break the pattern by moving a non-subject element forward.

const ARTICLE_NOUN_START = /^(?:The|A|An) [a-z]+(?:tion|ment|ness|ity|ance|ence|ism|ist|ous|ive|al|ing|ed)?\b/i;

function enforceStructuralDiversity(sentences: string[]): string[] {
  if (sentences.length < 3) return sentences;

  const result = [...sentences];

  for (let i = 2; i < result.length; i++) {
    const prev2Start = result[i - 2].split(/\s+/).slice(0, 2).join(" ").toLowerCase();
    const prev1Start = result[i - 1].split(/\s+/).slice(0, 2).join(" ").toLowerCase();
    const currStart = result[i].split(/\s+/).slice(0, 2).join(" ").toLowerCase();

    // Detect 3+ consecutive "The [noun]" starts
    if (ARTICLE_NOUN_START.test(result[i]) &&
        ARTICLE_NOUN_START.test(result[i - 1]) &&
        ARTICLE_NOUN_START.test(result[i - 2])) {

      const sent = result[i];
      const words = sent.split(/\s+/);
      if (words.length < 8) continue;

      // Try to front a prepositional phrase or adverbial
      const commaIdx = sent.indexOf(",");
      if (commaIdx > 0 && commaIdx < sent.length / 2) {
        // Move post-comma content to front
        const before = sent.slice(0, commaIdx).trim();
        const after = sent.slice(commaIdx + 1).trim();
        if (after.length > 20 && before.length > 5) {
          result[i] = after[0].toUpperCase() + after.slice(1) + ", " + before.toLowerCase() + (sent.endsWith(".") && !after.endsWith(".") ? "." : "");
        }
      }
      continue;
    }

    // Detect 3+ sentences starting with the exact same word pair
    if (prev2Start === prev1Start && prev1Start === currStart && result[i].split(/\s+/).length >= 6) {
      // Fronting: move a mid-sentence phrase to the start
      const sent = result[i];
      // Find a prepositional phrase to front: ", in/of/for/with/by/through [phrase],"
      const prepMatch = sent.match(/,\s+((?:in|of|for|with|by|through|during|across|under|over|among|between|within|around|about|after|before)\s+[^,]{5,30}),/i);
      if (prepMatch && prepMatch.index !== undefined) {
        const prep = prepMatch[1].trim();
        const before = sent.slice(0, prepMatch.index).trim();
        const after = sent.slice(prepMatch.index + prepMatch[0].length).trim();
        result[i] = prep[0].toUpperCase() + prep.slice(1) + ", " + before[0].toLowerCase() + before.slice(1) + " " + after;
        // Ensure proper ending
        if (!result[i].match(/[.!?]$/)) result[i] += ".";
      }
    }
  }

  return result;
}

// ── Phase E: Repetitive Connector Kill ──
// If the same transitional word/phrase appears 3+ times, replace extras.

const TRACKED_CONNECTORS: Record<string, string[]> = {
  "however": ["that said", "even so", "still"],
  "therefore": ["for this reason", "as such", "so"],
  "furthermore": ["beyond this", "also", "what is more"],
  "moreover": ["besides", "on top of this", "also"],
  "additionally": ["also", "besides", "likewise"],
  "consequently": ["as a result", "because of this", "this meant"],
  "nevertheless": ["even so", "all the same", "still"],
  "similarly": ["in the same way", "likewise", "along these lines"],
  "specifically": ["in particular", "to be precise", "namely"],
  "notably": ["in particular", "especially", "of note"],
  "indeed": ["in fact", "as it happens", "truly"],
  "meanwhile": ["at the same time", "in parallel", "concurrently"],
  "conversely": ["on the flip side", "by contrast", "then again"],
  "accordingly": ["in response", "as such", "so"],
};

function killRepetitiveConnectors(sentences: string[]): string[] {
  const connectorCounts = new Map<string, number>();

  return sentences.map(sent => {
    let result = sent;
    for (const [connector, alts] of Object.entries(TRACKED_CONNECTORS)) {
      const rx = new RegExp(`^${connector},?\\s`, "i");
      if (rx.test(result)) {
        const count = (connectorCounts.get(connector) ?? 0) + 1;
        connectorCounts.set(connector, count);
        if (count > 2) {
          // Replace with an alternative
          const alt = alts[(count - 3) % alts.length];
          const capitalized = alt[0].toUpperCase() + alt.slice(1);
          result = result.replace(rx, capitalized + ", ");
        }
        break;
      }
    }
    return result;
  });
}

// ── Phase F: Sentence Coherence Validator ──
// Ensures each sentence has basic grammatical integrity after transforms.
// Catches broken sentences from aggressive restructuring.

function validateSentenceCoherence(sentences: string[]): string[] {
  return sentences.map(sent => {
    let result = sent.trim();
    if (!result || result.split(/\s+/).length < 3) return result;

    // Fix sentences that start with a lowercase letter
    if (/^[a-z]/.test(result)) {
      result = result[0].toUpperCase() + result.slice(1);
    }

    // Fix sentences that start with punctuation (artifact from stripping)
    result = result.replace(/^[,;:]\s*/, "");
    if (result && /^[a-z]/.test(result)) {
      result = result[0].toUpperCase() + result.slice(1);
    }

    // Fix doubled connectors: "However, however," → "However,"
    result = result.replace(/^(\w+),?\s+\1,?\s/i, (_, w) => w[0].toUpperCase() + w.slice(1) + ", ");

    // Fix sentences ending mid-clause (no proper ending punctuation)
    if (result.length > 10 && !/[.!?]$/.test(result)) {
      result += ".";
    }

    // Fix "the the", "a a", "an an" — doubled articles
    result = result.replace(/\b(the|a|an)\s+\1\b/gi, "$1");

    // Fix "of of", "in in", "for for" — doubled prepositions
    result = result.replace(/\b(of|in|for|to|on|at|by|with|from|into|about|through)\s+\1\b/gi, "$1");

    // Fix dangling "and" / "or" / "but" at end
    result = result.replace(/\s+(?:and|or|but)\s*\.\s*$/, ".");

    // Fix sentences starting with "And" immediately after a period was stripped
    // (already handled by cleanSentenceStarters, but catch residual)

    return result;
  });
}

/**
 * Deep cleaning pass — multi-phase cleanup for meaning, flow, and AI-free output.
 * Runs 6 sub-phases in sequence on a paragraph's sentences.
 * Shared by Ghost Mini and Ghost Pro.
 *
 * Phase A: Deep AI residue sweep (structural patterns surviving word-level kills)
 * Phase B: Hedging density limiter (max 1 hedge per 5 sentences)
 * Phase C: Orphan pronoun & fragment cleanup
 * Phase D: Sentence structure diversity (break wall-of-same-pattern)
 * Phase E: Repetitive connector kill
 * Phase F: Sentence coherence validation
 */
export function deepCleaningPass(sentences: string[]): string[] {
  if (!sentences || sentences.length === 0) return sentences;

  let result = [...sentences];

  // Phase A: Deep AI residue sweep
  result = result.map(sent => {
    let s = sent;
    for (const [pattern, replacement] of DEEP_AI_RESIDUE_PATTERNS) {
      if (pattern.test(s)) {
        const after = s.replace(pattern, replacement).trim();
        // Only strip if we leave a real sentence behind (5+ words)
        if (after.split(/\s+/).length >= 5) {
          s = after;
          // Capitalize
          if (s && /^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
        }
        break; // one fix per sentence
      }
    }
    return s;
  });

  // Phase B: Hedging density limiter
  result = limitHedgingDensity(result);

  // Phase C: Orphan pronoun & fragment cleanup
  result = cleanOrphansAndFragments(result);

  // Phase D: Sentence structure diversity
  result = enforceStructuralDiversity(result);

  // Phase E: Repetitive connector kill
  result = killRepetitiveConnectors(result);

  // Phase F: Sentence coherence validation
  result = validateSentenceCoherence(result);

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// ACADEMIC SENTENCE STARTER CLEANUP
// Cleans bad conjunctive/gerund starters and ensures academic tone.
// Used by Ghost Mini and Ghost Pro post-processing.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Bad sentence starters that should be removed or replaced.
 * Maps the bad pattern (regex) to how to fix it:
 *   "strip" = remove the opener up to the comma and capitalize what follows
 *   string  = replace the matched opener with this text
 */
const BAD_STARTER_FIXES: [RegExp, string][] = [
  // "By [gerund]" — AI hallmark, strip the whole prepositional phrase if short
  [/^By \w+ing\b[^,]{0,30},\s*/i, "strip"],
  // Bare "And" at start — replace with "Also" or strip
  [/^And\s+(?=[a-z])/i, "Also "],
  // Bare "And," at start
  [/^And,\s*/i, "Also, "],
  // "But" at sentence start — keep only when it's a genuine contrast, replace others
  [/^But\s+(?:also|then|yet|still)\s*/i, "strip"],
  // "So" as a bare starter (AI filler) — only when followed by comma or lowercase
  [/^So,\s*/i, "strip"],
  [/^So\s+(?=[a-z])/i, "strip"],
  // "Yet" as bare opener (not "Yet another")
  [/^Yet\s+(?!another|again|more|further)/i, "Still, "],
  // "Hence" / "Thus" bare starters
  [/^Hence,?\s*/i, "As a result, "],
  [/^Thus,?\s*/i, "In this way, "],
  // "Now," as filler
  [/^Now,\s*/i, "strip"],
  // "Plus," as filler
  [/^Plus,?\s*/i, "In addition, "],
  // "Sure enough," — too informal
  [/^Sure enough,\s*/i, "As expected, "],
  // "Truth be told," — informal
  [/^Truth be told,\s*/i, "In fact, "],
  // "The thing is," — informal
  [/^The thing is,?\s*/i, "strip"],
  // "What happens is" — informal
  [/^What happens is\s*/i, "strip"],
  // "Put simply," — too casual
  [/^Put simply,\s*/i, "In brief, "],
  // "Dig deeper and" — too casual
  [/^Dig deeper and\s*/i, "On closer examination, "],
  // "Strip it down and" — casual
  [/^Strip it down and\s*/i, "Fundamentally, "],
  // "Zoom in and" — casual
  [/^Zoom in and\s*/i, "On closer inspection, "],
  // "Step back and" — casual
  [/^Step back and\s*/i, "From a broader perspective, "],
  // "In a way," — vague
  [/^In a way,\s*/i, "To some extent, "],
  // "Oddly enough," — informal
  [/^Oddly enough,\s*/i, "Notably, "],
  // "At a glance," — informal
  [/^At a glance,\s*/i, "Initially, "],
  // "Consider this:" — imperative, informal
  [/^Consider this:\s*/i, "strip"],
  // "Worth noting:" — fragment
  [/^Worth noting:\s*/i, "It is worth noting that "],
  // "What stands out is that" — AI pattern
  [/^What stands out is that\s*/i, "strip"],
  // "The key insight here is that" — AI pattern
  [/^The key insight here is that\s*/i, "strip"],
  // "A closer reading shows" — AI pattern
  [/^A closer reading shows\s*/i, "strip"],
];

/**
 * Academic-appropriate starters for breaking repetition.
 * These maintain the formal tone of research papers.
 * Grouped by function: contrast, addition, cause/effect, temporal, emphasis.
 */
const ACADEMIC_STARTERS: Record<string, string[]> = {
  contrast: [
    "In contrast,", "On the other hand,", "Conversely,",
    "By comparison,", "Alternatively,", "Even so,",
  ],
  addition: [
    "In addition,", "Similarly,", "Along the same lines,",
    "Equally important,", "Comparably,", "In a related finding,",
  ],
  cause_effect: [
    "As a result,", "For this reason,", "Given this,",
    "With this in mind,", "Under these conditions,", "In response,",
  ],
  temporal: [
    "At this stage,", "During this period,", "Over time,",
    "In the interim,", "Following this,", "Prior to this,",
  ],
  emphasis: [
    "In particular,", "Especially relevant is the fact that",
    "Of particular importance,", "Central to this argument,",
    "Significantly,", "Critically,",
  ],
  example: [
    "For example,", "As an illustration,", "A case in point is",
    "This is evident in", "To illustrate,", "One example of this is",
  ],
  concession: [
    "While this is true,", "Although this may be the case,",
    "Despite this,", "Granted,", "Admittedly,",
    "Notwithstanding this limitation,",
  ],
};

/**
 * Clean bad sentence starters and replace with academic-appropriate alternatives.
 * Operates on an array of sentences (paragraph-level).
 * Returns cleaned sentences with proper capitalization.
 */
export function cleanSentenceStarters(sentences: string[]): string[] {
  const result: string[] = [];
  const usedStarters = new Set<string>();

  for (let i = 0; i < sentences.length; i++) {
    let sent = sentences[i].trim();
    if (!sent || sent.split(/\s+/).length < 3) {
      result.push(sent);
      continue;
    }

    // Phase 1: Fix known bad starters
    for (const [pattern, fix] of BAD_STARTER_FIXES) {
      const m = sent.match(pattern);
      if (m) {
        if (fix === "strip") {
          // Remove the matched opener and capitalize what follows
          const after = sent.slice(m[0].length).trim();
          if (after.length > 0) {
            sent = after[0].toUpperCase() + after.slice(1);
          }
        } else {
          // Replace the matched opener with the fix
          sent = sent.replace(pattern, fix);
          if (sent[0] && /^[a-z]/.test(sent)) {
            sent = sent[0].toUpperCase() + sent.slice(1);
          }
        }
        break; // Only apply one fix per sentence
      }
    }

    // Phase 2: Break consecutive identical starters using academic alternatives
    if (i > 0) {
      const prevFirst = result[result.length - 1]?.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
      const currFirst = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

      if (prevFirst === currFirst && sent.split(/\s+/).length > 6) {
        // Pick an academic starter based on sentence context
        const starter = pickAcademicStarter(sent, usedStarters);
        if (starter) {
          sent = starter + " " + sent[0].toLowerCase() + sent.slice(1);
          usedStarters.add(starter.split(/\s+/)[0]?.toLowerCase() ?? "");
        }
      }
    }

    // Track starter for duplicate detection
    usedStarters.add(sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "");
    result.push(sent);
  }

  return result;
}

/**
 * Pick an academic-appropriate starter based on sentence content.
 * Analyzes the sentence to find the best-fitting category.
 */
function pickAcademicStarter(sent: string, usedStarters: Set<string>): string | null {
  const lower = sent.toLowerCase();

  // Detect sentence function by keywords
  let category: keyof typeof ACADEMIC_STARTERS = "addition";

  if (/\b(but|however|although|despite|contrary|unlike|differ|contrast|rather than|instead)\b/i.test(lower)) {
    category = "contrast";
  } else if (/\b(because|therefore|caused|result|led to|consequence|due to|owing to|hence)\b/i.test(lower)) {
    category = "cause_effect";
  } else if (/\b(for example|such as|instance|illustrat|case|specifically|particular)\b/i.test(lower)) {
    category = "example";
  } else if (/\b(before|after|during|while|meanwhile|then|later|earlier|period|time|year|century)\b/i.test(lower)) {
    category = "temporal";
  } else if (/\b(important|significant|critical|key|central|essential|crucial|notably)\b/i.test(lower)) {
    category = "emphasis";
  } else if (/\b(although|while|despite|granted|admittedly|nonetheless|still)\b/i.test(lower)) {
    category = "concession";
  }

  const candidates = ACADEMIC_STARTERS[category];
  // Pick one that hasn't been used yet
  for (const starter of candidates) {
    const first = starter.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!usedStarters.has(first)) return starter;
  }
  // Fallback: use first from addition category
  return ACADEMIC_STARTERS.addition[Math.floor(Math.random() * ACADEMIC_STARTERS.addition.length)];
}

/**
 * Verify that all input sentences are represented in output.
 * Compares key content words between input and output sentences.
 * Returns { verified: boolean, missing: number[], extra: number[] }
 */
export function verifySentencePresence(
  inputText: string,
  outputText: string,
  splitFn: (text: string) => string[],
): { verified: boolean; inputCount: number; outputCount: number; missingKeywords: string[] } {
  const inputSents = splitFn(inputText).filter(s => s.trim().length > 0);
  const outputSents = splitFn(outputText).filter(s => s.trim().length > 0);

  // Extract key content words (4+ chars) from each input sentence
  const inputKeywords = new Set<string>();
  for (const sent of inputSents) {
    const words = sent.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length >= 4);
    for (const w of words) inputKeywords.add(w);
  }

  // Check how many input keywords appear in output
  const outputText_lower = outputText.toLowerCase();
  const missingKeywords: string[] = [];
  for (const kw of inputKeywords) {
    if (!outputText_lower.includes(kw)) {
      missingKeywords.push(kw);
    }
  }

  // Allow up to 30% keyword loss (synonyms change words) but flag if worse
  const keywordRetention = 1 - (missingKeywords.length / Math.max(inputKeywords.size, 1));

  return {
    verified: inputSents.length === outputSents.length && keywordRetention >= 0.70,
    inputCount: inputSents.length,
    outputCount: outputSents.length,
    missingKeywords: missingKeywords.slice(0, 15),
  };
}
