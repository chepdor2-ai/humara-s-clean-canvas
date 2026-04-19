/**
 * Citation formatters for OpenAlex works.
 * Supports APA 7, MLA 9, Chicago (author-date), Harvard, IEEE, Vancouver,
 * BibTeX, RIS and EndNote (.enw).
 *
 * These are pragmatic implementations — not perfect CSL, but accurate
 * enough for students and researchers to paste into a document.
 */

import type { OpenAlexWork, OpenAlexAuthorship } from './openalex'

export type CitationStyle =
  | 'apa'
  | 'mla'
  | 'chicago'
  | 'harvard'
  | 'ieee'
  | 'vancouver'
  | 'bibtex'
  | 'ris'
  | 'endnote'

export const CITATION_LABELS: Record<CitationStyle, string> = {
  apa: 'APA 7',
  mla: 'MLA 9',
  chicago: 'Chicago',
  harvard: 'Harvard',
  ieee: 'IEEE',
  vancouver: 'Vancouver',
  bibtex: 'BibTeX',
  ris: 'RIS',
  endnote: 'EndNote',
}

// ─────────────────────────── helpers ───────────────────────────

function getAuthors(w: OpenAlexWork): string[] {
  return (
    w.authorships
      ?.map((a) => a.author?.display_name || a.raw_author_name)
      .filter((n): n is string => Boolean(n)) ?? []
  )
}

function splitName(name: string): { given: string; family: string } {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { given: '', family: '' }
  // If name contains a comma, assume "Family, Given"
  if (trimmed.includes(',')) {
    const [family, rest] = trimmed.split(',')
    return { family: family.trim(), given: (rest || '').trim() }
  }
  const parts = trimmed.split(' ')
  if (parts.length === 1) return { family: parts[0], given: '' }
  const family = parts[parts.length - 1]
  const given = parts.slice(0, -1).join(' ')
  return { family, given }
}

function initials(given: string): string {
  if (!given) return ''
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + '.')
    .join(' ')
}

function formatName(name: string, mode: 'apa' | 'mla-first' | 'mla-rest' | 'chicago-first' | 'chicago-rest' | 'ieee' | 'vancouver'): string {
  const { family, given } = splitName(name)
  switch (mode) {
    case 'apa':
      return given ? `${family}, ${initials(given)}` : family
    case 'mla-first':
      return given ? `${family}, ${given}` : family
    case 'mla-rest':
      return given ? `${given} ${family}` : family
    case 'chicago-first':
      return given ? `${family}, ${given}` : family
    case 'chicago-rest':
      return given ? `${given} ${family}` : family
    case 'ieee':
      return given ? `${initials(given)} ${family}` : family
    case 'vancouver': {
      // "Family GM" — initials concatenated, no periods/spaces
      const inits = given
        .split(/[\s-]+/)
        .filter(Boolean)
        .map((p) => p[0]!.toUpperCase())
        .join('')
      return inits ? `${family} ${inits}` : family
    }
    default:
      return name
  }
}

function joinAuthorsApa(names: string[]): string {
  const apa = names.map((n) => formatName(n, 'apa'))
  if (apa.length === 0) return ''
  if (apa.length === 1) return apa[0]
  if (apa.length === 2) return `${apa[0]}, & ${apa[1]}`
  if (apa.length <= 20) return apa.slice(0, -1).join(', ') + ', & ' + apa[apa.length - 1]
  return apa.slice(0, 19).join(', ') + ', … ' + apa[apa.length - 1]
}

function joinAuthorsMla(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return formatName(names[0], 'mla-first') + '.'
  if (names.length === 2)
    return `${formatName(names[0], 'mla-first')}, and ${formatName(names[1], 'mla-rest')}.`
  return formatName(names[0], 'mla-first') + ', et al.'
}

function joinAuthorsChicago(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return formatName(names[0], 'chicago-first') + '.'
  if (names.length <= 3) {
    const first = formatName(names[0], 'chicago-first')
    const rest = names.slice(1).map((n) => formatName(n, 'chicago-rest'))
    if (rest.length === 1) return `${first}, and ${rest[0]}.`
    return `${first}, ${rest.slice(0, -1).join(', ')}, and ${rest[rest.length - 1]}.`
  }
  return formatName(names[0], 'chicago-first') + ', et al.'
}

function joinAuthorsHarvard(names: string[]): string {
  const formatted = names.map((n) => {
    const { family, given } = splitName(n)
    return given ? `${family}, ${initials(given)}` : family
  })
  if (formatted.length === 0) return ''
  if (formatted.length === 1) return formatted[0]
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`
  if (formatted.length === 3) return `${formatted[0]}, ${formatted[1]} and ${formatted[2]}`
  return `${formatted[0]} et al.`
}

function joinAuthorsIeee(names: string[]): string {
  const arr = names.map((n) => formatName(n, 'ieee'))
  if (arr.length === 0) return ''
  if (arr.length === 1) return arr[0]
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
  if (arr.length <= 6) return arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1]
  return `${arr[0]} et al.`
}

function joinAuthorsVancouver(names: string[]): string {
  const arr = names.slice(0, 6).map((n) => formatName(n, 'vancouver'))
  if (names.length > 6) arr.push('et al')
  return arr.join(', ') + '.'
}

function getDoi(w: OpenAlexWork): string | null {
  if (!w.doi) return null
  return w.doi.replace(/^https?:\/\/doi\.org\//, '')
}

function getDoiUrl(w: OpenAlexWork): string | null {
  const d = getDoi(w)
  return d ? `https://doi.org/${d}` : null
}

function getJournal(w: OpenAlexWork): string {
  return w.primary_location?.source?.display_name || w.best_oa_location?.source?.display_name || ''
}

function getBiblio(w: OpenAlexWork) {
  const b = w.biblio || {}
  const vol = b.volume || ''
  const iss = b.issue || ''
  const fp = b.first_page || ''
  const lp = b.last_page || ''
  const pages = fp && lp ? `${fp}–${lp}` : fp || ''
  return { vol, iss, pages }
}

function sanitizeBibkey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40) || 'ref'
}

// ─────────────────────────── formatters ───────────────────────────

function formatApa(w: OpenAlexWork): string {
  const names = getAuthors(w)
  const authors = joinAuthorsApa(names)
  const year = w.publication_year ? `(${w.publication_year})` : '(n.d.)'
  const title = w.title?.replace(/\s+/g, ' ').trim() || 'Untitled'
  const journal = getJournal(w)
  const { vol, iss, pages } = getBiblio(w)
  const doiUrl = getDoiUrl(w)

  let ref = `${authors} ${year}. ${title}.`
  if (journal) {
    let jpart = ` *${journal}*`
    if (vol) jpart += `, *${vol}*`
    if (iss) jpart += `(${iss})`
    if (pages) jpart += `, ${pages}`
    ref += jpart + '.'
  }
  if (doiUrl) ref += ` ${doiUrl}`
  return ref.replace(/\s+/g, ' ').trim()
}

function formatMla(w: OpenAlexWork): string {
  const names = getAuthors(w)
  const authors = joinAuthorsMla(names)
  const title = w.title?.replace(/\s+/g, ' ').trim() || 'Untitled'
  const journal = getJournal(w)
  const year = w.publication_year ?? 'n.d.'
  const { vol, iss, pages } = getBiblio(w)
  const doiUrl = getDoiUrl(w)

  let ref = `${authors} "${title}."`
  if (journal) {
    let jpart = ` *${journal}*`
    if (vol || iss) jpart += `, vol. ${vol}${iss ? `, no. ${iss}` : ''}`
    jpart += `, ${year}`
    if (pages) jpart += `, pp. ${pages}`
    ref += jpart + '.'
  } else {
    ref += ` ${year}.`
  }
  if (doiUrl) ref += ` ${doiUrl}.`
  return ref.replace(/\s+/g, ' ').trim()
}

function formatChicago(w: OpenAlexWork): string {
  const names = getAuthors(w)
  const authors = joinAuthorsChicago(names)
  const year = w.publication_year ?? 'n.d.'
  const title = w.title?.replace(/\s+/g, ' ').trim() || 'Untitled'
  const journal = getJournal(w)
  const { vol, iss, pages } = getBiblio(w)
  const doiUrl = getDoiUrl(w)

  let ref = `${authors} ${year}. "${title}."`
  if (journal) {
    let jpart = ` *${journal}*`
    if (vol) jpart += ` ${vol}`
    if (iss) jpart += `, no. ${iss}`
    if (pages) jpart += `: ${pages}`
    ref += jpart + '.'
  }
  if (doiUrl) ref += ` ${doiUrl}.`
  return ref.replace(/\s+/g, ' ').trim()
}

function formatHarvard(w: OpenAlexWork): string {
  const names = getAuthors(w)
  const authors = joinAuthorsHarvard(names)
  const year = w.publication_year ?? 'n.d.'
  const title = w.title?.replace(/\s+/g, ' ').trim() || 'Untitled'
  const journal = getJournal(w)
  const { vol, iss, pages } = getBiblio(w)
  const doiUrl = getDoiUrl(w)

  let ref = `${authors} (${year}) '${title}'`
  if (journal) {
    let jpart = `, *${journal}*`
    if (vol) jpart += `, ${vol}`
    if (iss) jpart += `(${iss})`
    if (pages) jpart += `, pp. ${pages}`
    ref += jpart + '.'
  } else {
    ref += '.'
  }
  if (doiUrl) ref += ` doi: ${doiUrl}`
  return ref.replace(/\s+/g, ' ').trim()
}

function formatIeee(w: OpenAlexWork): string {
  const names = getAuthors(w)
  const authors = joinAuthorsIeee(names)
  const title = w.title?.replace(/\s+/g, ' ').trim() || 'Untitled'
  const journal = getJournal(w)
  const year = w.publication_year ?? 'n.d.'
  const { vol, iss, pages } = getBiblio(w)
  const doiUrl = getDoiUrl(w)

  let ref = `${authors}, "${title},"`
  if (journal) {
    let jpart = ` *${journal}*`
    if (vol) jpart += `, vol. ${vol}`
    if (iss) jpart += `, no. ${iss}`
    if (pages) jpart += `, pp. ${pages}`
    jpart += `, ${year}`
    ref += jpart + '.'
  } else {
    ref += ` ${year}.`
  }
  if (doiUrl) ref += ` doi: ${doiUrl}.`
  return ref.replace(/\s+/g, ' ').trim()
}

function formatVancouver(w: OpenAlexWork): string {
  const names = getAuthors(w)
  const authors = joinAuthorsVancouver(names)
  const title = w.title?.replace(/\s+/g, ' ').trim() || 'Untitled'
  const journal = getJournal(w)
  const year = w.publication_year ?? ''
  const { vol, iss, pages } = getBiblio(w)
  const doiUrl = getDoiUrl(w)

  let ref = `${authors} ${title}.`
  if (journal) {
    let jpart = ` ${journal}. ${year}`
    if (vol) jpart += `;${vol}`
    if (iss) jpart += `(${iss})`
    if (pages) jpart += `:${pages}`
    ref += jpart + '.'
  } else if (year) {
    ref += ` ${year}.`
  }
  if (doiUrl) ref += ` doi:${doiUrl}`
  return ref.replace(/\s+/g, ' ').trim()
}

function formatBibtex(w: OpenAlexWork): string {
  const names = getAuthors(w)
  const first = names[0] ? splitName(names[0]).family : 'ref'
  const year = w.publication_year ?? ''
  const key = sanitizeBibkey(first) + (year ? String(year) : '')
  const authorField = names
    .map((n) => {
      const { family, given } = splitName(n)
      return given ? `${family}, ${given}` : family
    })
    .join(' and ')
  const journal = getJournal(w)
  const { vol, iss, pages } = getBiblio(w)
  const doi = getDoi(w)

  const lines: string[] = []
  lines.push(`@article{${key},`)
  if (w.title) lines.push(`  title = {${w.title}},`)
  if (authorField) lines.push(`  author = {${authorField}},`)
  if (journal) lines.push(`  journal = {${journal}},`)
  if (year) lines.push(`  year = {${year}},`)
  if (vol) lines.push(`  volume = {${vol}},`)
  if (iss) lines.push(`  number = {${iss}},`)
  if (pages) lines.push(`  pages = {${pages}},`)
  if (doi) lines.push(`  doi = {${doi}},`)
  // remove trailing comma on last line
  const last = lines.pop()!
  lines.push(last.replace(/,\s*$/, ''))
  lines.push('}')
  return lines.join('\n')
}

function formatRis(w: OpenAlexWork): string {
  const lines: string[] = []
  lines.push('TY  - JOUR')
  for (const name of getAuthors(w)) {
    const { family, given } = splitName(name)
    lines.push(`AU  - ${given ? `${family}, ${given}` : family}`)
  }
  if (w.title) lines.push(`TI  - ${w.title}`)
  const journal = getJournal(w)
  if (journal) lines.push(`JO  - ${journal}`)
  const { vol, iss, pages } = getBiblio(w)
  if (vol) lines.push(`VL  - ${vol}`)
  if (iss) lines.push(`IS  - ${iss}`)
  if (pages) {
    const [sp, ep] = pages.split(/[–-]/)
    if (sp) lines.push(`SP  - ${sp}`)
    if (ep) lines.push(`EP  - ${ep}`)
  }
  if (w.publication_year) lines.push(`PY  - ${w.publication_year}`)
  if (w.publication_date) lines.push(`DA  - ${w.publication_date}`)
  const doi = getDoi(w)
  if (doi) lines.push(`DO  - ${doi}`)
  const url = getDoiUrl(w)
  if (url) lines.push(`UR  - ${url}`)
  lines.push('ER  - ')
  return lines.join('\n')
}

function formatEndnote(w: OpenAlexWork): string {
  const lines: string[] = []
  lines.push('%0 Journal Article')
  for (const name of getAuthors(w)) {
    const { family, given } = splitName(name)
    lines.push(`%A ${given ? `${family}, ${given}` : family}`)
  }
  if (w.title) lines.push(`%T ${w.title}`)
  const journal = getJournal(w)
  if (journal) lines.push(`%J ${journal}`)
  const { vol, iss, pages } = getBiblio(w)
  if (vol) lines.push(`%V ${vol}`)
  if (iss) lines.push(`%N ${iss}`)
  if (pages) lines.push(`%P ${pages}`)
  if (w.publication_year) lines.push(`%D ${w.publication_year}`)
  const doi = getDoi(w)
  if (doi) lines.push(`%R ${doi}`)
  const url = getDoiUrl(w)
  if (url) lines.push(`%U ${url}`)
  return lines.join('\n')
}

// ─────────────────────────── public API ───────────────────────────

export function formatCitation(w: OpenAlexWork, style: CitationStyle): string {
  switch (style) {
    case 'apa':
      return formatApa(w)
    case 'mla':
      return formatMla(w)
    case 'chicago':
      return formatChicago(w)
    case 'harvard':
      return formatHarvard(w)
    case 'ieee':
      return formatIeee(w)
    case 'vancouver':
      return formatVancouver(w)
    case 'bibtex':
      return formatBibtex(w)
    case 'ris':
      return formatRis(w)
    case 'endnote':
      return formatEndnote(w)
    default:
      return formatApa(w)
  }
}

// Re-export helper for components that want author formatting
export type { OpenAlexAuthorship }
