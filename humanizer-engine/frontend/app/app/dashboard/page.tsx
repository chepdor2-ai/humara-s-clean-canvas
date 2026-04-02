import { Activity, FileText, BrainCircuit, TrendingUp } from 'lucide-react';

export default function DashboardHome() {
  const stats = [
    { label: "Words Humanized", value: "45,231", icon: <FileText className="w-6 h-6 text-[#D97757]"/> },
    { label: "Avg AI Score Defeated", value: "94%", icon: <TrendingUp className="w-6 h-6 text-[#7A8F6A]"/> },
    { label: "Active Style Profiles", value: "3", icon: <BrainCircuit className="w-6 h-6 text-indigo-500"/> },
  ];

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold font-sora text-[#5C4033]">Welcome back, Dr. Doe</h1>
        <p className="text-[#8A7263]">Here's your humanization overview for this week.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-[#EADDCF] shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-xl bg-[#FFF8F0] flex items-center justify-center">
              {stat.icon}
            </div>
            <div>
              <p className="text-sm font-bold text-[#8A7263] uppercase tracking-wider">{stat.label}</p>
              <p className="text-3xl font-bold text-[#5C4033] mt-1">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#EADDCF] rounded-2xl p-6 shadow-sm flex-1">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[#5C4033]">Recent Documents</h2>
          <button className="text-[#D97757] font-bold text-sm hover:underline">View All</button>
        </div>
        <div className="space-y-4">
          {[1,2,3].map(i => (
             <div key={i} className="flex items-center justify-between p-4 bg-[#FFF8F0] rounded-xl border border-[#EADDCF]">
                <div className="flex items-center gap-4">
                  <Activity className="w-5 h-5 text-[#8A7263]" />
                  <div>
                    <h3 className="font-bold text-[#5C4033]">Research_Draft_V{i}.docx</h3>
                    <p className="text-xs text-[#8A7263]">Processed 2 days ago  Academic Mode</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-green-100 text-green-800 font-bold text-xs rounded-full">100% Human</span>
                </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}
