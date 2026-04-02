'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Edit3, FileText, BrainCircuit, Settings, LogOut, Menu, X, ArrowRight, Link as LinkIcon, AtSign, Send } from 'lucide-react';
import { useState, useEffect } from 'react';

const Logo = () => (
  <Link href="/" className="flex items-center text-xl font-bold font-sora tracking-tight leading-none group">
    <span className="text-[#5C4033]">Huma</span>
    <span className="text-[#D97757]">ra</span>
    <div className="w-1 h-1 rounded-full bg-[#7A8F6A] ml-0.5 group-hover:scale-150 transition-transform"></div>
  </Link>
);

const APP_ROUTES = ['/app'];

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAppRoute = APP_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const appLinks = [
    { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
    { name: 'Editor', href: '/app', icon: Edit3 },
    { name: 'My Documents', href: '/app/docs', icon: FileText },
    { name: 'Style Memory', href: '/app/style', icon: BrainCircuit },
    { name: 'Settings', href: '/app/settings', icon: Settings },
  ];

  if (!isAppRoute) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FFF8F0] selection:bg-[#D97757]/10">
        <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-md border-b border-[#EADDCF] py-4' : 'bg-transparent py-6'}`}>
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
            <Logo />

            <nav className="hidden md:flex items-center gap-10">
              <Link href="/how-it-works" className="text-[11px] font-black uppercase tracking-[0.15em] text-[#8A7263] hover:text-[#5C4033] transition-colors">How it works</Link>
              <Link href="/pricing" className="text-[11px] font-black uppercase tracking-[0.15em] text-[#8A7263] hover:text-[#5C4033] transition-colors">Pricing</Link>
              <Link href="/about" className="text-[11px] font-black uppercase tracking-[0.15em] text-[#8A7263] hover:text-[#5C4033] transition-colors">About</Link>
            </nav>

            <div className="hidden md:flex items-center gap-8">
              <Link href="/login" className="text-[11px] font-black uppercase tracking-[0.15em] text-[#5C4033] hover:text-[#D97757] transition-colors">Sign in</Link>
              <Link href="/signup" className="text-[11px] font-black uppercase tracking-[0.15em] bg-[#5C4033] text-white px-7 py-3 rounded-sm hover:bg-[#D97757] transition-all shadow-sm hover:shadow-md active:scale-95">
                Get Started
              </Link>
            </div>

            <button className="md:hidden p-2 text-[#5C4033]" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden bg-white border-b border-[#EADDCF] px-6 py-8 flex flex-col gap-6 absolute top-full left-0 w-full shadow-2xl animate-in slide-in-from-top duration-300">
              <Link href="/how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-[#5C4033]">How it works</Link>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-[#5C4033]">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-[#5C4033]">About</Link>
              <div className="h-px bg-[#EADDCF] my-2"></div>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-[#5C4033]">Sign in</Link>
              <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-[#D97757]">Get Started</Link>
            </div>
          )}
        </header>

        <main className="flex-1">
          {children}
        </main>

        <footer className="bg-white border-t border-[#EADDCF] pt-24 pb-12">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-16 mb-24">
              <div className="md:col-span-4">
                <Logo />
                <p className="mt-8 text-base text-[#8A7263] leading-relaxed max-w-sm">
                  Precision-engineered humanization for the next generation of academic and professional writing. Restoring the human element to digital composition.
                </p>
                  <div className="flex gap-4 mt-8">
                    {[LinkIcon, AtSign, Send].map((Icon, i) => (
                      <a key={i} href="#" className="w-10 h-10 rounded-full border border-[#EADDCF] flex items-center justify-center text-[#8A7263] hover:text-[#D97757] hover:border-[#D97757] transition-all">
                        <Icon className="w-4 h-4" />
                      </a>
                    ))}
                  </div>
              </div>
              <div className="md:col-span-2 md:col-start-6">
                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5C4033]/40 mb-8">Platform</h4>
                <ul className="space-y-4 text-[13px] font-bold text-[#8A7263]">
                  <li><Link href="/app" className="hover:text-[#5C4033] transition-colors uppercase tracking-widest">The Editor</Link></li>
                  <li><Link href="/how-it-works" className="hover:text-[#5C4033] transition-colors uppercase tracking-widest">Our Engine</Link></li>
                  <li><Link href="/pricing" className="hover:text-[#5C4033] transition-colors uppercase tracking-widest">Pricing</Link></li>
                </ul>
              </div>
              <div className="md:col-span-2">
                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5C4033]/40 mb-8">Resources</h4>
                <ul className="space-y-4 text-[13px] font-bold text-[#8A7263]">
                  <li><Link href="/about" className="hover:text-[#5C4033] transition-colors uppercase tracking-widest">About Us</Link></li>
                  <li><Link href="/blog" className="hover:text-[#5C4033] transition-colors uppercase tracking-widest">Journal</Link></li>
                  <li><Link href="/contact" className="hover:text-[#5C4033] transition-colors uppercase tracking-widest">Contact</Link></li>
                </ul>
              </div>
              <div className="md:col-span-3">
                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5C4033]/40 mb-8">Subscribe</h4>
                <p className="text-[13px] text-[#8A7263] mb-6">Receive insights on the future of AI and writing.</p>
                <div className="flex rounded-sm overflow-hidden border border-[#EADDCF]">
                  <input type="email" placeholder="Email address" className="bg-[#FFF8F0] px-4 py-3 text-[11px] font-bold uppercase tracking-widest focus:outline-none w-full placeholder:text-[#8A7263]/50" />
                  <button className="bg-[#5C4033] text-white px-5 py-3 text-[11px] font-black uppercase tracking-widest hover:bg-[#D97757] transition-colors border-l border-[#EADDCF]">Join</button>
                </div>
              </div>
            </div>
            <div className="pt-12 border-t border-[#EADDCF] flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A7263]">
                © {new Date().getFullYear()} Humara. All rights reserved.
              </div>
              <div className="flex gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-[#8A7263]">
                <Link href="/privacy" className="hover:text-[#5C4033] transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-[#5C4033] transition-colors">Terms of Service</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#FFF8F0] overflow-hidden selection:bg-[#D97757]/10">
      <aside className="w-72 bg-white border-r border-[#EADDCF] flex flex-col pt-10 pb-8 shrink-0 relative z-20">
        <div className="px-8 mb-12 flex justify-between items-center">
          <Logo />
        </div>
        <nav className="flex-1 px-5 space-y-1.5">
          {appLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-4 px-4 py-4 rounded-sm text-[11px] font-black uppercase tracking-[0.15em] transition-all group ${
                  isActive
                    ? 'bg-[#5C4033] text-white shadow-xl shadow-[#5C4033]/20 translate-x-1'
                    : 'text-[#8A7263] hover:bg-[#FFF8F0] hover:text-[#5C4033] hover:translate-x-1'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#8A7263] group-hover:text-[#5C4033]'}`} />
                {link.name}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 pt-8 mt-8 border-t border-[#EADDCF]">
          <Link href="/" className="flex items-center justify-between px-4 py-4 rounded-sm text-[10px] font-black uppercase tracking-[0.2em] text-[#D97757] bg-[#F5EBE1] hover:bg-[#EADDCF] transition-all mb-3 group">
            Exit Dashboard <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <button className="flex items-center gap-4 px-4 py-4 rounded-sm text-[11px] font-black uppercase tracking-[0.15em] text-[#8A7263] hover:bg-red-50 hover:text-red-600 w-full transition-all group">
            <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#FFF8F0] relative">
        <div className="max-w-6xl mx-auto p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
