import { Activity, FileText, BrainCircuit, TrendingUp, Zap, BarChart3 } from 'lucide-react';
import Link from 'next/link';

export default function DashboardHome() {
  const stats = [
    { label: "Words Humanized", value: "45,231", icon: <FileText className="w-5 h-5 text-brand-600"/> },
    { label: "Avg AI Score Defeated", value: "94%", icon: <TrendingUp className="w-5 h-5 text-emerald-600"/> },
    { label: "Style Profiles", value: "3", icon: <BrainCircuit className="w-5 h-5 text-blue-600"/> },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Overview of your writing activity</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center">
              {stat.icon}
            </div>
            <div>
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="text-xl font-semibold text-slate-900 mt-0.5">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link href="/app" className="bg-brand-600 hover:bg-brand-700 p-6 rounded-xl text-white transition-colors">
          <Zap className="w-5 h-5 mb-3" />
          <h3 className="text-sm font-semibold mb-1">Quick Humanize</h3>
          <p className="text-white/70 text-xs">Open the humanizer</p>
        </Link>
        <Link href="/app/style" className="bg-white hover:bg-slate-50 p-6 rounded-xl border border-slate-200 transition-colors">
          <BrainCircuit className="w-5 h-5 mb-3 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Style Profiles</h3>
          <p className="text-slate-500 text-xs">Manage writing styles</p>
        </Link>
        <Link href="/app/advanced" className="bg-white hover:bg-slate-50 p-6 rounded-xl border border-slate-200 transition-colors">
          <BarChart3 className="w-5 h-5 mb-3 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Analytics</h3>
          <p className="text-slate-500 text-xs">Track performance</p>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Recent Documents</h2>
          <button className="text-brand-600 hover:text-brand-700 text-xs font-medium">View All →</button>
        </div>
        <div className="divide-y divide-slate-100">
          {[1,2,3].map(i => (
             <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-slate-300" />
                  <div>
                    <h3 className="text-sm font-medium text-slate-800">Research_Draft_V{i}.docx</h3>
                    <p className="text-xs text-slate-400">2 days ago · Academic</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">100% Human</span>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}

