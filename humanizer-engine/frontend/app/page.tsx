'use client';
import { useState, useMemo } from 'react';
import { Copy, Check, CheckCircle2, SlidersHorizontal, ShieldCheck, Zap } from 'lucide-react';

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
  { id: 'ghost_mini', label: 'Ghost Mini', desc: 'Fast, 45% word change' },
  { id: 'ghost_pro', label: 'Ghost Pro', desc: 'Balanced, 60% word change' },
  { id: 'ninja', label: 'Ninja', desc: 'Deep, <5% detection target' },
];

const STRENGTHS = [
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Balanced' },
  { id: 'strong', label: 'Deep' },
];

const TONES = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'academic', label: 'Academic' },
  { id: 'professional', label: 'Professional' },
  { id: 'simple', label: 'Simple' },
];

// Top 5 detectors to show as score cards
const TOP_DETECTORS = ['GPTZero', 'Turnitin', 'Originality.AI', 'Winston AI', 'Copyleaks'];

export default function EditorPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const [engine, setEngine] = useState('ghost_mini');
  const [strength, setStrength] = useState('medium');
  const [tone, setTone] = useState('neutral');
  const [strictMeaning, setStrictMeaning] = useState(false);

  const [inputScores, setInputScores] = useState<DetectorBlock | null>(null);
  const [outputScores, setOutputScores] = useState<DetectorBlock | null>(null);
  const [meaningScore, setMeaningScore] = useState<number | null>(null);

  const inputWords = useMemo(() => text.trim() ? text.trim().split(/\s+/).length : 0, [text]);
  const outputWords = useMemo(() => result.trim() ? result.trim().split(/\s+/).length : 0, [result]);

  const handleHumanize = async () => {
    if (!text.trim()) return;
    if (inputWords < 10) { setError('Please enter at least 10 words.'); return; }

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
      setError(err instanceof Error ? err.message : 'Unexpected error');
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
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-sora text-[#5C4033]">Humanizer Editor</h1>
          <p className="text-[#8A7263]">Transform your draft with academic precision.</p>
        </div>
        {meaningScore !== null && (
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#EADDCF] rounded-lg shadow-sm">
            <ShieldCheck className="w-4 h-4 text-[#7A8F6A]" />
            <span className="text-sm font-semibold text-[#5C4033]">
              Meaning: {Math.round(meaningScore * 100)}%
            </span>
          </div>
        )}
      </header>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar controls */}
        <div className="col-span-1 lg:col-span-3 bg-white rounded-2xl border border-[#EADDCF] p-5 flex flex-col gap-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#5C4033] font-bold border-b border-[#EADDCF] pb-3">
            <SlidersHorizontal className="w-5 h-5 text-[#D97757]" /> Engine Controls
          </div>

          {/* Engine selector */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-[#5C4033]">Engine</label>
            <div className="space-y-1.5">
              {ENGINES.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEngine(e.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                    engine === e.id
                      ? 'bg-[#D97757] text-white font-bold shadow-md'
                      : 'bg-[#F5EBE1] text-[#5C4033] hover:bg-[#EADDCF]'
                  }`}
                >
                  <div className="font-semibold">{e.label}</div>
                  <div className={`text-xs ${engine === e.id ? 'text-white/80' : 'text-[#8A7263]'}`}>
                    {e.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Strength */}
          <div className="space-y-2 pt-2 border-t border-[#EADDCF]">
            <label className="text-sm font-bold text-[#5C4033]">Strength</label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F5EBE1] rounded-lg">
              {STRENGTHS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStrength(s.id)}
                  className={`py-1.5 text-xs font-bold rounded-md transition-all ${
                    strength === s.id
                      ? 'bg-white text-[#D97757] shadow-sm'
                      : 'text-[#8A7263] hover:text-[#5C4033]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2 pt-2 border-t border-[#EADDCF]">
            <label className="text-sm font-bold text-[#5C4033]">Target Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full bg-[#F5EBE1] border border-[#EADDCF] rounded-lg p-2.5 text-sm text-[#5C4033] outline-none"
            >
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Strict meaning toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-[#EADDCF]">
            <label className="text-sm font-bold text-[#5C4033]">Strict Meaning</label>
            <button
              onClick={() => setStrictMeaning(!strictMeaning)}
              className={`w-10 h-5 rounded-full transition-all relative ${
                strictMeaning ? 'bg-[#D97757]' : 'bg-[#EADDCF]'
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${
                  strictMeaning ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Action buttons */}
          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={handleHumanize}
              disabled={!text.trim() || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#D97757] hover:bg-[#C96342] text-white font-bold rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Zap className="w-4 h-4" /> Humanize
                </>
              )}
            </button>
            <button
              onClick={handleClear}
              className="w-full px-4 py-2 text-sm font-semibold text-[#8A7263] hover:text-[#5C4033] hover:bg-[#F5EBE1] rounded-xl transition-all"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Text areas */}
        <div className="col-span-1 lg:col-span-9 flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row gap-6 min-h-[400px]">
            {/* Input */}
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm font-bold px-1">
                <label className="text-[#8A7263]">Input Text</label>
                <span className="text-xs text-[#8A7263]">{inputWords} words</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full flex-1 p-5 rounded-2xl border border-[#EADDCF] bg-white focus:border-[#D97757] focus:ring-2 focus:ring-[#D97757]/20 outline-none resize-none transition-all text-[#5C4033] shadow-sm text-base leading-relaxed min-h-[350px]"
                placeholder="Paste your AI-generated text here..."
              />
            </div>

            {/* Output */}
            <div className="flex-1 flex flex-col gap-2 relative">
              <div className="flex justify-between items-center text-sm font-bold px-1">
                <label className="text-[#8A7263]">Human Output</label>
                <span className="text-xs text-[#8A7263]">{outputWords} words</span>
              </div>
              <div className="w-full flex-1 p-5 rounded-2xl border border-[#EADDCF] bg-white shadow-sm overflow-y-auto relative text-base leading-relaxed text-[#5C4033] min-h-[350px]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
                    <div className="w-8 h-8 border-4 border-[#EADDCF] border-t-[#D97757] rounded-full animate-spin" />
                    <span className="font-semibold text-[#8A7263] animate-pulse">
                      Analyzing & transforming...
                    </span>
                  </div>
                ) : result ? (
                  <p className="whitespace-pre-wrap">{result}</p>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-[#EADDCF] gap-2">
                    <CheckCircle2 className="w-10 h-10" />
                    <span className="font-medium text-[#8A7263]">Output will appear here</span>
                  </div>
                )}
                {result && !loading && (
                  <button
                    onClick={handleCopy}
                    className="absolute bottom-4 right-4 bg-[#FFF8F0] text-[#5C4033] p-2.5 rounded-xl shadow-sm border border-[#EADDCF] hover:bg-[#F5EBE1] transition-all"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-[#7A8F6A]" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Detector score cards */}
          {(inputScores || outputScores) && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[#5C4033] px-1">Detector Scores</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {TOP_DETECTORS.map((name) => {
                  const inputD = inputScores?.detectors.find((d) => d.detector === name);
                  const outputD = outputScores?.detectors.find((d) => d.detector === name);
                  const beforeAI = inputD?.ai_score ?? 0;
                  const afterAI = outputD?.ai_score ?? 0;
                  const improved = afterAI < beforeAI;

                  return (
                    <div
                      key={name}
                      className="bg-white rounded-xl border border-[#EADDCF] p-4 shadow-sm"
                    >
                      <div className="text-xs font-bold text-[#8A7263] mb-2 truncate">{name}</div>
                      <div className="flex items-end gap-1">
                        {inputScores && (
                          <div className="text-xs text-[#8A7263]">
                            <span className="line-through">{Math.round(beforeAI)}%</span>
                          </div>
                        )}
                        {outputScores && (
                          <div
                            className={`text-lg font-extrabold ${
                              afterAI <= 15
                                ? 'text-[#7A8F6A]'
                                : afterAI <= 40
                                  ? 'text-[#D97757]'
                                  : 'text-red-500'
                            }`}
                          >
                            {Math.round(afterAI)}%
                          </div>
                        )}
                        {improved && (
                          <span className="text-xs text-[#7A8F6A] font-bold mb-0.5">
                            -{Math.round(beforeAI - afterAI)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#8A7263] mt-1">AI Score</div>
                    </div>
                  );
                })}
              </div>

              {/* Overall summary */}
              {outputScores && (
                <div className="flex flex-wrap gap-4 px-1 text-sm">
                  <span className="font-semibold text-[#5C4033]">
                    Overall AI: <span className={outputScores.overall <= 15 ? 'text-[#7A8F6A]' : 'text-[#D97757]'}>
                      {Math.round(outputScores.overall)}%
                    </span>
                  </span>
                  {inputScores && (
                    <span className="text-[#8A7263]">
                      (was {Math.round(inputScores.overall)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
