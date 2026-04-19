'use client'

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  Eraser,
  FileDown,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Printer,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
} from 'lucide-react'
import { useCallback } from 'react'
import { cn } from '@/lib/utils'

type ToolbarProps = {
  onExec: (cmd: string, value?: string) => void
  onInsertTable: () => void
  onInsertChart: () => void
  onInsertHr: () => void
  onInsertImage: () => void
  onExportDocx: () => void
  onExportHtml: () => void
  onPrint: () => void
  onClear: () => void
  fontFamily: string
  onFontFamilyChange: (f: string) => void
  fontSize: string
  onFontSizeChange: (s: string) => void
}

const FONTS = [
  { value: 'Calibri, Arial, sans-serif', label: 'Calibri' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Cambria", serif', label: 'Cambria' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: '"Helvetica Neue", Helvetica, sans-serif', label: 'Helvetica' },
]

const FONT_SIZES = ['10', '11', '12', '14', '16', '18', '20', '24', '28', '32']

export function EditorToolbar(props: ToolbarProps) {
  const {
    onExec,
    onInsertTable,
    onInsertChart,
    onInsertHr,
    onInsertImage,
    onExportDocx,
    onExportHtml,
    onPrint,
    onClear,
    fontFamily,
    onFontFamilyChange,
    fontSize,
    onFontSizeChange,
  } = props

  const btn = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    extra?: string,
  ) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50',
        extra,
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  )

  const handleLink = useCallback(() => {
    const url = window.prompt('Enter URL')
    if (!url) return
    onExec('createLink', url)
  }, [onExec])

  return (
    <div className="sticky top-14 z-10 flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 print:hidden">
      {/* Font family */}
      <select
        value={fontFamily}
        onChange={(e) => onFontFamilyChange(e.target.value)}
        className="mr-1 h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        title="Font family"
        aria-label="Font family"
      >
        {FONTS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font size */}
      <select
        value={fontSize}
        onChange={(e) => onFontSizeChange(e.target.value)}
        className="mr-1 h-8 w-[72px] rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        title="Font size"
        aria-label="Font size"
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}pt
          </option>
        ))}
      </select>

      <Divider />

      {btn(<Undo2 className="h-4 w-4" />, 'Undo', () => onExec('undo'))}
      {btn(<Redo2 className="h-4 w-4" />, 'Redo', () => onExec('redo'))}

      <Divider />

      {btn(<Bold className="h-4 w-4" />, 'Bold', () => onExec('bold'))}
      {btn(<Italic className="h-4 w-4" />, 'Italic', () => onExec('italic'))}
      {btn(<Underline className="h-4 w-4" />, 'Underline', () => onExec('underline'))}
      {btn(<Strikethrough className="h-4 w-4" />, 'Strikethrough', () => onExec('strikeThrough'))}

      <Divider />

      {btn(<Heading1 className="h-4 w-4" />, 'Heading 1', () => onExec('formatBlock', 'H1'))}
      {btn(<Heading2 className="h-4 w-4" />, 'Heading 2', () => onExec('formatBlock', 'H2'))}
      {btn(<Heading3 className="h-4 w-4" />, 'Heading 3', () => onExec('formatBlock', 'H3'))}

      <Divider />

      {btn(<AlignLeft className="h-4 w-4" />, 'Align left', () => onExec('justifyLeft'))}
      {btn(<AlignCenter className="h-4 w-4" />, 'Align center', () => onExec('justifyCenter'))}
      {btn(<AlignRight className="h-4 w-4" />, 'Align right', () => onExec('justifyRight'))}
      {btn(<AlignJustify className="h-4 w-4" />, 'Justify', () => onExec('justifyFull'))}

      <Divider />

      {btn(<List className="h-4 w-4" />, 'Bulleted list', () => onExec('insertUnorderedList'))}
      {btn(<ListOrdered className="h-4 w-4" />, 'Numbered list', () => onExec('insertOrderedList'))}
      {btn(<Quote className="h-4 w-4" />, 'Block quote', () => onExec('formatBlock', 'BLOCKQUOTE'))}

      <Divider />

      {btn(<Link2 className="h-4 w-4" />, 'Insert link', handleLink)}
      {btn(<TableIcon className="h-4 w-4" />, 'Insert table', onInsertTable)}
      {btn(<ImageIcon className="h-4 w-4" />, 'Insert image', onInsertImage)}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onInsertChart}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        title="Insert chart"
      >
        <span>Chart</span>
      </button>
      {btn(<Minus className="h-4 w-4" />, 'Horizontal rule', onInsertHr)}

      <Divider />

      {btn(<Eraser className="h-4 w-4" />, 'Clear formatting', () => onExec('removeFormat'))}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onExportDocx}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-cyan-600 px-3 text-xs font-medium text-white hover:bg-cyan-700"
          title="Download as Word (.docx)"
        >
          <FileDown className="h-3.5 w-3.5" />
          Word
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          title="Print / Save as PDF"
        >
          <Printer className="h-3.5 w-3.5" />
          PDF
        </button>
        <button
          type="button"
          onClick={onExportHtml}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          title="Export HTML"
        >
          <Download className="h-3.5 w-3.5" />
          HTML
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Clear document"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-zinc-800" aria-hidden="true" />
}
