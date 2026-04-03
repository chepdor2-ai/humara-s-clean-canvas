import { Palette, Type, PenTool, Save } from 'lucide-react';

export default function StylePage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <Palette className="text-brand-600 w-8 h-8" /> Style Profiles
        </h1>
        <p className="text-gray-600">Create profiles so your writing always points to you.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[
          {
            name: "Academic Default",
            tone: "Formal",
            desc: "Scholarly tone with varied syntax and disciplined vocabulary.",
            active: true,
          },
          {
            name: "Blog Casual",
            tone: "Conversational",
            desc: "Relaxed, approachable writing with natural contractions.",
            active: false,
          },
          {
            name: "Technical Report",
            tone: "Professional",
            desc: "Precise, data-driven language with measured sentence flow.",
            active: false,
          },
        ].map((profile, i) => (
          <div
            key={i}
            className={`p-6 border rounded-lg transition-all cursor-pointer ${
              profile.active
                ? "bg-brand-500 text-white border-brand-600 shadow-md"
                : "bg-white text-gray-900 border-gray-200 hover:border-brand-300"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <PenTool className={`w-5 h-5 ${profile.active ? "text-white" : "text-brand-600"}`} />
              {profile.active && (
                <span className="text-xs font-medium bg-white text-brand-600 px-2 py-1 rounded-full">Active</span>
              )}
            </div>
            <h3 className="text-xl font-semibold mb-2">{profile.name}</h3>
            <p className={`text-xs font-medium mb-4 ${profile.active ? "text-white/70" : "text-gray-500"}`}>
              {profile.tone}
            </p>
            <p className={`text-sm leading-relaxed ${profile.active ? "text-white/80" : "text-gray-600"}`}>
              {profile.desc}
            </p>
          </div>
        ))}
      </div>

      <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 transition-all rounded-lg">
        <Save className="w-4 h-4" /> Create New Profile
      </button>
    </div>
  );
}

