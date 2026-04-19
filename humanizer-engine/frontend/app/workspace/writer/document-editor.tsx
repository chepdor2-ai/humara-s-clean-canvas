'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { EditorToolbar } from './editor-toolbar'
import { ChartBlock } from './chart-block'
import { parseChartSpec, type ChartSpec } from '@/lib/workspace/markdown'
import { exportDocx, exportHtml, exportPdf } from '@/lib/workspace/export'

export type DocumentEditorHandle = {
  appendHtml: (html: string) => void
  appendMarkdown: (html: string) => void
  getHtml: () => string
  getText: () => string
  replaceHtml: (html: string) => void
}

const STORAGE_KEY = 'humara-writer-doc'

type Props = {
  initialHtml?: string
  placeholder?: string
  filename?: string
}

export const DocumentEditor = forwardRef<DocumentEditorHandle, Props>(function DocumentEditor(
  { initialHtml, placeholder, filename = 'humara-paper.docx' },
  ref,
) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [fontFamily, setFontFamily] = useState('Calibri, Arial, sans-serif')
  const [fontSize, setFontSize] = useState('12')
  const [charts, setCharts] = useState<{ id: string; spec: ChartSpec; host: HTMLElement }[]>([])
  const [, setTick] = useState(0)

  // Load saved doc on mount
  useEffect(() => {
    if (!editorRef.current) return
    const saved = localStorage.getItem(STORAGE_KEY)
    const html = saved ?? initialHtml ?? ''
    editorRef.current.innerHTML = html
    rebindCharts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = useCallback(() => {
    if (!editorRef.current) return
    try {
      localStorage.setItem(STORAGE_KEY, editorRef.current.innerHTML)
    } catch {
      /* ignore quota */
    }
  }, [])

  // Scan for chart placeholder divs and mount React chart components into them
  const rebindCharts = useCallback(() => {
    if (!editorRef.current) return
    const hosts = Array.from(
      editorRef.current.querySelectorAll<HTMLElement>('.md-chart[data-chart="true"]'),
    )
    const next: { id: string; spec: ChartSpec; host: HTMLElement }[] = []
    hosts.forEach((host, idx) => {
      const id = host.getAttribute('data-chart-id') || `chart-${Date.now()}-${idx}`
      host.setAttribute('data-chart-id', id)
      const raw = host.getAttribute('data-chart-spec') || host.textContent || ''
      const spec = parseChartSpec(raw)
      if (!spec) return
      if (!host.getAttribute('data-chart-spec')) {
        host.setAttribute('data-chart-spec', raw)
        host.textContent = ''
      }
      next.push({ id, spec, host })
    })
    setCharts(next)
  }, [])

  const handleInput = () => {
    save()
    setTick((t) => t + 1)
  }

  useImperativeHandle(
    ref,
    () => ({
      appendHtml(html: string) {
        if (!editorRef.current) return
        editorRef.current.insertAdjacentHTML('beforeend', html)
        rebindCharts()
        save()
      },
      appendMarkdown(html: string) {
        if (!editorRef.current) return
        editorRef.current.insertAdjacentHTML('beforeend', html)
        rebindCharts()
        save()
      },
      replaceHtml(html: string) {
        if (!editorRef.current) return
        editorRef.current.innerHTML = html
        rebindCharts()
        save()
      },
      getHtml() {
        return editorRef.current?.innerHTML ?? ''
      },
      getText() {
        return editorRef.current?.innerText ?? ''
      },
    }),
    [rebindCharts, save],
  )

  // Toolbar actions
  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    try {
      document.execCommand(cmd, false, value)
    } catch {
      /* noop */
    }
    save()
  }

  const insertAtCursor = (html: string) => {
    editorRef.current?.focus()
    try {
      document.execCommand('insertHTML', false, html)
    } catch {
      editorRef.current?.insertAdjacentHTML('beforeend', html)
    }
    rebindCharts()
    save()
  }

  const insertTable = () => {
    const rawCols = window.prompt('Columns?', '3')
    const rawRows = window.prompt('Rows?', '3')
    const cols = Math.max(1, Math.min(10, Number(rawCols) || 3))
    const rows = Math.max(1, Math.min(30, Number(rawRows) || 3))
    let html = '<table class="md-table"><thead><tr>'
    for (let c = 0; c < cols; c++) html += `<th>Header ${c + 1}</th>`
    html += '</tr></thead><tbody>'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) html += '<td>&nbsp;</td>'
      html += '</tr>'
    }
    html += '</tbody></table><p><br/></p>'
    insertAtCursor(html)
  }

  const insertChart = () => {
    const sample: ChartSpec = {
      type: 'bar',
      title: 'Sample chart — edit the underlying JSON or replace',
      data: [
        { name: '2020', value: 40 },
        { name: '2021', value: 62 },
        { name: '2022', value: 78 },
        { name: '2023', value: 91 },
        { name: '2024', value: 105 },
      ],
    }
    const raw = JSON.stringify(sample, null, 2)
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    const html = `<div class="md-chart" data-chart="true" data-chart-spec="${escaped}" contenteditable="false"></div><p><br/></p>`
    insertAtCursor(html)
  }

  const insertHr = () => insertAtCursor('<hr class="md-hr" /><p><br/></p>')

  const insertImage = () => {
    const url = window.prompt('Image URL')
    if (!url) return
    const alt = window.prompt('Alt text (optional)') || ''
    insertAtCursor(
      `<figure class="md-figure"><img src="${url}" alt="${alt}" /></figure><p><br/></p>`,
    )
  }

  const clearDoc = () => {
    if (!window.confirm('Clear the entire document? This cannot be undone.')) return
    if (!editorRef.current) return
    editorRef.current.innerHTML = ''
    localStorage.removeItem(STORAGE_KEY)
    setCharts([])
  }

  const handleExportDocx = async () => {
    if (!editorRef.current) return
    await exportDocx(editorRef.current, filename)
  }

  const handleExportHtml = () => {
    if (!editorRef.current) return
    exportHtml(editorRef.current, filename.replace(/\.docx$/, '.html'))
  }

  // Font family/size via execCommand fontName / fontSize
  const handleFontFamily = (f: string) => {
    setFontFamily(f)
    exec('fontName', f)
  }
  const handleFontSize = (s: string) => {
    setFontSize(s)
    // execCommand fontSize accepts 1–7; we set style via wrapping in a span instead
    editorRef.current?.focus()
    try {
      document.execCommand('styleWithCSS', false, 'true')
      document.execCommand('fontSize', false, '4') // placeholder size to wrap
      // Replace the inserted <font size="4"> with our exact pt size
      const fonts = editorRef.current?.querySelectorAll('font[size="4"]')
      fonts?.forEach((f) => {
        const span = document.createElement('span')
        span.style.fontSize = `${s}pt`
        span.innerHTML = f.innerHTML
        f.replaceWith(span)
      })
    } catch {
      /* ignore */
    }
    save()
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100 dark:bg-zinc-950">
      <EditorToolbar
        onExec={exec}
        onInsertTable={insertTable}
        onInsertChart={insertChart}
        onInsertHr={insertHr}
        onInsertImage={insertImage}
        onExportDocx={handleExportDocx}
        onExportHtml={handleExportHtml}
        onPrint={exportPdf}
        onClear={clearDoc}
        fontFamily={fontFamily}
        onFontFamilyChange={handleFontFamily}
        fontSize={fontSize}
        onFontSizeChange={handleFontSize}
      />

      <div className="flex-1 overflow-y-auto px-4 py-6 print:overflow-visible print:px-0 print:py-0">
        <div className="mx-auto max-w-[8.5in]">
          <div
            ref={editorRef}
            className="word-page mx-auto min-h-[11in] bg-white px-[1in] py-[1in] shadow-sm outline-none ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 print:min-h-0 print:px-0 print:py-0 print:shadow-none print:ring-0"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Document editor"
            aria-multiline="true"
            style={{
              fontFamily,
              fontSize: `${fontSize}pt`,
              lineHeight: 1.5,
              color: 'inherit',
            }}
            onInput={handleInput}
            onBlur={save}
            onPaste={() => setTimeout(rebindCharts, 0)}
            data-placeholder={placeholder}
          />
        </div>
      </div>

      {charts.map((c) =>
        createPortal(<ChartBlock spec={c.spec} />, c.host),
      )}

      <style jsx global>{`
        .word-page:empty::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
        .word-page h1 {
          font-size: 1.9em;
          font-weight: 700;
          margin: 0.6em 0 0.3em;
        }
        .word-page h2 {
          font-size: 1.5em;
          font-weight: 700;
          margin: 0.6em 0 0.25em;
        }
        .word-page h3 {
          font-size: 1.2em;
          font-weight: 700;
          margin: 0.5em 0 0.2em;
        }
        .word-page h4 {
          font-size: 1.05em;
          font-weight: 700;
          margin: 0.5em 0 0.2em;
        }
        .word-page p {
          margin: 0 0 0.75em;
        }
        .word-page ul,
        .word-page ol {
          margin: 0 0 0.75em 1.25rem;
          padding-left: 1rem;
        }
        .word-page ul {
          list-style: disc;
        }
        .word-page ol {
          list-style: decimal;
        }
        .word-page li {
          margin-bottom: 0.25em;
        }
        .word-page a {
          color: #0e7490;
          text-decoration: underline;
        }
        .word-page code.md-code {
          background: #f1f5f9;
          padding: 0.1em 0.35em;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 0.95em;
        }
        .dark .word-page code.md-code {
          background: #27272a;
        }
        .word-page pre.md-pre {
          background: #0f172a;
          color: #e2e8f0;
          padding: 1em;
          border-radius: 6px;
          overflow-x: auto;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
          margin: 0.75em 0;
        }
        .word-page blockquote.md-quote {
          border-left: 3px solid #cbd5e1;
          color: #475569;
          margin: 0.75em 0;
          padding-left: 1rem;
          font-style: italic;
        }
        .dark .word-page blockquote.md-quote {
          border-color: #3f3f46;
          color: #a1a1aa;
        }
        .word-page hr.md-hr {
          border: 0;
          border-top: 1px solid #cbd5e1;
          margin: 1.25em 0;
        }
        .word-page table.md-table,
        .word-page table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.75em 0;
          font-size: 0.95em;
        }
        .word-page table.md-table th,
        .word-page table.md-table td,
        .word-page table th,
        .word-page table td {
          border: 1px solid #cbd5e1;
          padding: 0.4em 0.6em;
          vertical-align: top;
        }
        .dark .word-page table.md-table th,
        .dark .word-page table.md-table td,
        .dark .word-page table th,
        .dark .word-page table td {
          border-color: #3f3f46;
        }
        .word-page table.md-table thead th {
          background: #f1f5f9;
          font-weight: 600;
          text-align: left;
        }
        .dark .word-page table.md-table thead th {
          background: #27272a;
        }
        .word-page figure.md-figure {
          margin: 0.75em 0;
          text-align: center;
        }
        .word-page figure.md-figure img {
          max-width: 100%;
          height: auto;
        }
        .word-page .md-chart {
          user-select: none;
        }

        @media print {
          @page {
            margin: 1in;
            size: Letter;
          }
          body {
            background: #fff !important;
          }
          .word-page {
            box-shadow: none !important;
            ring: 0 !important;
          }
        }
      `}</style>
    </div>
  )
})
