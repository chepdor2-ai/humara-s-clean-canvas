'use client';
import { useState, useRef, useEffect } from 'react';

export default function Home() {
    const [inputText, setInputText] = useState('');
    const [outputText, setOutputText] = useState('');
    const [engine, setEngine] = useState('ghost_pro');
    const [strength, setStrength] = useState('balanced');
    const [isProcessing, setIsProcessing] = useState(false);
    const [toastMsg, setToastMsg] = useState('');

    const [scores, setScores] = useState({
        gptzero: null, turnitin: null, originality: null, winston: null, copyleaks: null, overall: null,
        engineUsed: '--', processingTime: '--s', wordsChanged: '--%'
    } as any);

    const getCircleColor = (score: number) => {
        if (score <= 21) return '#10b981';
        if (score <= 65) return '#f59e0b';
        return '#ef4444';
    };

    const CircleMeter = ({ score, name, type, icon, bgClass }: any) => {
        const offset = score !== null ? 326.73 - (score / 100) * 326.73 : 326.73;
        const color = score !== null ? getCircleColor(score) : '#e5e7eb';
        
        return (
            <div className="bg-white/80 backdrop-blur-md rounded-lg p-3 shadow-sm border border-gray-100/50 hover-lift text-center">
                <div className={detector-icon  mx-auto mb-2 shadow-sm flex items-center justify-center} style={{ width: '24px', height: '24px', fontSize: '10px' }}>
                    <i className={icon}></i>
                </div>
                <div className="relative w-14 h-14 mx-auto mb-2">       
                    <svg className="circle-progress w-full h-full" viewBox="0 0 120 120">
                        <circle className="circle-progress-track" cx="60" cy="60" r="52"/>
                        <circle className="circle-progress-fill transition-all" cx="60" cy="60" r="52"
                            style={{ strokeDasharray: '326.73', strokeDashoffset: offset, stroke: color }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs font-black text-gray-900">{score !== null ? Math.round(score) + '%' : '--%'}</span>
                    </div>
                </div>
                <h4 className="font-bold text-[10px] text-gray-900 uppercase tracking-widest">{name}</h4>
                <p className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">{type}</p>
            </div>
        );
    };

    const showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(''), 3000);
    };

    const handleHumanize = async () => {
        if (!inputText.trim()) return showToast('Please enter some text to humanize');
        if (inputText.trim().split(/\s+/).length < 10) return showToast('Please enter at least 10 words');

        setIsProcessing(true);
        const startTime = Date.now();

        try {
            const res = await fetch('/api/humanize', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: inputText, engine, strength, preserve_sentences: true, strict_meaning: true, no_contractions: true, tone: 'neutral', enable_post_processing: true })
            });
            if (!res.ok) throw new Error('Server error');
            const data = await res.json();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            setOutputText(data.humanized);
            const modPercent = Math.round((1 - (data.humanized.length / inputText.length)) * 100);

            if (data.output_detector_results) {
                setScores({
                    ...data.output_detector_results,
                    engineUsed: data.engine_used || engine,
                    processingTime: elapsed + 's',
                    wordsChanged: Math.abs(modPercent) + '%'
                });
            } else {
                setScores((s: any) => ({ ...s, engineUsed: data.engine_used || engine, processingTime: elapsed + 's', wordsChanged: Math.abs(modPercent) + '%' }));
            }
            showToast('Text humanized successfully!');
        } catch (e: any) {
            showToast('Error: ' + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const inputWords = inputText.trim() ? inputText.trim().split(/\s+/).filter(Boolean).length : 0;
    const outputWords = outputText.trim() ? outputText.trim().split(/\s+/).filter(Boolean).length : 0;

    return (
        <main className="pt-20 pb-10">
            <div className="w-[90%] max-w-[1600px] mx-auto">
                <div className="text-center mb-6 animate-fade-in-up flex flex-col items-center">
                    <div className="inline-flex items-center px-2.5 py-1 bg-orange-100/50 border border-orange-200/50 rounded-full mb-3">
                        <span className="text-orange-700 font-bold text-[10px] uppercase tracking-widest"><i className="fas fa-rocket mr-1.5"></i>Ghost Engine v3.0</span>  
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black mb-2 bg-gradient-to-r from-gray-900 via-orange-700 to-red-700 bg-clip-text text-transparent tracking-tight">
                        AI Text Humanizer
                    </h1>
                    <p className="text-xs text-gray-500 max-w-xl mx-auto font-medium">  
                        Transform AI-generated content into authentic text that bypasses <strong>all major AI detectors</strong>.
                    </p>
                </div>

                <div className="glass rounded-xl shadow-lg p-5 mb-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">        
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                                <i className="fas fa-cog mr-1.5 text-orange-600 text-xs"></i>Engine
                            </label>
                            <select value={engine} onChange={e => setEngine(e.target.value)} className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-500 font-semibold transition-all shadow-sm hover:border-orange-400">
                                <option value="ghost_mini"> Ghost Mini (Fast)</option>
                                <option value="ghost_pro"> Ghost Pro (Max Quality)</option>
                                <option value="ninja"> Ninja (LLM-Powered)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                                <i className="fas fa-sliders-h mr-1.5 text-orange-600 text-xs"></i>Strength
                            </label>
                            <select value={strength} onChange={e => setStrength(e.target.value)} className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-500 font-semibold transition-all shadow-sm hover:border-orange-400">
                                <option value="light"> Light</option>
                                <option value="balanced"> Balanced</option>
                                <option value="deep"> Deep</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                                <i className="fas fa-heartbeat mr-1.5 text-orange-600 text-xs"></i>Status
                            </label>
                            <div className={px-3 py-2 rounded-lg text-white text-xs font-bold text-center shadow-md flex items-center justify-center }>
                                {isProcessing ? <><div className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 animate-pulse"></div>Processing...</> : 'Ready'}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                                <i className="fas fa-chart-line mr-1.5 text-orange-600 text-xs"></i>Quality
                            </label>
                            <div className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-400 to-indigo-500 text-white text-xs font-bold text-center shadow-md">
                                --%
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">        
                        <div className="flex flex-col h-full">
                            <div className="flex justify-between items-center mb-1.5">  
                                <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                                    <i className="fas fa-file-import mr-1.5 text-orange-600"></i>Original AI Text
                                </label>
                                <button onClick={() => { setInputText(''); setOutputText(''); }} className="text-[10px] text-red-600 hover:text-red-700 font-bold px-2 py-0.5 bg-red-50 rounded hover:bg-red-100 transition-all uppercase tracking-wider">
                                    <i className="fas fa-trash-alt mr-1"></i>Clear      
                                </button>
                            </div>
                            <textarea
                                value={inputText} onChange={e => setInputText(e.target.value)}
                                rows={12}
                                className="flex-grow w-full px-3 py-2 bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-500 resize-none text-[11px] leading-relaxed shadow-inner transition-all placeholder-gray-400 font-medium"
                                placeholder="Paste your AI-generated text here... (ChatGPT, Claude, Gemini, etc.)"
                            ></textarea>
                            <div className="flex justify-between items-center mt-1.5 text-[10px]">
                                <span className="text-gray-500 font-bold uppercase tracking-wider">
                                    <i className="fas fa-file-word mr-1 text-blue-500"></i>{inputWords} words  {inputText.length} chars
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col h-full">
                            <div className="flex justify-between items-center mb-1.5">  
                                <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                                    <i className="fas fa-file-export mr-1.5 text-green-600"></i>Humanized Text
                                </label>
                                <button onClick={() => { navigator.clipboard.writeText(outputText); showToast('Copied to clipboard!'); }} className="text-[10px] text-green-600 hover:text-green-700 font-bold px-2 py-0.5 bg-green-50 rounded hover:bg-green-100 transition-all uppercase tracking-wider">
                                    <i className="fas fa-copy mr-1"></i>Copy
                                </button>
                            </div>
                            <textarea
                                value={outputText} readOnly
                                rows={12}
                                className="flex-grow w-full px-3 py-2 bg-gradient-to-br from-green-50/50 to-emerald-50/50 backdrop-blur-sm border border-green-200/50 rounded-lg resize-none text-[11px] leading-relaxed shadow-inner font-medium text-gray-800"
                                placeholder="Your humanized, undetectable text will appear here..."
                            ></textarea>
                            <div className="flex justify-between items-center mt-1.5 text-[10px]">
                                <span className="text-gray-500 font-bold uppercase tracking-wider">
                                    <i className="fas fa-file-word mr-1 text-green-500"></i>{outputWords} words  {outputText.length} chars
                                </span>
                                <span className="text-gray-500 font-bold uppercase tracking-wider">{scores.processingTime}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mb-5">
                        <button onClick={handleHumanize} disabled={isProcessing} className="w-full bg-gradient-orange text-white font-black text-xs py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all hover:scale-[1.005] btn-premium relative overflow-hidden uppercase tracking-widest disabled:opacity-50">
                            <span className="relative z-10">
                                {isProcessing ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-magic mr-2 text-[10px]"></i>}
                                {isProcessing ? 'Processing...' : 'Humanize Text Now'}
                            </span>
                        </button>
                    </div>

                    <div className="block border-t border-gray-100/50 pt-5">
                        <h3 className="text-xs font-black text-gray-800 mb-3 flex items-center uppercase tracking-widest">
                            <i className="fas fa-chart-pie mr-2 text-orange-500"></i>AI Detection Scores (Top 5 Engines)
                            <span className="ml-auto text-[9px] font-bold text-gray-400 bg-gray-100/50 px-2 py-0.5 rounded-full">LOWER IS BETTER (0-21% = UNDETECTABLE)</span>
                        </h3>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                            <CircleMeter score={scores.gptzero} id="gptzero" name="GPTZero" type="Academic" icon="fab fa-google" bgClass="bg-gradient-to-br from-purple-500 to-pink-600" />
                            <CircleMeter score={scores.turnitin} id="turnitin" name="Turnitin" type="University" icon="fas fa-graduation-cap" bgClass="bg-gradient-to-br from-blue-500 to-cyan-600" />
                            <CircleMeter score={scores.originality} id="originality" name="Originality" type="Content" icon="fas fa-check-circle" bgClass="bg-gradient-to-br from-green-500 to-emerald-600" />
                            <CircleMeter score={scores.winston} id="winston" name="Winston AI" type="Advanced" icon="fas fa-brain" bgClass="bg-gradient-to-br from-orange-500 to-red-600" />
                            <CircleMeter score={scores.copyleaks} id="copyleaks" name="Copyleaks" type="Plagiarism" icon="fas fa-shield-virus" bgClass="bg-gradient-to-br from-yellow-500 to-amber-600" />
                        </div>

                        <div className="glass-dark rounded-lg p-4 text-white hover-lift border border-white/5 shadow-md">
                            <h4 className="text-[10px] uppercase tracking-widest font-bold mb-3 flex items-center text-gray-300">
                                <i className="fas fa-chart-bar mr-1.5 text-orange-400"></i>Overall Statistics
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">     
                                <div className="text-center p-2 rounded bg-white/5">    
                                    <div className="text-lg font-black mb-0.5 bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent" style={{ color: scores.overall !== null ? getCircleColor(scores.overall) : undefined }}>{scores.overall !== null ? Math.round(scores.overall) + '%' : '--%'}</div>
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Avg AI Score</div>
                                </div>
                                <div className="text-center p-2 rounded bg-white/5">    
                                    <div className="text-xs font-black mb-0.5 mt-1 text-orange-400">{scores.engineUsed}</div>
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-1">Engine Used</div>
                                </div>
                                <div className="text-center p-2 rounded bg-white/5">
                                    <div className="text-sm font-black mb-0.5 mt-1 text-green-400">{scores.processingTime}</div>
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-1">Processing Time</div>
                                </div>
                                <div className="text-center p-2 rounded bg-white/5">    
                                    <div className="text-sm font-black mb-0.5 mt-1 text-blue-400">{scores.wordsChanged}</div>
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-1">Text Modification</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="glass rounded-xl p-4 hover-lift text-center">       
                        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md">
                            <i className="fas fa-check-double text-white text-lg"></i>  
                        </div>
                        <h3 className="text-sm font-bold mb-1.5">100% Human Score</h3>  
                        <p className="text-gray-600 text-xs leading-relaxed">Bypass all major AI detectors with our advanced rewriting algorithms</p>
                    </div>
                    <div className="glass rounded-xl p-4 hover-lift text-center">       
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md">  
                            <i className="fas fa-bolt text-white text-lg"></i>
                        </div>
                        <h3 className="text-sm font-bold mb-1.5">Lightning Fast</h3>    
                        <p className="text-gray-600 text-xs leading-relaxed">Process thousands of words in seconds with our optimized engine</p>
                    </div>
                    <div className="glass rounded-xl p-4 hover-lift text-center">       
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md">  
                            <i className="fas fa-lock text-white text-lg"></i>
                        </div>
                        <h3 className="text-sm font-bold mb-1.5">100% Private</h3>      
                        <p className="text-gray-600 text-xs leading-relaxed">Your content is never stored or shared. Complete privacy guaranteed</p>
                    </div>
                </div>
            </div>

            <div className={	oast fixed top-24 right-6 z-50 glass-dark text-white px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-3 }>
                <i className="fas fa-check-circle text-green-400 text-xl"></i>
                <span className="font-semibold">{toastMsg}</span>
            </div>
        </main>
    );
}
