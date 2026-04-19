/**
 * ai-signal-dictionary.ts
 * ───────────────────────────────────────────────────────────────────────
 * Shared source of truth for AI-signal detection + targeted cleanup.
 *
 * Powers:
 *   • Client-side per-sentence risk scoring (SentenceMeter, editor page)
 *   • Backend multi-detector (`perSentenceDetails`)
 *   • Nuru 2.0 deep clean + `stealthHumanizeTargeted`
 *   • Forensic cleanup for ZeroGPT / Turnitin / Originality / Copyleaks /
 *     GPTZero / Pangram / Surfer SEO / Scribbr / Winston
 *   • `/api/rehumanize-sentence` and `/api/deep-clean` endpoints
 *
 * This module is intentionally pure (no Node-only imports) so it can be
 * imported from both the Next.js server and the browser bundle.
 * ───────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════════
// 1. AI MARKER WORDS — 350+ terms real detectors flag as LLM-typical
// ══════════════════════════════════════════════════════════════════════

/** Words that appear disproportionately in LLM output. */
export const AI_MARKER_WORDS: Set<string> = new Set([
  // ── Academic / formal hedging & boosting ──
  "utilize", "utilise", "utilization", "utilisation", "leverage", "leveraged", "leveraging",
  "facilitate", "facilitates", "facilitated", "facilitating", "facilitation",
  "comprehensive", "comprehensively", "multifaceted", "multidimensional", "paramount",
  "furthermore", "moreover", "additionally", "consequently", "subsequently",
  "nevertheless", "notwithstanding", "aforementioned", "henceforth", "hereinafter",
  "heretofore", "hereby", "wherein", "whereby", "therein", "thereby", "thereof",
  "paradigm", "paradigmatic", "methodology", "methodologies", "methodological",
  "framework", "frameworks", "trajectory", "trajectories", "discourse", "discursive",
  "dichotomy", "dichotomies", "conundrum", "juxtaposition", "juxtaposed",
  "ramification", "ramifications", "underpinning", "underpinnings", "synergy", "synergies",
  "synergistic", "equilibrium", "equilibria", "hegemony", "hegemonic",
  "epistemology", "epistemological", "ontology", "ontological", "teleology",

  // ── Over-used AI adjectives ──
  "robust", "nuanced", "salient", "ubiquitous", "pivotal", "intricate", "intricately",
  "meticulous", "meticulously", "profound", "profoundly", "inherent", "inherently",
  "overarching", "substantive", "efficacious", "efficaciously", "holistic", "holistically",
  "transformative", "transformational", "innovative", "innovatively", "groundbreaking",
  "cutting-edge", "state-of-the-art", "noteworthy", "remarkable", "remarkably",
  "compelling", "compellingly", "striking", "strikingly", "profound", "palpable",
  "unprecedented", "unprecedentedly", "unparalleled", "unparalleled", "formidable",
  "exemplary", "quintessential", "preeminent", "seminal", "eminent", "prominent",
  "multitudinous", "manifold", "prolific", "prodigious", "resplendent",

  // ── Over-used AI verbs ──
  "proliferate", "proliferates", "proliferated", "proliferating", "proliferation",
  "exacerbate", "exacerbates", "exacerbated", "exacerbating", "exacerbation",
  "ameliorate", "ameliorates", "ameliorated", "ameliorating",
  "engender", "engenders", "engendered", "engendering",
  "promulgate", "promulgates", "promulgated", "promulgating",
  "delineate", "delineates", "delineated", "delineating",
  "elucidate", "elucidates", "elucidated", "elucidating", "elucidation",
  "illuminate", "illuminates", "illuminated", "illuminating",
  "necessitate", "necessitates", "necessitated", "necessitating",
  "perpetuate", "perpetuates", "perpetuated", "perpetuating",
  "culminate", "culminates", "culminated", "culminating", "culmination",
  "underscore", "underscores", "underscored", "underscoring",
  "exemplify", "exemplifies", "exemplified", "exemplifying",
  "encompass", "encompasses", "encompassed", "encompassing",
  "bolster", "bolsters", "bolstered", "bolstering",
  "catalyze", "catalyzes", "catalyzed", "catalyzing", "catalyse", "catalysed",
  "streamline", "streamlines", "streamlined", "streamlining",
  "optimize", "optimizes", "optimized", "optimizing", "optimization", "optimisation",
  "enhance", "enhances", "enhanced", "enhancing", "enhancement", "enhancements",
  "mitigate", "mitigates", "mitigated", "mitigating", "mitigation",
  "navigate", "navigates", "navigated", "navigating",
  "prioritize", "prioritizes", "prioritized", "prioritizing", "prioritisation",
  "articulate", "articulates", "articulated", "articulating",
  "substantiate", "substantiates", "substantiated", "substantiating",
  "corroborate", "corroborates", "corroborated", "corroborating",
  "disseminate", "disseminates", "disseminated", "disseminating",
  "cultivate", "cultivates", "cultivated", "cultivating",
  "ascertain", "ascertains", "ascertained", "ascertaining",
  "endeavor", "endeavors", "endeavored", "endeavoring", "endeavour",
  "delve", "delves", "delved", "delving",
  "embark", "embarks", "embarked", "embarking",
  "foster", "fosters", "fostered", "fostering",
  "harness", "harnesses", "harnessed", "harnessing",
  "spearhead", "spearheads", "spearheaded", "spearheading",
  "unravel", "unravels", "unravelled", "unravelling", "unraveled", "unraveling",
  "unveil", "unveils", "unveiled", "unveiling",
  "pivot", "pivots", "pivoted", "pivoting",
  "pioneer", "pioneers", "pioneered", "pioneering",
  "empower", "empowers", "empowered", "empowering",

  // ── Connector adverbs AI overuses ──
  "notably", "specifically", "crucially", "importantly", "significantly",
  "essentially", "fundamentally", "arguably", "undeniably", "undoubtedly",
  "interestingly", "remarkably", "evidently", "ultimately", "primarily",
  "particularly", "namely", "critically", "vitally", "manifestly",
  "indubitably", "unquestionably", "undeniably", "palpably", "overwhelmingly",

  // ── Abstract / filler nouns ──
  "implication", "implications", "realm", "landscape", "tapestry", "cornerstone",
  "bedrock", "linchpin", "catalyst", "nexus", "spectrum", "myriad", "plethora",
  "multitude", "influx", "surge", "hallmark", "tenet", "crux", "keystone",
  "kaleidoscope", "mosaic", "patchwork", "fabric", "pantheon", "echelon",
  "trove", "wellspring", "bastion", "vanguard", "forefront",

  // ── AI-tell vocabulary from ZeroGPT / Turnitin reports ──
  "effectively", "efficiently", "seamlessly", "seamless", "holistically",
  "strategically", "methodically", "rigorously", "proactively",
  "collaboratively", "contextually", "systematically",
  "dynamically", "iteratively", "pragmatically", "analytically",

  // ── "Enhance" family (flagged by Originality.ai heavily) ──
  "enrich", "enriches", "enriched", "enriching", "enrichment",
  "amplify", "amplifies", "amplified", "amplifying",
  "augment", "augments", "augmented", "augmenting",
  "reinforce", "reinforces", "reinforced", "reinforcing",
  "galvanize", "galvanizes", "galvanized", "galvanizing",

  // ── Surfer SEO / Copyleaks markers ──
  "ever-evolving", "ever-changing", "ever-growing", "fast-paced", "rapidly-changing",
  "modern-day", "present-day", "dominant", "predominant", "predominantly",
  "preeminent", "preeminently", "utmost", "paramount",

  // ── Pangram / research-tier markers ──
  "leverage", "synergy", "paradigm", "catalyst", "conduit",
  "modality", "modalities", "typology", "typologies",
  "stakeholder", "stakeholders", "lifecycle", "lifecycles",
]);

// ══════════════════════════════════════════════════════════════════════
// 2. AI PHRASE PATTERNS — 80+ regex patterns matched across detectors
// ══════════════════════════════════════════════════════════════════════

export interface PhrasePattern {
  readonly pattern: RegExp;
  /** Detector families most likely to flag this phrase. */
  readonly detectors: ReadonlyArray<DetectorName>;
  /** 0-1 weight: how strongly this signals AI when matched. */
  readonly weight: number;
}

export type DetectorName =
  | "zerogpt"
  | "turnitin"
  | "originality"
  | "copyleaks"
  | "gptzero"
  | "pangram"
  | "surfer"
  | "scribbr"
  | "winston";

export const AI_PHRASE_PATTERNS: ReadonlyArray<PhrasePattern> = [
  // ── "It is [important/crucial/...] to note that" family ──
  { pattern: /\bit is (?:important|crucial|essential|vital|imperative|worth noting|notable|noteworthy) (?:to (?:note|mention|emphasize|stress|recognize|acknowledge|highlight|consider|point out) )?that\b/i, detectors: ["turnitin", "originality", "copyleaks", "gptzero"], weight: 0.18 },
  { pattern: /\bit (?:should|must|can|may|will) be (?:noted|observed|mentioned|emphasized|argued|acknowledged|recognized|stressed) that\b/i, detectors: ["turnitin", "originality", "pangram"], weight: 0.16 },
  { pattern: /\bit is (?:clear|evident|obvious|apparent|well[- ]?known) that\b/i, detectors: ["zerogpt", "turnitin", "originality"], weight: 0.14 },
  { pattern: /\bthere is no doubt that\b/i, detectors: ["turnitin", "originality"], weight: 0.14 },
  { pattern: /\bit goes without saying that\b/i, detectors: ["zerogpt", "turnitin"], weight: 0.14 },
  { pattern: /\bit is widely (?:recognized|acknowledged|accepted|believed|understood) that\b/i, detectors: ["turnitin", "originality", "copyleaks"], weight: 0.15 },

  // ── "Plays a [adj] role" family ──
  { pattern: /\bplays? a (?:crucial|vital|important|significant|key|pivotal|critical|fundamental|instrumental|central|essential|major|indispensable) role\b/i, detectors: ["originality", "gptzero", "pangram", "copyleaks"], weight: 0.20 },
  { pattern: /\bserves? as a (?:crucial|vital|important|significant|key|pivotal|critical|fundamental|essential|testament|reminder|catalyst|cornerstone|foundation|beacon|symbol|conduit|bridge)\b/i, detectors: ["originality", "pangram", "copyleaks"], weight: 0.18 },
  { pattern: /\bstands? as a (?:testament|reminder|symbol|beacon|cornerstone)\b/i, detectors: ["originality", "pangram"], weight: 0.16 },
  { pattern: /\bacts? as a (?:catalyst|cornerstone|foundation|driving force|bridge|conduit)\b/i, detectors: ["originality", "pangram"], weight: 0.16 },
  { pattern: /\bfunctions? as a (?:critical|key|vital|central|cornerstone)\b/i, detectors: ["originality", "pangram"], weight: 0.14 },

  // ── "A wide range of" / "a plethora of" / "a myriad of" ──
  { pattern: /\ba (?:wide|broad|vast|diverse|rich|extensive|varied) (?:range|array|spectrum|variety|selection|gamut) of\b/i, detectors: ["zerogpt", "originality", "copyleaks", "pangram"], weight: 0.16 },
  { pattern: /\ba (?:plethora|myriad|multitude|wealth|host|litany|profusion|abundance|trove) of\b/i, detectors: ["originality", "copyleaks", "pangram"], weight: 0.17 },
  { pattern: /\bcountless (?:examples|instances|ways|possibilities|opportunities)\b/i, detectors: ["originality", "pangram"], weight: 0.12 },

  // ── "In today's [world/era/society/landscape]" family ──
  { pattern: /\bin today'?s (?:world|society|landscape|era|age|environment|climate|context|digital age|rapidly[- ]changing world|fast[- ]paced world)\b/i, detectors: ["zerogpt", "originality", "surfer", "copyleaks"], weight: 0.18 },
  { pattern: /\bin the (?:modern|current|contemporary|present|digital|information) (?:era|age|world|landscape|society|marketplace|workplace)\b/i, detectors: ["originality", "surfer", "copyleaks"], weight: 0.16 },
  { pattern: /\bin this (?:modern|digital|fast[- ]paced|ever[- ]changing|rapidly evolving) (?:era|age|world|landscape)\b/i, detectors: ["originality", "copyleaks", "pangram"], weight: 0.18 },

  // ── Purpose / connective filler ──
  { pattern: /\bin order to\b/i, detectors: ["zerogpt", "turnitin", "originality"], weight: 0.08 },
  { pattern: /\bdue to the fact that\b/i, detectors: ["turnitin", "originality"], weight: 0.13 },
  { pattern: /\bfor the purpose of\b/i, detectors: ["turnitin", "scribbr"], weight: 0.10 },
  { pattern: /\bwith the aim of\b/i, detectors: ["turnitin", "scribbr"], weight: 0.10 },
  { pattern: /\bin the context of\b/i, detectors: ["turnitin", "scribbr"], weight: 0.09 },
  { pattern: /\bwith (?:respect|regard) to\b/i, detectors: ["turnitin", "scribbr"], weight: 0.08 },
  { pattern: /\bon the basis of\b/i, detectors: ["turnitin", "scribbr"], weight: 0.08 },
  { pattern: /\bin light of\b/i, detectors: ["turnitin"], weight: 0.08 },
  { pattern: /\bin view of\b/i, detectors: ["turnitin"], weight: 0.08 },
  { pattern: /\bin terms of\b/i, detectors: ["turnitin", "scribbr"], weight: 0.08 },
  { pattern: /\bwith that in mind\b/i, detectors: ["zerogpt", "surfer"], weight: 0.10 },
  { pattern: /\bhaving said that\b/i, detectors: ["zerogpt", "surfer"], weight: 0.10 },
  { pattern: /\bthat being said\b/i, detectors: ["zerogpt", "surfer", "copyleaks"], weight: 0.11 },

  // ── Result / conclusion cliches ──
  { pattern: /\bas a result\b/i, detectors: ["zerogpt", "turnitin", "gptzero"], weight: 0.09 },
  { pattern: /\bin conclusion\b/i, detectors: ["turnitin", "gptzero", "scribbr"], weight: 0.12 },
  { pattern: /\bto summarize\b/i, detectors: ["turnitin", "gptzero"], weight: 0.12 },
  { pattern: /\bin summary\b/i, detectors: ["turnitin", "gptzero"], weight: 0.12 },
  { pattern: /\bat the end of the day\b/i, detectors: ["zerogpt", "copyleaks"], weight: 0.12 },
  { pattern: /\ball things considered\b/i, detectors: ["zerogpt"], weight: 0.10 },
  { pattern: /\btaken together\b/i, detectors: ["turnitin", "scribbr"], weight: 0.08 },

  // ── Balanced / Originality tells ──
  { pattern: /\bon the one hand\b.{3,120}?\bon the other hand\b/i, detectors: ["originality", "copyleaks"], weight: 0.14 },
  { pattern: /\bon the other hand\b/i, detectors: ["originality", "copyleaks"], weight: 0.10 },
  { pattern: /\bnot only .{5,80}? but also\b/i, detectors: ["originality", "pangram", "copyleaks"], weight: 0.15 },
  { pattern: /\beach and every\b/i, detectors: ["originality", "pangram"], weight: 0.11 },
  { pattern: /\bfirst and foremost\b/i, detectors: ["turnitin", "originality"], weight: 0.12 },
  { pattern: /\bby the same token\b/i, detectors: ["copyleaks"], weight: 0.10 },
  { pattern: /\bin the same vein\b/i, detectors: ["copyleaks"], weight: 0.10 },

  // ── "Research/studies have shown" paper cliches ──
  { pattern: /\b(?:research|studies|evidence|data|findings) (?:has|have) (?:shown|demonstrated|revealed|indicated|suggested|established) that\b/i, detectors: ["turnitin", "scribbr", "originality"], weight: 0.14 },
  { pattern: /\b(?:this|the|present|current) (?:study|paper|research|analysis|article|work|essay|report) (?:aims|seeks|attempts|endeavors|intends|will) to\b/i, detectors: ["turnitin", "scribbr", "originality"], weight: 0.18 },
  { pattern: /\b(?:this|the) (?:paper|essay|study|article) (?:will|is going to) (?:discuss|examine|explore|investigate|analyze|analyse|present|outline|address)\b/i, detectors: ["turnitin", "scribbr", "originality"], weight: 0.16 },

  // ── "Delve into" / "dive into" ──
  { pattern: /\b(?:delve|dive|embark) (?:deep|deeply )?into\b/i, detectors: ["originality", "pangram", "gptzero"], weight: 0.16 },
  { pattern: /\bshed(?:ding|s)? light on\b/i, detectors: ["originality", "pangram"], weight: 0.14 },
  { pattern: /\bpave(?:s|d)? the way for\b/i, detectors: ["originality", "pangram", "copyleaks"], weight: 0.15 },
  { pattern: /\bgive(?:s)? rise to\b/i, detectors: ["turnitin", "originality"], weight: 0.10 },
  { pattern: /\bunlock(?:s|ed|ing)? the (?:potential|power|secrets|mysteries|key) of\b/i, detectors: ["originality", "copyleaks", "pangram"], weight: 0.17 },
  { pattern: /\bharness(?:es|ed|ing)? the (?:power|potential|capabilities|strength) of\b/i, detectors: ["originality", "pangram"], weight: 0.16 },
  { pattern: /\btap(?:s|ped|ping)? into the (?:power|potential) of\b/i, detectors: ["originality", "pangram"], weight: 0.15 },

  // ── "X is a key/important/vital ingredient" structural ──
  { pattern: /\b(?:is|are|remains?|constitutes?) (?:a|an|the) (?:critical|crucial|vital|important|key|essential|pivotal|central) (?:tool|mechanism|framework|foundation|component|ingredient|factor|driver|element)\b/i, detectors: ["originality", "pangram", "copyleaks"], weight: 0.16 },
  { pattern: /\bat the (?:core|heart|forefront) of\b/i, detectors: ["originality", "pangram"], weight: 0.13 },
  { pattern: /\bat the intersection of\b/i, detectors: ["pangram"], weight: 0.14 },

  // ── "Navigate the complexities" / "navigating" ──
  { pattern: /\b(?:navigate|navigating) (?:the )?(?:complex(?:ities)?|challenges?|intricacies|landscape|terrain|waters?)\b/i, detectors: ["originality", "pangram", "copyleaks"], weight: 0.17 },
  { pattern: /\bthe complexities of\b/i, detectors: ["originality", "copyleaks"], weight: 0.12 },
  { pattern: /\bthe intricacies of\b/i, detectors: ["originality", "pangram"], weight: 0.13 },

  // ── "This highlights / underscores / emphasizes" closers ──
  { pattern: /\bthis (?:highlights|underscores|emphasizes|demonstrates|illustrates|exemplifies|reinforces) the (?:importance|need|significance|value|role|fact)\b/i, detectors: ["originality", "pangram", "copyleaks"], weight: 0.16 },
  { pattern: /\bultimately (?:leads|leading) to\b/i, detectors: ["gptzero", "originality"], weight: 0.12 },
  { pattern: /\bultimately (?:drives|driving|shaping|transforming)\b/i, detectors: ["gptzero", "originality"], weight: 0.12 },

  // ── Turnitin-flavoured academic filler ──
  { pattern: /\bin the ever[- ](?:evolving|changing|growing) (?:landscape|world|field|realm|environment)\b/i, detectors: ["turnitin", "originality", "pangram"], weight: 0.18 },
  { pattern: /\bat an unprecedented (?:pace|rate|scale|level)\b/i, detectors: ["originality", "pangram"], weight: 0.14 },
  { pattern: /\bhas (?:gained|garnered|received|attracted) (?:significant|considerable|substantial|growing|increasing) (?:attention|interest|focus|traction|momentum)\b/i, detectors: ["originality", "pangram", "copyleaks"], weight: 0.18 },

  // ── Copyleaks specific fluff ──
  { pattern: /\bit is widely (?:used|utilized|accepted|understood) (?:in|for|to)\b/i, detectors: ["copyleaks", "turnitin"], weight: 0.14 },
  { pattern: /\bwhich contributes? to (?:better|improved|enhanced|greater|stronger|more effective)\b/i, detectors: ["copyleaks", "originality"], weight: 0.13 },
  { pattern: /\bprovides? (?:a|an)? (?:comprehensive|holistic|thorough|in[- ]depth) (?:overview|understanding|analysis|examination)\b/i, detectors: ["copyleaks", "turnitin"], weight: 0.17 },

  // ── "When it comes to" / "with regard to" modern ──
  { pattern: /\bwhen it comes to\b/i, detectors: ["zerogpt", "copyleaks"], weight: 0.12 },
  { pattern: /\bin the grand scheme of things\b/i, detectors: ["zerogpt", "copyleaks"], weight: 0.13 },
  { pattern: /\bneedless to say\b/i, detectors: ["zerogpt", "copyleaks"], weight: 0.12 },

  // ── "As technology advances" / "as we move forward" ──
  { pattern: /\bas (?:technology|the world|society|we) (?:advance|advances|progress|progresses|evolve|evolves|move forward)\b/i, detectors: ["originality", "copyleaks", "pangram"], weight: 0.14 },
  { pattern: /\bmoving forward\b/i, detectors: ["zerogpt", "originality"], weight: 0.10 },
  { pattern: /\bgoing forward\b/i, detectors: ["zerogpt", "originality"], weight: 0.10 },

  // ── "A testament to" / "a symbol of" ──
  { pattern: /\b(?:is|are|stands? as|serves? as)? a testament to\b/i, detectors: ["originality", "pangram"], weight: 0.15 },
  { pattern: /\ba symbol of\b/i, detectors: ["originality", "copyleaks"], weight: 0.09 },

  // ── Surfer-SEO keyword-heavy patterns ──
  { pattern: /\bthe (?:ultimate|definitive|comprehensive|essential) guide to\b/i, detectors: ["surfer", "pangram", "copyleaks"], weight: 0.18 },
  { pattern: /\beverything you need to know (?:about|regarding)\b/i, detectors: ["surfer", "copyleaks"], weight: 0.18 },
  { pattern: /\ba (?:must[- ]have|must[- ]read|must[- ]know)\b/i, detectors: ["surfer", "copyleaks"], weight: 0.15 },
];

// ══════════════════════════════════════════════════════════════════════
// 3. AI SENTENCE STARTERS — openings LLMs overproduce
// ══════════════════════════════════════════════════════════════════════

export const AI_SENTENCE_STARTERS: ReadonlyArray<string> = [
  // Connectors
  "furthermore,", "moreover,", "additionally,", "consequently,", "subsequently,",
  "nevertheless,", "notwithstanding,", "accordingly,", "thus,", "hence,",
  "therefore,", "indeed,", "notably,", "specifically,", "crucially,",
  "importantly,", "essentially,", "fundamentally,", "arguably,", "undeniably,",
  "undoubtedly,", "interestingly,", "remarkably,", "evidently,", "ultimately,",
  // "It is X" openings
  "it is important", "it is crucial", "it is essential", "it is worth noting",
  "it is worth mentioning", "it is worth highlighting", "it should be noted",
  "it must be noted", "it can be argued", "it can be seen", "it is clear",
  "it is evident", "it is apparent", "it is obvious", "it stands to reason",
  // "One of the X" openings
  "one of the most", "one of the key", "one of the main", "one of the primary",
  "one of the greatest", "one of the biggest", "one of the major",
  // "In today's" / "In the modern"
  "in today's", "in the modern", "in the current", "in the contemporary",
  "in the digital age", "in this digital age", "in the 21st century",
  // Paper / essay openers
  "this essay", "this paper", "this study", "this article", "this analysis",
  "this research", "this report", "this work", "the purpose of",
  "the aim of", "the goal of",
  // Conclusion
  "in conclusion,", "in summary,", "to summarize,", "to conclude,", "in closing,",
  "as a result,", "in the end,", "at the end of the day,",
  // Example openers
  "for example,", "for instance,", "as an example,", "to illustrate,",
  "on the other hand,", "in other words,", "put simply,", "simply put,",
  "to put it simply,",
  // Generic AI openers
  "there are several", "there are many", "there are numerous",
  "when it comes to", "when we look at", "looking at", "given that",
  "having said that,", "that being said,", "with that in mind,",
  // Temporal
  "in recent years,", "over the past", "over the last", "throughout history,",
  "since the dawn of", "for centuries,",
];

// ══════════════════════════════════════════════════════════════════════
// 4. FORMAL LINKING WORDS — mid-sentence connectors LLMs abuse
// ══════════════════════════════════════════════════════════════════════

export const FORMAL_LINKING_WORDS: Set<string> = new Set([
  "however", "therefore", "furthermore", "moreover", "consequently",
  "additionally", "conversely", "similarly", "specifically", "particularly",
  "notably", "indeed", "essentially", "fundamentally", "accordingly",
  "thus", "hence", "subsequently", "likewise", "correspondingly",
  "instead", "alternatively", "meanwhile", "nonetheless", "nevertheless",
  "undoubtedly", "undeniably", "ultimately", "crucially", "importantly",
]);

// ══════════════════════════════════════════════════════════════════════
// 5. FUNCTION WORDS (for function-word-ratio analysis)
// ══════════════════════════════════════════════════════════════════════

export const FUNCTION_WORDS: Set<string> = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "and", "but", "or",
  "nor", "for", "yet", "so", "in", "on", "at", "to", "from", "by",
  "with", "of", "as", "if", "then", "than", "that", "this", "these",
  "those", "not", "no", "also", "such", "each", "both", "all", "which",
  "who", "whom", "whose", "what", "where", "when", "how", "why", "it",
  "its", "i", "me", "my", "we", "us", "our", "you", "your", "he",
  "him", "his", "she", "her", "they", "them", "their", "about", "into",
  "through", "during", "before", "after", "above", "below", "between",
  "under", "more", "most", "other", "some", "any", "only", "very",
  "too", "just", "own", "same", "up", "down", "out", "off", "over",
  "there", "here", "now", "then", "still",
]);

// ══════════════════════════════════════════════════════════════════════
// 6. AI WORD → NATURAL REPLACEMENT MAP (used by targeted cleanup)
// Keep this lean; full replacement coverage lives in shared-dictionaries.ts
// ══════════════════════════════════════════════════════════════════════

export const AI_WORD_NATURAL_REPLACEMENTS: Record<string, string[]> = {
  utilize: ["use"], utilise: ["use"],
  leverage: ["use", "draw on", "rely on", "tap"],
  facilitate: ["help", "support", "allow", "ease"],
  comprehensive: ["broad", "full", "thorough", "complete"],
  multifaceted: ["many-sided", "complex", "varied"],
  paramount: ["key", "top", "central"],
  furthermore: ["also", "on top of that", "plus"],
  moreover: ["also", "besides", "in addition"],
  additionally: ["also", "on top of that", "besides"],
  consequently: ["so", "as a result", "therefore"],
  subsequently: ["later", "after that", "then"],
  nevertheless: ["still", "even so", "yet"],
  notwithstanding: ["even so", "still", "despite this"],
  aforementioned: ["earlier", "mentioned", "noted"],
  paradigm: ["model", "approach", "pattern"],
  methodology: ["method", "approach", "process"],
  framework: ["structure", "approach", "setup"],
  trajectory: ["path", "course", "direction"],
  discourse: ["debate", "talk", "discussion"],
  robust: ["strong", "solid", "sturdy"],
  nuanced: ["subtle", "detailed", "careful"],
  salient: ["key", "notable", "clear"],
  ubiquitous: ["common", "widespread", "everywhere"],
  pivotal: ["key", "central", "important"],
  intricate: ["complex", "detailed", "tangled"],
  meticulous: ["careful", "thorough", "precise"],
  profound: ["deep", "strong", "far-reaching"],
  inherent: ["built-in", "natural", "basic"],
  overarching: ["main", "overall", "broader"],
  substantive: ["real", "meaningful", "solid"],
  efficacious: ["effective", "useful", "works"],
  holistic: ["whole", "full", "complete"],
  transformative: ["major", "far-reaching", "big"],
  innovative: ["new", "fresh", "creative"],
  groundbreaking: ["new", "first", "pioneering"],
  noteworthy: ["notable", "worth noting", "significant"],
  proliferate: ["spread", "grow", "multiply"],
  exacerbate: ["worsen", "deepen", "aggravate"],
  ameliorate: ["improve", "ease", "reduce"],
  engender: ["cause", "create", "lead to"],
  delineate: ["outline", "describe", "map out"],
  elucidate: ["explain", "clarify", "make clear"],
  illuminate: ["show", "reveal", "clarify"],
  necessitate: ["require", "need", "call for"],
  perpetuate: ["keep going", "sustain", "prolong"],
  culminate: ["end in", "result in", "lead to"],
  underscore: ["show", "stress", "highlight"],
  exemplify: ["show", "illustrate", "prove"],
  encompass: ["cover", "include", "span"],
  bolster: ["strengthen", "back up", "support"],
  catalyze: ["spark", "trigger", "cause"],
  streamline: ["simplify", "tighten", "smooth out"],
  optimize: ["improve", "fine-tune", "boost"],
  enhance: ["improve", "boost", "raise"],
  mitigate: ["reduce", "soften", "limit"],
  navigate: ["handle", "work through", "manage"],
  prioritize: ["rank", "focus on", "put first"],
  articulate: ["express", "state", "put into words"],
  substantiate: ["prove", "back up", "support"],
  corroborate: ["confirm", "back up", "support"],
  disseminate: ["share", "spread", "distribute"],
  cultivate: ["build", "grow", "develop"],
  ascertain: ["find out", "confirm", "check"],
  endeavor: ["try", "aim", "work"],
  delve: ["look into", "explore", "dig into"],
  embark: ["start", "begin", "set out"],
  foster: ["support", "build", "nurture"],
  harness: ["use", "tap", "put to use"],
  spearhead: ["lead", "head up", "drive"],
  unravel: ["work out", "untangle", "solve"],
  unveil: ["reveal", "show", "present"],
  notably: ["in particular", "especially", "namely"],
  specifically: ["in particular", "namely", "that is"],
  crucially: ["importantly", "key"],
  importantly: ["notably", "key", "worth noting"],
  significantly: ["greatly", "a lot", "considerably"],
  essentially: ["basically", "in short", "at core"],
  fundamentally: ["basically", "at root", "at core"],
  arguably: ["perhaps", "possibly", "maybe"],
  undeniably: ["clearly", "plainly", "truly"],
  undoubtedly: ["clearly", "surely", "for sure"],
  interestingly: ["notably", "oddly", "curiously"],
  remarkably: ["notably", "surprisingly"],
  evidently: ["clearly", "obviously", "plainly"],
  ultimately: ["in the end", "finally", "eventually"],
  implication: ["meaning", "effect", "consequence"],
  implications: ["effects", "consequences", "meanings"],
  realm: ["area", "field", "world"],
  landscape: ["scene", "field", "picture"],
  tapestry: ["mix", "blend", "weave"],
  cornerstone: ["foundation", "pillar", "basis"],
  bedrock: ["foundation", "base", "core"],
  linchpin: ["key part", "anchor"],
  catalyst: ["trigger", "driver", "spark"],
  nexus: ["link", "meeting point", "connection"],
  spectrum: ["range", "span"],
  myriad: ["many", "countless", "lots of"],
  plethora: ["many", "lots of", "abundance"],
  multitude: ["many", "lots of"],
  seamlessly: ["smoothly", "cleanly", "easily"],
  seamless: ["smooth", "clean", "effortless"],
  "ever-evolving": ["changing", "evolving", "shifting"],
  "ever-changing": ["changing", "shifting"],
  "cutting-edge": ["modern", "advanced", "up-to-date"],
  "state-of-the-art": ["advanced", "modern", "top"],
};

// ══════════════════════════════════════════════════════════════════════
// 7. PER-DETECTOR SCORING WEIGHTS (used when ranking flags per detector)
// ══════════════════════════════════════════════════════════════════════

export const DETECTOR_WEIGHT: Record<DetectorName, number> = {
  zerogpt: 1.0,
  turnitin: 1.15,
  originality: 1.20,
  copyleaks: 1.10,
  gptzero: 1.05,
  pangram: 1.25,
  surfer: 0.95,
  scribbr: 0.95,
  winston: 1.00,
};

// ══════════════════════════════════════════════════════════════════════
// 8. SHARED PERSONAL-PRONOUN SET
// ══════════════════════════════════════════════════════════════════════

export const PERSONAL_PRONOUNS: Set<string> = new Set([
  "i", "we", "you", "my", "me", "your", "our", "us", "myself", "ourselves", "yours",
]);

// ══════════════════════════════════════════════════════════════════════
// 9. SENTENCE-LEVEL DEEP SCORER
// Returns detailed flags — used for both UI and targeted cleanup.
// ══════════════════════════════════════════════════════════════════════

export interface SentenceSignalReport {
  /** AI risk score in [0, 1]. */
  score: number;
  /** AI risk score in [0, 100] for UI display. */
  scorePct: number;
  /** Matched marker words (lowercased, unique). */
  flaggedWords: string[];
  /** Matched AI phrases (raw substring matches, unique). */
  flaggedPhrases: string[];
  /** Matched starter prefix (if any). */
  flaggedStarter: string | null;
  /** Which detectors likely flag this sentence. */
  likelyDetectors: DetectorName[];
}

const EMPTY_REPORT: SentenceSignalReport = {
  score: 0,
  scorePct: 0,
  flaggedWords: [],
  flaggedPhrases: [],
  flaggedStarter: null,
  likelyDetectors: [],
};

/**
 * Deep per-sentence AI-signal scorer.
 * Combines 11 signals ported from the backend `perSentenceDetails()` with
 * the detailed flag-collection used by targeted humanization.
 */
export function scoreSentenceDeep(sentence: string): SentenceSignalReport {
  const trimmed = (sentence ?? "").trim();
  if (!trimmed) return { ...EMPTY_REPORT };

  const lower = trimmed.toLowerCase();
  const words = lower.match(/[a-z']+/g) ?? [];
  if (words.length < 3) {
    return { ...EMPTY_REPORT, score: 0.05, scorePct: 5 };
  }

  const flaggedWordsSet = new Set<string>();
  const flaggedPhrasesSet = new Set<string>();
  const detectorHits = new Map<DetectorName, number>();
  let flaggedStarter: string | null = null;
  let score = 0;

  // 1. AI sentence starters (+0.20)
  for (const s of AI_SENTENCE_STARTERS) {
    if (lower.startsWith(s)) {
      score += 0.20;
      flaggedStarter = s;
      // Most starters flag GPTZero + Turnitin
      detectorHits.set("gptzero", (detectorHits.get("gptzero") ?? 0) + 1);
      detectorHits.set("turnitin", (detectorHits.get("turnitin") ?? 0) + 1);
      break;
    }
  }

  // 2. AI marker-word density (+ up to 0.22)
  let markerCount = 0;
  for (const w of words) {
    if (AI_MARKER_WORDS.has(w)) {
      markerCount++;
      flaggedWordsSet.add(w);
    }
  }
  const markerDensity = markerCount / words.length;
  score += Math.min(markerDensity * 5.0, 0.22);
  if (markerCount > 0) {
    detectorHits.set("originality", (detectorHits.get("originality") ?? 0) + markerCount);
    detectorHits.set("copyleaks", (detectorHits.get("copyleaks") ?? 0) + markerCount);
    detectorHits.set("pangram", (detectorHits.get("pangram") ?? 0) + Math.ceil(markerCount / 2));
  }

  // 3. Word-length CV < 0.35 = uniform = AI-like (+0.12)
  const wLens = words.map(w => w.length);
  const wMean = wLens.reduce((a, b) => a + b, 0) / wLens.length;
  const wStd = Math.sqrt(wLens.reduce((a, x) => a + (x - wMean) ** 2, 0) / wLens.length);
  if (wMean > 0 && wStd / wMean < 0.35) {
    score += 0.12;
    detectorHits.set("gptzero", (detectorHits.get("gptzero") ?? 0) + 1);
  }

  // 4. AI sweet-spot length 13–30 words (+0.10)
  if (words.length >= 13 && words.length <= 30) {
    score += 0.10;
  }

  // 5. Function-word ratio 0.35–0.55 (+0.10)
  const fwRatio = words.filter(w => FUNCTION_WORDS.has(w)).length / words.length;
  if (fwRatio >= 0.35 && fwRatio <= 0.55) {
    score += 0.10;
    detectorHits.set("turnitin", (detectorHits.get("turnitin") ?? 0) + 1);
  }

  // 6. Phrase pattern matches (+ weighted by rule)
  for (const rule of AI_PHRASE_PATTERNS) {
    const m = trimmed.match(rule.pattern);
    if (m) {
      score += rule.weight;
      flaggedPhrasesSet.add(m[0].toLowerCase());
      for (const d of rule.detectors) {
        detectorHits.set(d, (detectorHits.get(d) ?? 0) + 1);
      }
    }
  }

  // 7. No contractions = formal = AI-like (+0.03)
  if (!words.some(w => w.includes("'"))) score += 0.03;

  // 8. Formal linking word present (+0.10)
  if (words.some(w => FORMAL_LINKING_WORDS.has(w))) {
    score += 0.10;
    detectorHits.set("turnitin", (detectorHits.get("turnitin") ?? 0) + 1);
  }

  // 9. No first/second-person pronouns (+0.02)
  if (!words.some(w => PERSONAL_PRONOUNS.has(w))) score += 0.02;

  // 10. Bigram repetition within sentence (+0.08)
  {
    const seenBi = new Set<string>();
    let biRepeat = false;
    for (let j = 0; j < words.length - 1; j++) {
      const bi = words[j] + " " + words[j + 1];
      if (seenBi.has(bi)) { biRepeat = true; break; }
      seenBi.add(bi);
    }
    if (biRepeat) score += 0.08;
  }

  // 11. Average word length in 4.5–6.0 sweet-spot (+0.06)
  const avgWL = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (avgWL >= 4.5 && avgWL <= 6.0) score += 0.06;

  // 12. Adverb-first pattern (+0.05)
  if (/^[a-z]+ly,/i.test(lower)) {
    score += 0.05;
    detectorHits.set("zerogpt", (detectorHits.get("zerogpt") ?? 0) + 1);
  }

  // 13. Passive voice (+0.04)
  if (/\b(is|are|was|were|been|being)\s+(being\s+)?\w+(ed|en)\b/i.test(trimmed)) {
    score += 0.04;
    detectorHits.set("turnitin", (detectorHits.get("turnitin") ?? 0) + 1);
  }

  const normalized = Math.min(1, Math.max(0, score));
  const likelyDetectors: DetectorName[] = [...detectorHits.entries()]
    .filter(([, hits]) => hits > 0)
    .sort((a, b) => (b[1] * DETECTOR_WEIGHT[b[0]]) - (a[1] * DETECTOR_WEIGHT[a[0]]))
    .map(([name]) => name);

  return {
    score: normalized,
    scorePct: Math.round(normalized * 100),
    flaggedWords: [...flaggedWordsSet].slice(0, 12),
    flaggedPhrases: [...flaggedPhrasesSet].slice(0, 6),
    flaggedStarter,
    likelyDetectors,
  };
}

/**
 * Shortcut: return only the score in [0,1]. Keeps API compatibility with
 * legacy callers like `sentenceRisk(sentence)`.
 */
export function scoreSentenceSimple(sentence: string): number {
  return scoreSentenceDeep(sentence).score;
}

/**
 * Utility: classify a sentence into a risk band for UI coloring.
 * Thresholds intentionally match the SentenceMeter.
 */
export type RiskBand = "ai-free" | "watch" | "flagged";

export function classifyRisk(score: number): RiskBand {
  if (score <= 0.35) return "ai-free";
  if (score <= 0.60) return "watch";
  return "flagged";
}

// ══════════════════════════════════════════════════════════════════════
// 10. DOCUMENT-LEVEL FLAG COLLECTION
// Gathers per-sentence flags for iterative deep clean.
// ══════════════════════════════════════════════════════════════════════

export interface DocumentFlagReport {
  sentences: Array<{
    index: number;
    text: string;
    report: SentenceSignalReport;
  }>;
  overallScore: number;
  overallScorePct: number;
  flaggedCount: number;
  watchCount: number;
  cleanCount: number;
  /** Unique flagged words across the whole document. */
  flaggedWords: string[];
  /** Unique flagged phrases across the whole document. */
  flaggedPhrases: string[];
}

export function analyzeDocument(
  sentences: ReadonlyArray<string>,
): DocumentFlagReport {
  const reports = sentences.map((text, index) => ({
    index,
    text,
    report: scoreSentenceDeep(text),
  }));

  const scored = reports.filter(r => r.text.trim().split(/\s+/).filter(Boolean).length >= 3);
  const overallScore = scored.length === 0
    ? 0
    : scored.reduce((a, r) => a + r.report.score, 0) / scored.length;

  const wordSet = new Set<string>();
  const phraseSet = new Set<string>();
  let flaggedCount = 0;
  let watchCount = 0;
  let cleanCount = 0;
  for (const r of reports) {
    const band = classifyRisk(r.report.score);
    if (band === "flagged") flaggedCount++;
    else if (band === "watch") watchCount++;
    else cleanCount++;
    for (const w of r.report.flaggedWords) wordSet.add(w);
    for (const p of r.report.flaggedPhrases) phraseSet.add(p);
  }

  return {
    sentences: reports,
    overallScore,
    overallScorePct: Math.round(overallScore * 100),
    flaggedCount,
    watchCount,
    cleanCount,
    flaggedWords: [...wordSet],
    flaggedPhrases: [...phraseSet],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 11. TONE CONFIGURATION — including the new `academic_blog`
// ══════════════════════════════════════════════════════════════════════

export type ToneId =
  | "neutral"
  | "academic"
  | "academic_blog"
  | "professional"
  | "casual"
  | "simple";

export interface ToneSettings {
  readonly id: ToneId;
  readonly label: string;
  readonly description: string;
  /** Always expand contractions? (true for formal tones) */
  readonly expandContractions: boolean;
  /** Allow adding light contractions to humanize cadence? */
  readonly allowContractions: boolean;
  /** First-person pronouns permitted in output? */
  readonly allowFirstPerson: boolean;
  /** Maximum sentence length before considered fatiguing. */
  readonly maxSentenceLength: number;
  /** Preferred sentence openers to rotate in (kept concise). */
  readonly openers: ReadonlyArray<string>;
  /** Keep long Latinate vocabulary (academic terms) or prefer plain English. */
  readonly preserveLatinate: boolean;
}

export const TONE_SETTINGS: Record<ToneId, ToneSettings> = {
  neutral: {
    id: "neutral",
    label: "Natural",
    description: "Balanced, easy-to-read prose with human cadence.",
    expandContractions: false,
    allowContractions: true,
    allowFirstPerson: true,
    maxSentenceLength: 28,
    openers: ["Also,", "Besides,", "On top of that,", "Another point is that", "What is more,"],
    preserveLatinate: false,
  },
  academic: {
    id: "academic",
    label: "Academic",
    description: "Formal, citation-ready prose with scholarly register.",
    expandContractions: true,
    allowContractions: false,
    allowFirstPerson: false,
    maxSentenceLength: 34,
    openers: [
      "Notably,", "In this regard,", "This suggests that", "As shown,",
      "The evidence indicates that", "Consider the fact that",
    ],
    preserveLatinate: true,
  },
  academic_blog: {
    id: "academic_blog",
    label: "Academic Blog",
    description: "Scholarly credibility with a readable, blog-style rhythm — citations welcome, jargon trimmed.",
    expandContractions: false,
    allowContractions: true,
    allowFirstPerson: true,
    maxSentenceLength: 26,
    openers: [
      "Here is the thing:",
      "Think about it this way:",
      "What research shows is",
      "To put this plainly,",
      "The short version is",
      "Looking at the evidence,",
      "A closer look reveals",
    ],
    preserveLatinate: false,
  },
  professional: {
    id: "professional",
    label: "Business",
    description: "Polished business register — direct, no fluff.",
    expandContractions: true,
    allowContractions: false,
    allowFirstPerson: false,
    maxSentenceLength: 28,
    openers: ["In practice,", "Beyond this,", "From this standpoint,", "For teams,"],
    preserveLatinate: true,
  },
  casual: {
    id: "casual",
    label: "Conversational",
    description: "Friendly, everyday voice with contractions and shorter beats.",
    expandContractions: false,
    allowContractions: true,
    allowFirstPerson: true,
    maxSentenceLength: 24,
    openers: ["So,", "Now,", "Here is the thing —", "What is interesting is", "Basically,", "Look,"],
    preserveLatinate: false,
  },
  simple: {
    id: "simple",
    label: "Direct",
    description: "Short sentences, plain English, minimal filler.",
    expandContractions: false,
    allowContractions: false,
    allowFirstPerson: true,
    maxSentenceLength: 20,
    openers: [],
    preserveLatinate: false,
  },
};

/** Normalize an arbitrary tone string into a known `ToneId`. */
export function resolveTone(tone?: string | null): ToneSettings {
  if (!tone) return TONE_SETTINGS.neutral;
  const key = tone.toLowerCase().replace(/[\s-]+/g, "_");
  // Blog-style academic aliases
  if (key === "academic_blog" || key === "blog_academic" || key === "blog") {
    return TONE_SETTINGS.academic_blog;
  }
  // Legacy aliases
  if (key === "direct") return TONE_SETTINGS.simple;
  if (key === "wikipedia") return TONE_SETTINGS.academic;
  // Direct ToneId match
  if (isToneId(key) && TONE_SETTINGS[key]) return TONE_SETTINGS[key];
  return TONE_SETTINGS.neutral;
}

function isToneId(value: string): value is ToneId {
  return (
    value === "neutral" ||
    value === "academic" ||
    value === "academic_blog" ||
    value === "professional" ||
    value === "casual" ||
    value === "simple"
  );
}

// ══════════════════════════════════════════════════════════════════════
// 12. FLAGGED-WORD → NATURAL REPLACEMENT HELPER
// Used by targeted cleanup; falls back to the AI_WORD_NATURAL_REPLACEMENTS
// ══════════════════════════════════════════════════════════════════════

/** Returns a natural-English replacement for a flagged word, or null. */
export function naturalReplacementFor(word: string): string | null {
  const lower = word.toLowerCase();
  const list = AI_WORD_NATURAL_REPLACEMENTS[lower];
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}
