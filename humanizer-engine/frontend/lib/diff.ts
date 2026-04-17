export type DiffToken = { text: string; type: "eq" | "add" | "del" }

function tokenize(text: string) {
  return text.match(/\S+|\s+/g) ?? []
}

export function wordDiff(oldText: string, newText: string): DiffToken[] {
  const a = tokenize(oldText)
  const b = tokenize(newText)
  const n = a.length
  const m = b.length

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i].trim() && a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else if (!a[i].trim() && !b[j].trim()) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const tokens: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const same = a[i] === b[j] || (!a[i].trim() && !b[j].trim())
    if (same) {
      tokens.push({ text: b[j], type: "eq" })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ text: a[i], type: "del" })
      i++
    } else {
      tokens.push({ text: b[j], type: "add" })
      j++
    }
  }
  while (i < n) tokens.push({ text: a[i++], type: "del" })
  while (j < m) tokens.push({ text: b[j++], type: "add" })
  return tokens
}

export function changeRatio(oldText: string, newText: string) {
  const tokens = wordDiff(oldText, newText)
  const considered = tokens.filter((t) => t.text.trim().length > 0)
  if (considered.length === 0) return 0
  const changed = considered.filter((t) => t.type !== "eq").length
  return changed / considered.length
}
