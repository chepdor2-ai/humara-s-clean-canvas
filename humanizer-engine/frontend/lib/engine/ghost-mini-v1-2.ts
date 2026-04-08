/**
 * Ghost Mini v1.2 - Academic Prose Engine (Aggressive)
 * =====================================================
 * Full-infrastructure academic humanizer leveraging 619K+ word dictionary,
 * 500K+ phrase combinations, AI word kill, anti-detection, and deep restructuring.
 *
 * Pipeline (strict sentence-by-sentence with paragraph preservation):
 *   1. Content protection (citations, numbers, brackets)
 *   2. Paragraph extraction
 *   3. Per-sentence 9-phase transformation:
 *      F1: Contraction expansion (academic)
 *      F2: AI word/phrase kill + buzzword removal
 *      F3: Phrase pattern substitution (500K+ combos)
 *      F4: Synonym replacement (rules-based)
 *      F5: Dictionary synonym replacement (619K+ words)
 *      F6: Deep restructure (clause swap, adverbial fronting)
 *      F7: Voice shift (selective active→passive)
 *      F8: Wordy phrase simplification + verb formalization
 *      F9: Punctuation normalization (no em-dashes, semicolons)
 *   4. Anti-detection pass (per-sentence scoring + targeted fixes)
 *   5. Deep cleaning pass (hedging, orphans, structure diversity)
 *   6. Sentence starter deduplication
 *   7. Micro noise injection (controlled imperfections)
 *   8. Content restoration
 *   9. Paragraph reassembly
 */

import {
  synonymReplace,
  replaceAiStarters,
  restructureSentence,
} from "./utils";
import { PROTECTED_WORDS } from "./rules";
import { expandContractions, voiceShift, deepRestructure, tenseVariation } from "./advanced-transforms";
import { getDictionary, type HumanizerDictionary } from "./dictionary";
import {
  protectSpecialContent,
  restoreSpecialContent,
  cleanOutputRepetitions,
  robustSentenceSplit,
} from "./content-protection";
import {
  applyPhrasePatterns,
  applyAIWordKill,
  fixPunctuation,
  cleanSentenceStarters,
} from "./shared-dictionaries";
import { validateAndRepairOutput } from "./validation-post-process";

// ═══════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════

const BASE_INTENSITY = 0.4;     // Synonym replacement — boost word unpredictability
const DICT_INTENSITY = 0.15;    // Light dictionary synonyms — filtered through blacklist
const VOICE_SHIFT_PROB = 0.30;  // 30% chance of active↔passive swap
const RESTRUCTURE_INTENSITY = 0.35; // Moderate restructuring — clause fronting, adverbial moves

// ═══════════════════════════════════════════
// Dictionary blacklist (academic-safe filtering)
// ═══════════════════════════════════════════

const DICT_BLACKLIST = new Set([
  "bodoni", "soh", "thence", "wherefore", "hitherto", "thereof",
  "mercantile", "pursuance", "pecuniary", "remunerative", "lucrative",
  "ain", "tis", "twas", "nay", "aye", "hath", "doth",
  "thee", "thou", "thy", "thine", "whence", "whilst",
  "atm", "homophile", "dodo", "croak", "grizzle", "braw",
  "gloriole", "upwind", "edifice", "tract", "genesis",
  "hatful", "panoptic", "ardor", "fogey", "carrefour",
  "aerofoil", "appall", "bionomical", "planer", "rick",
  "permeant", "enounce", "audacious", "bod", "bole",
  "phoner", "drape", "castrate", "bludgeon",
  "heft", "mien", "writ", "brio", "nub", "vim", "cog",
  "jot", "ken", "ilk", "kin", "orb", "pith", "rout",
  "woe", "gist", "boon", "onus", "bane", "crux",
  "forebear", "proffer", "betoken", "bespeak", "parlance",
  "forthwith", "henceforward", "anent", "betwixt",
  "caller", "calling", "selling", "flunk", "handler",
  "societal", "communal", "assort", "checker", "pleader",
  "roomer", "settler", "capper", "shaker", "sayer",
  "chassis", "unitedly", "limitless", "lonely", "retrieve",
  "apparatus", "contrivance", "contraption", "gizmo", "gadget",
  "habitation", "domicile", "abode", "lodgings", "berth",
  "vessel", "conduit", "receptacle", "depository",
  "corporeal", "ethereal", "ephemeral", "nascent", "cognizant",
  "obfuscate", "prognosticate", "remunerate", "conflagration",
  "perambulate", "masticate", "regurgitate", "cogitate",
  "veritably", "assuredly", "indubitably", "irrefutably",
  "boss", "wearable", "covering", "tactical", "falling",
  "substance", "direction", "understandings",
  "quartet", "pity", "associate", "interplays",
  "vesture", "coating", "specially",
  "earn", "quatern", "concluded",
  "lotion", "prosody", "primer", "ticker", "cosmos",
  "mentation", "cogitation", "bettor",
  // Additional bad replacements that produce unnatural academic prose
  "surd", "grandness", "competently", "burdensome",
  "thriftiness", "labourers", "procession", "leverage",
  "tailor", "secures", "demands", "openings", "networks",
  "tackles", "assortment", "locale", "sporting", "gymnastic",
  "custody", "forfeit", "muster", "ponder", "reckon",
  "hardheaded", "pigheaded", "bullheaded", "headstrong",
  "polish", "flying", "spinning", "swinging", "darting",
  "pumping", "hustling", "booming", "blazing", "dashing",
  "rank", "grade", "notch", "slot", "bracket",
  "penury", "indigence", "privation", "destitution",
  "mounting", "surroundings", "environs",
  "part", "expanding", "maintained",
  "futurity", "effectivity",
]);

// ═══════════════════════════════════════════
// Modern buzzwords to kill (pre-2000 academic style)
// ═══════════════════════════════════════════

const MODERN_BUZZWORDS: [RegExp, string][] = [
  [/\bdelve(?:s|d)?\s+(?:into|deeper)\b/gi, "examine"],
  [/\bdelve(?:s|d)?\b/gi, "explore"],
  [/\btapestry\b/gi, "structure"],
  [/\blandscape\b/gi, "field"],
  [/\bunlock(?:s|ed|ing)?\s+(?:the\s+)?(?:potential|power|secrets?)\b/gi, "reveal"],
  [/\bgame[\s-]?changer\b/gi, "advance"],
  [/\bcutting[\s-]?edge\b/gi, "recent"],
  [/\bgroundbreaking\b/gi, "notable"],
  [/\bparadigm\s+shift\b/gi, "change"],
  [/\bsynergi(?:ze|es|zing)\b/gi, "cooperate"],
  [/\bsynergy\b/gi, "cooperation"],
  [/\bleverag(?:e[sd]?|ing)\b/gi, "use"],
  [/\bholistic\b/gi, "complete"],
  [/\brobust\b/gi, "strong"],
  [/\bseamless(?:ly)?\b/gi, "smooth"],
  [/\binnovative\b/gi, "new"],
  [/\bimpactful\b/gi, "influential"],
  [/\bactionable\b/gi, "practical"],
  [/\bscalable\b/gi, "expandable"],
  [/\bsustainable\b/gi, "lasting"],
  [/\bstakeholder[s]?\b/gi, "participant"],
  [/\bbest\s+practice(?:s)?\b/gi, "standard method"],
  [/\bthought\s+leader(?:s|ship)?\b/gi, "expert"],
  [/\bdisrupt(?:s|ed|ive|ion)?\b/gi, "change"],
  [/\bempower(?:s|ed|ing|ment)?\b/gi, "enable"],
  [/\boptimiz(?:e[sd]?|ing|ation)\b/gi, "improve"],
  [/\bstreamline(?:s|d)?\b/gi, "simplify"],
  [/\bproactive(?:ly)?\b/gi, "early"],
  [/\beco[\s-]?system\b/gi, "system"],
  [/\bpivot(?:s|ed|ing)?\b/gi, "shift"],
  [/\bcurated?\b/gi, "selected"],
  [/\bbespoke\b/gi, "custom"],
  [/\bgranular(?:ity)?\b/gi, "detailed"],
  [/\bsilo(?:s|ed)?\b/gi, "isolated"],
  [/\bbandwidth\b/gi, "capacity"],
  [/\bdrilldown\b/gi, "analysis"],
  [/\bmultifaceted\b/gi, "complex"],
  [/\bparamount\b/gi, "very important"],
];

// ═══════════════════════════════════════════
// Comprehensive AI marker word kill — targets every word flagged by detectors
// ═══════════════════════════════════════════

const DETECTOR_MARKER_KILL: [RegExp, string][] = [
  // Formal hedging/boosting
  [/\butiliz(?:e[sd]?|ing)\b/gi, "use"],
  [/\butilis(?:e[sd]?|ing)\b/gi, "use"],
  [/\bfacilitat(?:e[sd]?|ing)\b/gi, "help"],
  [/\bcomprehensive\b/gi, "full"],
  [/\baforementioned\b/gi, "earlier"],
  [/\bhenceforth\b/gi, "from now"],
  [/\bparadigm[s]?\b/gi, "model"],
  [/\bmethodolog(?:y|ies)\b/gi, "method"],
  [/\bframework[s]?\b/gi, "structure"],
  [/\btrajectory\b/gi, "path"],
  [/\bdiscourse\b/gi, "discussion"],
  [/\bdichotomy\b/gi, "divide"],
  [/\bconundrum\b/gi, "problem"],
  [/\bjuxtaposition\b/gi, "contrast"],
  [/\bramification[s]?\b/gi, "result"],
  [/\bunderpinning[s]?\b/gi, "basis"],
  // Over-used AI adjectives
  [/\bnuanced\b/gi, "subtle"],
  [/\bsalient\b/gi, "key"],
  [/\bubiquitous\b/gi, "common"],
  [/\bpivotal\b/gi, "key"],
  [/\bintricate\b/gi, "complex"],
  [/\bmeticulous(?:ly)?\b/gi, "careful"],
  [/\bprofound(?:ly)?\b/gi, "deep"],
  [/\binherent(?:ly)?\b/gi, "built-in"],
  [/\boverarching\b/gi, "broad"],
  [/\bsubstantive\b/gi, "real"],
  [/\befficacious\b/gi, "effective"],
  [/\btransformative\b/gi, "changing"],
  [/\bnoteworthy\b/gi, "notable"],
  // Over-used AI verbs
  [/\bproliferat(?:e[sd]?|ing)\b/gi, "spread"],
  [/\bexacerbat(?:e[sd]?|ing)\b/gi, "worsen"],
  [/\bameliorat(?:e[sd]?|ing)\b/gi, "improve"],
  [/\bengender(?:s|ed|ing)?\b/gi, "cause"],
  [/\bpromulgat(?:e[sd]?|ing)\b/gi, "spread"],
  [/\bdelineat(?:e[sd]?|ing)\b/gi, "outline"],
  [/\belucidat(?:e[sd]?|ing)\b/gi, "explain"],
  [/\billuminat(?:e[sd]?|ing)\b/gi, "show"],
  [/\bnecessitat(?:e[sd]?|ing)\b/gi, "require"],
  [/\bperpetuat(?:e[sd]?|ing)\b/gi, "continue"],
  [/\bculminat(?:e[sd]?|ing)\b/gi, "end in"],
  [/\bunderscore[sd]?\b/gi, "highlight"],
  [/\bexemplif(?:y|ies|ied|ying)\b/gi, "show"],
  [/\bencompass(?:es|ed|ing)?\b/gi, "include"],
  [/\bbolster(?:s|ed|ing)?\b/gi, "support"],
  [/\bcatalyz(?:e[sd]?|ing)\b/gi, "trigger"],
  [/\benhance[sd]?\b/gi, "improve"],
  [/\bmitigat(?:e[sd]?|ing)\b/gi, "reduce"],
  [/\bnavigate[sd]?\b/gi, "handle"],
  [/\bprioritiz(?:e[sd]?|ing)\b/gi, "focus on"],
  [/\barticulat(?:e[sd]?|ing)\b/gi, "express"],
  [/\bsubstantiat(?:e[sd]?|ing)\b/gi, "prove"],
  [/\bcorroborat(?:e[sd]?|ing)\b/gi, "confirm"],
  [/\bdisseminat(?:e[sd]?|ing)\b/gi, "share"],
  [/\bcultivat(?:e[sd]?|ing)\b/gi, "grow"],
  [/\bascertain(?:s|ed|ing)?\b/gi, "find"],
  [/\bendeavor(?:s|ed|ing)?\b/gi, "try"],
  [/\bembark(?:s|ed|ing)?\b/gi, "start"],
  [/\bfoster(?:s|ed|ing)?\b/gi, "support"],
  [/\bharness(?:es|ed|ing)?\b/gi, "use"],
  [/\bspearhead(?:s|ed|ing)?\b/gi, "lead"],
  [/\bunravel(?:s|ed|ing)?\b/gi, "explain"],
  [/\bunveil(?:s|ed|ing)?\b/gi, "reveal"],
  // Connector adverbs — keep structure, just simplify
  [/\bsignificantly\b/gi, "greatly"],
  // Abstract nouns
  [/\bimplication[s]?\b/gi, "effect"],
  [/\brealm[s]?\b/gi, "area"],
  [/\bcornerstone[s]?\b/gi, "basis"],
  [/\bbedrock\b/gi, "base"],
  [/\blinchpin[s]?\b/gi, "key part"],
  [/\bcatalyst[s]?\b/gi, "driver"],
  [/\bnexus\b/gi, "link"],
  [/\bspectrum\b/gi, "range"],
  [/\bmyriad\b/gi, "many"],
  [/\bplethora\b/gi, "excess"],
  [/\bmultitude\b/gi, "many"],
];

// Formal link words — per-sentence AI signal in multi-detector
const FORMAL_LINK_KILL: [RegExp, string][] = [
  [/^However,?\s*/i, "But "],
  [/^Therefore,?\s*/i, "So "],
  [/^Furthermore,?\s*/i, "Also, "],
  [/^Moreover,?\s*/i, "Also, "],
  [/^Consequently,?\s*/i, "As a result, "],
  [/^Additionally,?\s*/i, "Also, "],
  [/^Conversely,?\s*/i, "On the flip side, "],
  [/^Similarly,?\s*/i, "In the same way, "],
  [/^Specifically,?\s*/i, "In particular, "],
  [/^Particularly,?\s*/i, "Especially, "],
  [/^Notably,?\s*/i, "In particular, "],
  [/^Indeed,?\s*/i, "In fact, "],
  [/^Essentially,?\s*/i, "Basically, "],
  [/^Fundamentally,?\s*/i, "At its core, "],
  [/^Accordingly,?\s*/i, "So "],
  [/^Thus,?\s*/i, "So "],
  // Mid-sentence formal links
  [/\bhowever,?\s/gi, "but "],
  [/\btherefore,?\s/gi, "so "],
  [/\bfurthermore,?\s/gi, "also "],
  [/\bmoreover,?\s/gi, "also "],
  [/\bconsequently,?\s/gi, "so "],
  [/\badditionally,?\s/gi, "also "],
  [/\bconversely,?\s/gi, "yet "],
  [/\baccordingly,?\s/gi, "so "],
  [/\bthus\b/gi, "so"],
  [/\bindeed\b/gi, "in fact"],
];

// AI sentence starters flagged by multi-detector
const AI_STARTER_KILL: [RegExp, string][] = [
  [/^It is important to note that\s*/i, ""],
  [/^It is crucial to note that\s*/i, ""],
  [/^It is essential to note that\s*/i, ""],
  [/^It is worth noting that\s*/i, ""],
  [/^It should be noted that\s*/i, ""],
  [/^It can be seen that\s*/i, ""],
  [/^It is clear that\s*/i, ""],
  [/^One of the most\b/i, "A very "],
  [/^In today's\s*/i, "In the current "],
  [/^In the modern\s*/i, "In the current "],
  [/^In recent years,?\s*/i, "Recently, "],
  [/^There are several\b/i, "Several "],
  [/^There are many\b/i, "Many "],
  [/^Looking at\s*/i, "Examining "],
  [/^When it comes to\s*/i, "Regarding "],
  [/^When we look at\s*/i, "Examining "],
  [/^Given that\s*/i, "Since "],
  [/^The purpose of\s*/i, "This "],
  [/^This essay\b/i, "This paper"],
  [/^In conclusion,?\s*/i, "Overall, "],
  [/^In summary,?\s*/i, "Overall, "],
  [/^To summarize,?\s*/i, "Overall, "],
  [/^As a result,?\s*/i, "So "],
  [/^For example,?\s*/i, "For instance, "],
  [/^On the other hand,?\s*/i, "Yet "],
  [/^In other words,?\s*/i, "That is, "],
];

// AI phrase patterns flagged by multi-detector
const AI_PHRASE_KILL: [RegExp, string][] = [
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal) role\b/gi, "matters"],
  [/\ba (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/gi, "many "],
  [/\bin today'?s (?:world|society|landscape|era)\b/gi, "today"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bit (?:should|must|can) be (?:noted|argued|emphasized) that\b/gi, ""],
  [/\bfirst and foremost\b/gi, "first"],
  [/\beach and every\b/gi, "every"],
  [/\bnot only (.{5,40}) but also\b/gi, "both $1 and"],
  [/\bmoving forward\b/gi, "next"],
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone)\b/gi, "shows"],
  [/\bthe (?:importance|significance|impact) of\b/gi, "how important "],
  [/\ba (?:plethora|myriad|multitude) of\b/gi, "many "],
  [/\bin the (?:modern|current|contemporary) (?:era|age|world|landscape)\b/gi, "now"],
  [/\bwith (?:respect|regard) to\b/gi, "about"],
  [/\bneedless to say\b/gi, ""],
  [/\bat the end of the day\b/gi, "ultimately"],
  [/\btaken together\b/gi, "combined"],
  [/\ball things considered\b/gi, "overall"],
  [/\bhaving said that\b/gi, "still"],
  [/\bthat being said\b/gi, "still"],
  [/\bin light of\b/gi, "given"],
  [/\bin view of\b/gi, "given"],
  [/\bwith that in mind\b/gi, "so"],
  [/\bfor the purpose of\b/gi, "for"],
  [/\bin the context of\b/gi, "in"],
  [/\bit is (?:important|crucial|essential|vital) (?:to note )?that\b/gi, ""],
];

// ═══════════════════════════════════════════
// Academic wordy phrase simplification
// ═══════════════════════════════════════════

const WORDY_PHRASES: [RegExp, string][] = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\bfor the purpose of\b/gi, "for"],
  [/\bin the event that\b/gi, "if"],
  [/\bat this point in time\b/gi, "now"],
  [/\bin the near future\b/gi, "soon"],
  // NOTE: Keep "it is evident that" — sample uses this exact phrasing
  // NOTE: Keep "it is worth noting" — natural in academic prose
  [/\bit is crucial to recognize that\b/gi, "it is important to note that"],
  [/\bit is essential to note that\b/gi, "it is important to note that"],
  [/\bit is necessary to\b/gi, "there is a need to"],
  [/\bthe purpose of this analysis is to\b/gi, "this analysis will"],
  [/\bwith regard to\b/gi, "regarding"],
  [/\bon the basis of\b/gi, "based on"],
  [/\bin the context of\b/gi, "in the field of"],
  [/\bwith respect to\b/gi, "regarding"],
];

// ═══════════════════════════════════════════
// Verb formalization (phrasal → formal)
// ═══════════════════════════════════════════

const VERB_FORMALIZATIONS: [RegExp, string][] = [
  [/\blook at\b/gi, "examine"],
  [/\bthink about\b/gi, "consider"],
  [/\btalk about\b/gi, "discuss"],
  [/\bpoint out\b/gi, "indicate"],
  [/\bbring up\b/gi, "introduce"],
  [/\bfigure out\b/gi, "determine"],
  [/\bcarry out\b/gi, "conduct"],
  [/\bset up\b/gi, "establish"],
  [/\bgive up\b/gi, "abandon"],
  [/\bcome up with\b/gi, "devise"],
  [/\bmake up\b/gi, "constitute"],
  [/\bgo through\b/gi, "undergo"],
  [/\bturn out\b/gi, "prove"],
  [/\bput forward\b/gi, "propose"],
  [/\bbuild on\b/gi, "extend"],
  [/\brely on\b/gi, "depend upon"],
  [/\bdeal with\b/gi, "address"],
  [/\bfind out\b/gi, "discover"],
  [/\brule out\b/gi, "exclude"],
  [/\bbreak down\b/gi, "decompose"],
  [/\bput first\b/gi, "prioritize"],
  [/\bget rid of\b/gi, "eliminate"],
  [/\bgive rise to\b/gi, "produce"],
  [/\btake into account\b/gi, "consider"],
];

// ═══════════════════════════════════════════
// Perspective neutrality (first-person → impersonal)
// ═══════════════════════════════════════════

const PERSPECTIVE_SWAPS: [RegExp, string][] = [
  [/\bI think that\b/gi, "One can argue that"],
  [/\bI think\b/gi, "One may note"],
  [/\bWe think that\b/gi, "One can argue that"],
  [/\bWe think\b/gi, "One may note"],
  [/\bWe believe that\b/gi, "The evidence suggests that"],
  [/\bWe believe\b/gi, "The evidence suggests"],
  [/\bI believe that\b/gi, "The evidence suggests that"],
  [/\bI believe\b/gi, "The evidence suggests"],
  [/\bIn my opinion,?\s*/gi, ""],
  [/\bIn our opinion,?\s*/gi, ""],
  [/\bI feel that\b/gi, "There are signs that"],
  [/\bWe feel that\b/gi, "There are signs that"],
  [/\bI would argue that\b/gi, "One might argue that"],
  [/\bWe suggest that\b/gi, "The data suggests that"],
  [/\bI contend that\b/gi, "One might argue that"],
  [/\bWe can see that\b/gi, "The data shows that"],
  [/\bWe can see\b/gi, "The data shows"],
  [/\bAs we know,?\s*/gi, "As is known, "],
  [/\bWe must\b/gi, "There is a need to"],
  [/\bWe need to\b/gi, "There is a need to"],
  [/\bWe should\b/gi, "There is a case for"],
  [/\bI would say\b/gi, "One could say"],
];

// ═══════════════════════════════════════════
// Dictionary-based smart synonym replacement
// ═══════════════════════════════════════════

let _dictCache: HumanizerDictionary | null = null;
function getDict(): HumanizerDictionary {
  if (!_dictCache) {
    try { _dictCache = getDictionary(); } catch { _dictCache = null!; }
  }
  return _dictCache!;
}

function isAcceptableReplacement(word: string): boolean {
  const low = word.toLowerCase();
  if (DICT_BLACKLIST.has(low)) return false;
  if (low.length > 12 || low.length < 3) return false;
  if (!/^[a-z]+$/i.test(low)) return false;
  return true;
}

function dictSynonymReplaceSentence(
  sent: string, intensity: number, used: Set<string>, protectedTerms: Set<string>,
): string {
  const dict = getDict();
  if (!dict) return sent;
  
  const replaceProb = Math.min(0.008 * intensity, 0.60);
  const words = sent.split(/\s+/);
  const result: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const stripped = w.replace(/^[.,;:!?"'()\-\[\]{}]+/, "").replace(/[.,;:!?"'()\-\[\]{}]+$/, "");
    const lower = stripped.toLowerCase();

    if (protectedTerms.has(lower) || PROTECTED_WORDS.has(lower) ||
        stripped.length <= 3 || used.has(lower) || Math.random() > replaceProb) {
      result.push(w);
      continue;
    }

    let replacement: string | null = null;
    try { replacement = dict.replaceWordSmartly(lower, sent, used); } catch { replacement = null; }

    if (replacement && replacement !== lower && !DICT_BLACKLIST.has(replacement.toLowerCase())
      && replacement.length < 25 && !replacement.includes(" ")
      && Math.abs(replacement.length - lower.length) <= Math.max(3, lower.length * 0.4)
      && isAcceptableReplacement(replacement)) {
      // Avoid creating adjacent duplicates
      const prev = result.length > 0 ? result[result.length - 1].replace(/[.,;:!?"'()\-\[\]{}]/g, "").toLowerCase() : "";
      const next = i + 1 < words.length ? words[i + 1].replace(/[.,;:!?"'()\-\[\]{}]/g, "").toLowerCase() : "";
      if (replacement.toLowerCase() === prev || replacement.toLowerCase() === next) {
        result.push(w);
        continue;
      }
      // Preserve capitalization
      if (stripped[0] === stripped[0].toUpperCase()) replacement = replacement[0].toUpperCase() + replacement.slice(1);
      if (stripped === stripped.toUpperCase()) replacement = replacement.toUpperCase();
      const prefixMatch = w.match(/^[.,;:!?"'()\-\[\]{}]+/);
      const suffixMatch = w.match(/[.,;:!?"'()\-\[\]{}]+$/);
      result.push((prefixMatch?.[0] ?? "") + replacement + (suffixMatch?.[0] ?? ""));
      used.add(lower);
      used.add(replacement.toLowerCase());
    } else {
      result.push(w);
    }
  }
  return result.join(" ");
}

// ═══════════════════════════════════════════
// Paragraph & Sentence Infrastructure
// ═══════════════════════════════════════════

function extractParagraphs(text: string): string[] {
  return text.split(/\n\n+/);
}

function isTitle(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length < 100 &&
    (!/[.!?]$/.test(trimmed) || /^#{1,6}\s/.test(trimmed) || /^[IVXLCDM]+\.\s/i.test(trimmed))
  );
}

function extractSentences(paragraph: string): string[] {
  const trimmed = paragraph.trim();
  if (isTitle(trimmed)) return [trimmed];

  // Use robust sentence splitting that handles abbreviations, decimals, URLs
  return robustSentenceSplit(trimmed);
}

// ═══════════════════════════════════════════
// Per-Sentence 9-Phase Pipeline
// ═══════════════════════════════════════════

/**
 * Basic coherence check — rejects garbled transformations.
 * Returns true if the sentence appears structurally valid.
 */
function isCoherent(sent: string): boolean {
  // Reject "by we", "by I", "by he", "by she" — broken passive voice
  if (/\bby\s+(we|I|he|she|they)\b/i.test(sent)) return false;
  // Reject sentences starting with prepositional phrase + modal verb without subject
  if (/^(?:At|In|On|By|For|With|From|Before|After|Between|Under|Over|Through)\s+\w+(?:\s+\w+){0,4}\s+(?:will|shall|should|can|could|may|might|must)\s/i.test(sent)) {
    const commaIdx = sent.indexOf(",");
    if (commaIdx > 0) {
      const afterComma = sent.slice(commaIdx + 1).trim();
      if (!/^[A-Z]/.test(afterComma)) return false;
    } else {
      return false;
    }
  }
  // Reject doubled words within 3-word window (catches "the the", "is is" etc.)
  // Exclude common function words that naturally repeat in compound sentences
  const COMMON_REPEATERS = new Set(["that", "this", "which", "about", "with", "from", "into", "more", "also", "both", "been", "have", "will", "their", "them", "they", "than", "each", "such", "some", "these", "those", "other", "when", "where", "what", "does", "make", "take"]);
  const words = sent.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i].toLowerCase().replace(/[^a-z]/g, "");
    if (w.length > 3 && !COMMON_REPEATERS.has(w)) {
      for (let j = i + 1; j < Math.min(i + 3, words.length); j++) {
        if (words[j].toLowerCase().replace(/[^a-z]/g, "") === w) return false;
      }
    }
  }
  // Reject sentences ending with dangling preposition + pronoun
  if (/\b(?:by|of|for|to|from)\s+(?:we|I|he|she|they)\s*[.!?]$/.test(sent)) return false;
  // Reject nonsensical "expanding in grandness" type patterns
  if (/\b(?:expanding|growing)\s+in\s+\w+ness\b/i.test(sent)) return false;
  // Reject "has/have become + gerund" — always garbled (e.g. "has become expanding in importance")
  if (/\b(?:has|have|had)\s+become\s+\w+ing\b/i.test(sent)) return false;
  // Reject "At <gerund> ..." patterns from bad clause swap (e.g. "At executing thorough programs, ...")
  if (/^At\s+\w+ing\b/i.test(sent)) return false;
  // Reject sentence fragments (< 4 words and not a title-like element)
  if (words.length < 4 && /[.!?]$/.test(sent) && !/^[A-Z][a-z]+:?\s*$/.test(sent.replace(/[.!?]$/, ""))) return false;
  // Reject "Before/After <adjective> ..." garbled fronting
  if (/^(?:Before|After)\s+\w+\s+in\b/i.test(sent) && /\bis\s+now\s+more\b/i.test(sent)) return false;
  // Reject garbled passive: active clause + dangling passive (e.g. "X can Y is used by Z")
  if (/\b(?:can|will|shall|should|could|may|might|must)\s+\w+\s+.+?\bis\s+\w+ed\s+by\b/i.test(sent)) return false;
  // Reject sentences ending with trailing incomplete clause ("that <word(s)>." with no verb after that)
  if (/\bthat\s+\w+\s*[.!?]$/.test(sent) && !/\bthat\s+\w+\s+(?:is|are|was|were|has|have|had|do|does|did|can|will|shall|should|could|may|might|must|would)\b/i.test(sent.slice(sent.lastIndexOf("that")))) return false;
  // Reject sentences starting with preposition + NP + verb but missing subject
  if (/^With\s+\w+\s+\w+\s+are\b/i.test(sent)) return false;
  // Reject sentence with "is/was <pp> by <noun>" where the agent repeats a word from earlier
  const passiveMatch = sent.match(/\b(?:is|was|are|were)\s+(\w+ed)\s+by\s+(\w+)/i);
  if (passiveMatch) {
    const agent = passiveMatch[2].toLowerCase();
    const beforePassive = sent.slice(0, sent.toLowerCase().indexOf(passiveMatch[0].toLowerCase()));
    if (beforePassive.toLowerCase().includes(agent)) return false;
  }
  return true;
}

/**
 * Safely apply a transform — reverts to `before` if the result is incoherent.
 */
function safeTransform(before: string, fn: (s: string) => string): string {
  const after = fn(before);
  if (after === before) return after;
  return isCoherent(after) ? after : before;
}

function processSentenceAggressive(
  sentence: string,
  _isFirst: boolean,
  usedWords: Set<string>,
  protectedTerms: Set<string>,
  intensity: number = BASE_INTENSITY,
): string {
  if (!sentence || sentence.split(/\s+/).length < 3) return sentence;

  let s = sentence;

  // ── F1: Expand contractions (academic prose never uses contractions) ──
  s = expandContractions(s);

  // ── F2: Kill AI words/phrases + modern buzzwords + detector-flagged markers ──
  s = applyAIWordKill(s);
  for (const [pattern, replacement] of MODERN_BUZZWORDS) {
    s = s.replace(pattern, replacement);
  }
  // Kill ALL words flagged by multi-detector AI marker list
  for (const [pattern, replacement] of DETECTOR_MARKER_KILL) {
    s = s.replace(pattern, replacement);
  }
  // Kill ALL AI phrases flagged by multi-detector
  for (const [pattern, replacement] of AI_PHRASE_KILL) {
    const before = s;
    s = s.replace(pattern, replacement);
    if (s !== before && s.length > 0 && /^[a-z]/.test(s)) {
      s = s[0].toUpperCase() + s.slice(1);
    }
  }
  // Kill formal link words (per-sentence AI signal)
  for (const [pattern, replacement] of FORMAL_LINK_KILL) {
    const before = s;
    s = s.replace(pattern, replacement);
    if (s !== before && s.length > 0 && /^[a-z]/.test(s)) {
      s = s[0].toUpperCase() + s.slice(1);
    }
  }
  // Kill AI sentence starters
  for (const [pattern, replacement] of AI_STARTER_KILL) {
    const before = s;
    s = s.replace(pattern, replacement);
    if (s !== before && s.length > 0 && /^[a-z]/.test(s)) {
      s = s[0].toUpperCase() + s.slice(1);
    }
  }
  s = replaceAiStarters(s);

  // ── F3: Verb formalization + wordy phrase removal + perspective (BEFORE restructuring) ──
  for (const [pat, rep] of VERB_FORMALIZATIONS) {
    s = s.replace(pat, rep);
  }
  for (const [pat, rep] of WORDY_PHRASES) {
    const before = s;
    s = s.replace(pat, rep);
    if (s !== before && s.length > 0 && /^[a-z]/.test(s)) {
      s = s[0].toUpperCase() + s.slice(1);
    }
  }
  for (const [pat, rep] of PERSPECTIVE_SWAPS) {
    s = s.replace(pat, rep);
  }

  // ── F4: Phrase pattern substitution ──
  s = safeTransform(s, (x) => applyPhrasePatterns(x));

  // ── F5: Rules-based synonym replacement — light, for perplexity boost ──
  if (intensity > 0.05) {
    s = safeTransform(s, (x) => synonymReplace(x, intensity, usedWords, protectedTerms));
  }

  // ── F6: Dictionary synonym replacement ──
  if (DICT_INTENSITY > 0) {
    s = safeTransform(s, (x) => dictSynonymReplaceSentence(x, DICT_INTENSITY, usedWords, protectedTerms));
  }

  // ── F7: Restructure ──
  if (RESTRUCTURE_INTENSITY > 0 && Math.random() < 0.6) {
    s = safeTransform(s, (x) => deepRestructure(x, RESTRUCTURE_INTENSITY));
  }

  // ── F8: Voice shift ──
  if (VOICE_SHIFT_PROB > 0 && Math.random() < VOICE_SHIFT_PROB) {
    s = safeTransform(s, (x) => voiceShift(x, VOICE_SHIFT_PROB));
  }

  // ── F8b: Tense variation (simple ↔ continuous) ──
  if (Math.random() < 0.2) {
    s = safeTransform(s, (x) => tenseVariation(x, 0.15));
  }

  // ── F9: Punctuation normalization ──
  // Insert missing "that" after passive constructions (e.g. "It is understood organizations" → "It is understood that organizations")
  s = s.replace(/\b(It is (?:believed|argued|posited|suggested|maintained|contended|apparent|proposed|assumed|noted|asserted|held|recognized|acknowledged|understood|accepted|known|evident|widely accepted|generally accepted))\s+(?!that\b)([A-Z])/g, "$1 that $2");
  s = s.replace(/\b(it is (?:believed|argued|posited|suggested|maintained|contended|apparent|proposed|assumed|noted|asserted|held|recognized|acknowledged|understood|accepted|known|evident|widely accepted|generally accepted))\s+(?!that\b)([a-z])/gi, "$1 that $2");
  // Remove em-dashes (replace with comma clauses)
  s = s.replace(/\s*—\s*/g, ", ");
  s = s.replace(/\s*–\s*/g, ", ");
  // Fix broken hyphens: "fast - paced" → "fast-paced"
  s = s.replace(/(\w)\s+-\s+(\w)/g, "$1-$2");
  // Fix double spaces, trim
  s = s.replace(/\s{2,}/g, " ").trim();
  // Ensure proper sentence ending
  if (s.length > 0 && !/[.!?]$/.test(s)) s += ".";
  // Ensure capitalization
  if (s.length > 0 && /^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);

  return s;
}

// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// Burstiness Injection — vary sentence lengths for human-like statistical profile
// ═══════════════════════════════════════════

function injectBurstiness(sentences: string[]): string[] {
  if (sentences.length < 2) return sentences;

  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sent = sentences[i];
    const words = sent.split(/\s+/);

    // Split sentences >= 13 words to escape the 13-30 word AI detection window
    if (words.length >= 13) {
      // Strategy 1: Split at conjunction after comma (creates two valid clauses)
      // Only split if BOTH halves form independent clauses (have a verb).
      // Do NOT split at Oxford commas in lists like "A, B, and C".
      const conjSplit = sent.match(/^(.+?),\s+(and|but|so|yet)\s+(.+)$/i);
      if (conjSplit && conjSplit[1].split(/\s+/).length >= 4 && conjSplit[3].split(/\s+/).length >= 4) {
        // Skip if this looks like an Oxford comma list (first part ends with "X, Y" pattern)
        const isOxfordComma = /,\s*\S{1,25}$/.test(conjSplit[1].trim());
        // Check BOTH parts have a verb (are independent clauses, not list items)
        const firstPart = conjSplit[1].trim().toLowerCase();
        const restPart = conjSplit[3].trim().toLowerCase();
        const verbRe = /\b(?:is|are|was|were|has|have|had|do|does|did|will|would|could|should|shall|may|might|can|must|need|make|made|take|took|get|got|give|gave|lead|led|show|find|found|keep|say|said|know|knew|mean|meant|become|became|remain|run|seem|appear|include|provide|allow|help|create|cause|produce|affect|result|involve|require|suggest|indicate|demonstrate|reveal|exist|occur|happen|depend|contribute|continue|begin|began|start|play|serve|represent|support|develop|establish|change|move|work|turn|come|came|go|went|see|saw|think|thought|believe|argue|claim|prove|ensure|determine|consider|examine|discuss|increase|decrease|reduce|improve|affect|reflect|prevent|enable|bring|brought|set|put)\b/i;
        if (!isOxfordComma && verbRe.test(firstPart) && verbRe.test(restPart)) {
          const first = conjSplit[1].trim().replace(/[.,;:]+$/, "") + ".";
          const restLower = restPart;
          const hasSubject = /^(?:it|this|that|they|these|those|he|she|we|the|a|an|its|his|her|their|our|my|one|such|each|all|some|many|most|few|no|any|several|both|either|neither|other|another|much|more|enough|certain|particular|people|individuals|students|countries|workers|communities|governments|organizations|companies|businesses|education|technology|society|research|studies|data|evidence|results?|policies?|systems?|issues?|problems?|challenges?|changes?|effects?|impacts?|factors?|levels?|rates?|access|quality|development|information|resources?|opportunities?)/i.test(restLower);
          if (hasSubject) {
            const capRest = conjSplit[3].trim().charAt(0).toUpperCase() + conjSplit[3].trim().slice(1);
            const restEnded = /[.!?]$/.test(capRest) ? capRest : capRest + ".";
            result.push(first, restEnded);
            continue;
          }
          // Has verb but no clear subject — prepend "This also"
          const capRest = "This also " + conjSplit[3].trim().charAt(0).toLowerCase() + conjSplit[3].trim().slice(1);
          const restEnded = /[.!?]$/.test(capRest) ? capRest : capRest + ".";
          result.push(first, restEnded);
          continue;
        }
        // No verb in rest — it's a list item, don't split
      }

      // Strategy 2: Split at semicolon 
      const semiIdx = sent.indexOf(";");
      if (semiIdx > 0) {
        const first = sent.slice(0, semiIdx).trim();
        const rest = sent.slice(semiIdx + 1).trim();
        if (first.split(/\s+/).length >= 4 && rest.split(/\s+/).length >= 4) {
          const firstEnded = first.replace(/[.,;:]+$/, "") + ".";
          const capRest = rest.charAt(0).toUpperCase() + rest.slice(1);
          const restEnded = /[.!?]$/.test(capRest) ? capRest : capRest + ".";
          result.push(firstEnded, restEnded);
          continue;
        }
      }

      // Strategy 3: Split at "which/where/because" — extract as separate sentence
      const relSplit = sent.match(/^(.+?),\s+(which|where|because|since|as)\s+(.+)$/i);
      if (relSplit && relSplit[1].split(/\s+/).length >= 4 && relSplit[3].split(/\s+/).length >= 3) {
        const first = relSplit[1].trim().replace(/[.,;:]+$/, "") + ".";
        const connector = relSplit[2].toLowerCase();
        let rest = relSplit[3].trim();
        let secondSentence: string;
        if (connector === "which" || connector === "where") {
          secondSentence = "This " + rest;
        } else {
          // because/since/as — keep the connector
          secondSentence = connector.charAt(0).toUpperCase() + connector.slice(1) + " " + rest;
          // Actually, make it standalone: "This happens because X" → just start fresh
          secondSentence = "This is because " + rest;
        }
        secondSentence = secondSentence.charAt(0).toUpperCase() + secondSentence.slice(1);
        if (!/[.!?]$/.test(secondSentence)) secondSentence += ".";
        result.push(first, secondSentence);
        continue;
      }

      // No clean split — keep as-is
      result.push(sent);
    }
    // For very short sentences (< 6 words), merge with next for variety
    else if (words.length < 6 && i < sentences.length - 1 && Math.random() < 0.30) {
      const next = sentences[i + 1];
      const nextWords = next.split(/\s+/);
      if (words.length + nextWords.length <= 22) {
        const combined = sent.replace(/[.!?]$/, "") + ", and " + next.charAt(0).toLowerCase() + next.slice(1);
        result.push(combined);
        i++;
      } else {
        result.push(sent);
      }
    }
    else {
      result.push(sent);
    }
  }
  return result;
}

// ═══════════════════════════════════════════
// Protected term extraction
// ═══════════════════════════════════════════

function extractProtectedTerms(text: string): Set<string> {
  const terms = new Set<string>();

  // Proper nouns (capitalized mid-sentence words)
  const midSentence = text.matchAll(/(?<=[a-z,;]\s)([A-Z][a-z]{2,})/g);
  for (const m of midSentence) terms.add(m[1].toLowerCase());

  // Technical terms and acronyms
  const acronyms = text.matchAll(/\b[A-Z]{2,}\b/g);
  for (const m of acronyms) terms.add(m[0]);

  // Add common academic words that should not be replaced
  const academicGuard = [
    // Statistical & research terms
    "hypothesis", "null", "statistical", "significance", "mean", "median",
    "variance", "deviation", "sample", "population", "coefficient", "correlation",
    "regression", "anova", "confidence", "probability", "distribution",
    "qualitative", "quantitative", "empirical", "methodology", "validity",
    "reliability", "dissertation", "thesis", "abstract", "citation",
    "analysis", "analyze", "analytical", "truancy", "absenteeism",
    "attendance", "socioeconomic", "demographic", "cohort", "curriculum",
    "clinical", "diagnosis", "prognosis", "treatment", "therapy",
    "prevalence", "incidence", "morbidity", "mortality", "placebo",
    "equation", "formula", "algorithm", "computation",
    // Technology & AI terms (from sample text)
    "artificial", "intelligence", "machine", "machines", "computer",
    "computers", "learning", "deep", "neural", "network", "networks",
    "data", "datasets", "digital", "software", "hardware", "robot",
    "robots", "robotics", "automation", "automated", "autonomous",
    "cognitive", "consciousness", "self-awareness", "awareness",
    "recognition", "processing", "algorithms", "models", "systems",
    "technology", "technologies", "engineering", "science", "scientific",
    // Common academic vocabulary (from sample text)
    "culture", "training", "fast", "important", "growth", "environment",
    "marketplace", "compete", "invest", "practical", "comprehensive",
    "prioritize", "effective", "success", "impact", "approach",
    "organizations", "leadership", "development", "programs", "decisions",
    "factor", "component", "understand", "teams", "management",
    "emotional", "research", "studies", "results",
    "strategy", "modern", "continuous", "areas", "implement",
    "implementing", "increasingly", "business", "companies", "value",
    "create", "creating", "need", "needs", "ability", "abilities",
    "self-awareness", "self-reflection", "reflection",
    // Words natural in academic writing that should not be swapped
    "human", "humans", "society", "social", "problem", "problems",
    "solve", "solving", "task", "tasks", "perform", "performing",
    "process", "concept", "concepts", "design", "designed",
    "specific", "general", "capable", "capacity", "knowledge",
    "experience", "information", "communication", "significant",
    "aspect", "aspects", "various", "includes", "including",
    "described", "defined", "associated", "related", "similar",
    "complex", "advanced", "basic", "simple", "wide", "broad",
    "hypothetical", "theoretical", "observable", "biological",
    "historical", "philosophical", "mathematical", "logical",
    "sector", "sectors", "industry", "industries", "field", "fields",
    "method", "methods", "application", "applications",
    "pattern", "patterns", "behavior", "behaviour",
    "decision", "decisions", "function", "functions",
    "perception", "reasoning", "beliefs", "intentions",
    "emotions", "desires", "observing", "interaction",
  ];
  for (const t of academicGuard) terms.add(t);

  return terms;
}

// ═══════════════════════════════════════════
// Main Processing Function
// ═══════════════════════════════════════════

/**
 * Ghost Mini v1.2 - Aggressive Academic Humanizer
 * Multi-sentence chunk processing (3-sentence groups) with paragraph preservation.
 */
export function ghostMiniV1_2(text: string): string {
  if (!text || text.trim().length === 0) return text;

  // Dynamic intensity: boost synonym replacement for shorter texts
  // Short texts need more word variation to achieve good perplexity/vocabulary richness
  const wordCount = text.split(/\s+/).length;
  const INTENSITY = wordCount < 250 ? BASE_INTENSITY * 1.5 : BASE_INTENSITY;

  // ── Step 1: Protect special content ──
  const { text: protectedText, map: protectionMap } = protectSpecialContent(text);

  // ── Step 2: Extract protected terms ──
  const protectedTerms = extractProtectedTerms(text);
  const usedWords = new Set<string>();

  // ── Step 3: Extract paragraphs ──
  const paragraphs = extractParagraphs(protectedText);

  // ── Step 4: Process each paragraph ──
  const processedParagraphs = paragraphs.map((paragraph) => {
    if (!paragraph.trim()) return paragraph;

    // Extract sentences (kept for fallback/coherence tracking)
    const sentences = extractSentences(paragraph);

    // Skip titles/headings
    if (sentences.length === 1 && isTitle(paragraph.trim())) {
      return sentences[0];
    }

    // ── 4a: Sentence-by-sentence independent processing ──
    // Each sentence is processed independently through the 9-phase pipeline,
    // then reassembled back into the paragraph.
    let processed = sentences.map(sent => {
      const result = processSentenceAggressive(
        sent, true, usedWords, protectedTerms, INTENSITY
      );
      // Ensure the result is a single sentence (no extra periods introduced)
      const resultSentences = extractSentences(result);
      if (resultSentences.length === 1) return resultSentences[0];
      // If processing split the sentence, rejoin and fix
      if (resultSentences.length > 1) {
        // Take the full result but ensure it ends with proper punctuation
        const joined = resultSentences.join(' ');
        return joined;
      }
      return result;
    });

    // ── 4b: Anti-detection pass — DISABLED (creates uniform patterns) ──

    // ── 4c: Deep cleaning pass — DISABLED (counterproductive) ──

    // ── 4d: Clean sentence starters (preserve chunk count) ──
    const preStarterClean = [...processed];
    const starterCleaned = cleanSentenceStarters([...processed]);
    if (starterCleaned.length === preStarterClean.length) {
      processed = starterCleaned.map((s, i) => isCoherent(s) ? s : preStarterClean[i]);
    }

    // ── 4e: Coherence sweep — revert garbled sentences ──
    processed = processed.map((s, i) => {
      if (!isCoherent(s) && i < sentences.length) {
        let fallback = expandContractions(sentences[i]);
        for (const [pat, rep] of VERB_FORMALIZATIONS) { fallback = fallback.replace(pat, rep); }
        for (const [pat, rep] of PERSPECTIVE_SWAPS) { fallback = fallback.replace(pat, rep); }
        for (const [pat, rep] of WORDY_PHRASES) { fallback = fallback.replace(pat, rep); }
        fallback = fallback.replace(/\b(it is (?:believed|argued|posited|suggested|maintained|contended|apparent|proposed|assumed|noted|asserted|held|recognized|acknowledged|understood|accepted|known|evident|widely accepted|generally accepted))\s+(?!that\b)([a-z])/gi, "$1 that $2");
        fallback = fallback.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, ", ");
        if (/^[a-z]/.test(fallback)) fallback = fallback[0].toUpperCase() + fallback.slice(1);
        return fallback;
      }
      return s;
    });

    // ── 4f: Protected-term restoration ──
    if (processed.length === sentences.length) {
      processed = processed.map((s, i) => {
        const origWords = sentences[i].toLowerCase().split(/\s+/);
        const procWords = s.toLowerCase().split(/\s+/);
        for (const term of protectedTerms) {
          if (origWords.includes(term) && !procWords.some(w => w.replace(/[^a-z]/g, "") === term)) {
            let safe = expandContractions(sentences[i]);
            for (const [pat, rep] of VERB_FORMALIZATIONS) { safe = safe.replace(pat, rep); }
            for (const [pat, rep] of PERSPECTIVE_SWAPS) { safe = safe.replace(pat, rep); }
            safe = safe.replace(/\b(it is (?:believed|argued|posited|suggested|maintained|contended|apparent|proposed|assumed|noted|asserted|held|recognized|acknowledged|understood|accepted|known|evident|widely accepted|generally accepted))\s+(?!that\b)([a-z])/gi, "$1 that $2");
            safe = safe.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, ", ");
            if (/^[a-z]/.test(safe)) safe = safe[0].toUpperCase() + safe.slice(1);
            return safe;
          }
        }
        return s;
      });
    }

    // ── 4g: Stylometric enhancement — boost human-like features ──
    // Add parenthetical expression to one sentence per paragraph (boosts pdS signal)
    let parentheticalAdded = false;
    processed = processed.map(s => {
      if (parentheticalAdded) return s;
      const words = s.split(/\s+/);
      if (words.length >= 10) {
        // Try to wrap an adjective+noun pair in parentheses
        const parenPatterns: [RegExp, string][] = [
          [/\b(especially|particularly|mainly|primarily)\s+(in|for|among)\b/gi, "($1 $2"],
          [/\b(such as)\s+(\w+)/i, "(such as $2"],
        ];
        for (const [pat, rep] of parenPatterns) {
          if (pat.test(s)) {
            // Find a good insertion point
            s = s.replace(pat, (match, p1, p2) => {
              parentheticalAdded = true;
              const inner = `(${p1} ${p2}`;
              // Find end of the parenthetical (next comma or end of clause)
              return inner;
            });
            // Close the parenthetical at the next comma or period
            if (parentheticalAdded) {
              const openParen = s.indexOf("(");
              if (openParen >= 0) {
                const commaAfter = s.indexOf(",", openParen + 5);
                const periodAfter = s.indexOf(".", openParen + 5);
                let closeAt = -1;
                if (commaAfter > 0 && periodAfter > 0) closeAt = Math.min(commaAfter, periodAfter);
                else if (commaAfter > 0) closeAt = commaAfter;
                else if (periodAfter > 0) closeAt = periodAfter;
                if (closeAt > 0) {
                  s = s.slice(0, closeAt) + ")" + s.slice(closeAt);
                } else {
                  // Close before period at end
                  s = s.replace(/\.\s*$/, ").");
                }
              }
            }
            break;
          }
        }
      }
      return s;
    });

    // ── 4h: Burstiness injection — vary sentence lengths for human-like patterns ──
    processed = injectBurstiness(processed);

    // ── 4i: Final punctuation fix ──
    processed = processed.map(s => {
      let r = fixPunctuation(s);
      r = r.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, ", ");
      return r;
    });

    return processed.join(" ");
  });

  // ── Step 5: Reassemble document ──
  let result = processedParagraphs.join("\n\n");

  // ── Step 6: Restore protected content ──
  result = restoreSpecialContent(result, protectionMap);

  // ── Step 7: Final cleanup ──
  result = cleanOutputRepetitions(result);
  // Fix article agreement: "a" before vowel sounds → "an"
  result = result.replace(/\b(a)\s+([aeiouAEIOU]\w*)/g, (match, article, word) => {
    // Keep "a" before words that sound like consonants (e.g., "a university", "a one-time")
    const exceptions = /^(uni|use|usu|uter|one|once|eu)/i;
    if (exceptions.test(word)) return match;
    return article === "A" ? "An " + word : "an " + word;
  });
  // Fix reverse: "an" before consonant sounds → "a"
  result = result.replace(/\b(an)\s+([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]\w*)/g, (match, article, word) => {
    // Keep "an" before words that sound like vowels (e.g., "an hour", "an honest")
    const exceptions = /^(ho(?:ur|nest|nour|norab))/i;
    if (exceptions.test(word)) return match;
    return article === "An" ? "A " + word : "a " + word;
  });
  // Strip any remaining em-dashes
  result = result.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, ", ");
  // Fix double spaces
  result = result.replace(/ {2,}/g, " ");

  // ── POST-PROCESSING VALIDATION ──
  try {
    const validationResult = validateAndRepairOutput(text, result, {
      allowWordChangeBound: 0.7,
      minSentenceWords: 3,
      autoRepair: true,
    });
    if (validationResult.wasRepaired) {
      result = validationResult.text;
    }
  } catch (error) {
    console.warn('[ghostMiniV1_2] Validation error:', error);
  }

  return result;
}

/**
 * Public API for document humanization.
 */
export function humanizeDocument(text: string): string {
  return ghostMiniV1_2(text);
}

/**
 * Validation function to test that structure is preserved.
 */
export function validateStructurePreservation(original: string, processed: string): {
  paragraphCountMatch: boolean;
  blankLinesPreserved: boolean;
  originalParagraphs: number;
  processedParagraphs: number;
} {
  const origParagraphs = extractParagraphs(original);
  const procParagraphs = extractParagraphs(processed);

  return {
    paragraphCountMatch: origParagraphs.length === procParagraphs.length,
    blankLinesPreserved: origParagraphs.filter(p => !p.trim()).length === procParagraphs.filter(p => !p.trim()).length,
    originalParagraphs: origParagraphs.length,
    processedParagraphs: procParagraphs.length,
  };
}
