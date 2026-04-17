const PROPER_NOUNS: Record<string, string> = {
  i: "I", gpt: "GPT", gptzero: "GPTZero", openai: "OpenAI", chatgpt: "ChatGPT",
  humaragpt: "HumaraGPT", ai: "AI", api: "API", wikipedia: "Wikipedia",
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
  january: "January", february: "February", march: "March", april: "April",
  may: "May", june: "June", july: "July", august: "August",
  september: "September", october: "October", november: "November", december: "December",
}

const PRESERVED_ABBREVIATIONS: Record<string, string> = {
  i: "I",
  ai: "AI",
  api: "API",
  apis: "APIs",
  llm: "LLM",
  llms: "LLMs",
  nlp: "NLP",
  seo: "SEO",
  gpt: "GPT",
  gptzero: "GPTZero",
  chatgpt: "ChatGPT",
  openai: "OpenAI",
  humaragpt: "HumaraGPT",
  ui: "UI",
  ux: "UX",
  cpu: "CPU",
  gpu: "GPU",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  js: "JS",
  ts: "TS",
  sql: "SQL",
  faq: "FAQ",
  url: "URL",
  http: "HTTP",
  https: "HTTPS",
  usa: "USA",
  uk: "UK",
  eu: "EU",
  un: "UN",
}

function applyCaseMap(text: string, caseMap: Record<string, string>) {
  return text.replace(/\b([a-z][a-z0-9]*)(?:'([a-z]+))?\b/g, (match, base: string, suffix?: string) => {
    const key = base.toLowerCase()
    if (!caseMap[key]) return match
    if (suffix) return `${caseMap[key]}'${suffix}`
    return caseMap[key]
  })
}

function fixProperNouns(text: string) {
  return applyCaseMap(text, PROPER_NOUNS)
}

export function toLowerSentenceStyle(raw: string): string {
  if (!raw) return ""
  const lower = raw.toLowerCase()
  return applyCaseMap(lower, PRESERVED_ABBREVIATIONS)
}

export function toSentenceCase(raw: string): string {
  if (!raw) return ""
  const lower = raw.toLowerCase()
  let result = ""
  let capitalizeNext = true
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]
    if (/[a-z]/.test(ch)) {
      result += capitalizeNext ? ch.toUpperCase() : ch
      capitalizeNext = false
    } else {
      result += ch
      if (/[.!?]/.test(ch)) capitalizeNext = true
      else if (/[\n\r]/.test(ch)) capitalizeNext = true
    }
  }
  return fixProperNouns(result)
}
