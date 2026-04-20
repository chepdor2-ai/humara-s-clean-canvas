'use client'

import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Italic,
  Maximize2,
  Minimize2,
  Redo2,
  RefreshCw,
  SpellCheck,
  Underline,
  Undo2,
  Wand2,
  X,
  Check,
  Highlighter,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DocumentArtifactProps {
  title: string
  content: string
  onContentChange: (content: string) => void
  onClose: () => void
  isFullScreen?: boolean
  onToggleFullScreen?: () => void
  format?: 'APA' | 'MLA' | 'Harvard' | 'Chicago' | string
  coverpage?: boolean
}

export function DocumentArtifact({
  title,
  content,
  onContentChange,
  onClose,
  isFullScreen,
  onToggleFullScreen,
  format,
  coverpage,
}: DocumentArtifactProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [synonymPopup, setSynonymPopup] = useState<{
    word: string
    synonyms: string[]
    pos: { top: number; left: number }
    range: Range | null
  } | null>(null)
  const [rephraseMenu, setRephraseMenu] = useState<{
    text: string
    pos: { top: number; left: number }
    range: Range | null
  } | null>(null)
  const [isRephrasing, setIsRephrasing] = useState(false)
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false)
  const [grammarIssues, setGrammarIssues] = useState<Array<{
    start: number
    end: number
    message: string
    correction: string
    severity: string
  }>>([])
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [selectedFont, setSelectedFont] = useState('Times New Roman')
  const [selectedSize, setSelectedSize] = useState('12pt')
  const [copied, setCopied] = useState(false)
  const isEditingRef = useRef(false)

  // Initialize editor
  useEffect(() => {
    if (editorRef.current && !isEditingRef.current) {
      const currentText = editorRef.current.innerText.trim()
      const newText = content.trim()
      if (currentText !== newText) {
        editorRef.current.innerHTML = formatContentToHtml(content)
      }
    }
  }, [content])

  // Update word count and page count
  useEffect(() => {
    const text = content || ''
    const words = text.split(/\s+/).filter(Boolean)
    setWordCount(words.length)
    setCharCount(text.length)
    // Estimate pages: ~250 words per page
    setPageCount(Math.max(1, Math.ceil(words.length / 250)))
  }, [content])

  // Format content to HTML paragraphs
  function formatContentToHtml(text: string): string {
    if (!text) return ''
    let html = ''

    // Add Cover Page if required
    if (coverpage) {
      html += `<div style="text-align: center; margin-bottom: 40px; page-break-after: always; display: flex; flex-direction: column; justify-content: center; min-height: 800px;">
        <h1 style="font-size:32px;font-weight:bold;margin-bottom:20px;font-family:'${selectedFont}';color:#1e293b">${title}</h1>
        <p style="font-size:16px;font-family:'${selectedFont}';color:#475569">Format: ${format || 'Standard'}</p>
      </div>`
    }

    const paragraphsHtml = text
      .split('\n\n')
      .map((paragraph) => {
        const trimmed = paragraph.trim()
        if (!trimmed) return ''
        // Headings (markdown # style)
        if (trimmed.startsWith('# ')) {
          const headingText = trimmed.slice(2).replace(/\*+/g, '').trim()
          return `<h1 style="font-size:24px;font-weight:bold;margin:20px 0 10px;font-family:'${selectedFont}';color:#1e293b">${headingText}</h1>`
        }
        if (trimmed.startsWith('## ')) {
          const headingText = trimmed.slice(3).replace(/\*+/g, '').trim()
          return `<h2 style="font-size:18px;font-weight:bold;margin:18px 0 8px;font-family:'${selectedFont}';color:#334155">${headingText}</h2>`
        }
        if (trimmed.startsWith('### ')) {
          const headingText = trimmed.slice(4).replace(/\*+/g, '').trim()
          return `<h3 style="font-size:15px;font-weight:bold;margin:14px 0 6px;font-family:'${selectedFont}';color:#475569">${headingText}</h3>`
        }
        // Detect standalone bold lines as headings (e.g. **Introduction** or **References**)
        const standaloneBoldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
        if (standaloneBoldMatch && trimmed.split(/\s+/).length <= 10) {
          const headingText = standaloneBoldMatch[1].replace(/\*+/g, '').trim()
          return `<h2 style="font-size:18px;font-weight:bold;margin:18px 0 8px;font-family:'${selectedFont}';color:#334155">${headingText}</h2>`
        }
        // Bold and italic — strip residual asterisks from any remaining text
        const formatted = trimmed
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/(?<!\w)\*+|\*+(?!\w)/g, '')

        return `<p style="margin:0 0 12px;line-height:2;text-indent:0;text-align:justify;font-family:'${selectedFont}';font-size:${selectedSize}">${formatted}</p>`
      })
      .filter(Boolean)
      .join('')

    return html + paragraphsHtml
  }

  // Handle editor input
  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isEditingRef.current = true
      onContentChange(editorRef.current.innerText)
      // Reset after a tick
      setTimeout(() => {
        isEditingRef.current = false
      }, 100)
    }
  }, [onContentChange])

  // Execute formatting command
  const execCmd = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val)
    editorRef.current?.focus()
  }, [])

  // Copy all content
  const handleCopyAll = useCallback(() => {
    const text = editorRef.current?.innerText || content
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Content copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  // Handle double-click for synonyms
  const handleDoubleClick = useCallback(async () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const range = selection.getRangeAt(0)
    const word = selection.toString().trim()

    if (!word || word.includes(' ') || word.length < 2) return

    const rect = range.getBoundingClientRect()

    try {
      const res = await fetch('/api/synonyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word }),
      })

      if (!res.ok) return

      const data = await res.json()
      const synonymList =
        data.synonyms
          ?.filter((s: { isOriginal: boolean }) => !s.isOriginal)
          ?.map((s: { word: string }) => s.word) || []

      if (synonymList.length > 0) {
        setSynonymPopup({
          word,
          synonyms: synonymList.slice(0, 8),
          pos: { top: rect.bottom + 4, left: rect.left },
          range: range.cloneRange(),
        })
      }
    } catch {
      // Silently fail
    }
  }, [])

  // Apply synonym
  const applySynonym = useCallback(
    (synonym: string) => {
      if (!synonymPopup?.range) return
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(synonymPopup.range)
      document.execCommand('insertText', false, synonym)
      setSynonymPopup(null)
      handleInput()
      toast.success(`Replaced with "${synonym}"`)
    },
    [synonymPopup, handleInput],
  )

  // Handle text selection for rephrase menu
  useEffect(() => {
    const checkSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return
      }

      const range = selection.getRangeAt(0)
      const text = selection.toString().trim()

      if (
        text.length > 5 &&
        text.includes(' ') &&
        editorRef.current?.contains(range.commonAncestorContainer)
      ) {
        const rect = range.getBoundingClientRect()
        setRephraseMenu({
          text,
          pos: { top: rect.top - 48, left: rect.left + rect.width / 2 },
          range: range.cloneRange(),
        })
      } else if (text.length <= 5 || !text.includes(' ')) {
        setRephraseMenu(null)
      }
    }

    document.addEventListener('selectionchange', checkSelection)
    return () => document.removeEventListener('selectionchange', checkSelection)
  }, [])

  // Rephrase selected text
  const handleRephrase = useCallback(async () => {
    if (!rephraseMenu?.range) return
    setIsRephrasing(true)

    try {
      const res = await fetch('/api/workspace/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Rephrase this sentence to be clearer and more professional while keeping the same meaning. Return ONLY the rephrased text, nothing else: "${rephraseMenu.text}"`,
          messages: [],
        }),
      })

      if (!res.ok || !res.body) throw new Error('Rephrase failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let result = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.content) result += parsed.content
            } catch { /* skip */ }
          }
        }
      }

      if (result.trim() && rephraseMenu.range) {
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(rephraseMenu.range)
        document.execCommand('insertText', false, result.trim().replace(/^["']|["']$/g, ''))
        handleInput()
        toast.success('Sentence rephrased!')
      }
    } catch {
      toast.error('Failed to rephrase. Try again.')
    } finally {
      setIsRephrasing(false)
      setRephraseMenu(null)
    }
  }, [rephraseMenu, handleInput])

  // Grammar check
  const handleGrammarCheck = useCallback(async () => {
    if (!editorRef.current) return
    setIsCheckingGrammar(true)
    setGrammarIssues([])

    try {
      const text = editorRef.current.innerText
      const res = await fetch('/api/grammar-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) throw new Error('Grammar check failed')

      const data = await res.json()
      if (data.issues && data.issues.length > 0) {
        setGrammarIssues(data.issues)
        toast.success(`Found ${data.issues.length} issue${data.issues.length > 1 ? 's' : ''}`)
      } else {
        toast.success('No grammar issues found!')
      }
    } catch {
      toast.error('Grammar check failed')
    } finally {
      setIsCheckingGrammar(false)
    }
  }, [])

  // Export functions
  const handleExport = useCallback(
    async (type: 'docx' | 'pdf' | 'txt' | 'pptx') => {
      setShowExportMenu(false)
      const text = editorRef.current?.innerText || content

      if (type === 'txt') {
        const blob = new Blob([text], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Downloaded as TXT')
        return
      }

      if (type === 'pdf') {
        try {
          const { jsPDF } = await import('jspdf')
          const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
          pdf.setFontSize(20)
          pdf.text(title, 48, 54)
          pdf.setFontSize(12)
          const lines = pdf.splitTextToSize(text, 500)
          let y = 88
          for (const line of lines) {
            if (y > 780) {
              pdf.addPage()
              y = 48
            }
            pdf.text(line, 48, y)
            y += 18
          }
          pdf.save(`${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`)
          toast.success('Downloaded as PDF')
        } catch {
          toast.error('PDF export failed')
        }
        return
      }

      if (type === 'docx') {
        try {
          const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
          const paragraphs = text.split('\n').filter(Boolean)
          const doc = new Document({
            sections: [
              {
                children: [
                  new Paragraph({
                    heading: HeadingLevel.TITLE,
                    children: [new TextRun({ text: title, bold: true, size: 32 })],
                  }),
                  ...paragraphs.map(
                    (p) =>
                      new Paragraph({
                        children: [new TextRun({ text: p, size: 24, font: selectedFont })],
                        spacing: { after: 200, line: 480 },
                      }),
                  ),
                ],
              },
            ],
          })

          const blob = await Packer.toBlob(doc)
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`
          a.click()
          URL.revokeObjectURL(url)
          toast.success('Downloaded as DOCX')
        } catch {
          toast.error('DOCX export failed')
        }
        return
      }

      if (type === 'pptx') {
        try {
          const pptxgen = (await import('pptxgenjs')).default
          const pptx = new pptxgen()
          
          let slide = pptx.addSlide()
          slide.addText(title, { x: 1, y: 3, w: '80%', h: 1, align: 'center', fontSize: 32, bold: true })
          if (format) {
             slide.addText(`Format: ${format}`, { x: 1, y: 4, w: '80%', h: 1, align: 'center', fontSize: 16 })
          }

          const paragraphs = text.split('\n').filter(Boolean)
          let currentSlide = pptx.addSlide()
          let yPos = 0.5
          
          for (const p of paragraphs) {
            if (yPos > 4.5) {
               currentSlide = pptx.addSlide()
               yPos = 0.5
            }
            if (p.startsWith('## ') || p.startsWith('# ')) {
               const cleanTitle = p.replace(/#/g, '').trim()
               currentSlide = pptx.addSlide()
               currentSlide.addText(cleanTitle, { x: 0.5, y: 0.5, w: '90%', fontSize: 24, bold: true })
               yPos = 1.5
            } else {
               const cleanP = p.replace(/\*\*/g, '').trim()
               if (!cleanP) continue
               currentSlide.addText(cleanP, { x: 0.5, y: yPos, w: '90%', fontSize: 14 })
               yPos += 1.2
            }
          }
          
          pptx.writeFile({ fileName: `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pptx` })
          toast.success('Downloaded as PPTX')
        } catch (e) {
          console.error(e)
          toast.error('PPTX export failed')
        }
      }
    },
    [title, content, selectedFont, format],
  )

  // Change font
  const handleFontChange = useCallback(
    (font: string) => {
      setSelectedFont(font)
      if (editorRef.current) {
        editorRef.current.style.fontFamily = font
      }
    },
    [],
  )

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return
    const handleClick = () => setShowExportMenu(false)
    setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => document.removeEventListener('click', handleClick)
  }, [showExportMenu])

  return (
    <div
      className={cn(
        'document-artifact-pane flex h-full flex-col border-l border-slate-200/80 bg-gradient-to-b from-slate-100 to-slate-50 dark:border-white/5 dark:from-[#0e1018] dark:to-[#0a0c14]',
        isFullScreen && 'fixed inset-0 z-50',
      )}
    >
      {/* ── Document Header ── */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-2 backdrop-blur-sm dark:border-white/5 dark:bg-[#0d0f18]/90">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10">
            <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-white">{title}</div>
            <div className="text-[10px] text-slate-400 dark:text-zinc-600">
              Document · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyAll}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300"
            title="Copy all"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            onClick={onToggleFullScreen}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300"
            title={isFullScreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-100 hover:text-red-500 dark:text-zinc-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200/60 bg-white/70 px-3 py-1.5 backdrop-blur-sm dark:border-white/5 dark:bg-[#0d0f18]/70">
        {/* Undo/Redo */}
        <button onClick={() => execCmd('undo')} className="doc-toolbar-btn" title="Undo">
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCmd('redo')} className="doc-toolbar-btn" title="Redo">
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-zinc-800" />

        {/* Font selector */}
        <select
          value={selectedFont}
          onChange={(e) => handleFontChange(e.target.value)}
          className="doc-toolbar-select h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="Times New Roman">Times New Roman</option>
          <option value="Arial">Arial</option>
          <option value="Cambria">Cambria</option>
          <option value="Georgia">Georgia</option>
          <option value="Calibri">Calibri</option>
          <option value="Garamond">Garamond</option>
        </select>

        {/* Size selector */}
        <select
          value={selectedSize}
          onChange={(e) => setSelectedSize(e.target.value)}
          className="doc-toolbar-select h-7 w-16 rounded-md border border-slate-200 bg-white px-1 text-xs text-slate-700 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="10pt">10</option>
          <option value="11pt">11</option>
          <option value="12pt">12</option>
          <option value="14pt">14</option>
          <option value="16pt">16</option>
          <option value="18pt">18</option>
          <option value="20pt">20</option>
          <option value="24pt">24</option>
        </select>

        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-zinc-800" />

        {/* Format buttons */}
        <button onClick={() => execCmd('bold')} className="doc-toolbar-btn" title="Bold (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCmd('italic')} className="doc-toolbar-btn" title="Italic (Ctrl+I)">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCmd('underline')} className="doc-toolbar-btn" title="Underline (Ctrl+U)">
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCmd('hiliteColor', '#fef08a')} className="doc-toolbar-btn" title="Highlight">
          <Highlighter className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-zinc-800" />

        {/* Alignment */}
        <button onClick={() => execCmd('justifyLeft')} className="doc-toolbar-btn" title="Align Left">
          <AlignLeft className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCmd('justifyCenter')} className="doc-toolbar-btn" title="Center">
          <AlignCenter className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCmd('justifyRight')} className="doc-toolbar-btn" title="Align Right">
          <AlignRight className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => execCmd('justifyFull')} className="doc-toolbar-btn" title="Justify">
          <AlignJustify className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-zinc-800" />

        {/* Grammar Check */}
        <button
          onClick={handleGrammarCheck}
          disabled={isCheckingGrammar}
          className="doc-toolbar-btn-accent flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          title="Check Grammar"
        >
          {isCheckingGrammar ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <SpellCheck className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Grammar</span>
        </button>

        {/* Export */}
        <div className="relative ml-auto">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowExportMenu(!showExportMenu)
            }}
            className="doc-toolbar-btn-accent flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Download</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
              <button
                onClick={() => handleExport('docx')}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-emerald-50 dark:text-zinc-300 dark:hover:bg-emerald-500/10"
              >
                <FileText className="h-4 w-4 text-emerald-500" /> Word Document (.docx)
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-cyan-50 dark:text-zinc-300 dark:hover:bg-cyan-500/10"
              >
                <FileText className="h-4 w-4 text-cyan-500" /> PDF Document (.pdf)
              </button>
              <button
                onClick={() => handleExport('pptx')}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-orange-50 dark:text-zinc-300 dark:hover:bg-orange-500/10"
              >
                <FileText className="h-4 w-4 text-orange-500" /> PowerPoint (.pptx)
              </button>
              <button
                onClick={() => handleExport('txt')}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                <FileText className="h-4 w-4 text-slate-500" /> Plain Text (.txt)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Document Body (Word-like A4 page) ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 doc-page-container premium-scroll">
        <div
          className="doc-a4-page relative mx-auto"
          onClick={() => editorRef.current?.focus()}
        >
          {/* Editable area */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onDoubleClick={handleDoubleClick}
            className="doc-editor-body min-h-[800px] outline-none"
            style={{
              fontFamily: selectedFont,
              fontSize: selectedSize,
              lineHeight: '2',
            }}
            spellCheck={false}
            data-placeholder="Your document will appear here. Start typing or ask HumaraGPT to write one..."
          />
        </div>
      </div>

      {/* ── Footer Status Bar ── */}
      <div className="flex items-center justify-between border-t border-slate-200/60 bg-white/80 px-4 py-1.5 text-[11px] backdrop-blur-sm dark:border-white/5 dark:bg-[#0d0f18]/80">
        <div className="flex items-center gap-4 text-slate-500 dark:text-zinc-500">
          <span>{wordCount.toLocaleString()} words</span>
          <span>{charCount.toLocaleString()} characters</span>
          <span>Page {pageCount}</span>
          {grammarIssues.length > 0 && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <SpellCheck className="h-3 w-3" />
              {grammarIssues.length} issue{grammarIssues.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="text-slate-400 dark:text-zinc-600">{selectedFont} · {selectedSize}</div>
      </div>

      {/* ── Synonym Popup ── */}
      {synonymPopup && (
        <div
          className="fixed z-[60] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-2xl backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95"
          style={{ top: synonymPopup.pos.top, left: synonymPopup.pos.left }}
        >
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-600">
              Synonyms for &ldquo;{synonymPopup.word}&rdquo;
            </span>
            <button
              onClick={() => setSynonymPopup(null)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:text-zinc-600 dark:hover:text-zinc-400"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {synonymPopup.synonyms.map((syn) => (
              <button
                key={syn}
                onClick={() => applySynonym(syn)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition-all hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-400"
              >
                {syn}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Rephrase Context Menu ── */}
      {rephraseMenu && !synonymPopup && (
        <div
          className="fixed z-[60] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95"
          style={{ top: rephraseMenu.pos.top, left: rephraseMenu.pos.left }}
        >
          {isRephrasing ? (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Rephrasing...
            </div>
          ) : (
            <>
              <button
                onClick={handleRephrase}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-emerald-50 dark:text-zinc-200 dark:hover:bg-emerald-900/30"
              >
                <Wand2 className="h-3.5 w-3.5 text-emerald-500" /> Rephrase
              </button>
              <div className="h-4 w-px bg-slate-200 dark:bg-zinc-800" />
              <button
                onClick={() => setRephraseMenu(null)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 dark:hover:bg-zinc-800"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Inline styles ── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .doc-editor-body:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
          display: block;
          font-style: italic;
        }
        .dark .doc-editor-body:empty:before {
          color: #52525b;
        }
      `,
        }}
      />
    </div>
  )
}
