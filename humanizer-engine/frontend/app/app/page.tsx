'use client';
import { useState } from 'react';
import { ArrowRight, Copy, Check, SlidersHorizontal, ArrowLeftRight, CheckCircle2 } from 'lucide-react';

export default function EditorPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleHumanize = async () => {
    if (!text) return;
    setLoading(true);
    setTimeout(() => {
      setResult('This is your beautifully reconstructed text, carefully optimized to bypass all AI detectors while preserving perfect academic tone and structure. ' + text.substring(0, 50));
      setLoading(false);
    }, 1500);
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-sora text-[#5C4033]">Humanizer Editor</h1>
          <p className="text-[#8A7263]">Transform your draft with academic precision.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[#EADDCF] rounded-lg text-[#5C4033] font-medium shadow-sm hover:bg-[#F5EBE1] transition-colors">
          <ArrowLeftRight className="w-4 h-4" /> Compare Changes
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        <div className="col-span-1 lg:col-span-3 bg-white rounded-2xl border border-[#EADDCF] p-5 flex flex-col gap-6 shadow-sm overflow-y-auto">
          <div className="flex items-center gap-2 text-[#5C4033] font-bold border-b border-[#EADDCF] pb-3">
            <SlidersHorizontal className="w-5 h-5 text-[#D97757]"/> Engine Controls
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-bold text-[#5C4033] flex justify-between">
              Variation % <span>85%</span>
            </label>
            <input type="range" min="0" max="100" defaultValue="85" className="w-full accent-[#D97757] cursor-pointer" />
            <p className="text-xs text-[#8A7263]">Dial in exact rewriting variation for safety.</p>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#EADDCF]">
            <label className="text-sm font-bold text-[#5C4033]">Target Tone</label>
            <select className="w-full bg-[#F5EBE1] border border-[#EADDCF] rounded-lg p-2.5 text-sm text-[#5C4033] outline-none">
              <option>Academic (Formal)</option>
              <option>Professional</option>
              <option>Creative</option>
            </select>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#EADDCF]">
            <label className="text-sm font-bold text-[#5C4033]">Strictness</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#F5EBE1] rounded-lg">
              <button className="bg-white rounded-md py-1.5 text-xs font-bold text-[#D97757] shadow-sm">Strict Edit</button>
              <button className="py-1.5 text-xs font-bold text-[#8A7263] hover:text-[#5C4033]">Flexible</button>
            </div>
            <p className="text-xs text-[#8A7263]">Strict mode forces specific vocabulary retention.</p>
          </div>

          <button 
             onClick={handleHumanize}
             disabled={!text || loading}
             className="mt-auto w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#D97757] hover:bg-[#C96342] text-white font-bold rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
             {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/> : "Rewrite Now"}
          </button>
        </div>

        <div className="col-span-1 lg:col-span-9 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 flex flex-col gap-2">
            <label className="text-sm font-bold text-[#8A7263] pl-1">Input Text</label>
            <textarea 
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full flex-1 p-5 rounded-2xl border border-[#EADDCF] bg-white focus:border-[#D97757] focus:ring-2 focus:ring-[#D97757]/20 outline-none resize-none transition-all text-[#5C4033] shadow-sm text-base leading-relaxed"
              placeholder="Paste your AI text here..."
            />
          </div>

          <div className="flex-1 flex flex-col gap-2 relative">
             <div className="flex justify-between items-center text-sm font-bold px-1">
               <label className="text-[#8A7263]">Human Output</label>
               {result && <span className="text-[#7A8F6A] flex items-center gap-1"><Check className="w-3.5 h-3.5"/> Academic Parity</span>}
             </div>
             
             <div className="w-full flex-1 p-5 rounded-2xl border border-[#EADDCF] bg-white shadow-sm overflow-y-auto relative text-base leading-relaxed text-[#5C4033]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
                    <div className="w-8 h-8 border-4 border-[#EADDCF] border-t-[#D97757] rounded-full animate-spin"/>
                    <span className="font-semibold text-[#8A7263] animate-pulse">Analyzing & transforming...</span>
                  </div>
                ) : result ? (
                  <p className="whitespace-pre-wrap">{result}</p>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-[#EADDCF] gap-2">
                    <CheckCircle2 className="w-10 h-10" />
                    <span className="font-medium text-[#8A7263]">Output ready</span>
                  </div>
                )}
                {result && !loading && (
                <button onClick={handleCopy} className="absolute bottom-4 right-4 bg-[#FFF8F0] text-[#5C4033] p-2.5 rounded-xl shadow-sm border border-[#EADDCF] hover:bg-[#F5EBE1] transition-all">
                  {copied ? <Check className="w-5 h-5 text-[#7A8F6A]" /> : <Copy className="w-5 h-5" />}
                </button>
                )}
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
