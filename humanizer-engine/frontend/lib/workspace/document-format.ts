import type { WorkspaceDraftContent, WorkspaceSource } from '@/lib/workspace/types'

export type SupportedCitationStyle = 'APA 7' | 'MLA 9' | 'Chicago' | 'Harvard'
export type AcademicPaperMode = 'student' | 'professional'

export interface FormattingProfile {
  style: SupportedCitationStyle
  paperMode: AcademicPaperMode
  fontFamily: string
  fontSizePt: number
  lineSpacing: number
  coverPage: boolean
  showPageNumbers: boolean
  showRunningHead: boolean
  runningHead: string
  bibliographyHeading: string
  paragraphIndentInches: number
}

export interface ParsedDocumentSection {
  level: 1 | 2 | 3
  heading: string
  paragraphs: string[]
}

export interface ParsedDocumentFootnote {
  id: number
  text: string
}

export interface ParsedDocument {
  title: string
  sections: ParsedDocumentSection[]
  references: string[]
  footnotes: ParsedDocumentFootnote[]
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripDoiPrefix(value: string | null | undefined) {
  if (!value) return null
  return value
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
}

function surname(author: string) {
  const cleaned = compactWhitespace(author)
  if (!cleaned) return 'Unknown'
  const parts = cleaned.split(' ')
  return parts.at(-1) ?? cleaned
}

function initials(author: string) {
  const cleaned = compactWhitespace(author)
  if (!cleaned) return 'Unknown'
  const parts = cleaned.split(' ')
  const family = parts.pop() ?? ''
  const given = parts
    .filter(Boolean)
    .map((part) => `${part[0]}.`)
    .join(' ')
  return [family + ',', given].filter(Boolean).join(' ')
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

function sentenceCase(value: string) {
  if (!value) return value
  const lower = value.charAt(0).toUpperCase() + value.slice(1)
  return lower
}

function inlineCitationFromAuthors(source: WorkspaceSource, style: SupportedCitationStyle) {
  const authors = source.authors.filter(Boolean)
  const year = source.year || 'n.d.'
  const surnames = authors.map(surname)

  if (style === 'MLA 9') {
    if (surnames.length === 0) return `("${source.title}")`
    if (surnames.length === 1) return `(${surnames[0]})`
    return `(${surnames[0]} et al.)`
  }

  if (surnames.length === 0) return `(Unknown, ${year})`
  if (surnames.length === 1) return `(${surnames[0]}, ${year})`
  if (surnames.length === 2) return `(${surnames[0]} & ${surnames[1]}, ${year})`
  return `(${surnames[0]} et al., ${year})`
}

function formatLocator(source: WorkspaceSource) {
  const doi = stripDoiPrefix(source.doi)
  if (doi) return `https://doi.org/${doi}`
  return source.fullTextUrl ?? source.sourceUrl ?? null
}

export function normalizeCitationStyle(style?: string | null): SupportedCitationStyle {
  const lowered = style?.toLowerCase() ?? ''
  if (lowered.includes('mla')) return 'MLA 9'
  if (lowered.includes('chicago')) return 'Chicago'
  if (lowered.includes('harvard')) return 'Harvard'
  return 'APA 7'
}

export function inferPaperMode(style?: string | null, instructions?: string | null): AcademicPaperMode {
  const lowered = `${style ?? ''} ${instructions ?? ''}`.toLowerCase()
  if (lowered.includes('professional') || lowered.includes('publication') || lowered.includes('running head')) {
    return 'professional'
  }
  return 'student'
}

export function buildRunningHead(title: string) {
  const cleaned = title
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= 50) return cleaned

  const words = cleaned.split(' ')
  const chosen: string[] = []
  let length = 0
  for (const word of words) {
    const next = length === 0 ? word.length : word.length + 1
    if (length + next > 50) break
    chosen.push(word)
    length += next
  }
  return chosen.join(' ') || cleaned.slice(0, 50).trim()
}

export function createFormattingProfile(style?: string | null, title = 'Untitled Paper', instructions?: string | null): FormattingProfile {
  const normalizedStyle = normalizeCitationStyle(style)
  const paperMode = inferPaperMode(style, instructions)
  const defaultFamily = normalizedStyle === 'MLA 9' ? 'Times New Roman' : 'Times New Roman'
  const coverPage =
    normalizedStyle === 'MLA 9'
      ? false
      : true
  const bibliographyHeading =
    normalizedStyle === 'MLA 9'
      ? 'Works Cited'
      : normalizedStyle === 'Chicago'
        ? 'Bibliography'
        : 'References'

  return {
    style: normalizedStyle,
    paperMode,
    fontFamily: defaultFamily,
    fontSizePt: 12,
    lineSpacing: 2,
    coverPage,
    showPageNumbers: true,
    showRunningHead: normalizedStyle === 'MLA 9' || paperMode === 'professional',
    runningHead: buildRunningHead(title),
    bibliographyHeading,
    paragraphIndentInches: normalizedStyle === 'MLA 9' ? 0 : 0.5,
  }
}

export function formatBibliographyEntry(source: WorkspaceSource, style?: string | null) {
  const normalizedStyle = normalizeCitationStyle(style)
  const authors = source.authors.filter(Boolean)
  const locator = formatLocator(source)
  const year = source.year || 'n.d.'
  const title = compactWhitespace(source.title || 'Untitled source')
  const journal = compactWhitespace(source.journal || 'Unknown source')

  if (normalizedStyle === 'MLA 9') {
    const authorText =
      authors.length === 0
        ? ''
        : authors.length === 1
          ? `${surname(authors[0])}, ${authors[0].replace(new RegExp(`${surname(authors[0])}$`), '').trim()}. `
          : `${surname(authors[0])}, ${authors[0].replace(new RegExp(`${surname(authors[0])}$`), '').trim()}, et al. `
    return `${authorText}"${title}." ${journal}, ${year}.${locator ? ` ${locator}` : ''}`.trim()
  }

  if (normalizedStyle === 'Chicago') {
    const authorText =
      authors.length === 0
        ? 'Unknown'
        : authors.length === 1
          ? authors[0]
          : authors.length === 2
            ? `${authors[0]} and ${authors[1]}`
            : `${authors[0]} et al.`
    return `${authorText}. "${title}." ${journal} (${year}).${locator ? ` ${locator}` : ''}`.trim()
  }

  if (normalizedStyle === 'Harvard') {
    const authorText =
      authors.length === 0
        ? 'Unknown'
        : authors.length === 1
          ? `${surname(authors[0])}, ${authors[0].replace(new RegExp(`${surname(authors[0])}$`), '').trim()}`
          : `${surname(authors[0])}, ${authors[0].replace(new RegExp(`${surname(authors[0])}$`), '').trim()} et al.`
    return `${authorText} (${year}) ${title}. ${journal}.${locator ? ` Available at: ${locator}` : ''}`.trim()
  }

  const authorText =
    authors.length === 0
      ? 'Unknown'
      : authors.length <= 3
        ? authors.map(initials).join(', ')
        : `${initials(authors[0])}, et al.`
  return `${authorText} (${year}). ${sentenceCase(title)}. ${journal}.${locator ? ` ${locator}` : ''}`.trim()
}

export function collectUsedSources(content: WorkspaceDraftContent, sourceLibrary: WorkspaceSource[]) {
  const ids = new Set(content.sections.flatMap((section) => section.citations))
  const resolved = sourceLibrary.filter((source) => ids.has(source.id))
  return resolved.length > 0 ? resolved : sourceLibrary.slice(0, 5)
}

export function buildDraftMarkdown(content: WorkspaceDraftContent, sourceLibrary: WorkspaceSource[], style?: string | null) {
  const formatting = createFormattingProfile(style, content.title)
  const references = collectUsedSources(content, sourceLibrary).map((source) => formatBibliographyEntry(source, formatting.style))

  return [
    `# ${content.title}`,
    '',
    ...content.sections.flatMap((section) => [
      `## ${section.title}`,
      '',
      section.body,
      '',
    ]),
    '---REFERENCES---',
    '',
    `## ${formatting.bibliographyHeading}`,
    '',
    ...references,
  ].join('\n')
}

function renderInlineHtml(text: string) {
  return escapeHtml(text)
    .replace(/\[\^(\d+)\]/g, '<sup>$1</sup>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

export function buildDraftHtml(content: WorkspaceDraftContent, sourceLibrary: WorkspaceSource[], style?: string | null) {
  const formatting = createFormattingProfile(style, content.title)
  const references = collectUsedSources(content, sourceLibrary).map((source) => formatBibliographyEntry(source, formatting.style))

  return [
    '<article class="workspace-document">',
    `<h1>${escapeHtml(content.title)}</h1>`,
    ...content.sections.map((section) => [
      '<section>',
      `<h2>${escapeHtml(section.title)}</h2>`,
      ...section.body
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${renderInlineHtml(paragraph)}</p>`),
      '</section>',
    ].join('')),
    `<section class="workspace-references"><h2>${escapeHtml(formatting.bibliographyHeading)}</h2>`,
    ...references.map((reference) => `<p>${escapeHtml(reference)}</p>`),
    '</section>',
    '</article>',
  ].join('')
}

export function ensureInlineCitations(text: string, sources: WorkspaceSource[], style?: string | null) {
  if (sources.length === 0) return text
  if (/\([^)]*\d{4}[^)]*\)|\[\^\d+\]/.test(text)) return text
  return `${text} ${inlineCitationFromAuthors(sources[0], normalizeCitationStyle(style))}`.trim()
}

export function parseDocumentText(content: string, title = 'Untitled Paper'): ParsedDocument {
  const normalized = content.replace(/\r/g, '').trim()
  const lines = normalized.split('\n')
  const footnotes = new Map<number, string>()
  const bodyLines: string[] = []

  for (const line of lines) {
    const footnoteMatch = line.match(/^\[\^(\d+)\]:\s*(.+)$/)
    if (footnoteMatch) {
      footnotes.set(Number(footnoteMatch[1]), footnoteMatch[2].trim())
      continue
    }
    bodyLines.push(line)
  }

  const markerIndex = bodyLines.findIndex((line) => line.trim() === '---REFERENCES---')
  const contentLines = markerIndex >= 0 ? bodyLines.slice(0, markerIndex) : bodyLines
  const referenceLines = markerIndex >= 0 ? bodyLines.slice(markerIndex + 1) : []

  const parsedTitleLine = contentLines.find((line) => line.startsWith('# ')) ?? `# ${title}`
  const documentTitle = parsedTitleLine.replace(/^#\s+/, '').trim() || title

  const sections: ParsedDocumentSection[] = []
  let current: ParsedDocumentSection | null = null
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    const paragraph = paragraphBuffer.join(' ').trim()
    if (!paragraph) return
    if (!current) {
      current = { level: 2, heading: 'Body', paragraphs: [] }
      sections.push(current)
    }
    current.paragraphs.push(paragraph)
    paragraphBuffer = []
  }

  for (const line of contentLines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === parsedTitleLine.trim()) {
      flushParagraph()
      continue
    }

    const headingMatch = trimmed.match(/^(#{2,3})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      current = {
        level: headingMatch[1].length === 2 ? 2 : 3,
        heading: headingMatch[2].trim(),
        paragraphs: [],
      }
      sections.push(current)
      continue
    }

    paragraphBuffer.push(trimmed)
  }
  flushParagraph()

  const references = referenceLines
    .map((line) => line.trim())
    .filter((line) => line && !/^##\s+(references|works cited|bibliography)$/i.test(line))

  return {
    title: documentTitle,
    sections,
    references,
    footnotes: [...footnotes.entries()].map(([id, text]) => ({ id, text })),
  }
}

export function buildReferenceEntriesFromSources(sources: WorkspaceSource[], style?: string | null) {
  return sources.map((source) => formatBibliographyEntry(source, style))
}

export function buildDocumentSummaryLabel(style?: string | null, instructions?: string | null) {
  const profile = createFormattingProfile(style, 'Untitled Paper', instructions)
  return `${profile.style} ${titleCaseWords(profile.paperMode)}`
}
