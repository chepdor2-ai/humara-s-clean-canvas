/**
 * Client-side export helpers.
 *  - exportDocx: walks the document HTML and builds a .docx using `docx`.
 *  - exportPdf: uses the browser's print dialog with a printable stylesheet.
 *  - exportHtml: raw .html file.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function extractRuns(el: Element): TextRun[] {
  const runs: TextRun[] = []
  const walk = (node: Node, inherited: { bold?: boolean; italic?: boolean; underline?: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) {
        runs.push(
          new TextRun({
            text,
            bold: inherited.bold,
            italics: inherited.italic,
            underline: inherited.underline ? {} : undefined,
          }),
        )
      }
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const e = node as HTMLElement
    const tag = e.tagName.toLowerCase()
    const next = { ...inherited }
    if (tag === 'strong' || tag === 'b') next.bold = true
    if (tag === 'em' || tag === 'i') next.italic = true
    if (tag === 'u') next.underline = true
    if (tag === 'br') {
      runs.push(new TextRun({ text: '', break: 1 }))
      return
    }
    e.childNodes.forEach((c) => walk(c, next))
  }
  el.childNodes.forEach((c) => walk(c, {}))
  return runs
}

function buildParagraphsFromElement(el: Element): (Paragraph | Table)[] {
  const tag = el.tagName.toLowerCase()

  if (/^h[1-6]$/.test(tag)) {
    const levelIdx = Number(tag[1]) - 1
    const headingLevels = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ]
    return [
      new Paragraph({
        heading: headingLevels[Math.min(5, Math.max(0, levelIdx))],
        children: extractRuns(el),
      }),
    ]
  }

  if (tag === 'p' || tag === 'div') {
    const runs = extractRuns(el)
    if (runs.length === 0) return [new Paragraph('')]
    const align =
      (el as HTMLElement).style?.textAlign === 'center'
        ? AlignmentType.CENTER
        : (el as HTMLElement).style?.textAlign === 'right'
        ? AlignmentType.RIGHT
        : (el as HTMLElement).style?.textAlign === 'justify'
        ? AlignmentType.JUSTIFIED
        : AlignmentType.LEFT
    return [new Paragraph({ children: runs, alignment: align })]
  }

  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(el.querySelectorAll(':scope > li'))
    return items.map(
      (li) =>
        new Paragraph({
          bullet: tag === 'ul' ? { level: 0 } : undefined,
          numbering: tag === 'ol' ? { reference: 'numbered-list', level: 0 } : undefined,
          children: extractRuns(li),
        }),
    )
  }

  if (tag === 'blockquote') {
    return [
      new Paragraph({
        indent: { left: 720 },
        children: extractRuns(el),
      }),
    ]
  }

  if (tag === 'hr') {
    return [
      new Paragraph({
        border: { bottom: { color: '999999', size: 6, style: 'single', space: 1 } },
      }),
    ]
  }

  if (tag === 'table') {
    const tableRows: TableRow[] = []
    const rowEls = Array.from(el.querySelectorAll('tr'))
    rowEls.forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('th,td'))
      if (!cells.length) return
      tableRows.push(
        new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                width: { size: Math.floor(9000 / cells.length), type: WidthType.DXA },
                children: [
                  new Paragraph({
                    children: extractRuns(cell),
                  }),
                ],
              }),
          ),
        }),
      )
    })
    if (tableRows.length === 0) return []
    return [
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
    ]
  }

  // Skip chart divs (can't embed Recharts as DOCX natively); add a placeholder.
  if (el.getAttribute('data-chart') === 'true') {
    return [
      new Paragraph({
        children: [new TextRun({ text: '[Chart — rendered in the web editor]', italics: true })],
      }),
    ]
  }

  // Default: treat as paragraph with extracted runs
  const runs = extractRuns(el)
  if (runs.length === 0) return []
  return [new Paragraph({ children: runs })]
}

export async function exportDocx(
  root: HTMLElement,
  filename = 'document.docx',
): Promise<void> {
  const blocks: (Paragraph | Table)[] = []
  Array.from(root.children).forEach((child) => {
    blocks.push(...buildParagraphsFromElement(child))
  })

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'numbered-list',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 24 }, // 12pt
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch
          },
        },
        children: blocks.length ? blocks : [new Paragraph('')],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, filename)
}

export function exportHtml(root: HTMLElement, filename = 'document.html') {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${filename}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; max-width: 8.5in; margin: 1in auto; line-height: 1.5; }
  h1,h2,h3,h4 { font-family: 'Calibri Light', Arial, sans-serif; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #999; padding: 6px 10px; }
  blockquote { border-left: 3px solid #ccc; padding-left: 1rem; color: #555; }
</style></head>
<body>${root.innerHTML}</body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  triggerDownload(blob, filename)
}

export function exportPdf() {
  // The editor is print-styled; just trigger the browser print dialog.
  window.print()
}
