import { Activity, FileText, BrainCircuit, TrendingUp, Zap, BarChart3 } from 'lucide-react';
import Link from 'next/link';

export default function DashboardHome() {
  const stats = [
    { label: "Words Humanized", value: "45,231", icon: <FileText className="w-6 h-6 text-brand-600"/> },
    { label: "Avg AI Score Defeated", value: "94%", icon: <TrendingUp className="w-6 h-6 text-green-600"/> },
    { label: "Active Style Profiles", value: "3", icon: <BrainCircuit className="w-6 h-6 text-blue-600"/> },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to your Dashboard</h1>
        <p className="text-gray-600">Here's a quick look at your writing activities.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-lg border border-gray-200 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-brand-50 rounded-lg flex items-center justify-center">
              {stat.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Link href="/app" className="bg-brand-500 hover:bg-brand-600 p-8 rounded-lg text-white transition-colors group">
          <Zap className="w-8 h-8 mb-4 group-hover:scale-110 transition-transform" />
          <h3 className="text-lg font-semibold mb-2">Quick Humanize</h3>
          <p className="text-white/80 text-sm">Jump straight to the editor</p>
        </Link>
        <Link href="/app/style" className="bg-white hover:bg-gray-50 p-8 rounded-lg border border-gray-200 transition-colors group">
          <BrainCircuit className="w-8 h-8 mb-4 text-brand-600 group-hover:scale-110 transition-transform" />
          <h3 className="text-lg font-semibold mb-2 text-gray-900">Manage Styles</h3>
          <p className="text-gray-600 text-sm">Edit writing profiles</p>
        </Link>
        <Link href="/app/advanced" className="bg-white hover:bg-gray-50 p-8 rounded-lg border border-gray-200 transition-colors group">
          <BarChart3 className="w-8 h-8 mb-4 text-brand-600 group-hover:scale-110 transition-transform" />
          <h3 className="text-lg font-semibold mb-2 text-gray-900">View Analytics</h3>
          <p className="text-gray-600 text-sm">Track performance</p>
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Recent Documents</h2>
          <button className="text-brand-600 hover:text-brand-700 font-medium text-sm hover:underline">View All →</button>
        </div>
        <div className="divide-y divide-gray-200">
          {[1,2,3].map(i => (
             <div key={i} className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <Activity className="w-5 h-5 text-gray-400" />
                  <div>
                    <h3 className="font-medium text-gray-900">Research_Draft_V{i}.docx</h3>
                    <p className="text-sm text-gray-500">Processed 2 days ago • Academic Mode</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-green-100 text-green-800 font-medium text-sm rounded-full">100% Human</span>
                </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}

