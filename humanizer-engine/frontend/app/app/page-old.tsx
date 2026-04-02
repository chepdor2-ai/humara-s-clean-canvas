'use client';
import { useState, useMemo } from 'react';
import { Copy, Check, CheckCircle2, SlidersHorizontal, ShieldCheck, Zap, Eraser, Info, RotateCcw } from 'lucide-react';

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
  { id: 'ghost_mini', label: 'Ghost Mini', desc: 'Efficiency focus' },
  { id: 'ghost_pro', label: 'Ghost Pro', desc: 'Standard balance' },
  { id: 'ninja', label: 'Ninja Stealth', desc: 'Maximum evasion' },
];

const STRENGTHS = [
  { id: 'light', label: 'Standard' },
  { id: 'medium', label: 'Advanced' },
  { id: 'strong', label: 'Extreme' },
];

const TONES = [
  { id: 'neutral', label: 'Natural' },
  { id: 'academic', label: 'Academic' },
  { id: 'professional', label: 'Business' },
  { id: 'simple', label: 'Direct' },
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
      <header className="flex items-end justify-between border-b border-[#EADDCF] pb-8">
        <div>
          <h1 className="text-3xl font-bold font-sora text-[#5C4033] tracking-tight">The Editor</h1>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8A7263] mt-2">Neural Reconstruction Environment</p>
        </div>
        <div className="flex gap-4">
           <button onClick={handleClear} className="px-4 py-2 border border-[#EADDCF] text-[10px] font-black uppercase tracking-widest text-[#8A7263] hover:bg-white transition-all flex items-center gap-2">
              <Eraser className="w-3.5 h-3.5" /> Clear Canvas
           </button>
           {meaningScore !== null && (
             <div className="px-4 py-2 bg-white border border-[#EADDCF] flex items-center gap-3">
               <ShieldCheck className="w-4 h-4 text-[#7A8F6A]" />
               <span className="text-[11px] font-black uppercase tracking-widest text-[#5C4033]">
                 Logic Preservation: {Math.round(meaningScore * 100)}%
               </span>
             </div>
           )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="col-span-1 lg:col-span-3 space-y-8">
          <div className="bg-white border border-[#EADDCF] p-8 shadow-sm">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8A7263] mb-8 pb-4 border-b border-[#FFF8F0]">Engine Parameters</h3>
            
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#5C4033] block">Active Model</label>
                <div className="space-y-1">
                  {ENGINES.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEngine(e.id)}
                      className={`w-full text-left px-4 py-3 rounded-sm text-[11px] font-bold uppercase tracking-widest transition-all ${
                        engine === e.id
                          ? 'bg-[#5C4033] text-white shadow-xl shadow-[#5C4033]/20'
                          : 'bg-[#FFF8F0] text-[#8A7263] border border-[#EADDCF] hover:border-[#D97757]'
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#5C4033] block">Variation Intensity</label>
                <div className="grid grid-cols-1 gap-1 bg-[#FFF8F0] border border-[#EADDCF] p-1">
                  {STRENGTHS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStrength(s.id)}
                      className={`py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                        strength === s.id
                          ? 'bg-white text-[#5C4033] shadow-sm'
                          : 'text-[#8A7263] hover:text-[#5C4033]'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#5C4033] block">Target Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full bg-[#FFF8F0] border border-[#EADDCF] rounded-sm px-4 py-3 text-[11px] font-black uppercase tracking-widest text-[#5C4033] outline-none focus:border-[#D97757]"
                >
                  {TONES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#FFF8F0]">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#5C4033]">Strict Logic</label>
                <button
                  onClick={() => setStrictMeaning(!strictMeaning)}
                  className={`w-9 h-5 rounded-full transition-all relative ${
                    strictMeaning ? 'bg-[#D97757]' : 'bg-[#EADDCF]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${
                      strictMeaning ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <button
                onClick={handleHumanize}
                disabled={!text.trim() || loading}
                className="w-full py-5 bg-[#5C4033] hover:bg-[#D97757] text-white text-[12px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-[#5C4033]/20 disabled:opacity-30 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                {loading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> Reconstruction</>}
              </button>
            </div>
          </div>
          
          <div className="p-6 bg-[#F5EBE1] border border-[#EADDCF]">
             <div className="flex gap-3 mb-4"><Info className="w-4 h-4 text-[#D97757]" /> <span className="text-[10px] font-black uppercase tracking-widest text-[#5C4033]">Lab Note</span></div>
             <p className="text-[11px] text-[#8A7263] leading-relaxed font-medium">
                Higher intensity reconstruction significantly reduces AI detection probability but may require manual review for citation placement.
             </p>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-9 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-1 bg-[#EADDCF] border border-[#EADDCF] shadow-2xl">
            <div className="bg-white p-8 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#8A7263]">Source Input</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#8A7263]">{inputWords} words</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-[500px] bg-transparent outline-none resize-none text-[15px] leading-relaxed text-[#5C4033] font-medium placeholder:text-[#8A7263]/30"
                placeholder="Paste original AI draft..."
              />
            </div>

            <div className="bg-white p-8 space-y-4 relative group">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#5C4033]">Humanized Output</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#8A7263]">{outputWords} words</span>
              </div>
              <div className="w-full h-[500px] overflow-y-auto text-[15px] leading-relaxed text-[#5C4033] font-bold">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
                    <div className="w-8 h-8 border-4 border-[#EADDCF] border-t-[#D97757] rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#8A7263]">Reconstructing Neural Map...</span>
                  </div>
                ) : result ? (
                  <p className="whitespace-pre-wrap">{result}</p>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-[#EADDCF]/50 gap-6">
                    <Zap className="w-12 h-12" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Awaiting Command</span>
                  </div>
                )}
              </div>
              {result && !loading && (
                <button
                  onClick={handleCopy}
                  className="absolute bottom-8 right-8 bg-[#5C4033] text-white p-4 shadow-2xl hover:bg-[#D97757] transition-all active:scale-90"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-5 bg-red-50 border border-red-100 text-[11px] font-black uppercase tracking-widest text-red-600">
              Error: {error}
            </div>
          )}

          {(inputScores || outputScores) && (
            <div className="space-y-6">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5C4033]">Detector Diagnostic Scores</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {TOP_DETECTORS.map((name) => {
                  const inputD = inputScores?.detectors.find((d) => d.detector === name);
                  const outputD = outputScores?.detectors.find((d) => d.detector === name);
                  const afterAI = outputD?.ai_score ?? 0;

                  return (
                    <div key={name} className="bg-white border border-[#EADDCF] p-6 shadow-sm">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#8A7263] mb-4 truncate">{name}</div>
                      <div className={`text-2xl font-black font-sora ${afterAI <= 15 ? 'text-[#7A8F6A]' : 'text-[#D97757]'}`}>
                        {Math.round(afterAI)}%
                      </div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#8A7263]/40 mt-1">AI Signature</div>
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
