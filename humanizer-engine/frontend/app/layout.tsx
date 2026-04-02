'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Edit3, FileText, BrainCircuit, ShieldAlert, Settings, LogOut } from 'lucide-react';

const Logo = () => (
  <Link href="/" className="flex items-end text-2xl font-bold font-sora tracking-tight leading-none group mb-10 px-4">
    <span className="text-[#5C4033]">Huma</span>
    <span className="text-[#D97757]">ra</span>
    <div className="w-1.5 h-1.5 rounded-full bg-[#7A8F6A] ml-1 mb-1 group-hover:scale-150 transition-transform"></div>
  </Link>
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const links = [
    { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
    { name: 'Editor', href: '/app', icon: Edit3 },
    { name: 'My Documents', href: '/app/docs', icon: FileText },
    { name: 'Style Memory', href: '/app/style', icon: BrainCircuit },
    { name: 'Settings', href: '/app/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-[#FFF8F0] overflow-hidden">
      <aside className="w-64 bg-white border-r border-[#EADDCF] flex flex-col pt-8 pb-6">
        <Logo />
        <nav className="flex-1 px-4 space-y-1">
          {links.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link 
                key={link.name} 
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-[#F5EBE1] text-[#D97757]' 
                    : 'text-[#8A7263] hover:bg-[#F5EBE1]/50 hover:text-[#5C4033]'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#D97757]' : 'text-[#8A7263]'} `} />
                {link.name}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 border-t border-[#EADDCF] pt-4 mx-4">
          <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#8A7263] hover:bg-[#F5EBE1]/50 hover:text-[#D97757] w-full transition-colors">
            <LogOut className="w-5 h-5" />
            Log Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#FFF8F0] p-6">
        {children}
      </main>
    </div>
  );
}
