import '@/app/globals.css';
import { Inter, Sora } from 'next/font/google';
import Link from 'next/link';
import { LayoutDashboard, PenTool, FileText, BrainCircuit, Settings, Activity } from 'lucide-react';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });

export const metadata = {
  title: 'Humara App - World''s Best AI Text Humanizer',
  description: 'Bypass AI detectors with standard-setting humanization.',
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={${inter.variable}  font-inter bg-[#F5EBE1] text-[#5C4033] antialiased min-h-screen flex flex-col}>
        <div className="flex flex-1 h-screen overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-[#EADDCF] flex flex-col p-6 shadow-sm z-10 shrink-0">
            <Link href="/" className="text-2xl font-black font-sora tracking-tighter mb-12 flex items-center">
              HUMARA <span className="text-[#D97757] ml-1">.</span>
            </Link>

             <nav className="flex-1 space-y-2">
              <Link href="/app/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#8A7263] hover:text-[#D97757] hover:bg-[#FFF8F0] transition-colors font-medium group">
                <LayoutDashboard className="w-5 h-5 group-hover:scale-110 transition-transform" /> Dashboard
              </Link>
              <Link href="/app" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#5C4033] text-white shadow-md font-medium transition-transform active:scale-95 group">
                <PenTool className="w-5 h-5 group-hover:rotate-12 transition-transform" /> Rewrite Editor
              </Link>
              <Link href="/advanced" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#8A7263] hover:text-[#D97757] hover:bg-[#FFF8F0] transition-colors font-medium group">
                <Activity className="w-5 h-5 group-hover:-rotate-12 transition-transform" /> Advanced
              </Link>
              <Link href="/docs" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#8A7263] hover:text-[#D97757] hover:bg-[#FFF8F0] transition-colors font-medium group">
                <FileText className="w-5 h-5 group-hover:-translate-y-1 transition-transform" /> My Docs
              </Link>
              <Link href="/style" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#8A7263] hover:text-[#D97757] hover:bg-[#FFF8F0] transition-colors font-medium group relative">
                <BrainCircuit className="w-5 h-5 group-hover:scale-110 transition-transform" /> Style Memory
                <span className="absolute right-4 w-2 h-2 rounded-full bg-[#D97757]"></span>
              </Link>
            </nav>

            <div className="mt-auto space-y-2">
              <div className="p-4 bg-[#FFF8F0] rounded-2xl border border-[#EADDCF] mb-4">
                <div className="text-xs font-bold text-[#8A7263] mb-2 uppercase tracking-wide">Pro Plan</div>
                <div className="w-full bg-[#EADDCF] h-2 rounded-full overflow-hidden">
                  <div className="bg-[#D97757] w-[45%] h-full rounded-full"></div>
                </div>
                <div className="text-[10px] text-[#8A7263] mt-2 font-medium">22k / 50k words</div>
              </div>
              <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#8A7263] hover:text-[#5C4033] hover:bg-gray-50 transition-colors font-medium group">
                <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" /> Settings
              </Link>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#FFF8F0]/80 via-[#F5EBE1]/40 to-[#EADDCF]/20 overflow-y-auto p-4 md:p-8">
            {children}
          </main>
        </div>
      </body>
 