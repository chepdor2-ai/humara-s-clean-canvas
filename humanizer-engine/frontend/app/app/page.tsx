'use client';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Copy, Check, ShieldCheck, Zap, Eraser, Info, RotateCcw, Type, AlignLeft } from 'lucide-react';

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

interface SynonymOption {
  word: string;
  isOriginal: boolean;
}

interface SentenceAlternative {
  text: string;
  score: number;
}

interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  rect: { x: number; y: number };
  type: 'word' | 'sentence';
}

// Circular Progress Component
const CircularProgress = ({ score, size = 100 }: { score: number; size?: number }) => {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  
  const getColor = (s: number) => {
    if (s <= 20) return '#10b981';
    if (s <= 75) return '#eab308';
    return '#ef4444';
  };

  const color = getColor(score);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth="8" fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-2xl font-bold ${score <= 20 ? 'text-green-500' : score <= 75 ? 'text-yellow-500' : 'text-red-500'}`}>
          {Math.round(score)}%
        </span>
      </div>
    </div>
  );
};

const ENGINES = [
  { id: 'ghost_mini', label: 'Ghost Mini', desc: 'Efficiency focus' },
  { id: 'ghost_pro', label: 'Ghost Pro', desc: 'Standard balance' },
  { id: 'ninja', label: 'Ninja Stealth', desc: 'Maximum evasion' },
];

const STRENGTHS = [
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Advanced' },
  { id: 'strong', label: 'Deep' },
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
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const [engine, setEngine] = useState('ghost_pro');
  const [strength, setStrength] = useState('medium');
  const [tone, setTone] = useState('academic');
  const [strictMeaning, setStrictMeaning] = useState(true);

  const [inputScores, setInputScores] = useState<DetectorBlock | null>(null);
  const [outputScores, setOutputScores] = useState<DetectorBlock | null>(null);
  const [meaningScore, setMeaningScore] = useState<number | null>(null);

  // Editing / selection state
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [synonyms, setSynonyms] = useState<SynonymOption[]>([]);
  const [sentenceAlternatives, setSentenceAlternatives] = useState<SentenceAlternative[]>([]);
  const [popupType, setPopupType] = useState<'synonym' | 'sentence' | null>(null);
  const [loadingPopup, setLoadingPopup] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

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

  const handleCheck = async () => {
    if (!text.trim()) return;
    if (inputWords < 10) { setError('Minimum 10 words required for detection.'); return; }

    setChecking(true);
    setError('');
    setInputScores(null);

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Detection failed');
      }

      setInputScores(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection error encountered');
    } finally {
      setChecking(false);
    }
  };

  const handleClear = () => {
    setText('');
    setResult('');
    setInputScores(null);
    setOutputScores(null);
    setMeaningScore(null);
    setError('');
    closePopup();
  };

  const closePopup = useCallback(() => {
    setPopupType(null);
    setSelectionInfo(null);
    setSynonyms([]);
    setSentenceAlternatives([]);
  }, []);

  // Detect the sentence surrounding the cursor position
  const getContainingSentence = (text: string, cursor: number): { start: number; end: number } | null => {
    const enders = /[.!?]/;
    let start = cursor;
    while (start > 0 && !enders.test(text[start - 1])) start--;
    while (start < cursor && /\s/.test(text[start])) start++;
    let end = cursor;
    while (end < text.length && !enders.test(text[end])) end++;
    if (end < text.length) end++; // include punctuation
    if (end <= start || (end - start) < 10) return null;
    return { start, end };
  };

  // Handle text selection in the output textarea (double-click word or drag-select)
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOutputSelect = useCallback(() => {
    // Debounce to avoid firing during drag
    if (selectionTimer.current) clearTimeout(selectionTimer.current);

    selectionTimer.current = setTimeout(() => {
      const el = outputRef.current;
      if (!el || !result) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;

      // Click (no drag) → detect and highlight containing sentence for alternatives
      if (start === end) {
        const bounds = getContainingSentence(result, start);
        if (!bounds) return;
        const sentence = result.slice(bounds.start, bounds.end).trim();
        el.setSelectionRange(bounds.start, bounds.end);
        const rect = el.getBoundingClientRect();
        const textBefore = result.slice(0, bounds.start);
        const linesAbove = textBefore.split('\n').length - 1;
        const lineHeight = 22;
        const popupY = rect.top + window.scrollY + Math.min(linesAbove * lineHeight + 40, rect.height - 40);
        const popupX = rect.left + rect.width / 2;
        setSelectionInfo({
          text: sentence,
          start: bounds.start,
          end: bounds.end,
          rect: { x: popupX, y: popupY },
          type: 'sentence',
        });
        fetchSentenceAlternatives(sentence, 4);
        return;
      }

      const selectedText = result.slice(start, end).trim();
      if (!selectedText || selectedText.length < 2) return;

      // Compute popup position using textarea geometry
      const rect = el.getBoundingClientRect();
      const textBeforeSelection = result.slice(0, start);
      const linesAbove = textBeforeSelection.split('\n').length - 1;
      const lineHeight = 22;
      const popupY = rect.top + window.scrollY + Math.min(linesAbove * lineHeight + 40, rect.height - 40);
      const popupX = rect.left + rect.width / 2;

      const isSingleWord = !/\s/.test(selectedText) && !/[.!?]/.test(selectedText);

      setSelectionInfo({
        text: selectedText,
        start,
        end,
        rect: { x: popupX, y: popupY },
        type: isSingleWord ? 'word' : 'sentence',
      });

      if (isSingleWord) {
        fetchSynonyms(selectedText);
      } else {
        fetchSentenceAlternatives(selectedText);
      }
    }, 300);
  }, [result]);

  // Fetch synonyms from API
  const fetchSynonyms = async (word: string) => {
    setPopupType('synonym');
    setLoadingPopup(true);
    setSynonyms([]);
    try {
      const response = await fetch('/api/synonyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word }),
      });
      if (response.ok) {
        const data = await response.json();
        setSynonyms(data.synonyms || [{ word, isOriginal: true }]);
      } else {
        setSynonyms([{ word, isOriginal: true }]);
      }
    } catch {
      setSynonyms([{ word, isOriginal: true }]);
    } finally {
      setLoadingPopup(false);
    }
  };

  // Fetch sentence alternatives from API — request more options
  const fetchSentenceAlternatives = async (sentence: string, count = 8) => {
    setPopupType('sentence');
    setLoadingPopup(true);
    setSentenceAlternatives([]);
    try {
      const response = await fetch('/api/alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence, engine, count }),
      });
      if (response.ok) {
        const data = await response.json();
        setSentenceAlternatives(data.alternatives || []);
      } else {
        setSentenceAlternatives([{ text: sentence, score: 1.0 }]);
      }
    } catch {
      setSentenceAlternatives([{ text: sentence, score: 1.0 }]);
    } finally {
      setLoadingPopup(false);
    }
  };

  // Replace a word or sentence in the result
  const applyReplacement = useCallback((newText: string) => {
    if (!selectionInfo) return;
    const before = result.slice(0, selectionInfo.start);
    const after = result.slice(selectionInfo.end);
    setResult(before + newText + after);
    closePopup();
    // Refocus textarea
    setTimeout(() => outputRef.current?.focus(), 50);
  }, [selectionInfo, result, closePopup]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        closePopup();
      }
    };
    if (popupType) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [popupType, closePopup]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Humanizer</h1>
          <p className="text-sm text-gray-600 mt-1">Transform AI text into natural, human-like content</p>
        </div>
        <div className="flex gap-3">
           <button onClick={handleClear} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
              <Eraser className="w-4 h-4" /> Clear
           </button>
           {meaningScore !== null && (
             <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
               <ShieldCheck className="w-4 h-4 text-green-600" />
               <span className="text-sm font-medium text-green-700">
                 Meaning: {Math.round(meaningScore * 100)}%
               </span>
             </div>
           )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="col-span-1 lg:col-span-3 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">Settings</h3>
            
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700 block">Mode</label>
                <div className="space-y-1.5">
                  {ENGINES.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEngine(e.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        engine === e.id
                          ? 'bg-brand-500 text-white'
                          : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-brand-300'
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700 block">Strength</label>
                <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-lg p-1">
                  {STRENGTHS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStrength(s.id)}
                      className={`py-2 text-xs font-medium rounded-md transition-all ${
                        strength === s.id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700 block">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  title="Select tone for humanized text"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  {TONES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <label className="text-xs font-medium text-gray-700">Preserve Meaning</label>
                <button
                  onClick={() => setStrictMeaning(!strictMeaning)}
                  title={strictMeaning ? 'Meaning preservation enabled' : 'Meaning preservation disabled'}
                  className={`w-11 h-6 rounded-full transition-all relative ${
                    strictMeaning ? 'bg-brand-500' : 'bg-gray-200'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${
                      strictMeaning ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={handleCheck}
                  disabled={!text.trim() || checking || loading}
                  className="py-3 bg-white border-2 border-brand-500 text-brand-500 hover:bg-brand-50 text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {checking ? <RotateCcw className="w-4 h-4 animate-spin" /> : <><ShieldCheck className="w-4 h-4" /> Check</>}
                </button>
                <button
                  onClick={handleHumanize}
                  disabled={!text.trim() || loading || checking}
                  className="py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> Humanize</>}
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
             <div className="flex gap-2 mb-2"><Info className="w-4 h-4 text-blue-500" /> <span className="text-xs font-semibold text-blue-900">Editing Tips</span></div>
             <ul className="text-xs text-blue-700 leading-relaxed space-y-1">
               <li>• Select any word to see synonyms</li>
               <li>• Click a sentence for 4 alternative rewrites</li>
               <li>• Click the output to edit directly</li>
               <li>• Higher strength = better AI bypass</li>
             </ul>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-9 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-900">Input Text</span>
                <span className="text-xs font-medium text-gray-500">{inputWords} words</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-[500px] bg-transparent outline-none resize-none text-sm leading-relaxed text-gray-900 placeholder:text-gray-400"
                placeholder="Paste your AI-generated text here..."
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3 relative">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-semibold text-gray-900">Humanized Output</span>
                  {result && (
                    <p className="text-xs text-gray-500 mt-0.5">Select a word for synonyms, or a sentence for alternatives</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">{outputWords} words</span>
                  {result && (
                    <button
                      onClick={handleCopy}
                      className="p-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-[500px] gap-3">
                  <div className="w-8 h-8 border-[3px] border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                  <span className="text-sm font-medium text-gray-600">Humanizing text...</span>
                </div>
              ) : result ? (
                <textarea
                  ref={outputRef}
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  onSelect={handleOutputSelect}
                  className="w-full h-[500px] bg-transparent outline-none resize-none text-sm leading-relaxed text-gray-900 placeholder:text-gray-400"
                  placeholder="Humanized text will appear here..."
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-300 gap-4">
                  <Zap className="w-10 h-10" />
                  <span className="text-sm font-medium text-gray-400">Output will appear here</span>
                </div>
              )}

              {/* Synonym Popup */}
              {popupType === 'synonym' && selectionInfo && (
                <div
                  ref={popupRef}
                  className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-2xl py-2 w-[220px]"
                  style={{
                    left: `${Math.min(selectionInfo.rect.x, window.innerWidth - 240)}px`,
                    top: `${selectionInfo.rect.y}px`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100 flex items-center gap-2">
                    <Type className="w-3 h-3" />
                    Synonyms for &ldquo;{selectionInfo.text}&rdquo;
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {loadingPopup ? (
                      <div className="px-3 py-4 text-xs text-gray-400 text-center flex items-center justify-center gap-2">
                        <RotateCcw className="w-3 h-3 animate-spin" /> Finding synonyms...
                      </div>
                    ) : synonyms.length > 0 ? (
                      synonyms.map((syn, idx) => (
                        <button
                          key={idx}
                          onClick={() => applyReplacement(syn.word)}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                            syn.isOriginal
                              ? 'text-red-600 font-semibold bg-red-50 hover:bg-red-100'
                              : 'text-gray-700 hover:bg-brand-50'
                          }`}
                        >
                          <span>{syn.word}</span>
                          {syn.isOriginal && (
                            <span className="text-[10px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-medium">original</span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-xs text-gray-400 text-center">No synonyms found</div>
                    )}
                  </div>
                </div>
              )}

              {/* Sentence Alternatives Popup */}
              {popupType === 'sentence' && selectionInfo && (
                <div
                  ref={popupRef}
                  className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-2xl py-2 w-[500px] max-w-[90vw]"
                  style={{
                    left: `${Math.min(selectionInfo.rect.x, window.innerWidth - 520)}px`,
                    top: `${selectionInfo.rect.y}px`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100 flex items-center gap-2">
                    <AlignLeft className="w-3 h-3" />
                    Alternative Sentences
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {loadingPopup ? (
                      <div className="px-3 py-6 text-xs text-gray-400 text-center flex flex-col items-center gap-2">
                        <RotateCcw className="w-4 h-4 animate-spin" />
                        Generating alternatives...
                      </div>
                    ) : sentenceAlternatives.length > 0 ? (
                      sentenceAlternatives.map((alt, idx) => (
                        <button
                          key={idx}
                          onClick={() => applyReplacement(alt.text)}
                          className="w-full text-left px-3 py-2.5 text-sm border-b border-gray-50 last:border-0 hover:bg-brand-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-xs font-bold text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                              {idx + 1}
                            </span>
                            <span className="flex-1 text-gray-700 leading-relaxed">{alt.text}</span>
                            <span className="text-xs text-gray-400 font-medium whitespace-nowrap mt-0.5">
                              {Math.round(alt.score * 100)}%
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-4 text-xs text-gray-400 text-center">No alternatives generated</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          {(inputScores || outputScores) && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">AI Detection Results</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {TOP_DETECTORS.map((name) => {
                  const inputD = inputScores?.detectors.find((d) => d.detector === name);
                  const outputD = outputScores?.detectors.find((d) => d.detector === name);
                  const scoreToShow = outputD?.ai_score ?? inputD?.ai_score ?? 0;
                  const isOutput = !!outputD;

                  return (
                    <div key={name} className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col items-center">
                      <div className="text-xs font-medium text-gray-600 mb-3 text-center truncate w-full">
                        {name}
                      </div>
                      <CircularProgress score={scoreToShow} size={90} />
                      <div className="text-xs text-gray-500 mt-3 text-center">
                        {isOutput ? 'After humanize' : 'AI detected'}
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
