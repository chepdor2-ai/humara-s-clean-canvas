'use client';
import { BookOpen, Code2, FileText, Terminal, ExternalLink, Copy, Check, ChevronRight } from 'lucide-react';
import { useState } from 'react';

type Section = 'overview' | 'api' | 'sdk' | 'engines' | 'tips';

const SECTIONS = [
  { id: 'overview' as Section, label: 'Overview', icon: BookOpen },
  { id: 'api' as Section, label: 'API Reference', icon: Terminal },
  { id: 'sdk' as Section, label: 'SDK & Libraries', icon: Code2 },
  { id: 'engines' as Section, label: 'Engine Guides', icon: FileText },
  { id: 'tips' as Section, label: 'Best Practices', icon: BookOpen },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [copied, setCopied] = useState<string | null>(null);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const CodeBlock = ({ code, id, lang }: { code: string; id: string; lang: string }) => (
    <div className="relative bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800">
        <span className="text-xs text-slate-400 font-mono">{lang}</span>
        <button onClick={() => copyCode(code, id)} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
          {copied === id ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="p-4 text-sm text-slate-300 font-mono overflow-x-auto leading-relaxed"><code>{code}</code></pre>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
          <BookOpen className="text-brand-600 w-7 h-7" /> Documentation
        </h1>
        <p className="text-sm text-zinc-400 mt-1">API references, engine guides, and integration docs.</p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left nav */}
        <nav className="lg:w-52 shrink-0">
          <div className="lg:sticky lg:top-6 space-y-0.5">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => setActiveSection(s.id)} className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeSection === s.id ? 'bg-brand-950 text-brand-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                  <Icon className="w-4 h-4" /> {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-6">

          {activeSection === 'overview' && (
            <div className="space-y-6">
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Getting Started</h2>
                <p className="text-sm text-zinc-400 leading-relaxed">HumaraGPT provides a REST API for humanizing AI-generated text. All requests require an API key passed via the <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">Authorization</code> header.</p>
                <div className="flex items-start gap-3 p-4 bg-brand-950/30 rounded-lg border border-brand-800">
                  <ChevronRight className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-brand-300">Generate your API key from <a href="/app/settings" className="font-medium underline">Settings → API Keys</a>.</p>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Base URL</h2>
                <CodeBlock code="https://humaragpt.com/api" id="base-url" lang="URL" />
              </div>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Authentication</h2>
                <CodeBlock code={`curl -X POST https://humaragpt.com/api/humanize \\
  -H "Authorization: Bearer hum_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Your AI text here", "engine": "ghost_pro"}'`} id="auth" lang="bash" />
              </div>
            </div>
          )}

          {activeSection === 'api' && (
            <div className="space-y-6">
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 text-xs font-semibold rounded">POST</span>
                  <code className="text-sm font-mono text-white">/api/humanize</code>
                </div>
                <p className="text-sm text-zinc-400">Humanize AI-generated text.</p>
                <h3 className="text-sm font-semibold text-zinc-200">Request Body</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-zinc-700"><th className="text-left py-2 text-zinc-400 font-medium">Field</th><th className="text-left py-2 text-zinc-400 font-medium">Type</th><th className="text-left py-2 text-zinc-400 font-medium">Required</th><th className="text-left py-2 text-zinc-400 font-medium">Description</th></tr></thead>
                    <tbody className="text-zinc-300">
                      <tr className="border-b border-zinc-800"><td className="py-2 font-mono text-xs">text</td><td className="py-2">string</td><td className="py-2">Yes</td><td className="py-2">The text to humanize</td></tr>
                      <tr className="border-b border-zinc-800"><td className="py-2 font-mono text-xs">engine</td><td className="py-2">string</td><td className="py-2">No</td><td className="py-2">Engine ID (ghost_mini, ghost_pro, ninja, humara, fast_v11)</td></tr>
                      <tr className="border-b border-zinc-800"><td className="py-2 font-mono text-xs">strength</td><td className="py-2">string</td><td className="py-2">No</td><td className="py-2">light, medium, or strong</td></tr>
                      <tr><td className="py-2 font-mono text-xs">tone</td><td className="py-2">string</td><td className="py-2">No</td><td className="py-2">neutral, academic, professional, simple</td></tr>
                    </tbody>
                  </table>
                </div>
                <CodeBlock code={`// Example response
{
  "success": true,
  "humanized": "Your humanized text...",
  "word_count": 150,
  "engine_used": "ghost_pro",
  "meaning_preserved": true,
  "meaning_similarity": 0.92,
  "output_detector_results": {
    "overall": 8,
    "detectors": [...]
  }
}`} id="humanize-resp" lang="json" />
              </div>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 text-xs font-semibold rounded">POST</span>
                  <code className="text-sm font-mono text-white">/api/detect</code>
                </div>
                <p className="text-sm text-zinc-400">Detect AI-generated content in text.</p>
                <CodeBlock code={`{
  "text": "Text to analyze for AI patterns",
  "detectors": ["gptzero", "turnitin", "originality"]
}`} id="detect-req" lang="json" />
              </div>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-950 text-blue-400 text-xs font-semibold rounded">GET</span>
                  <code className="text-sm font-mono text-white">/api/health</code>
                </div>
                <p className="text-sm text-zinc-400">Check API health and available engines.</p>
              </div>
            </div>
          )}

          {activeSection === 'sdk' && (
            <div className="space-y-6">
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">JavaScript / Node.js</h2>
                <CodeBlock code={`const response = await fetch('https://humaragpt.com/api/humanize', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer hum_your_api_key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'Your AI-generated text here',
    engine: 'humara',
    tone: 'academic',
  }),
});

const data = await response.json();
console.log(data.humanized);`} id="js-sdk" lang="javascript" />
              </div>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Python</h2>
                <CodeBlock code={`import requests

response = requests.post(
    'https://humaragpt.com/api/humanize',
    headers={'Authorization': 'Bearer hum_your_api_key'},
    json={
        'text': 'Your AI-generated text here',
        'engine': 'humara',
        'tone': 'academic',
    },
)

data = response.json()
print(data['humanized'])`} id="py-sdk" lang="python" />
              </div>

              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">cURL</h2>
                <CodeBlock code={`curl -X POST https://humaragpt.com/api/humanize \\
  -H "Authorization: Bearer hum_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Your AI-generated text here",
    "engine": "ghost_pro",
    "strength": "medium"
  }'`} id="curl-sdk" lang="bash" />
              </div>
            </div>
          )}

          {activeSection === 'engines' && (
            <div className="space-y-4">
              {[
                { name: 'Humara 0', id: 'fast_v11', tier: 'Premium', desc: '15-phase pipeline with deep AI pattern removal. Processes each sentence individually through cleaning, detection, rewriting, vocabulary injection, syntax restructuring, and multi-pass post-processing.', best: 'Academic papers, research submissions' },
                { name: 'Humara v1.1', id: 'humara', tier: 'Premium', desc: 'Dual-path engine running two independent passes, scoring multiple candidates per sentence for naturalness and meaning. Applies shared humanization layer with phrasal verbs and AI-term elimination.', best: 'High-stakes content with meaning preservation' },
                { name: 'Fast', id: 'ghost_mini', tier: 'Free', desc: 'Lightweight single-pass rewrite with synonym swaps and basic restructuring.', best: 'Quick turnaround, short texts' },
                { name: 'Standard', id: 'ghost_pro', tier: 'Free', desc: 'Balanced engine with synonym replacement, sentence restructuring, and AI pattern removal.', best: 'General-purpose humanization' },
                { name: 'Stealth', id: 'ninja', tier: 'Free', desc: 'Aggressive rewriting focused on detector evasion with heavier structural changes.', best: 'Maximum AI score reduction' },
                { name: 'Undetectable', id: 'undetectable', tier: 'Free', desc: 'Deep multi-pass rewriting for minimal AI detection scores.', best: 'When detection score must be near zero' },
              ].map(e => (
                <div key={e.id} className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-base font-semibold text-white">{e.name}</h3>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${e.tier === 'Premium' ? 'bg-brand-950 text-brand-300' : 'bg-zinc-800 text-zinc-400'}`}>{e.tier}</span>
                    <code className="text-xs text-slate-400 font-mono">{e.id}</code>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-2">{e.desc}</p>
                  <p className="text-xs text-zinc-500"><strong>Best for:</strong> {e.best}</p>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'tips' && (
            <div className="space-y-4">
              {[
                { title: 'Choose the right engine', body: 'Use Humara 0 or Humara v1.1 for academic and high-stakes content. Use Fast or Standard for quick everyday rewrites. Use Stealth or Undetectable when detection score is the top priority.' },
                { title: 'Use academic tone for research papers', body: 'Set tone to "academic" when processing research papers. This preserves technical terminology, citation formats, and statistical notation.' },
                { title: 'Enable strict meaning preservation', body: 'For content where accuracy matters (medical, legal, academic), enable the strict meaning toggle to minimize semantic drift.' },
                { title: 'Process in reasonable chunks', body: 'For best results, process 200-500 words at a time. Very long texts may see diminishing quality in later paragraphs.' },
                { title: 'Review and iterate', body: 'After humanization, use the built-in AI detector to check scores. If some sentences still score high, use sentence-level rephrasing to target them specifically.' },
                { title: 'Create style profiles', body: 'Set up style profiles that match your natural writing patterns. This helps the engine produce output that sounds authentically like you.' },
              ].map((tip, i) => (
                <div key={i} className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                  <h3 className="text-sm font-semibold text-white mb-2">{i + 1}. {tip.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{tip.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

