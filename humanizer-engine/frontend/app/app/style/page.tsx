import { Palette, Type, PenTool, Save } from 'lucide-react';

export default function StylePage() {
  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold font-sora text-[#5C4033] flex items-center gap-3">
          <Palette className="text-[#8A7263] w-8 h-8" /> Style Profiles
        </h1>
        <p className="text-[#8A7263] mt-2">Create and manage writing style profiles for consistent humanization.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            className={`p-8 border shadow-sm transition-all cursor-pointer ${
              profile.active
                ? "bg-[#5C4033] text-white border-[#5C4033]"
                : "bg-white text-[#5C4033] border-[#EADDCF] hover:border-[#D97757]/30"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <PenTool className={`w-5 h-5 ${profile.active ? "text-[#D97757]" : "text-[#8A7263]"}`} />
              {profile.active && (
                <span className="text-[9px] font-black uppercase tracking-widest text-[#D97757]">Active</span>
              )}
            </div>
            <h3 className="text-lg font-bold mb-1">{profile.name}</h3>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-4 ${profile.active ? "text-white/50" : "text-[#8A7263]"}`}>
              {profile.tone}
            </p>
            <p className={`text-sm leading-relaxed ${profile.active ? "text-white/70" : "text-[#8A7263]"}`}>
              {profile.desc}
            </p>
          </div>
        ))}
      </div>

      <button className="self-start flex items-center gap-3 px-8 py-4 bg-[#FFF8F0] border border-[#EADDCF] text-[#5C4033] text-[11px] font-black uppercase tracking-[0.2em] hover:border-[#D97757] transition-all">
        <Save className="w-4 h-4" /> Create New Profile
      </button>
    </div>
  );
}
