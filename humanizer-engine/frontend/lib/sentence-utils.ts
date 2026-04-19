import { scoreSentenceDeep } from "@/lib/engine/ai-signal-dictionary"

export function splitSentences(text: string): string[] {
  if (!text) return []
  const parts = text.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) ?? [text]
  return parts.map((p) => p).filter(Boolean)
}

function readingEaseForSentence(sentence: string) {
  const words = sentence.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0)
  const ease = 206.835 - 1.015 * words.length - 84.6 * (syllables / words.length)
  return Math.max(0, Math.min(100, ease))
}

export function readingEase(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const sentences = splitSentences(text).filter((s) => s.trim().length > 0)
  if (!words.length || !sentences.length) return 0
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0)
  const ease = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length)
  return Math.round(Math.max(0, Math.min(100, ease)))
}

export function readingEaseSentenceAverage(text: string) {
  const sentences = splitSentences(text).map((s) => s.trim()).filter(Boolean)
  if (!sentences.length) return 0
  const scores = sentences.map(readingEaseForSentence).filter((score) => Number.isFinite(score))
  if (!scores.length) return 0
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length
  return Math.round(Math.max(0, Math.min(100, avg)))
}

function countSyllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "")
  if (!w) return 0
  if (w.length <= 3) return 1
  const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "")
  const matches = cleaned.match(/[aeiouy]{1,2}/g)
  return matches ? matches.length : 1
}

// ── AI signal data (trimmed from multi-detector) ──

const _MARKER_WORDS = new Set([
  "utilize","utilise","leverage","facilitate","comprehensive","multifaceted",
  "paramount","furthermore","moreover","additionally","consequently",
  "subsequently","nevertheless","notwithstanding","aforementioned","henceforth",
  "paradigm","methodology","methodologies","framework","trajectory","discourse",
  "dichotomy","conundrum","juxtaposition","ramification","underpinning","synergy",
  "robust","nuanced","salient","ubiquitous","pivotal","intricate","meticulous",
  "profound","inherent","overarching","substantive","efficacious","holistic",
  "transformative","innovative","groundbreaking","noteworthy",
  "proliferate","exacerbate","ameliorate","engender","promulgate","delineate",
  "elucidate","illuminate","necessitate","perpetuate","culminate","underscore",
  "exemplify","encompass","bolster","catalyze","streamline","optimize","enhance",
  "mitigate","navigate","prioritize","articulate","substantiate","corroborate",
  "disseminate","cultivate","ascertain","endeavor","delve","embark","foster",
  "harness","spearhead","unravel","unveil",
  "notably","specifically","crucially","importantly","significantly",
  "essentially","fundamentally","arguably","undeniably","undoubtedly",
  "interestingly","remarkably","evidently",
  "implication","implications","realm","landscape","tapestry","cornerstone",
  "bedrock","linchpin","catalyst","nexus","spectrum","myriad","plethora","multitude",
])

const _STARTERS = [
  "furthermore,","moreover,","additionally,","consequently,","subsequently,",
  "nevertheless,","notwithstanding,","accordingly,",
  "it is important","it is crucial","it is essential","it is worth noting",
  "it should be noted","one of the most","in today's","in the modern",
  "this essay","this paper","this study","the purpose of",
  "in conclusion,","in summary,","to summarize,","as a result,",
  "for example,","for instance,","on the other hand,","in other words,",
  "there are several","there are many","it can be seen","it is clear",
  "looking at","when it comes to","when we look at","given that",
  "despite","while","although","in recent years,",
]

const _PHRASES: RegExp[] = [
  /\bit is (?:important|crucial|essential|vital) (?:to note )?that\b/i,
  /\bplays? a (?:crucial|vital|key|significant|important|pivotal) role\b/i,
  /\ba (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/i,
  /\bin today'?s (?:world|society|landscape|era)\b/i,
  /\bdue to the fact that\b/i,
  /\bfirst and foremost\b/i,
  /\beach and every\b/i,
  /\bnot only .{5,40} but also\b/i,
  /\bserves? as a (?:testament|reminder|catalyst|cornerstone)\b/i,
  /\bthe (?:importance|significance|impact) of\b/i,
  /\ba (?:plethora|myriad|multitude) of\b/i,
  /\bin the (?:modern|current|contemporary) (?:era|age|world|landscape)\b/i,
  /\bthat being said\b/i,
  /\bin light of\b/i,
  /\bin the context of\b/i,
]

const _FN_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","shall","should","may","might","must","can",
  "could","and","but","or","nor","for","yet","so","in","on","at","to","from",
  "by","with","of","as","if","then","than","that","this","these","those","not",
  "no","also","such","each","both","all","which","who","whom","whose","what",
  "where","when","how","why","it","its","i","me","my","we","us","our","you",
  "your","he","him","his","she","her","they","them","their","about","into",
  "through","during","before","after","above","below","between","under","more",
  "most","other","some","any","only","very","too","just","own","same","up",
  "down","out","off","over","there","here","now","then","still",
])

const _FORMAL_LINKS = new Set([
  "however","therefore","furthermore","moreover","consequently","additionally",
  "conversely","similarly","specifically","particularly","notably","indeed",
  "essentially","fundamentally","accordingly","thus",
])

/**
 * Deterministic per-sentence AI-risk score (0–1).
 *
 * Now a thin wrapper over the shared `scoreSentenceDeep` from
 * `lib/engine/ai-signal-dictionary`, so the SentenceMeter UI and the
 * backend `multi-detector` apply the same linguistic rules.
 *
 * The legacy marker/starter/phrase sets below are kept for any consumer
 * that imports this file directly but are no longer used for scoring.
 *
 * The `salt` parameter is accepted for API compatibility but ignored.
 */
export function sentenceRisk(sentence: string, _salt = 0): number {
  return scoreSentenceDeep(sentence).score
}

export function toneLabel(text: string): string {
  const lower = text.toLowerCase()
  const formalHits = (lower.match(/\b(therefore|moreover|furthermore|thus|hence|notwithstanding|consequently)\b/g) || []).length
  const casualHits = (lower.match(/\b(like|kinda|stuff|pretty|yeah|hey|gonna|wanna)\b/g) || []).length
  const technicalHits = (lower.match(/\b(system|algorithm|model|dataset|parameter|function|hypothesis|variable)\b/g) || []).length
  if (technicalHits > formalHits && technicalHits > casualHits) return "Technical"
  if (formalHits > casualHits) return "Formal"
  if (casualHits > 0) return "Casual"
  return "Neutral"
}

export function detectLanguage(text: string): { label: string; flag: string } {
  const lower = text.toLowerCase()
  const langs = [
    { label: "English", flag: "EN", hits: (lower.match(/\b(the|and|is|that|of|you|to|in|it)\b/g) || []).length },
    { label: "Spanish", flag: "ES", hits: (lower.match(/\b(que|de|la|el|es|los|una|por|para)\b/g) || []).length },
    { label: "French", flag: "FR", hits: (lower.match(/\b(le|la|les|des|une|est|pour|avec|dans)\b/g) || []).length },
    { label: "German", flag: "DE", hits: (lower.match(/\b(und|der|die|das|ist|nicht|ein|eine|mit)\b/g) || []).length },
  ]
  langs.sort((a, b) => b.hits - a.hits)
  if (langs[0].hits === 0) return { label: "English", flag: "EN" }
  return { label: langs[0].label, flag: langs[0].flag }
}

export function readingTime(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(0, Math.round(words / 220))
  if (words === 0) return "—"
  if (minutes < 1) return "< 1 min read"
  return `${minutes} min read`
}
