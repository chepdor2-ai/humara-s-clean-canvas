"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Type, Download, RefreshCw, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Issue {
  start: number;
  end: number;
  message: string;
  replacements: string[];
  severity: "error" | "warning" | "style";
  ruleId: string;
  aiDetected?: boolean;
}

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  onCheck: () => void;
  isChecking: boolean;
  issues?: Issue[] | null;
  activeIssueIdx: number | null;
  onIssueClick: (idx: number) => void;
  onAcceptIssue: (idx: number, rep: string) => void;
  onExportTarget: (type: 'pdf' | 'docx' | 'txt') => void;
  onRewriteSelection: (text: string, mode: 'phantom' | 'synonym') => Promise<string | null>;
}

export function RichTextEditor({
  value,
  onChange,
  onCheck,
  isChecking,
  issues,
  activeIssueIdx,
  onIssueClick,
  onAcceptIssue,
  onExportTarget,
  onRewriteSelection,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [rangeRef, setRangeRef] = useState<Range | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isEditingRef = useRef(false);

  // Initialize content ONLY when it's structurally empty or changed externally (like load example)
  useEffect(() => {
    if (editorRef.current && !isEditingRef.current) {
      if (editorRef.current.innerText.trim() !== value.trim() && !issues) {
        editorRef.current.innerText = value;
      }
    }
  }, [value, issues]);

  // Handle underlying text changes
  const handleInput = () => {
    if (editorRef.current) {
      isEditingRef.current = true;
      onChange(editorRef.current.innerText);
    }
  };

  const handleBlur = () => {
    isEditingRef.current = false;
  };

  // Execute formatting command
  const execCmd = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    handleInput();
  };

  // Selection change for Context Menu (Synonyms/Rewriting)
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setMenuPos(null);
        return;
      }
      
      const range = selection.getRangeAt(0);
      const text = range.toString().trim();
      
      // Ensure selection is inside editor
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer) && text.length > 0) {
        const rect = range.getBoundingClientRect();
        // Position menu above selection
        setMenuPos({ top: rect.top - 50, left: rect.left + rect.width / 2 });
        setSelectedText(text);
        setRangeRef(range);
      } else {
        setMenuPos(null);
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  const handleRewrite = async (mode: 'phantom' | 'synonym') => {
    if (!selectedText || !rangeRef) return;
    setIsProcessing(true);
    try {
      const replacement = await onRewriteSelection(selectedText, mode);
      if (replacement && rangeRef) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(rangeRef);
        document.execCommand('insertText', false, replacement);
        handleInput();
        setMenuPos(null);
        toast.success(`Text updated via ${mode === 'phantom' ? 'Phantom' : 'Synonym AI'}!`);
      }
    } catch (e) {
      toast.error("Failed to rephrase. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Render grammar issues on top of text
  const renderGrammarView = () => {
    if (!issues || !value) return null;
    
    // Fallback simple renderer if we have issues (Replacing inner HTML temporarily)
    const sorted = [...issues].map((iss, idx) => ({ ...iss, _idx: idx })).sort((a, b) => a.start - b.start);
    const parts: { text: string; isIssue: boolean; idx: number; sev: string; ai: boolean }[] = [];
    let cursor = 0;
    
    for (const issue of sorted) {
      if (issue.start > cursor) {
        parts.push({ text: value.slice(cursor, issue.start), isIssue: false, idx: -1, sev: 'error', ai: false });
      }
      if (issue.end > cursor) {
        parts.push({ 
          text: value.slice(Math.max(cursor, issue.start), issue.end), 
          isIssue: true, 
          idx: issue._idx, 
          sev: issue.severity, 
          ai: !!issue.aiDetected 
        });
        cursor = issue.end;
      }
    }
    if (cursor < value.length) parts.push({ text: value.slice(cursor), isIssue: false, idx: -1, sev: 'error', ai: false });

    return (
      <div className="word-editor-text whitespace-pre-wrap">
        {parts.map((s, i) =>
          s.isIssue ? (
            <span key={i} onClick={(e) => { e.stopPropagation(); onIssueClick(s.idx); }}
              className={`underline decoration-wavy decoration-2 underline-offset-4 cursor-pointer transition-all duration-150
                ${s.ai ? 'decoration-cyan-500/80' : s.sev === 'error' ? 'decoration-red-500/80' : s.sev === 'warning' ? 'decoration-amber-500/80' : 'decoration-blue-500/80'}
                ${activeIssueIdx === s.idx ? 'bg-emerald-100/70 dark:bg-emerald-950/30 rounded-sm' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/30 rounded-sm'}`}>
              {s.text}
            </span>
          ) : <span key={i}>{s.text}</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 w-full relative group">
      
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 border-b border-slate-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-sm sticky top-0 z-10 rounded-t-lg">
        <div className="flex items-center gap-1.5">
          <button onClick={() => execCmd('bold')} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors" title="Bold">
            <Bold className="w-4 h-4" />
          </button>
          <button onClick={() => execCmd('italic')} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors" title="Italic">
            <Italic className="w-4 h-4" />
          </button>
          <button onClick={() => execCmd('underline')} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors" title="Underline">
            <Underline className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-300 dark:bg-zinc-700 mx-1" />
          <button onClick={() => execCmd('justifyLeft')} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors" title="Align Left">
            <AlignLeft className="w-4 h-4" />
          </button>
          <button onClick={() => execCmd('justifyCenter')} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors" title="Center">
            <AlignCenter className="w-4 h-4" />
          </button>
          <button onClick={() => execCmd('justifyRight')} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors" title="Align Right">
            <AlignRight className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-300 dark:bg-zinc-700 mx-1" />
          <select 
            onChange={(e) => execCmd('fontName', e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-600 dark:text-zinc-300 outline-none hover:bg-slate-200 dark:hover:bg-zinc-800 p-1.5 rounded-md cursor-pointer"
          >
            <option value="Cambria">Cambria</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Georgia">Georgia</option>
          </select>
          <select 
            onChange={(e) => execCmd('fontSize', e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-600 dark:text-zinc-300 outline-none hover:bg-slate-200 dark:hover:bg-zinc-800 p-1.5 rounded-md cursor-pointer"
          >
            <option value="3">Normal</option>
            <option value="4">Large</option>
            <option value="5">Huge</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          <div className="relative group/export">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-md transition-colors">
              <Download className="w-4 h-4" /> Download
            </button>
            <div className="absolute top-full right-0 mt-1 hidden group-hover/export:flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 w-32 py-1">
              <button onClick={() => onExportTarget('docx')} className="text-left px-4 py-2 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors">Word (.docx)</button>
              <button onClick={() => onExportTarget('pdf')} className="text-left px-4 py-2 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors">PDF (.pdf)</button>
              <button onClick={() => onExportTarget('txt')} className="text-left px-4 py-2 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">Text (.txt)</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Editor Body ── */}
      <div 
        className="flex-1 w-full min-h-0 relative p-6 sm:p-10 cursor-text"
        onClick={() => { if (!issues && editorRef.current) editorRef.current.focus(); }}
      >
        {issues && issues.length >= 0 ? (
          renderGrammarView()
        ) : (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCheck(); } }}
            className="word-editor-text h-full min-h-[400px] w-full outline-none"
            spellCheck="false"
            data-placeholder="Start typing or paste your text here... (Ctrl+Enter to check)"
          />
        )}
      </div>

      {/* ── Context Menu (Selection) ── */}
      {menuPos && !issues && (
        <div 
          className="fixed z-50 transform -translate-x-1/2 flex items-center gap-1 p-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl shadow-black/10 origin-bottom animate-in zoom-in-95 duration-200"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {isProcessing ? (
            <div className="px-4 py-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Rewriting...
            </div>
          ) : (
            <>
              {selectedText.split(/\s+/).length === 1 ? (
                <button onClick={() => handleRewrite('synonym')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                  <Wand2 className="w-3.5 h-3.5 text-indigo-500" /> Synonyms
                </button>
              ) : (
                <button onClick={() => handleRewrite('phantom')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors">
                  <Wand2 className="w-3.5 h-3.5 text-emerald-500" /> Phantom Rephrase
                </button>
              )}
              <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1" />
              <button onClick={() => setMenuPos(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Placeholder injection via CSS if empty */}
      <style dangerouslySetInnerHTML={{__html: `
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
          display: block;
        }
        .dark [contenteditable]:empty:before {
          color: #52525b;
        }
      `}} />
    </div>
  );
}
