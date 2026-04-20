'use client'

import { memo, useState, useCallback } from 'react'
import { Check, Copy, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  isStreaming?: boolean
}

/** Simple markdown-ish renderer for bold, italic, lists, headings, code, blockquotes */
function renderMarkdown(text: string) {
  // Remove artifact tags for chat display - artifacts are shown in the document pane
  const cleaned = text
    .replace(/<artifact[^>]*>/gi, '')
    .replace(/<\/artifact>/gi, '')
    .trim()

  if (!cleaned) return null

  const lines = cleaned.split('\n')
  const elements: React.ReactNode[] = []
  let inList = false
  let listItems: string[] = []
  let listType: 'ul' | 'ol' = 'ul'
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeLang = ''

  const flushList = () => {
    if (listItems.length > 0) {
      if (listType === 'ol') {
        elements.push(
          <ol key={`ol-${elements.length}`} className="my-2 ml-5 list-decimal space-y-1 text-sm text-slate-700 dark:text-zinc-300">
            {listItems.map((item, i) => (
              <li key={i} className="leading-relaxed">{inlineFormat(item)}</li>
            ))}
          </ol>
        )
      } else {
        elements.push(
          <ul key={`ul-${elements.length}`} className="my-2 ml-5 list-disc space-y-1 text-sm text-slate-700 dark:text-zinc-300">
            {listItems.map((item, i) => (
              <li key={i} className="leading-relaxed">{inlineFormat(item)}</li>
            ))}
          </ul>
        )
      }
      listItems = []
      inList = false
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        elements.push(
          <div key={`code-${i}`} className="my-3 overflow-hidden rounded-xl border border-slate-200/60 dark:border-white/10">
            {codeLang && (
              <div className="flex items-center justify-between border-b border-slate-200/60 bg-slate-100 px-4 py-1.5 dark:border-white/5 dark:bg-white/5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-zinc-500">{codeLang}</span>
              </div>
            )}
            <pre className="overflow-x-auto bg-slate-900 p-4 text-xs leading-relaxed text-emerald-300 dark:bg-[#0d1117]">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        )
        inCodeBlock = false
        codeLines = []
        codeLang = ''
      } else {
        // Start code block
        flushList()
        inCodeBlock = true
        codeLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      flushList()
      elements.push(
        <h4 key={i} className="mt-4 mb-1.5 text-sm font-bold text-slate-800 dark:text-zinc-100">
          {inlineFormat(line.slice(4))}
        </h4>
      )
    } else if (line.startsWith('## ')) {
      flushList()
      elements.push(
        <h3 key={i} className="mt-4 mb-1.5 text-base font-bold text-slate-800 dark:text-zinc-100">
          {inlineFormat(line.slice(3))}
        </h3>
      )
    } else if (line.startsWith('# ')) {
      flushList()
      elements.push(
        <h2 key={i} className="mt-4 mb-2 text-lg font-bold text-slate-800 dark:text-zinc-100">
          {inlineFormat(line.slice(2))}
        </h2>
      )
    }
    // Blockquotes
    else if (line.startsWith('> ')) {
      flushList()
      elements.push(
        <blockquote key={i} className="my-2 border-l-3 border-cyan-400 pl-4 text-sm italic text-slate-600 dark:border-cyan-500/50 dark:text-zinc-400">
          {inlineFormat(line.slice(2))}
        </blockquote>
      )
    }
    // Horizontal rule
    else if (/^[-*_]{3,}$/.test(line.trim())) {
      flushList()
      elements.push(<hr key={i} className="my-4 border-slate-200 dark:border-white/10" />)
    }
    // Unordered list items
    else if (/^[-*•]\s/.test(line)) {
      if (!inList || listType !== 'ul') {
        flushList()
      }
      inList = true
      listType = 'ul'
      listItems.push(line.replace(/^[-*•]\s/, ''))
    }
    // Ordered list items
    else if (/^\d+\.\s/.test(line)) {
      if (!inList || listType !== 'ol') {
        flushList()
      }
      inList = true
      listType = 'ol'
      listItems.push(line.replace(/^\d+\.\s/, ''))
    }
    // Empty line
    else if (!line.trim()) {
      flushList()
      elements.push(<div key={`br-${i}`} className="h-2" />)
    }
    // Normal paragraph
    else {
      flushList()
      elements.push(
        <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
          {inlineFormat(line)}
        </p>
      )
    }
  }
  flushList()

  return <>{elements}</>
}

/** Format inline bold (**), italic (*), inline code (``), strikethrough (~~) */
function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  // Match **bold**, *italic*, `code`, ~~strikethrough~~
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-slate-900 dark:text-white">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index} className="text-slate-600 dark:text-zinc-400">{match[3]}</em>)
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-xs font-mono text-pink-600 dark:bg-zinc-800 dark:text-pink-400">
          {match[4]}
        </code>
      )
    } else if (match[5]) {
      parts.push(<del key={match.index} className="text-slate-400 dark:text-zinc-600">{match[5]}</del>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? <>{parts}</> : text
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  timestamp,
  isStreaming,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    // Copy without artifact tags
    const cleanContent = content
      .replace(/<artifact[^>]*>/gi, '')
      .replace(/<\/artifact>/gi, '')
      .trim()
    navigator.clipboard.writeText(cleanContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  const isUser = role === 'user'

  return (
    <div className={cn('group relative flex gap-3 px-4 py-4', isUser ? 'justify-end' : 'justify-start')}>
      {/* Assistant avatar */}
      {!isUser && (
        <div className="humara-avatar-sm flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white shadow-lg shadow-cyan-500/20">
          H
        </div>
      )}

      <div
        className={cn(
          'relative max-w-[80%] rounded-2xl px-4 py-3',
          isUser
            ? 'chat-user-bubble bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/15'
            : 'chat-assistant-bubble bg-white/80 text-slate-800 shadow-sm ring-1 ring-slate-200/60 dark:bg-white/5 dark:text-zinc-100 dark:ring-white/10',
        )}
      >
        {/* Assistant label */}
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
            <span className={cn(
              "inline-block h-1.5 w-1.5 rounded-full bg-cyan-500",
              isStreaming ? "animate-pulse" : ""
            )} />
            HumaraGPT
          </div>
        )}

        {/* Message content */}
        <div className={cn('chat-msg-content', isUser ? 'text-sm leading-relaxed' : '')}>
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
          ) : (
            renderMarkdown(content)
          )}
          {isStreaming && (
            <span className="typing-cursor inline-block h-4 w-[2px] bg-cyan-500 ml-0.5 align-middle" />
          )}
        </div>

        {/* Timestamp */}
        {timestamp && !isStreaming && (
          <div className={cn('mt-2 text-[10px]', isUser ? 'text-white/50' : 'text-slate-400 dark:text-zinc-600')}>
            {timestamp}
          </div>
        )}

        {/* Action buttons (assistant only) */}
        {!isUser && !isStreaming && content.length > 0 && (
          <div className="absolute -bottom-3 left-4 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-0.5 opacity-0 shadow-sm transition-all group-hover:opacity-100 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              onClick={handleCopy}
              className="rounded p-1 text-slate-400 transition-colors hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              title="Copy"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-zinc-700 dark:to-zinc-800">
          <User className="h-4 w-4 text-slate-600 dark:text-zinc-400" />
        </div>
      )}
    </div>
  )
})
