'use client'

import { useState } from 'react'
import { MessageSquare, Plus, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ChatConversation {
  id: string
  title: string
  messages: { role: 'user' | 'assistant'; content: string; timestamp: string }[]
  createdAt: string
  updatedAt: string
}

interface ChatHistoryProps {
  conversations: ChatConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  isOpen: boolean
  onClose: () => void
}

export function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onClose,
}: ChatHistoryProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter conversations by search query
  const filteredConversations = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.messages.some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : conversations

  // Group conversations by date
  const today = new Date()
  const todayStr = today.toDateString()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toDateString()

  const grouped = {
    today: filteredConversations.filter((c) => new Date(c.updatedAt).toDateString() === todayStr),
    yesterday: filteredConversations.filter((c) => new Date(c.updatedAt).toDateString() === yesterdayStr),
    older: filteredConversations.filter((c) => {
      const d = new Date(c.updatedAt).toDateString()
      return d !== todayStr && d !== yesterdayStr
    }),
  }

  const renderConversation = (conv: ChatConversation) => {
    const isActive = conv.id === activeId
    return (
      <div
        key={conv.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(conv.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(conv.id) }}
        onMouseEnter={() => setHoveredId(conv.id)}
        onMouseLeave={() => setHoveredId(null)}
        className={cn(
          'group flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all',
          isActive
            ? 'bg-white shadow-sm ring-1 ring-slate-200/60 dark:bg-white/8 dark:ring-white/10'
            : 'hover:bg-white/60 dark:hover:bg-white/3',
        )}
      >
        <MessageSquare
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            isActive ? 'text-cyan-500' : 'text-slate-400 dark:text-zinc-600',
          )}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-sm font-medium',
              isActive
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-700 dark:text-zinc-300',
            )}
          >
            {conv.title}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-zinc-600">
            {conv.messages.length} message{conv.messages.length !== 1 ? 's' : ''} ·{' '}
            {new Date(conv.updatedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </div>
        </div>

        {/* Delete button */}
        {(hoveredId === conv.id || isActive) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(conv.id)
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-100 hover:text-red-500 dark:text-zinc-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            title="Delete conversation"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    )
  }

  const renderSection = (label: string, items: ChatConversation[]) => {
    if (items.length === 0) return null
    return (
      <div className="mb-2">
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-600">
          {label}
        </div>
        <div className="space-y-0.5">
          {items.map(renderConversation)}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'chat-history-sidebar flex h-full w-72 shrink-0 flex-col border-r border-slate-200/80 bg-slate-50/95 backdrop-blur-md transition-transform duration-300 dark:border-white/5 dark:bg-[#0a0c14]/95',
          'fixed z-50 md:relative md:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/60 px-4 py-3.5 dark:border-white/5">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Chat History</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onNew}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-cyan-500/10 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-400"
              title="New Chat"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-200/60 md:hidden dark:text-zinc-400 dark:hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* New Chat button */}
        <div className="px-3 py-2">
          <button
            onClick={onNew}
            className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition-all hover:border-cyan-400 hover:bg-cyan-500/5 hover:text-cyan-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-cyan-500/40 dark:hover:text-cyan-400"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-xs dark:border-zinc-800 dark:bg-white/3">
            <Search className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-600" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none dark:text-zinc-300 dark:placeholder-zinc-600"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 premium-scroll">
          {filteredConversations.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-zinc-700" />
              <p className="text-xs text-slate-400 dark:text-zinc-600">
                {searchQuery ? (
                  <>No results for &ldquo;{searchQuery}&rdquo;</>
                ) : (
                  <>
                    No conversations yet.
                    <br />
                    Start a new chat to begin.
                  </>
                )}
              </p>
            </div>
          ) : (
            <>
              {renderSection('Today', grouped.today)}
              {renderSection('Yesterday', grouped.yesterday)}
              {renderSection('Older', grouped.older)}
            </>
          )}
        </div>

        {/* Footer branding */}
        <div className="border-t border-slate-200/60 px-4 py-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm shadow-cyan-500/20" />
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <span className="text-cyan-600 dark:text-cyan-400">Humara</span>GPT
              </div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-600">AI Writing Assistant</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
