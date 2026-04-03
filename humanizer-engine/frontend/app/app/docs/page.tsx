import { BookOpen, Code2, FileText, Terminal, ExternalLink } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <BookOpen className="text-brand-600 w-8 h-8" /> Documentation
        </h1>
        <p className="text-gray-600">API references, engine guides, and integration docs.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          {
            icon: <Terminal className="w-6 h-6 text-brand-600" />,
            title: "API Reference",
            desc: "RESTful endpoints for rewriting text, detecting AI, and managing styles.",
          },
          {
            icon: <Code2 className="w-6 h-6 text-green-600" />,
            title: "SDK & Libraries",
            desc: "Official client libraries for Python, Node.js, and Go.",
          },
          {
            icon: <FileText className="w-6 h-6 text-blue-600" />,
            title: "Engine Guides",
            desc: "Deep-dive into Ghost Mini, Ghost Pro, and Ninja Stealth engines.",
          },
          {
            icon: <BookOpen className="w-6 h-6 text-purple-600" />,
            title: "Best Practices",
            desc: "Tips for maximizing bypass rates while preserving meaning.",
          },
        ].map((item, i) => (
          <div
            key={i}
            className="bg-white p-6 border border-gray-200 rounded-lg hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 bg-brand-50 flex items-center justify-center mb-4 rounded-lg group-hover:scale-110 transition-transform">
              {item.icon}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">{item.title} <ExternalLink className="w-4 h-4 text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity" /></h3>
            <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 p-8 rounded-lg text-white">
        <h2 className="text-xl font-semibold mb-6">Quick Start</h2>
        <div className="bg-black/30 p-6 font-mono text-sm leading-loose overflow-x-auto rounded border border-gray-700">
          <div className="text-brand-400">{"// Humanize text via API"}</div>
          <div className="mt-2">
            <span className="text-green-400 font-semibold">POST</span> <span className="text-yellow-400">/api/humanize</span>
          </div>
          <div className="mt-2 text-gray-400">
            {`{ "text": "...", "engine": "ghost_pro" }`}
          </div>
        </div>
        <a href="#" className="inline-block mt-6 text-brand-400 hover:text-brand-300 font-medium text-sm">View Full Documentation →</a>
      </div>
    </div>
  );
}

