/**
 * Minimal, dependency-free Markdown → HTML converter tuned for academic papers.
 * Supports: headings, paragraphs, bold, italic, inline code, links, lists,
 * blockquotes, horizontal rules, fenced code blocks (including `chart` for
 * custom chart embedding), and GFM tables.
 *
 * Note: this is intentionally lean. We escape HTML, then transform a few
 * block/inline patterns. Output is sanitized (escape-first) so it's safe to
 * place inside contentEditable.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(s: string): string {
  // Escape first
  let out = escapeHtml(s)
  // Inline code `foo`
  out = out.replace(/`([^`]+)`/g, (_m, g1) => `<code class="md-code">${g1}</code>`)
  // Bold **x** or __x__
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  // Italic *x* or _x_ (avoid inside words)
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>')
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>')
  // Links [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text, href) =>
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  )
  return out
}

function renderTable(lines: string[]): string {
  // lines like: | a | b |
  const rows = lines.map((l) =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim()),
  )
  if (rows.length < 2) return ''
  const header = rows[0]
  const align = rows[1].map((c) => {
    if (/^:-+:$/.test(c)) return 'center'
    if (/^-+:$/.test(c)) return 'right'
    if (/^:-+$/.test(c)) return 'left'
    return ''
  })
  const body = rows.slice(2)
  const th = header
    .map(
      (h, i) =>
        `<th${align[i] ? ` style="text-align:${align[i]}"` : ''}>${inline(h)}</th>`,
    )
    .join('')
  const tbody = body
    .map(
      (r) =>
        '<tr>' +
        r
          .map(
            (c, i) =>
              `<td${align[i] ? ` style="text-align:${align[i]}"` : ''}>${inline(c)}</td>`,
          )
          .join('') +
        '</tr>',
    )
    .join('')
  return `<table class="md-table"><thead><tr>${th}</tr></thead><tbody>${tbody}</tbody></table>`
}

export function markdownToHtml(md: string): string {
  if (!md) return ''
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    const fenceMatch = line.match(/^```(\w+)?\s*$/)
    if (fenceMatch) {
      const lang = fenceMatch[1] || ''
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing fence
      const content = codeLines.join('\n')
      if (lang === 'chart') {
        // Embed chart marker; editor will render a <div data-chart>...</div>
        const encoded = escapeHtml(content)
        out.push(
          `<div class="md-chart" data-chart="true" contenteditable="false">${encoded}</div>`,
        )
      } else {
        out.push(
          `<pre class="md-pre"><code class="md-code-block${lang ? ` lang-${lang}` : ''}">${escapeHtml(content)}</code></pre>`,
        )
      }
      continue
    }

    // Horizontal rule
    if (/^-{3,}\s*$/.test(line) || /^_{3,}\s*$/.test(line) || /^\*{3,}\s*$/.test(line)) {
      out.push('<hr class="md-hr" />')
      i++
      continue
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      out.push(`<h${level}>${inline(h[2])}</h${level}>`)
      i++
      continue
    }

    // Table (header | sep | rows)
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const tableLines: string[] = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i])
        i++
      }
      out.push(renderTable(tableLines))
      continue
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote class="md-quote">${inline(buf.join(' '))}</blockquote>`)
      continue
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      out.push('<ul>' + items.map((it) => `<li>${inline(it)}</li>`).join('') + '</ul>')
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      out.push('<ol>' + items.map((it) => `<li>${inline(it)}</li>`).join('') + '</ol>')
      continue
    }

    // Blank line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph (gather consecutive non-empty lines that aren't block starts)
    const buf: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^>/.test(lines[i]) &&
      !/^\|.*\|\s*$/.test(lines[i]) &&
      !/^-{3,}\s*$/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`)
  }

  return out.join('\n')
}

/**
 * Extract the chart JSON specs embedded as ```chart code blocks,
 * replaced by <div class="md-chart"> markers in markdownToHtml.
 */
export type ChartSpec = {
  type: 'bar' | 'line' | 'pie' | 'area'
  title?: string
  data: Array<Record<string, string | number>>
  xKey?: string
  yKey?: string
}

export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const decoded = raw
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
    const obj = JSON.parse(decoded)
    if (!obj || !obj.type || !Array.isArray(obj.data)) return null
    return obj as ChartSpec
  } catch {
    return null
  }
}
