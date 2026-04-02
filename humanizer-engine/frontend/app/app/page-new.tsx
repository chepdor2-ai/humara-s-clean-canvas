'use client';
import { useState, useMemo } from 'react';
import { Copy, Check, CheckCircle2, SlidersHorizontal, ShieldCheck, Zap, Eraser, Info, RotateCcw, Sparkles, ArrowRight } from 'lucide-react';

interface DetectorScore {
  detector: string;
  ai_score: number;
  human_score: number;
}

interface DetectorBlock {
  overall: number;
  detectors: DetectorScore[];
}

interface HumanizeResponse {
  success: boolean;
  humanized: string;
  word_count: number;
  input_word_count: number;
  engine_used: string;
  meaning_preserved: boolean;
  meaning_similarity: number;
  input_detector_results: DetectorBlock;
  output_detector_results: DetectorBlock;
  error?: string;
}

const ENGINES = [
  { id: 'ghost_mini', label: 'Ghost Mini', desc: 'Fast & Efficient' },
  { id: 'ghost_pro', label: 'Ghost Pro', desc: 'Balanced Power' },
  { id: 'ninja', label: 'Ninja Stealth', desc: 'Maximum Evasion' },
];

const STRENGTHS = [
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'strong', label: 'Strong' },
];

const TONES = [
  { id: 'neutral', label: 'Natural' },
  { id: 'academic', label: 'Academic' },
  { id: 'professional', label: 'Professional' },
  { id: 'simple', label: 'Simple' },
];

const TOP_DETECTORS = ['GPTZero', 'Turnitin', 'Originality.AI', 'Winston AI', 'Copyleaks'];

export default function EditorPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const [engine, setEngine] = useState('ghost_pro');
  const [strength, setStrength] = useState('medium');
  const [tone, setTone] = useState('academic');
  const [strictMeaning, setStrictMeaning] = useState(true);

  const [inputScores, setInputScores] = useState<DetectorBlock | null>(null);
  const [outputScores, setOutputScores] = useState<DetectorBlock | null>(null);
  const [meaningScore, setMeaningScore] = useState<number | null>(null);

  const inputWords = useMemo(() => text.trim() ? text.trim().split(/\s+/).length : 0, [text]);
  const outputWords = useMemo(() => result.trim() ? result.trim().split(/\s+/).length : 0, [result]);

  const handleHumanize = async () => {
    if (!text.trim()) return;
    if (inputWords < 10) { setError('Minimum 10 words required for analysis.'); return; }

    setLoading(true);
    setError('');
    setResult('');
    setInputScores(null);
    setOutputScores(null);
    setMeaningScore(null);

    try {
      const response = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          engine,
          strength,
          tone,
          strict_meaning: strictMeaning,
          enable_post_processing: true,
        }),
      });

      const data: HumanizeResponse = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Humanization failed');
      }

      setResult(data.humanized);
      setInputScores(data.input_detector_results);
      setOutputScores(data.output_detector_results);
      setMeaningScore(data.meaning_similarity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Engine error encountered');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    setText('');
    setResult('');
    setInputScores(null);
    setOutputScores(null);
    setMeaningScore(null);
    setError('');
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-700">
      <header className="flex items-end justify-between border-b border-white/10 pb-8">
        <div>
          <h1 className="text-4xl font-bold font-sora text-white tracking-tight">Neural Editor</h1>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mt-3">Advanced Humanization Environment</p>
        </div>
        <div className="flex gap-4">
           <button onClick={handleClear} className="px-5 py-3 glass border border-white/10 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:border-white/20 transition-all flex items-center gap-2 rounded-lg">
              <Eraser className="w-4 h-4" /> Clear All
           </button>
           {meaningScore !== null && (
             <div className="px-5 py-3 glass-strong border border-teal-500/30 flex items-center gap-3 rounded-lg glow-green">
               <ShieldCheck className="w-5 h-5 text-teal-400" />
               <span className="text-xs font-bold uppercase tracking-wider text-white">
                 Meaning: {Math.round(meaningScore * 100)}%
               </span>
             </div>
           )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Control Panel */}
        <div className="col-span-1 lg:col-span-3 space-y-6">
          <div className="glass-strong border border-white/10 p-6 rounded-2xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-6 pb-4 border-b border-white/10 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" /> Engine Settings
            </h3>
            
            <div className="space-y-6">
              {/* Engine Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white block">Model</label>
                <div className="space-y-2">
                  {ENGINES.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEngine(e.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all relative overflow-hidden ${
                        engine === e.id
                          ? 'text-white shadow-xl'
                          : 'glass text-gray-400 border border-white/5 hover:border-indigo-500/30'
                      }`}
                    >
                      {engine === e.id && (
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-500"></div>
                      )}
                      <span className="relative z-10 block">{e.label}</span>
                      <span className="relative z-10 block text-[10px] opacity-60 mt-0.5">{e.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Strength */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white block">Intensity</label>
                <div className="grid grid-cols-3 gap-2 glass border border-white/10 p-2 rounded-lg">
                  {STRENGTHS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStrength(s.id)}
                      className={`py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all rounded-md ${
                        strength === s.id
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white block">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full glass border border-white/10 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider text-white outline-none focus:border-indigo-500/50 transition-all"
                >
                  {TONES.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#1E1E2E] text-white">{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Strict Meaning Toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <label className="text-xs font-bold uppercase tracking-wider text-white">Strict Meaning</label>
                <button
                  onClick={() => setStrictMeaning(!strictMeaning)}
                  className={`w-11 h-6 rounded-full transition-all relative ${
                    strictMeaning ? 'bg-gradient-to-r from-teal-500 to-teal-400' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-lg ${
                      strictMeaning ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Humanize Button */}
              <button
                onClick={handleHumanize}
                disabled={!text.trim() || loading}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-teal-500 text-white text-xs font-bold uppercase tracking-wider shadow-2xl shadow-indigo-500/50 disabled:opacity-30 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-3 rounded-lg relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                {loading ? (
                  <><RotateCcw className="w-4 h-4 animate-spin relative z-10" /> <span className="relative z-10">Processing...</span></>
                ) : (
                  <><Sparkles className="w-4 h-4 relative z-10" /> <span className="relative z-10">Humanize Text</span></>
                )}
              </button>
            </div>
          </div>
          
          {/* Info Box */}
          <div className="p-5 glass border border-indigo-500/20 rounded-2xl">
             <div className="flex gap-3 mb-3">
               <Info className="w-4 h-4 text-indigo-400" /> 
               <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Pro Tip</span>
             </div>
             <p className="text-xs text-gray-400 leading-relaxed">
                Higher intensity provides stronger detection evasion but may require minor adjustments for citations and formatting.
             </p>
          </div>
        </div>

        {/* Editor Panels */}
        <div className="col-span-1 lg:col-span-9 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Panel */}
            <div className="glass-strong border border-white/10 p-6 space-y-4 rounded-2xl">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">AI Input</span>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{inputWords} words</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-[550px] bg-transparent outline-none resize-none text-sm leading-relaxed text-white font-medium placeholder:text-gray-600"
                placeholder="Paste your AI-generated text here..."
              />
            </div>

            {/* Output Panel */}
            <div className="glass-strong border border-white/10 p-6 space-y-4 rounded-2xl relative group">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-white">Humanized Output</span>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{outputWords} words</span>
              </div>
              <div className="w-full h-[550px] overflow-y-auto text-sm leading-relaxed text-white font-medium">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="w-12 h-12 border-4 border-white/10 border-t-indigo-500 rounded-full animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Processing with neural engine...</span>
                  </div>
                ) : result ? (
                  <p className="whitespace-pre-wrap">{result}</p>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-6">
                    <Zap className="w-16 h-16" />
                    <span className="text-xs font-bold uppercase tracking-wider">Awaiting input</span>
                  </div>
                )}
              </div>
              {result && !loading && (
                <button
                  onClick={handleCopy}
                  className="absolute bottom-6 right-6 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white p-4 rounded-lg shadow-2xl hover:from-indigo-500 hover:to-teal-500 transition-all active:scale-90 glow"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-2xl text-sm font-bold text-red-400">
              Error: {error}
            </div>
          )}

          {/* Detector Scores */}
          {(inputScores || outputScores) && (
            <div className="space-y-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-400" /> Detector Analysis
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {TOP_DETECTORS.map((name) => {
                  const inputD = inputScores?.detectors.find((d) => d.detector === name);
                  const outputD = outputScores?.detectors.find((d) => d.detector === name);
                  const afterAI = outputD?.ai_score ?? 0;
                  const beforeAI = inputD?.ai_score ?? 0;
                  const improvement = beforeAI - afterAI;

                  return (
                    <div key={name} className="glass-strong border border-white/10 p-5 rounded-xl hover:border-indigo-500/30 transition-all">
                      <div className="text-xs font-bold text-white mb-3">{name}</div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">Before</span>
                          <span className="text-red-400 font-bold">{Math.round(beforeAI * 100)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">After</span>
                          <span className="text-teal-400 font-bold">{Math.round(afterAI * 100)}%</span>
                        </div>
                        {improvement > 0 && (
                          <div className="pt-2 border-t border-white/5">
                            <span className="text-[10px] text-indigo-400 font-bold">-{Math.round(improvement * 100)}% AI</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
