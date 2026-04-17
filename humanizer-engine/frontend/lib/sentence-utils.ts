export function splitSentences(text: string): string[] {
  if (!text) return []
  const parts = text.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) ?? [text]
  return parts.map((p) => p).filter(Boolean)
}

export function readingEase(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const sentences = splitSentences(text).filter((s) => s.trim().length > 0)
  if (!words.length || !sentences.length) return 0
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0)
  const ease = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length)
  return Math.round(Math.max(0, Math.min(100, ease)))
}

function countSyllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "")
  if (!w) return 0
  if (w.length <= 3) return 1
  const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "")
  const matches = cleaned.match(/[aeiouy]{1,2}/g)
  return matches ? matches.length : 1
}

export function sentenceRisk(sentence: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < sentence.length; i++) {
    h ^= sentence.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const pseudo = ((h >>> 0) % 1000) / 1000
  const len = sentence.trim().split(/\s+/).length
  const lenBias = len < 6 ? 0.2 : len < 14 ? 0.05 : -0.05
  return Math.max(0, Math.min(1, pseudo * 0.5 + 0.1 + lenBias))
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
