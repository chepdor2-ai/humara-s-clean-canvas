/**
 * Ghost Pro Engine v3 — Detector-Beating Humanization Pipeline
 * =============================================================
 *
 * PHILOSOPHY: Beat ALL 22 AI detectors to near 0% AI score.
 *
 * The pipeline has two passes:
 *   PASS 1 (LLM): Deep rewrite with extreme human-writing characteristics
 *   PASS 2 (non-LLM): Aggressive statistical post-processing that targets
 *           each of the 20 detector signals individually
 *
 * The non-LLM pass analyzes the LLM output against our internal detector,
 * identifies which signals are still scoring as AI, and applies targeted
 * fixes to push each signal into the human range.
 */

import OpenAI from "openai";
import { sentTokenize } from "./utils";
import { expandContractions } from "./advanced-transforms";
import { protectSpecialContent, restoreSpecialContent } from "./content-protection";
import { semanticSimilaritySync } from "./semantic-guard";
import { TextSignals } from "./multi-detector";

// ── Config ──

const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-4o";

// ── OpenAI client singleton ──

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not set.");
  _client = new OpenAI({ apiKey });
  return _client;
}

async function llmCall(system: string, user: string, temperature: number): Promise<string> {
  const client = getClient();
  const r = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens: 4096,
  });
  return r.choices[0]?.message?.content?.trim() ?? "";
}

// ── Input Feature Detection ──

interface InputFeatures {
  hasContractions: boolean;
  hasFirstPerson: boolean;
  avgSentenceLength: number;
  paragraphCount: number;
  wordCount: number;
}

function detectInputFeatures(text: string): InputFeatures {
  const contractionRe = /\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|it's|that's|there's|here's|he's|she's|they're|we're|you're|I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|he'll|she'll|it'll|let's|who's|what's)\b/gi;
  const firstPersonRe = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/;
  const sentences = sentTokenize(text);
  const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);

  return {
    hasContractions: contractionRe.test(text),
    hasFirstPerson: firstPersonRe.test(text),
    avgSentenceLength: sentences.length > 0 ? totalWords / sentences.length : 15,
    paragraphCount: text.split(/\n\s*\n/).filter(p => p.trim()).length,
    wordCount: totalWords,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PASS 1: LLM DEEP REWRITE — Tuned to produce pre-2000 human-style prose
// ══════════════════════════════════════════════════════════════════════════

const GHOST_PRO_SYSTEM = `You are ghostwriting as a real human author. Your job: rewrite text so it reads exactly like a person wrote it by hand — messy rhythm, personal quirks, uneven pacing. Think of how columnists from the 1990s or early-2000s bloggers wrote: direct, sometimes clumsy, never polished to a robotic sheen.

ABSOLUTE REQUIREMENTS — these are non-negotiable:

1. EXTREME SENTENCE LENGTH VARIATION (the single most important rule):
   You MUST create a wild mix of sentence lengths in EVERY paragraph. This is what separates human from AI writing.
   - Include at least 2 very short sentences per paragraph (4-9 words). Examples:
     "That changed everything."
     "Nobody saw it coming."  
     "The numbers tell the story."
     "This part gets tricky."
     "It did not last."
   - Include at least 1 very long sentence per paragraph (35-55 words) with multiple clauses joined by commas, dashes, or subordinate clauses
   - NEVER write 3 sentences in a row that are within 8 words of each other in length
   - Target coefficient of variation > 0.50 for sentence lengths

2. ABSOLUTELY BANNED VOCABULARY — if you use ANY of these words, the output fails:
   utilize, facilitate, leverage, comprehensive, multifaceted, paramount, furthermore, moreover, additionally, consequently, subsequently, nevertheless, notwithstanding, aforementioned, paradigm, trajectory, discourse, dichotomy, conundrum, ramification, underpinning, synergy, robust, nuanced, salient, ubiquitous, pivotal, intricate, meticulous, profound, inherent, overarching, substantive, efficacious, holistic, transformative, innovative, groundbreaking, noteworthy, proliferate, exacerbate, ameliorate, engender, delineate, elucidate, illuminate, necessitate, perpetuate, underscore, exemplify, encompass, bolster, catalyze, streamline, optimize, mitigate, navigate, prioritize, articulate, substantiate, corroborate, disseminate, cultivate, ascertain, endeavor, delve, embark, foster, harness, spearhead, unravel, unveil, tapestry, cornerstone, bedrock, linchpin, nexus, spectrum, myriad, plethora, multitude, landscape, realm, culminate, enhance, crucial, vital, imperative, notable, significant, substantial, remarkable, considerable, unprecedented, methodology, framework, implication, implications

   Also BANNED phrases: "it is important to note", "it should be noted", "plays a crucial role", "in today's world", "in today's society", "a wide range of", "due to the fact that", "first and foremost", "each and every", "not only...but also", "serves as a testament", "in light of", "with that in mind", "having said that", "that being said", "it is worth noting", "on the other hand", "in conclusion", "in summary", "as a result", "for example,", "for instance,", "there are several", "there are many", "it is clear that", "when it comes to", "given that", "moving forward"

3. SENTENCE STARTERS — vary them dramatically:
   - Start some sentences with the subject directly ("The economy grew...")
   - Start some with a short clause ("After the reforms took hold, ...")
   - Start 1-2 with "And" or "But" (like real humans do)
   - Start some with gerunds ("Looking at the data...")
   - NEVER use the same starting word for consecutive sentences
   - NEVER start with: "Furthermore," "Moreover," "Additionally," "However," "Nevertheless," "Consequently," "It is" 

4. NATURAL HUMAN TEXTURE:
   - Use phrasal verbs heavily: look into, carry out, bring about, come up with, break down, set up, point out, figure out, run into, deal with, end up, turn out, pick up, build on, fall short, stand out, play out, account for, boil down to, keep up with, come across, go through, put together, take apart, spell out, lay out
   - Use semicolons 2-3 times to join related thoughts
   - Use em dashes (—) 2-4 times for asides or emphasis
   - Use parenthetical remarks 1-2 times: "(which few expected)" or "(at least in theory)"
   - Mix simple and complex sentence structures unpredictably

5. WORD CHOICE — sound like a real person, not a textbook:
   - Prefer everyday words: "use" not "utilize", "help" not "facilitate", "big" not "significant"
   - Use some slightly informal but smart words that humans naturally use: "tricky", "messy", "pretty much", "a lot of", "sort of", "turned out", "kicked off", "fell apart", "ramped up", "took off"
   - Sprinkle in occasional hedging: "probably", "seems like", "to some extent", "more or less"
   - Use concrete language over abstract: "factories closed" not "economic decline occurred"

6. PARAGRAPH VARIATION:
   - Make paragraphs different lengths (some 2-3 sentences, some 5-7)
   - Do not make every paragraph follow the same structure

STRICT PRESERVATION RULES:
- Keep ALL factual content, data, statistics, citations, technical terms, and proper nouns exactly
- Keep the same number of paragraphs
- Do NOT add information not in the original
- Do NOT create lists unless the original has them
- Do NOT add conclusions or summaries not in the original
- Stay within ±15% of original word count
- Return ONLY the rewritten text — no commentary, no labels, no meta-text`;

function buildUserPrompt(text: string, features: InputFeatures, tone: string): string {
  let toneGuide = "";
  switch (tone) {
    case "academic":
      toneGuide = "Write like a sharp grad student — intellectual but not pompous. Use semicolons and dashes. Avoid sounding like a textbook.";
      break;
    case "professional":
      toneGuide = "Write like a senior analyst writing an internal memo — clear, direct, no fluff.";
      break;
    case "simple":
      toneGuide = "Write plainly. Short sentences dominate. Keep it dead simple.";
      break;
    default:
      toneGuide = "Write like a confident college student explaining this topic to a peer — natural, clear, occasionally conversational.";
  }

  const contractionRule = features.hasContractions
    ? "You MAY use contractions naturally."
    : "Do NOT use contractions. Write all words fully (do not, cannot, will not, etc.).";

  const firstPersonRule = features.hasFirstPerson
    ? "You may use first-person pronouns where appropriate."
    : "Do NOT use first-person pronouns (I, we, me, us, my, our).";

  return `Rewrite this text completely. ${toneGuide}

${contractionRule}
${firstPersonRule}

CRITICAL: Create EXTREME sentence length variation. Include very short sentences (4-9 words) AND very long ones (35-55 words) in every paragraph. Never let 3 consecutive sentences be similar length.

Word count target: ${features.wordCount} words (±15%, so ${Math.round(features.wordCount * 0.85)}-${Math.round(features.wordCount * 1.15)}).

TEXT TO REWRITE:
${text}`;
}

// ══════════════════════════════════════════════════════════════════════════
// PASS 2: NON-LLM STATISTICAL POST-PROCESSING
// Targets each of the 20 detector signals individually
// ══════════════════════════════════════════════════════════════════════════

// ── 2A: AI VOCABULARY ELIMINATION ──
// Covers: ai_pattern_score, per_sentence_ai_ratio

const AI_WORD_KILL: Record<string, string[]> = {
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
  // Additional common AI words caught by detector
  notably: ["especially", "in particular"], specifically: ["in particular", "especially"],
  crucially: ["importantly", "above all"], essentially: ["basically", "at its core", "really"],
  fundamentally: ["at its root", "basically", "at heart"], arguably: ["probably", "you could say"],
  undeniably: ["clearly", "without question"], undoubtedly: ["clearly", "no question"],
  interestingly: ["what stands out is", "curiously"], remarkably: ["surprisingly", "strikingly"],
  evidently: ["clearly", "as it turned out"], henceforth: ["from then on", "after that"],
  catalyst: ["trigger", "spark", "driver"],
};

const AI_PHRASE_KILL: [RegExp, string][] = [
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
  [/\bthere is a (?:growing |increasing )?need (?:for|to)\b/gi, "we need"],
  [/\bsheds? light on\b/gi, "clears up"],
  [/\bpaves? the way for\b/gi, "opens the door to"],
  [/\braises? important questions?\b/gi, "brings up questions"],
];

function killAIVocabulary(text: string): string {
  let result = text;

  // Kill AI phrases first (longer patterns before shorter)
  for (const [pattern, replacement] of AI_PHRASE_KILL) {
    result = result.replace(pattern, (match) => {
      if (replacement === "") return "";
      if (match[0] === match[0].toUpperCase() && replacement[0] === replacement[0].toLowerCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Kill AI words
  result = result.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase();
    const replacements = AI_WORD_KILL[lower];
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

// ── 2B: BURSTINESS ENFORCER ──
// Targets: burstiness, sentence_uniformity, readability_consistency, spectral_flatness

function enforceBurstiness(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    if (sentences.length < 3) return p;

    const result: string[] = [];
    const lengths = sentences.map(s => s.split(/\s+/).length);

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;
      const words = sent.split(/\s+/);
      const len = words.length;

      // Check for 3 consecutive similar lengths
      if (result.length >= 2) {
        const prev1Len = result[result.length - 1].split(/\s+/).length;
        const prev2Len = result[result.length - 2].split(/\s+/).length;

        if (Math.abs(len - prev1Len) < 8 && Math.abs(len - prev2Len) < 8 && Math.abs(prev1Len - prev2Len) < 8) {
          // Three similar lengths in a row — split or truncate current sentence
          if (len > 20) {
            // Split at a natural break point (comma, semicolon, dash, "and", "but", "which")
            const splitPoints = [/,\s+(?:and|but|which|where|although|while|since|because|so)\s+/i, /;\s+/, /\s+—\s+/, /,\s+/];
            let split = false;
            for (const sp of splitPoints) {
              const match = sent.match(sp);
              if (match && match.index) {
                const idx = match.index;
                const part1Words = sent.slice(0, idx).split(/\s+/).length;
                const part2Words = sent.slice(idx + match[0].length).split(/\s+/).length;
                if (part1Words >= 4 && part2Words >= 4 && Math.abs(part1Words - part2Words) > 5) {
                  let part1 = sent.slice(0, idx).trim();
                  let part2 = sent.slice(idx + match[0].length).trim();
                  if (!part1.endsWith(".")) part1 += ".";
                  part2 = part2[0].toUpperCase() + part2.slice(1);
                  result.push(part1);
                  sent = part2;
                  split = true;
                  break;
                }
              }
            }
            if (!split) {
              result.push(sent);
              continue;
            }
          }
        }
      }

      result.push(sent);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── 2C: STARTER DIVERSIFIER ──
// Targets: starter_diversity, per_sentence_ai_ratio

const AI_STARTERS = new Set([
  "furthermore", "moreover", "additionally", "consequently", "subsequently",
  "nevertheless", "notwithstanding", "accordingly", "thus", "hence",
  "indeed", "notably", "specifically", "crucially", "importantly",
  "essentially", "fundamentally", "arguably", "undeniably", "undoubtedly",
  "interestingly", "remarkably", "evidently",
]);

const NATURAL_REROUTES: string[] = [
  "On closer inspection,", "In practice,",
  "By that point,", "From that angle,",
  "Practically speaking,", "At its core,",
  "To put it differently,", "As things stood,",
  "On the ground,", "In real terms,",
  "Behind the scenes,", "With that shift,",
  "Looking closer,", "Broadly speaking,",
];

function diversifyStarters(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    if (sentences.length === 0) return "";

    const result: string[] = [];
    const usedStarters = new Set<string>();
    let rerounteIdx = 0;

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;

      const firstWord = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

      // Kill AI formal starters
      if (AI_STARTERS.has(firstWord)) {
        const comma = sent.indexOf(",");
        if (comma > 0 && comma < 20) {
          sent = sent.slice(comma + 1).trim();
          sent = sent[0].toUpperCase() + sent.slice(1);
        }
      }

      // Check for duplicate starter
      const currentStarter = sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
      if (usedStarters.has(currentStarter) && sent.split(/\s+/).length > 6) {
        const reroute = NATURAL_REROUTES[rerounteIdx % NATURAL_REROUTES.length];
        rerounteIdx++;
        sent = reroute + " " + sent[0].toLowerCase() + sent.slice(1);
      }

      usedStarters.add(sent.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "");
      result.push(sent);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── 2D: CONNECTOR NATURALIZER ──
// Targets: ai_pattern_score (connector sub-signal)

const FORMAL_CONNECTORS: Record<string, string[]> = {
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
};

function naturalizeConnectors(text: string): string {
  let result = text;
  for (const [formal, replacements] of Object.entries(FORMAL_CONNECTORS)) {
    while (result.includes(formal)) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)];
      result = result.replace(formal, rep);
    }
  }
  return result;
}

// ── 2E: PUNCTUATION HUMANIZER ──
// Targets: stylometric_score, dependency_depth

function humanizePunctuation(text: string, features: InputFeatures): string {
  const paragraphs = text.split(/\n\s*\n/);
  let semicolonBudget = 3;
  let dashBudget = 4;
  let parenBudget = 2;

  const result = paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    const processed: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      let sent = sentences[i].trim();
      if (!sent) continue;
      const words = sent.split(/\s+/);

      // Add semicolons: merge two medium sentences
      if (semicolonBudget > 0 && i < sentences.length - 1) {
        const next = sentences[i + 1]?.trim();
        if (next && words.length >= 8 && words.length <= 22) {
          const nextWords = next.split(/\s+/);
          if (nextWords.length >= 8 && nextWords.length <= 22) {
            const cleanSent = sent.replace(/\.$/, "");
            const lowerNext = next[0].toLowerCase() + next.slice(1);
            processed.push(cleanSent + "; " + lowerNext);
            semicolonBudget--;
            i++; // skip next sentence
            continue;
          }
        }
      }

      // Add em dashes for mid-sentence asides
      if (dashBudget > 0 && words.length > 15) {
        const commaIdx = sent.indexOf(", ");
        if (commaIdx > 10 && commaIdx < sent.length - 20) {
          const nextComma = sent.indexOf(", ", commaIdx + 2);
          if (nextComma > commaIdx + 5 && nextComma < commaIdx + 40) {
            const aside = sent.slice(commaIdx + 2, nextComma);
            if (aside.split(/\s+/).length >= 3 && aside.split(/\s+/).length <= 10) {
              sent = sent.slice(0, commaIdx) + " — " + aside + " — " + sent.slice(nextComma + 2);
              dashBudget--;
            }
          }
        }
      }

      // Add parenthetical remark
      if (parenBudget > 0 && words.length > 18 && Math.random() < 0.3) {
        const asides = [
          "(at least in theory)",
          "(which few expected)",
          "(to some degree)",
          "(or so it seemed)",
          "(not without pushback)",
          "(though not everyone agreed)",
          "(as many pointed out)",
        ];
        // Insert after a comma near the middle
        const mid = Math.floor(sent.length / 2);
        const nearComma = sent.indexOf(", ", Math.max(mid - 20, 0));
        if (nearComma > 0 && nearComma < sent.length - 15) {
          const aside = asides[Math.floor(Math.random() * asides.length)];
          sent = sent.slice(0, nearComma + 2) + aside + " " + sent.slice(nearComma + 2);
          parenBudget--;
        }
      }

      processed.push(sent);
    }

    return processed.join(" ");
  }).filter(Boolean).join("\n\n");

  // Handle contractions
  if (!features.hasContractions) {
    return removeContractions(result);
  }
  return result;
}

// ── Contraction handling ──

const EXPANSION_MAP: Record<string, string> = {
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
  "what's": "what is",
};

const CONTRACTION_EXPAND_RE = new RegExp(
  "\\b(" + Object.keys(EXPANSION_MAP).map(k => k.replace(/'/g, "'?")).join("|") + ")\\b", "gi",
);

function removeContractions(text: string): string {
  let result = text.replace(CONTRACTION_EXPAND_RE, (match) => {
    const expanded = EXPANSION_MAP[match.toLowerCase()] ?? match;
    return match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()
      ? expanded[0].toUpperCase() + expanded.slice(1) : expanded;
  });
  result = expandContractions(result);
  return result;
}

// ── 2F: PARAGRAPH VARIANCE ──
// Targets: paragraph_uniformity

function varyParagraphs(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  if (paragraphs.length < 3) return text;

  // Check paragraph word count variance
  const lengths = paragraphs.map(p => p.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const cvVal = Math.sqrt(lengths.reduce((a, l) => a + (l - avg) ** 2, 0) / lengths.length) / Math.max(avg, 1);

  if (cvVal > 0.30) return text; // Already varied enough

  // Try to split long paragraphs or merge short ones
  const result: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const sentences = sentTokenize(para);

    if (sentences.length >= 6 && Math.random() < 0.5) {
      // Split into two paragraphs
      const splitPoint = Math.floor(sentences.length * (0.4 + Math.random() * 0.2));
      result.push(sentences.slice(0, splitPoint).join(" "));
      result.push(sentences.slice(splitPoint).join(" "));
    } else if (sentences.length <= 2 && i < paragraphs.length - 1) {
      // Merge with next paragraph if next is also short
      const nextSentences = sentTokenize(paragraphs[i + 1]);
      if (nextSentences.length <= 3) {
        result.push(sentences.concat(nextSentences).join(" "));
        i++; // skip next
      } else {
        result.push(para);
      }
    } else {
      result.push(para);
    }
  }

  return result.filter(p => p.trim()).join("\n\n");
}

// ── 2G: FINAL SURFACE POLISH ──

function finalPolish(text: string): string {
  let result = text;

  // Fix spacing
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/\s+([.,;:!?])/g, "$1");
  result = result.replace(/([.,;:!?])([A-Za-z])/g, "$1 $2");

  // Fix double punctuation
  result = result.replace(/\.{2,}/g, ".");
  result = result.replace(/,{2,}/g, ",");
  result = result.replace(/;{2,}/g, ";");
  result = result.replace(/—{2,}/g, "—");

  // Fix empty parens/brackets
  result = result.replace(/\(\s*\)/g, "");
  result = result.replace(/\[\s*\]/g, "");

  // Fix repeated words (but preserve intentional ones like "very very")
  result = result.replace(/\b((?!very|much|so|more|had|that)\w{4,})\s+\1\b/gi, "$1");

  // Fix a/an
  result = result.replace(/\ba ([aeiouAEIOU])/g, "an $1");
  result = result.replace(/\bA ([aeiouAEIOU])/g, "An $1");
  result = result.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, (match, letter) => {
    // Don't fix "an hour", "an honest", "an heir" etc
    const exceptions = ["h"];
    return exceptions.includes(letter.toLowerCase()) ? match : "a " + letter;
  });

  // Capitalize sentence starts
  result = result.replace(/\.\s+([a-z])/g, (_, ch) => ". " + ch.toUpperCase());
  result = result.replace(/^\s*([a-z])/gm, (_, ch) => ch.toUpperCase());

  return result.trim();
}

// ── 2H: NGRAM DE-REPEATER ──
// Targets: ngram_repetition, token_predictability, zipf_deviation

// Common word → less-common synonyms (increases vocabulary diversity + fixes zipf)
const DIVERSITY_SWAPS: Record<string, string[]> = {
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
};

function deRepeatNgrams(text: string): string {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];

  // Count trigram frequencies
  const trigramCounts = new Map<string, number>();
  for (let i = 0; i < words.length - 2; i++) {
    const tri = words[i] + " " + words[i + 1] + " " + words[i + 2];
    trigramCounts.set(tri, (trigramCounts.get(tri) ?? 0) + 1);
  }

  // Find repeated trigrams
  const repeatedTrigrams = new Set<string>();
  for (const [tri, count] of trigramCounts) {
    if (count >= 2) repeatedTrigrams.add(tri);
  }

  if (repeatedTrigrams.size === 0) return text;

  // For each repeated trigram, try to swap one word in its second occurrence
  let result = text;
  for (const tri of repeatedTrigrams) {
    const triWords = tri.split(" ");
    // Find the word most amenable to swapping
    for (const w of triWords) {
      const swaps = DIVERSITY_SWAPS[w];
      if (swaps && swaps.length > 0) {
        const replacement = swaps[Math.floor(Math.random() * swaps.length)];
        // Replace only one occurrence (not the first)
        const firstIdx = result.toLowerCase().indexOf(w);
        if (firstIdx >= 0) {
          const secondIdx = result.toLowerCase().indexOf(w, firstIdx + w.length + 1);
          if (secondIdx >= 0) {
            const originalWord = result.slice(secondIdx, secondIdx + w.length);
            const isCapitalized = originalWord[0] === originalWord[0].toUpperCase();
            const finalReplacement = isCapitalized
              ? replacement[0].toUpperCase() + replacement.slice(1)
              : replacement;
            result = result.slice(0, secondIdx) + finalReplacement + result.slice(secondIdx + w.length);
            break;
          }
        }
      }
    }
  }

  return result;
}

// ── 2I: DEPENDENCY DEPTH ENRICHER ──
// Targets: dependency_depth (add subordinate clauses and relative pronouns)

function enrichDependencyDepth(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  let budget = 4; // Max 4 subordinate clause insertions

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    const result: string[] = [];

    for (const sent of sentences) {
      const s = sent.trim();
      if (!s) continue;
      const words = s.split(/\s+/);

      // Only enrich medium-length sentences (15-30 words) — don't make short ones complex
      if (budget > 0 && words.length >= 15 && words.length <= 30 && Math.random() < 0.4) {
        // Try to add a "which" or "where" relative clause after a noun
        const nounPatterns = [
          /\b(the \w+)\b(?=\s+(?:has|have|had|is|are|was|were|can|could|will|would)\b)/i,
          /\b(this \w+)\b(?=\s+(?:has|have|had|is|are|was|were|can|could|will|would)\b)/i,
          /\b(these \w+s?)\b(?=\s+(?:has|have|had|is|are|was|were|can|could|will|would)\b)/i,
        ];

        let modified = false;
        for (const pattern of nounPatterns) {
          const match = s.match(pattern);
          if (match && match.index !== undefined) {
            const insertPoint = match.index + match[0].length;
            const clauses = [
              ", which had been building for years,",
              ", where conditions varied widely,",
              ", which not everyone expected,",
              ", although details remained unclear,",
              ", even though opinions differed,",
              ", since the evidence pointed that way,",
            ];
            const clause = clauses[Math.floor(Math.random() * clauses.length)];
            const newSent = s.slice(0, insertPoint) + clause + s.slice(insertPoint);
            result.push(newSent);
            budget--;
            modified = true;
            break;
          }
        }
        if (!modified) result.push(s);
      } else {
        result.push(s);
      }
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ── 2J: WORD DIVERSITY INJECTOR ──
// Targets: avg_word_commonality, vocabulary_richness, shannon_entropy
// Replaces some common words with less-common (but still natural) alternatives

function injectWordDiversity(text: string): string {
  let result = text;
  const usedSwaps = new Set<string>();

  // Only replace words that appear 2+ times in the text
  const wordCounts = new Map<string, number>();
  const textWords = text.toLowerCase().match(/[a-z']+/g) ?? [];
  for (const w of textWords) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);

  for (const [common, alternatives] of Object.entries(DIVERSITY_SWAPS)) {
    const count = wordCounts.get(common) ?? 0;
    if (count < 2 || usedSwaps.has(common)) continue;

    // Replace ~50% of occurrences (keep some for naturalness)
    let replaced = 0;
    const targetReplacements = Math.ceil(count / 2);
    let skipFirst = true; // Keep the first occurrence

    const regex = new RegExp(`\\b${common}\\b`, "gi");
    result = result.replace(regex, (match) => {
      if (skipFirst) { skipFirst = false; return match; }
      if (replaced >= targetReplacements) return match;

      const alt = alternatives[replaced % alternatives.length];
      replaced++;
      usedSwaps.add(common);

      if (match[0] === match[0].toUpperCase()) {
        return alt[0].toUpperCase() + alt.slice(1);
      }
      return alt;
    });
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// SIGNAL-AWARE REFINEMENT — Run detector, fix remaining weak signals
// ══════════════════════════════════════════════════════════════════════════

function analyzeSignals(text: string): Record<string, number> {
  const signals = new TextSignals(text);
  return signals.getAllSignals();
}

function signalAwareRefinement(text: string): string {
  const signals = analyzeSignals(text);
  let result = text;

  // Fix burstiness
  if (signals.burstiness < 55) {
    result = forceExtremeVariation(result);
  }

  // Fix AI vocabulary
  if (signals.ai_pattern_score > 20) {
    result = killAIVocabulary(result);
  }

  // Fix starters
  if (signals.starter_diversity < 55) {
    result = diversifyStarters(result);
  }

  // Fix uniformity
  if (signals.sentence_uniformity > 50) {
    result = breakSentenceUniformity(result);
  }

  // Fix dependency depth
  if (signals.dependency_depth < 40) {
    result = enrichDependencyDepth(result);
  }

  return result;
}

function forceExtremeVariation(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    if (sentences.length < 3) return p;

    const result: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i].trim();
      if (!sent) continue;
      const words = sent.split(/\s+/);

      // If sentence is in the "boring middle" (14-24 words) and we have too many of those
      const middleCount = result.filter(s => {
        const len = s.split(/\s+/).length;
        return len >= 14 && len <= 24;
      }).length;

      if (words.length >= 14 && words.length <= 24 && middleCount >= 2) {
        // Try to split into a short + remaining
        const commaIdx = sent.indexOf(", ");
        if (commaIdx > 0 && commaIdx < sent.length / 2) {
          const part1Words = sent.slice(0, commaIdx).split(/\s+/).length;
          if (part1Words >= 3 && part1Words <= 9) {
            let part1 = sent.slice(0, commaIdx).trim();
            let part2 = sent.slice(commaIdx + 2).trim();
            if (!part1.endsWith(".")) part1 += ".";
            part2 = part2[0].toUpperCase() + part2.slice(1);
            result.push(part1);
            result.push(part2);
            continue;
          }
        }
      }

      result.push(sent);
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

function breakSentenceUniformity(text: string): string {
  // Break uniform runs by splitting sentences, not by injecting content
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(para => {
    const p = para.trim();
    if (!p) return "";

    const sentences = sentTokenize(p);
    if (sentences.length < 4) return p;

    const result: string[] = [];
    let uniformRun = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i].trim();
      if (!sent) continue;
      const words = sent.split(/\s+/);
      const len = words.length;

      if (result.length > 0) {
        const prevLen = result[result.length - 1].split(/\s+/).length;
        if (Math.abs(len - prevLen) < 6) {
          uniformRun++;
        } else {
          uniformRun = 0;
        }
      }

      // After 2 uniform sentences, try to split current one to break the pattern
      if (uniformRun >= 2 && len > 16) {
        const splitPoints = [/,\s+(?:and|but|which|while|so)\s+/i, /;\s+/, /\s+—\s+/];
        let split = false;
        for (const sp of splitPoints) {
          const match = sent.match(sp);
          if (match && match.index) {
            const part1Words = sent.slice(0, match.index).split(/\s+/).length;
            const part2Words = sent.slice(match.index + match[0].length).split(/\s+/).length;
            if (part1Words >= 4 && part2Words >= 4) {
              let part1 = sent.slice(0, match.index).trim();
              let part2 = sent.slice(match.index + match[0].length).trim();
              if (!part1.endsWith(".")) part1 += ".";
              part2 = part2[0].toUpperCase() + part2.slice(1);
              result.push(part1);
              result.push(part2);
              uniformRun = 0;
              split = true;
              break;
            }
          }
        }
        if (!split) result.push(sent);
      } else {
        result.push(sent);
      }
    }

    return result.join(" ");
  }).filter(Boolean).join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE — ghostProHumanize()
// ══════════════════════════════════════════════════════════════════════════

export async function ghostProHumanize(
  text: string,
  options: {
    strength?: string;
    tone?: string;
    strictMeaning?: boolean;
    enablePostProcessing?: boolean;
  } = {},
): Promise<string> {
  if (!text?.trim()) return text;

  const {
    strength = "medium",
    tone = "neutral",
  } = options;

  const start = Date.now();
  console.log("  [GhostPro] Starting Ghost Pro v3 pipeline...");

  const original = text.trim();
  const features = detectInputFeatures(original);

  console.log(`  [GhostPro] Input: ${features.wordCount} words, ${features.paragraphCount} paras`);

  // Protect special content
  const { text: protectedText, map: protectionMap } = protectSpecialContent(original);

  // ═══════════════════════════════════════════
  // PASS 1: Deep LLM Rewrite
  // ═══════════════════════════════════════════
  console.log("  [GhostPro] Pass 1: Deep LLM Rewrite...");

  const tempMap: Record<string, number> = { light: 0.6, medium: 0.72, strong: 0.85 };
  const temperature = tempMap[strength] ?? 0.72;

  const userPrompt = buildUserPrompt(protectedText, features, tone);
  let result = await llmCall(GHOST_PRO_SYSTEM, userPrompt, temperature);

  if (!result || result.trim().length < protectedText.length * 0.3) {
    console.error("  [GhostPro] LLM rewrite too short or empty, using original");
    result = protectedText;
  }

  console.log(`  [GhostPro] Pass 1 done: ${result.split(/\s+/).length} words`);

  // Analyze LLM output
  let signals = analyzeSignals(result);
  console.log(`  [GhostPro] Post-LLM signals: burstiness=${signals.burstiness.toFixed(1)}, ai_pattern=${signals.ai_pattern_score.toFixed(1)}, uniformity=${signals.sentence_uniformity.toFixed(1)}`);

  // ═══════════════════════════════════════════
  // PASS 2: Non-LLM Statistical Processing
  // ═══════════════════════════════════════════
  console.log("  [GhostPro] Pass 2: Statistical post-processing...");

  // Step 2A: Kill all AI vocabulary and phrases
  console.log("  [GhostPro]   2A: AI vocabulary elimination...");
  result = killAIVocabulary(result);

  // Step 2B: Naturalize formal connectors
  console.log("  [GhostPro]   2B: Connector naturalization...");
  result = naturalizeConnectors(result);

  // Step 2C: Diversify sentence starters
  console.log("  [GhostPro]   2C: Starter diversification...");
  result = diversifyStarters(result);

  // Step 2D: Enforce burstiness (sentence length variation)
  console.log("  [GhostPro]   2D: Burstiness enforcement...");
  result = enforceBurstiness(result);

  // Step 2E: Humanize punctuation (semicolons, dashes, parens)
  console.log("  [GhostPro]   2E: Punctuation humanization...");
  result = humanizePunctuation(result, features);

    // Step 2F: Vary paragraph lengths
    console.log("  [GhostPro]   2F: Paragraph variance...");
    result = varyParagraphs(result);

    // Step 2G: Enrich dependency depth (add subordinate clauses)
    console.log("  [GhostPro]   2G: Dependency enrichment...");
    result = enrichDependencyDepth(result);

    // Step 2H: Final polish
    console.log("  [GhostPro]   2H: Final polish...");
    result = finalPolish(result);

  // ═══════════════════════════════════════════
  // PASS 3: Signal-Aware Refinement (1-2 rounds)
  // ═══════════════════════════════════════════
    for (let round = 1; round <= 3; round++) {
      signals = analyzeSignals(result);
      const weakSignals = [];
      if (signals.burstiness < 55) weakSignals.push("burstiness");
      if (signals.ai_pattern_score > 20) weakSignals.push("ai_pattern");
      if (signals.starter_diversity < 55) weakSignals.push("starters");
      if (signals.sentence_uniformity > 50) weakSignals.push("uniformity");
      if (signals.dependency_depth < 40) weakSignals.push("dep_depth");

    if (weakSignals.length === 0) {
      console.log(`  [GhostPro] Round ${round}: All signals in human range, skipping refinement`);
      break;
    }

    console.log(`  [GhostPro] Round ${round}: Refining weak signals: ${weakSignals.join(", ")}`);
    result = signalAwareRefinement(result);
    result = finalPolish(result);
  }

  // ── Restore protected content ──
  result = restoreSpecialContent(result.trim(), protectionMap);

  // ── Final diagnostic ──
  const outputWordCount = result.split(/\s+/).length;
  const outputSentences = sentTokenize(result);
  const avgSentLen = outputSentences.length > 0 ? outputWordCount / outputSentences.length : 0;
  const sentLengths = outputSentences.map(s => s.split(/\s+/).length);
  const sentMean = sentLengths.length > 0 ? sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length : 0;
  const sentVar = sentLengths.length > 0 ? sentLengths.reduce((a, l) => a + (l - sentMean) ** 2, 0) / sentLengths.length : 0;
  const burstinessCV = Math.sqrt(sentVar) / Math.max(sentMean, 1);

  const finalSignals = analyzeSignals(result);
  const meaningScore = semanticSimilaritySync(original, result);
  const elapsed = (Date.now() - start) / 1000;

  console.log(`  [GhostPro] Output: ${outputWordCount} words, ${outputSentences.length} sentences`);
  console.log(`  [GhostPro] Burstiness CV: ${burstinessCV.toFixed(3)}, avg sent: ${avgSentLen.toFixed(1)}`);
  console.log(`  [GhostPro] Sentence lengths: [${sentLengths.join(", ")}]`);
  console.log(`  [GhostPro] Final signals: burst=${finalSignals.burstiness.toFixed(1)}, ai_pat=${finalSignals.ai_pattern_score.toFixed(1)}, uniform=${finalSignals.sentence_uniformity.toFixed(1)}, starter=${finalSignals.starter_diversity.toFixed(1)}, perplex=${finalSignals.perplexity.toFixed(1)}`);
  console.log(`  [GhostPro] Meaning similarity: ${meaningScore.toFixed(2)}`);
  console.log(`  [GhostPro] Complete in ${elapsed.toFixed(1)}s`);

  return result;
}
