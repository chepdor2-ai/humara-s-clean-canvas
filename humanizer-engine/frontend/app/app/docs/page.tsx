'use client';
import { BookOpen, Code2, FileText, Terminal, Copy, Check, ChevronRight, Zap, Shield, Globe, Key, BarChart3, Settings2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

type Section = 'overview' | 'auth' | 'humanize' | 'detect' | 'status' | 'usage' | 'models' | 'errors' | 'sdk' | 'limits';

const SECTIONS = [
  { id: 'overview' as Section, label: 'Overview', icon: BookOpen },
  { id: 'auth' as Section, label: 'Authentication', icon: Key },
  { id: 'humanize' as Section, label: 'POST /v1/humanize', icon: Zap },
  { id: 'detect' as Section, label: 'POST /v1/detect', icon: Shield },
  { id: 'status' as Section, label: 'GET /v1/status', icon: Globe },
  { id: 'usage' as Section, label: 'GET /v1/usage', icon: BarChart3 },
  { id: 'models' as Section, label: 'Engines & Models', icon: Settings2 },
  { id: 'errors' as Section, label: 'Error Codes', icon: AlertTriangle },
  { id: 'sdk' as Section, label: 'SDKs & Examples', icon: Code2 },
  { id: 'limits' as Section, label: 'Rate Limits', icon: FileText },
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
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{lang}</span>
        <button onClick={() => copyCode(code, id)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
          {copied === id ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="p-4 text-sm text-slate-600 dark:text-slate-300 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap"><code>{code}</code></pre>
    </div>
  );

  const ParamTable = ({ params }: { params: { name: string; type: string; required: boolean; desc: string; def?: string }[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-300 dark:border-zinc-700">
          <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Parameter</th>
          <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Type</th>
          <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Required</th>
          <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Default</th>
          <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Description</th>
        </tr></thead>
        <tbody className="text-slate-600 dark:text-zinc-300">
          {params.map((p, i) => (
            <tr key={i} className="border-b border-slate-200 dark:border-zinc-800">
              <td className="py-2 font-mono text-xs text-brand-600 dark:text-purple-400">{p.name}</td>
              <td className="py-2 text-xs">{p.type}</td>
              <td className="py-2">{p.required ? <span className="text-red-500 dark:text-red-400 text-xs font-semibold">Yes</span> : <span className="text-slate-400 dark:text-zinc-500 text-xs">No</span>}</td>
              <td className="py-2 text-xs text-slate-400 dark:text-zinc-500">{p.def || '—'}</td>
              <td className="py-2 text-xs">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const Badge = ({ method, color }: { method: string; color: string }) => (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${color}`}>{method}</span>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <BookOpen className="text-brand-600 w-7 h-7" /> API Documentation
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Complete reference for the HumaraGPT REST API v1</p>
          </div>
          <Link href="/api-pricing" className="text-sm text-brand-600 dark:text-purple-400 hover:text-brand-500 dark:hover:text-purple-300 flex items-center gap-1">
            View API Plans <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left nav */}
        <nav className="lg:w-56 shrink-0">
          <div className="lg:sticky lg:top-6 space-y-0.5">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => setActiveSection(s.id)} className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeSection === s.id ? 'bg-brand-950 text-brand-300' : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'}`}>
                  <Icon className="w-4 h-4" /> {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* ── Overview ───────────────────────────────────────── */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Getting Started</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
                  The HumaraGPT API lets you humanize AI-generated text programmatically. It supports 7 specialized engines,
                  configurable strength/tone, and returns humanized text with AI detection scores and usage metadata.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg border border-slate-200 dark:border-zinc-700">
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mb-1">Base URL</p>
                    <code className="text-sm text-slate-900 dark:text-white font-mono">https://humaragpt.com/api/v1</code>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg border border-slate-200 dark:border-zinc-700">
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mb-1">Content Type</p>
                    <code className="text-sm text-slate-900 dark:text-white font-mono">application/json</code>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-brand-950/30 rounded-lg border border-brand-800">
                  <ChevronRight className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-brand-300">Generate your API key from <Link href="/app/settings" className="font-medium underline">Settings → API Keys</Link>.</p>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Quick Start</h2>
                <CodeBlock code={`curl -X POST https://humaragpt.com/api/v1/humanize \\
  -H "Authorization: Bearer hum_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Artificial intelligence has fundamentally transformed...",
    "engine": "oxygen",
    "strength": "medium",
    "tone": "academic"
  }'`} id="quickstart" lang="bash" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">API Endpoints</h2>
                <div className="space-y-2">
                  {[
                    { method: 'POST', path: '/v1/humanize', desc: 'Humanize AI-generated text', color: 'bg-emerald-950 text-emerald-400', target: 'humanize' as Section },
                    { method: 'POST', path: '/v1/detect', desc: 'Detect AI-generated content', color: 'bg-emerald-950 text-emerald-400', target: 'detect' as Section },
                    { method: 'GET', path: '/v1/status', desc: 'API status, available engines, quota', color: 'bg-blue-950 text-blue-400', target: 'status' as Section },
                    { method: 'GET', path: '/v1/usage', desc: 'Usage analytics for last 30 days', color: 'bg-blue-950 text-blue-400', target: 'usage' as Section },
                  ].map((ep, i) => (
                    <button key={i} onClick={() => setActiveSection(ep.target)} className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors text-left">
                      <Badge method={ep.method} color={ep.color} />
                      <code className="text-sm font-mono text-slate-900 dark:text-white">{ep.path}</code>
                      <span className="text-xs text-slate-400 dark:text-zinc-500 ml-auto hidden sm:inline">{ep.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Authentication ─────────────────────────────────── */}
          {activeSection === 'auth' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">API Key Authentication</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
                  All API requests must include a valid API key in the <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">Authorization</code> header.
                  Keys are prefixed with <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">hum_</code> and hashed with SHA-256 — we never store your key in plain text.
                </p>
                <CodeBlock code={`Authorization: Bearer hum_your_api_key_here`} id="auth-header" lang="HTTP Header" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Generating API Keys</h2>
                <ol className="space-y-3 text-sm text-slate-500 dark:text-zinc-400">
                  <li className="flex gap-3"><span className="text-brand-600 dark:text-purple-400 font-bold shrink-0">1.</span> Sign in at <a href="https://humaragpt.com/login" className="text-brand-600 dark:text-purple-400 underline">humaragpt.com/login</a></li>
                  <li className="flex gap-3"><span className="text-brand-600 dark:text-purple-400 font-bold shrink-0">2.</span> Navigate to <Link href="/app/settings" className="text-brand-600 dark:text-purple-400 underline">Settings → API Keys</Link></li>
                  <li className="flex gap-3"><span className="text-brand-600 dark:text-purple-400 font-bold shrink-0">3.</span> Click &quot;Create Key&quot; and give it a name</li>
                  <li className="flex gap-3"><span className="text-brand-600 dark:text-purple-400 font-bold shrink-0">4.</span> Copy the key immediately — it&apos;s shown only once</li>
                </ol>
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800/40">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">Never share your API key or commit it to version control. Use environment variables instead.</p>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Security Best Practices</h2>
                <ul className="space-y-2 text-sm text-slate-500 dark:text-zinc-400">
                  <li className="flex gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Store keys in environment variables, not source code</li>
                  <li className="flex gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Use separate keys for development and production</li>
                  <li className="flex gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Rotate keys periodically — revoke old ones from Settings</li>
                  <li className="flex gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Never use API keys in client-side (browser) code</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── POST /v1/humanize ──────────────────────────────── */}
          {activeSection === 'humanize' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Badge method="POST" color="bg-emerald-950 text-emerald-400" />
                  <code className="text-sm font-mono text-slate-900 dark:text-white">/api/v1/humanize</code>
                </div>
                <p className="text-sm text-slate-500 dark:text-zinc-400">Humanize AI-generated text. Returns humanized output with AI detection scores, word counts, and usage metadata.</p>

                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Request Body</h3>
                <ParamTable params={[
                  { name: 'text', type: 'string', required: true, desc: 'The AI-generated text to humanize. Max 50,000 characters.' },
                  { name: 'engine', type: 'string', required: false, def: '"oxygen"', desc: 'Engine ID. Available engines depend on your API plan.' },
                  { name: 'strength', type: 'string', required: false, def: '"medium"', desc: 'Humanization strength: light, medium, or strong.' },
                  { name: 'tone', type: 'string', required: false, def: '"neutral"', desc: 'Output tone: neutral, academic, professional, simple, creative, technical, wikipedia.' },
                  { name: 'strict_meaning', type: 'boolean', required: false, def: 'true', desc: 'Preserve original meaning strictly. Set false for more aggressive rewriting.' },
                  { name: 'no_contractions', type: 'boolean', required: false, def: 'false', desc: 'Expand all contractions (e.g., "don\'t" → "do not").' },
                  { name: 'enable_post_processing', type: 'boolean', required: false, def: 'true', desc: 'Apply grammar cleanup and formatting passes.' },
                ]} />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Example Request</h3>
                <CodeBlock code={`{
  "text": "Artificial intelligence has fundamentally transformed the landscape of modern education. The integration of AI technologies in classrooms has significantly impacted how students learn and educators teach.",
  "engine": "oxygen",
  "strength": "medium",
  "tone": "academic",
  "strict_meaning": true
}`} id="humanize-req" lang="json" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Example Response</h3>
                <CodeBlock code={`{
  "success": true,
  "data": {
    "humanized": "AI has reshaped how students and teachers approach education today. Classrooms now rely on smart tools that change the way lessons are delivered and absorbed.",
    "engine_used": "oxygen",
    "input_word_count": 32,
    "output_word_count": 28,
    "meaning_preserved": true,
    "meaning_similarity": 0.91,
    "ai_scores": {
      "overall": 12,
      "detectors": [
        { "detector": "GPTZero", "ai_score": 8, "human_score": 92 },
        { "detector": "Turnitin", "ai_score": 15, "human_score": 85 },
        { "detector": "Originality.AI", "ai_score": 10, "human_score": 90 }
      ]
    }
  },
  "meta": {
    "latency_ms": 1240,
    "plan": "Developer",
    "usage": {
      "daily_requests_used": 42,
      "daily_requests_limit": 1000,
      "monthly_words_used": 15230,
      "monthly_words_limit": 250000
    },
    "remaining": {
      "daily_requests": 958,
      "monthly_words": 234770
    }
  }
}`} id="humanize-resp" lang="json" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Response Headers</h3>
                <ParamTable params={[
                  { name: 'X-RateLimit-Limit', type: 'integer', required: false, desc: 'Maximum daily requests for your plan.' },
                  { name: 'X-RateLimit-Remaining', type: 'integer', required: false, desc: 'Remaining daily requests.' },
                  { name: 'X-Request-Id', type: 'string', required: false, desc: 'Unique request identifier for debugging.' },
                ]} />
              </div>
            </div>
          )}

          {/* ── POST /v1/detect ────────────────────────────────── */}
          {activeSection === 'detect' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Badge method="POST" color="bg-emerald-950 text-emerald-400" />
                  <code className="text-sm font-mono text-slate-900 dark:text-white">/api/v1/detect</code>
                </div>
                <p className="text-sm text-slate-500 dark:text-zinc-400">Analyze text for AI-generated content patterns. Returns scores from multiple AI detectors.</p>

                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Request Body</h3>
                <ParamTable params={[
                  { name: 'text', type: 'string', required: true, desc: 'Text to analyze. Max 50,000 characters.' },
                ]} />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Example Response</h3>
                <CodeBlock code={`{
  "success": true,
  "data": {
    "overall_ai_score": 78,
    "overall_human_score": 22,
    "detectors": [
      { "detector": "GPTZero", "ai_score": 82, "human_score": 18 },
      { "detector": "Turnitin", "ai_score": 75, "human_score": 25 },
      { "detector": "Originality.AI", "ai_score": 80, "human_score": 20 }
    ],
    "word_count": 14,
    "sentence_count": 1
  },
  "meta": { "latency_ms": 45 }
}`} id="detect-resp" lang="json" />
              </div>
            </div>
          )}

          {/* ── GET /v1/status ─────────────────────────────────── */}
          {activeSection === 'status' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Badge method="GET" color="bg-blue-950 text-blue-400" />
                  <code className="text-sm font-mono text-slate-900 dark:text-white">/api/v1/status</code>
                </div>
                <p className="text-sm text-slate-500 dark:text-zinc-400">Check API status, available engines, and your current quota. Works with or without authentication.</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Authenticated Response</h3>
                <CodeBlock code={`{
  "success": true,
  "data": {
    "status": "operational",
    "version": "1.0.0",
    "plan": "Developer",
    "available_engines": ["oxygen", "ozone", "easy", "oxygen3", "nuru_v2", "ghost_pro_wiki"],
    "usage": {
      "daily_requests_used": 42,
      "daily_requests_limit": 1000,
      "monthly_words_used": 15230,
      "monthly_words_limit": 250000
    },
    "rate_limit": { "requests_per_minute": 30 },
    "total_requests": 1847
  }
}`} id="status-resp" lang="json" />
              </div>
            </div>
          )}

          {/* ── GET /v1/usage ──────────────────────────────────── */}
          {activeSection === 'usage' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Badge method="GET" color="bg-blue-950 text-blue-400" />
                  <code className="text-sm font-mono text-slate-900 dark:text-white">/api/v1/usage</code>
                </div>
                <p className="text-sm text-slate-500 dark:text-zinc-400">Get detailed usage analytics for the last 30 days including daily breakdown, engine distribution, and quotas.</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Example Response</h3>
                <CodeBlock code={`{
  "success": true,
  "data": {
    "plan": "Developer",
    "period": { "start": "2026-03-17", "end": "2026-04-16" },
    "summary": {
      "total_requests": 1847,
      "total_input_words": 142500,
      "total_output_words": 138200,
      "avg_latency_ms": 1380,
      "success_rate": 99.2,
      "error_count": 15
    },
    "quota": {
      "daily_requests_used": 42,
      "daily_requests_limit": 1000,
      "monthly_words_used": 142500,
      "monthly_words_limit": 250000
    },
    "daily_breakdown": [
      { "date": "2026-04-16", "requests": 42, "words": 3200, "errors": 0 }
    ],
    "engine_breakdown": [
      { "engine": "oxygen", "requests": 920 },
      { "engine": "easy", "requests": 540 }
    ]
  }
}`} id="usage-resp" lang="json" />
              </div>
            </div>
          )}

          {/* ── Engines & Models ───────────────────────────────── */}
          {activeSection === 'models' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Available Engines</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">Each engine is optimized for different use cases. The engines available to you depend on your API plan.</p>
              </div>

              {[
                { id: 'oxygen', name: 'Humara 2.0', tier: 'Hobby+', desc: 'GPTZero killer engine with AntiGPTZero mode. Uses adaptive chain processing to minimize AI detection. Best for academic papers and research content.', params: 'Supports all strength/tone combinations.', best: 'Academic papers, essays, research' },
                { id: 'ozone', name: 'Humara 2.1', tier: 'Developer+', desc: 'ZeroGPT and Surfer SEO cleaner. Optimized for content marketing and blog posts. Maintains SEO-friendly structure while removing AI patterns.', params: 'Supports sentence-by-sentence mode.', best: 'Blog posts, content marketing, SEO content' },
                { id: 'easy', name: 'Humara 2.2', tier: 'Hobby+', desc: 'Broad-spectrum general-purpose engine. Multi-engine fusion with Oxygen polish and Nuru refinement. Works well across all content types.', params: 'Full strength/tone support. Good default choice.', best: 'General-purpose, mixed content' },
                { id: 'oxygen3', name: 'Humara 3.0', tier: 'Developer+', desc: 'Fine-tuned on 270,000 humanization pairs. Sentence-independent processing means each sentence is rewritten without context contamination.', params: 'Best with medium strength and academic/neutral tone.', best: 'Long-form content, batch processing' },
                { id: 'humara_v3_3', name: 'Humara 2.4', tier: 'Business+', desc: 'Strongest GPTZero killer with triple fallback and detector feedback loop. Runs multiple passes and selects the output with lowest AI score.', params: 'All parameters supported. Most aggressive with strong strength.', best: 'High-stakes content, guaranteed low AI scores' },
                { id: 'nuru_v2', name: 'Nuru 2.0', tier: 'Developer+', desc: 'Deep sentence restructuring engine. Achieves 40%+ structural change rate. Completely rewrites sentence structures while preserving meaning.', params: 'Works best with medium or strong strength.', best: 'When maximum rewriting is needed, plagiarism avoidance' },
                { id: 'ghost_pro_wiki', name: 'Wikipedia', tier: 'Developer+', desc: 'Encyclopedic neutral point of view. Optimized for NPOV content with citation preservation. Uses template-breaking to avoid repetitive patterns.', params: 'Uses wikipedia tone automatically. Preserves citations.', best: 'Wikipedia articles, encyclopedic content' },
              ].map(e => (
                <div key={e.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{e.name}</h3>
                    <code className="text-xs text-slate-500 dark:text-zinc-500 font-mono bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{e.id}</code>
                    <span className="text-[10px] font-bold text-brand-600 dark:text-purple-400 bg-brand-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-full">{e.tier}</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">{e.desc}</p>
                  <div className="text-xs text-slate-400 dark:text-zinc-500"><strong className="text-slate-600 dark:text-zinc-400">Parameters:</strong> {e.params}</div>
                  <div className="text-xs text-slate-400 dark:text-zinc-500"><strong className="text-slate-600 dark:text-zinc-400">Best for:</strong> {e.best}</div>
                </div>
              ))}

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Strength Levels</h3>
                <div className="space-y-2 text-sm text-slate-500 dark:text-zinc-400">
                  <div className="flex gap-3"><code className="text-brand-600 dark:text-purple-400 font-mono text-xs w-20 shrink-0">light</code>Minimal changes — preserves original style closely. ~15-25% modification.</div>
                  <div className="flex gap-3"><code className="text-brand-600 dark:text-purple-400 font-mono text-xs w-20 shrink-0">medium</code>Balanced rewriting — good mix of naturalness and preservation. ~30-45% modification.</div>
                  <div className="flex gap-3"><code className="text-brand-600 dark:text-purple-400 font-mono text-xs w-20 shrink-0">strong</code>Aggressive rewriting — maximum AI pattern removal. ~50-70% modification.</div>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Available Tones</h3>
                <div className="space-y-2 text-sm text-slate-500 dark:text-zinc-400">
                  {[
                    { tone: 'neutral', desc: 'No specific style bias. Natural everyday writing.' },
                    { tone: 'academic', desc: 'Formal academic style with proper citations and terminology.' },
                    { tone: 'professional', desc: 'Business and corporate communication style.' },
                    { tone: 'simple', desc: 'Plain language, lower reading level.' },
                    { tone: 'creative', desc: 'More expressive and varied sentence structures.' },
                    { tone: 'technical', desc: 'Preserves technical terms and code references.' },
                    { tone: 'wikipedia', desc: 'Encyclopedic NPOV style with citation awareness.' },
                  ].map(t => (
                    <div key={t.tone} className="flex gap-3"><code className="text-brand-600 dark:text-purple-400 font-mono text-xs w-24 shrink-0">{t.tone}</code>{t.desc}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Error Codes ────────────────────────────────────── */}
          {activeSection === 'errors' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Error Response Format</h2>
                <CodeBlock code={`{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE"
}`} id="error-format" lang="json" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Error Codes Reference</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-300 dark:border-zinc-700">
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">HTTP</th>
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Code</th>
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Description</th>
                    </tr></thead>
                    <tbody className="text-slate-600 dark:text-zinc-300">
                      {[
                        { http: 400, code: 'INVALID_REQUEST', desc: 'Malformed JSON or missing Content-Type header.' },
                        { http: 400, code: 'MISSING_TEXT', desc: 'The "text" field is missing or empty.' },
                        { http: 400, code: 'TEXT_TOO_LONG', desc: 'Text exceeds 50,000 character limit.' },
                        { http: 400, code: 'INVALID_STRENGTH', desc: 'Strength must be light, medium, or strong.' },
                        { http: 400, code: 'INVALID_TONE', desc: 'Invalid tone value provided.' },
                        { http: 401, code: 'UNAUTHORIZED', desc: 'Missing or invalid API key.' },
                        { http: 403, code: 'FORBIDDEN', desc: 'API key has been revoked.' },
                        { http: 403, code: 'ENGINE_NOT_AVAILABLE', desc: 'Requested engine not included in your plan.' },
                        { http: 405, code: 'METHOD_NOT_ALLOWED', desc: 'Wrong HTTP method (e.g., GET instead of POST).' },
                        { http: 429, code: 'RATE_LIMITED', desc: 'Daily request limit reached.' },
                        { http: 429, code: 'WORD_LIMIT_REACHED', desc: 'Monthly word limit reached.' },
                        { http: 500, code: 'HUMANIZATION_FAILED', desc: 'Engine error during processing.' },
                        { http: 500, code: 'INTERNAL_ERROR', desc: 'Unexpected server error.' },
                      ].map((e, i) => (
                        <tr key={i} className="border-b border-slate-200 dark:border-zinc-800">
                          <td className="py-2"><span className={`text-xs font-bold px-1.5 py-0.5 rounded ${e.http < 400 ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950' : e.http < 500 ? 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950' : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950'}`}>{e.http}</span></td>
                          <td className="py-2 font-mono text-xs text-brand-600 dark:text-purple-400">{e.code}</td>
                          <td className="py-2 text-xs">{e.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── SDKs & Examples ─────────────────────────────────── */}
          {activeSection === 'sdk' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">JavaScript / Node.js</h2>
                <CodeBlock code={`// Using fetch (Node.js 18+ / browser)
async function humanize(text, engine = 'oxygen') {
  const response = await fetch('https://humaragpt.com/api/v1/humanize', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${process.env.HUMARAGPT_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, engine, strength: 'medium', tone: 'academic' }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(\`API error: \${err.code} - \${err.error}\`);
  }

  const { data, meta } = await response.json();
  console.log('Humanized:', data.humanized);
  console.log('Remaining:', meta.remaining.monthly_words, 'words');
  return data;
}`} id="js-sdk" lang="javascript" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Python</h2>
                <CodeBlock code={`import os, requests

API_KEY = os.environ["HUMARAGPT_API_KEY"]
BASE = "https://humaragpt.com/api/v1"

def humanize(text, engine="oxygen", **kw):
    r = requests.post(f"{BASE}/humanize",
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json={"text": text, "engine": engine, "strength": kw.get("strength", "medium"),
              "tone": kw.get("tone", "academic"), "strict_meaning": kw.get("strict_meaning", True)},
        timeout=120)
    r.raise_for_status()
    result = r.json()
    if not result.get("success"):
        raise Exception(f"API Error: {result.get('error')}")
    return result["data"]

def detect(text):
    r = requests.post(f"{BASE}/detect",
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json={"text": text}, timeout=30)
    r.raise_for_status()
    return r.json()["data"]

def get_usage():
    r = requests.get(f"{BASE}/usage", headers={"Authorization": f"Bearer {API_KEY}"}, timeout=10)
    r.raise_for_status()
    return r.json()["data"]`} id="py-sdk" lang="python" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">cURL</h2>
                <CodeBlock code={`# Humanize
curl -X POST https://humaragpt.com/api/v1/humanize \\
  -H "Authorization: Bearer hum_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Your text here", "engine": "oxygen", "strength": "medium"}'

# Detect AI
curl -X POST https://humaragpt.com/api/v1/detect \\
  -H "Authorization: Bearer hum_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Text to analyze"}'

# Status & quota
curl -H "Authorization: Bearer hum_your_api_key" https://humaragpt.com/api/v1/status

# Usage analytics
curl -H "Authorization: Bearer hum_your_api_key" https://humaragpt.com/api/v1/usage`} id="curl-sdk" lang="bash" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">PHP</h2>
                <CodeBlock code={`<?php
$apiKey = getenv('HUMARAGPT_API_KEY');
$ch = curl_init('https://humaragpt.com/api/v1/humanize');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer {$apiKey}",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'text' => 'Your AI-generated text',
        'engine' => 'oxygen',
        'strength' => 'medium',
    ]),
    CURLOPT_TIMEOUT => 120,
]);
$response = curl_exec($ch);
$result = json_decode($response, true);
echo $result['data']['humanized'];
?>`} id="php-sdk" lang="php" />
              </div>
            </div>
          )}

          {/* ── Rate Limits ────────────────────────────────────── */}
          {activeSection === 'limits' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Rate Limits by Plan</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-300 dark:border-zinc-700">
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Plan</th>
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Price</th>
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Words/Mo</th>
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Req/Day</th>
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Rate</th>
                      <th className="text-left py-2 text-slate-500 dark:text-zinc-400 font-medium">Engines</th>
                    </tr></thead>
                    <tbody className="text-slate-600 dark:text-zinc-300">
                      <tr className="border-b border-slate-200 dark:border-zinc-800"><td className="py-2 font-semibold">Hobby</td><td className="py-2">$9/mo</td><td className="py-2">50K</td><td className="py-2">100</td><td className="py-2">10/min</td><td className="py-2">2</td></tr>
                      <tr className="border-b border-slate-200 dark:border-zinc-800"><td className="py-2 font-semibold">Developer</td><td className="py-2">$29/mo</td><td className="py-2">250K</td><td className="py-2">1,000</td><td className="py-2">30/min</td><td className="py-2">6</td></tr>
                      <tr className="border-b border-slate-200 dark:border-zinc-800"><td className="py-2 font-semibold">Business</td><td className="py-2">$79/mo</td><td className="py-2">1M</td><td className="py-2">5,000</td><td className="py-2">60/min</td><td className="py-2">7+</td></tr>
                      <tr className="border-b border-slate-200 dark:border-zinc-800"><td className="py-2 font-semibold">Enterprise</td><td className="py-2">$199/mo</td><td className="py-2">5M</td><td className="py-2">Unlimited</td><td className="py-2">120/min</td><td className="py-2">All</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Rate Limit Headers</h2>
                <CodeBlock code={`X-RateLimit-Limit: 1000        # Daily request limit
X-RateLimit-Remaining: 958    # Requests remaining today
X-Request-Id: abc12def-1j4k   # Unique request ID`} id="headers" lang="HTTP Headers" />
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Handling Rate Limits</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
                  When you hit a limit, the API returns HTTP 429. Implement exponential backoff or check <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">X-RateLimit-Remaining</code> before each request.
                </p>
                <CodeBlock code={`async function humanizeWithRetry(text, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch('https://humaragpt.com/api/v1/humanize', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${process.env.HUMARAGPT_API_KEY}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
    if (res.status === 429) {
      const waitMs = Math.pow(2, i) * 1000;
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return await res.json();
  }
  throw new Error('Max retries exceeded');
}`} id="retry" lang="javascript" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
