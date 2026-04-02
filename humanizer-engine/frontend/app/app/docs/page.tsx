import { BookOpen, Code2, FileText, Terminal } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold font-sora text-[#5C4033] flex items-center gap-3">
          <BookOpen className="text-[#8A7263] w-8 h-8" /> Documentation
        </h1>
        <p className="text-[#8A7263] mt-2">API references, engine guides, and integration docs.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          {
            icon: <Terminal className="w-6 h-6 text-[#D97757]" />,
            title: "API Reference",
            desc: "RESTful endpoints for humanization, detection, and style management.",
          },
          {
            icon: <Code2 className="w-6 h-6 text-[#7A8F6A]" />,
            title: "SDK & Libraries",
            desc: "Official client libraries for Python, Node.js, and Go.",
          },
          {
            icon: <FileText className="w-6 h-6 text-indigo-500" />,
            title: "Engine Guides",
            desc: "Deep-dive into Ghost Mini, Ghost Pro, and Ninja Stealth engines.",
          },
          {
            icon: <BookOpen className="w-6 h-6 text-amber-500" />,
            title: "Best Practices",
            desc: "Tips for maximizing bypass rates while preserving meaning.",
          },
        ].map((item, i) => (
          <div
            key={i}
            className="bg-white p-8 border border-[#EADDCF] shadow-sm hover:shadow-md hover:border-[#D97757]/30 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 bg-[#FFF8F0] flex items-center justify-center mb-6">
              {item.icon}
            </div>
            <h3 className="text-lg font-bold text-[#5C4033] mb-2">{item.title}</h3>
            <p className="text-sm text-[#8A7263] leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#5C4033] p-8 text-white">
        <h2 className="text-xl font-bold font-sora mb-4">Quick Start</h2>
        <div className="bg-black/20 p-6 font-mono text-sm leading-relaxed overflow-x-auto">
          <div className="text-[#D97757]">{"// Humanize text via API"}</div>
          <div className="mt-2">
            <span className="text-green-400">POST</span> /api/humanize
          </div>
          <div className="mt-2 text-white/60">
            {`{ "text": "...", "engine": "ghost_pro" }`}
          </div>
        </div>
      </div>
    </div>
  );
}
