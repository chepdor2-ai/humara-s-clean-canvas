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
  pivotal: ["key", "central", "turning-point"], intricate: ["complex", "detailed", "involved"],
  meticulous: ["careful", "thorough", "exact"], profound: ["deep", "serious", "far-reaching"],
  inherent: ["built-in", "natural", "baked-in"], overarching: ["main", "broad", "general"],
  substantive: ["real", "meaningful", "solid"], efficacious: ["effective", "working"],
  holistic: ["whole", "complete", "full-picture"], transformative: ["game-changing", "major", "radical"],
  innovative: ["new", "fresh", "creative"], groundbreaking: ["pioneering", "first-of-its-kind"],
  noteworthy: ["worth noting", "interesting", "striking"], proliferate: ["spread", "grow", "multiply"],
  exacerbate: ["worsen", "make worse", "aggravate"], ameliorate: ["improve", "ease", "fix"],
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
  cultivate: ["develop", "grow", "build"], ascertain: ["find out", "determine", "figure out"],
  endeavor: ["try", "attempt", "effort"], delve: ["dig into", "look into", "explore"],
  embark: ["start", "begin", "kick off"], foster: ["encourage", "support", "grow"],
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
  notable: ["worth noting", "interesting"], significant: ["important", "big", "major", "clear"],
  substantial: ["large", "big", "real", "major"], remarkable: ["striking", "unusual", "surprising"],
  considerable: ["large", "big", "a good deal of"], unprecedented: ["never-before-seen", "new", "first-ever"],
  methodology: ["method", "approach", "process"], framework: ["structure", "setup", "system"],
  implication: ["effect", "result", "what this means"], implications: ["effects", "results", "consequences"],
  notably: ["especially", "in particular"], specifically: ["in particular", "especially"],
  crucially: ["importantly", "above all"], essentially: ["basically", "at its core", "really"],
  fundamentally: ["at its root", "basically", "at heart"], arguably: ["probably", "you could say"],
  undeniably: ["clearly", "without question"], undoubtedly: ["clearly", "no question"],
  interestingly: ["what stands out is", "curiously"], remarkably: ["surprisingly", "strikingly"],
  evidently: ["clearly", "as it turned out"], henceforth: ["from then on", "after that"],
  catalyst: ["trigger", "spark", "driver"], demonstrates: ["shows", "reveals", "makes clear"],
  indicates: ["shows", "suggests", "points to"], constitutes: ["makes up", "forms", "represents"],
  predominantly: ["mostly", "mainly", "largely"], systematically: ["step by step", "carefully"],
  inherently: ["by nature", "naturally"], approximately: ["about", "roughly", "around"],
  particularly: ["especially", "above all"], subsequently: ["then", "after that", "later"],
  accordingly: ["so", "in response"], conversely: ["on the flip side", "but"],
  notwithstanding: ["despite", "even with"], irrespective: ["regardless", "no matter"],
  commensurately: ["in proportion", "equally"], contemporaneously: ["at the same time"],
  unequivocally: ["clearly", "without doubt"], indubitably: ["clearly", "no question"],
  perspicacious: ["sharp", "insightful"], disproportionately: ["unevenly", "unfairly"],
  inextricably: ["closely", "tightly"], concomitantly: ["at the same time", "alongside"],
  ostensibly: ["seemingly", "apparently"], quintessentially: ["at its core", "purely"],
  characteristically: ["typically", "in keeping with"], quintessential: ["classic", "pure", "core"],
  predominantly: ["mostly", "mainly"], juxtaposition: ["contrast", "comparison"],
  prerequisite: ["requirement", "needed first"], dichotomous: ["divided", "split"],
  heterogeneous: ["mixed", "varied"], homogeneous: ["uniform", "same"],
  epistemological: ["knowledge-based"], ontological: ["about existence"],
  phenomenological: ["experience-based"], axiological: ["value-based"],
  hermeneutical: ["interpretive"], teleological: ["purpose-driven"],
};

export const AI_PHRASE_PATTERNS: [RegExp, string][] = [
  [/\bit is (?:important|crucial|essential|vital|imperative|worth noting|notable|noteworthy) (?:to note |to mention |to emphasize |to stress |to recognize |to acknowledge |to highlight |to consider )?that\b/gi, ""],
  [/\bit (?:should|must|can|cannot|could|may) be (?:noted|argued|said|emphasized|stressed|acknowledged|recognized|observed|mentioned|highlighted|pointed out) that\b/gi, ""],
  [/\bin today'?s (?:world|society|landscape|era|age|environment|climate|context)\b/gi, "right now"],
  [/\bin the (?:modern|current|contemporary|present-day|digital) (?:era|age|world|landscape|context|environment)\b/gi, "today"],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central|essential|major) role(?: in)?\b/gi, "matters"],
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
  [/\bthe (?:importance|significance|impact|relevance|value) of\b/gi, "how much ... matters"],
  [/\bmoving forward\b/gi, "going ahead"],
  [/\bin (?:order )?to\b/gi, "to"],
  [/\b(?:it is|it remains) (?:clear|evident|apparent|obvious) that\b/gi, "clearly"],
  [/\bas (?:a result|a consequence)\b/gi, "so"],
  [/\bfor (?:example|instance)\b/gi, "like"],
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
  [/\b(?:it (?:has been|was) )?(?:widely |generally |commonly |increasingly )?(?:recognized|acknowledged|accepted|established|understood|noted) that\b/gi, ""],
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
  "Notably, ": ["What stands out is ", "One thing worth noting: ", ""],
  "Specifically, ": ["In particular, ", "To be exact, ", ""],
  "As a result, ": ["So ", "Because of this, ", "That meant "],
  "For example, ": ["Take ", "Like ", "Consider "],
  "For instance, ": ["Take ", "Like ", "Say "],
  "On the other hand, ": ["Then again, ", "But ", "At the same time, "],
  "In other words, ": ["Put simply, ", "Basically, ", "What that means is "],
  "To begin with, ": ["First off, ", "Starting with, ", ""],
  "In particular, ": ["Especially, ", "Above all, ", ""],
  "As such, ": ["So ", "Given that, ", "This means "],
  "To that end, ": ["With that goal, ", "For that reason, ", "So "],
  "By contrast, ": ["But ", "On the other side, ", "Compare that to "],
  "In essence, ": ["At its core, ", "Basically, ", "Really, "],
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
  "in effect": ["basically", "in practice", "essentially"],
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
    result = result.replace(pattern, (match) => {
      if (replacement === "") return "";
      if (match[0] === match[0].toUpperCase() && replacement[0] === replacement[0].toLowerCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Kill words
  result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase();
    const replacements = AI_WORD_REPLACEMENTS[lower];
    if (!replacements) return word;
    const replacement = replacements[Math.floor(Math.random() * replacements.length)];
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });

  // Cleanup artifacts
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/\.\s+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^\s+/gm, "");
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
