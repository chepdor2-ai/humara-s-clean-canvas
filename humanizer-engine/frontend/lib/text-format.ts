const PROPER_NOUNS: Record<string, string> = {
  i: "I", gpt: "GPT", gptzero: "GPTZero", openai: "OpenAI", chatgpt: "ChatGPT",
  humaragpt: "HumaraGPT", ai: "AI", api: "API", wikipedia: "Wikipedia",
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
  january: "January", february: "February", march: "March", april: "April",
  may: "May", june: "June", july: "July", august: "August",
  september: "September", october: "October", november: "November", december: "December",
}

function fixProperNouns(text: string) {
  return text.replace(/\b([a-z]+)([''][a-z]+)?\b/g, (match, base: string, suffix?: string) => {
    const key = base.toLowerCase()
    if (PROPER_NOUNS[key]) return PROPER_NOUNS[key] + (suffix ?? "")
    return match
  })
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
