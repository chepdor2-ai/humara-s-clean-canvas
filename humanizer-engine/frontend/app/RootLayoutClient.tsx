'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Edit3, FileText, BrainCircuit, Settings, LogOut, Menu, X, ArrowRight, ShieldCheck, FlaskConical, BookOpen, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

const ADMIN_EMAILS = ['maguna956@gmail.com', 'maxwellotieno11@gmail.com'];

const Logo = () => (
  <Link href="/" className="flex items-center space-x-3 group">
    <div className="relative">
      <Image src="/logo.png" alt="HumaraGPT" width={56} height={56} className="w-14 h-14 relative z-10 drop-shadow-[0_0_14px_rgba(147,51,234,0.7)]" />
      {/* Layered purple glow rings */}
      <div className="absolute -inset-1 rounded-full bg-purple-500/25 animate-[logoPulse_2.5s_ease-in-out_infinite] blur-md" />
      <div className="absolute -inset-2.5 rounded-full bg-purple-400/15 animate-[logoPulse_2.5s_ease-in-out_infinite_0.6s] blur-lg" />
      <div className="absolute -inset-4 rounded-full bg-purple-600/8 animate-[logoPulse_2.5s_ease-in-out_infinite_1.2s] blur-xl" />
    </div>
    <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]">HumaraGPT</span>
  </Link>
);

const APP_ROUTES = ['/app'];

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const isAppRoute = APP_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const appLinks = [
    { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
    { name: 'Humanizer', href: '/app', icon: Edit3 },
    { name: 'Documents', href: '/app/documents', icon: FileText },
    { name: 'AI Detector', href: '/app/detector', icon: ShieldCheck, badge: 'Soon' },
    { name: 'Style Profiles', href: '/app/style', icon: BrainCircuit },
    { name: 'Advanced', href: '/app/advanced', icon: FlaskConical },
    { name: 'Docs', href: '/app/docs', icon: BookOpen },
    { name: 'Settings', href: '/app/settings', icon: Settings },
    ...(isAdmin ? [{ name: 'Admin', href: '/app/admin', icon: Shield }] : []),
  ];

  if (!isAppRoute) {
    return (
      <div className="min-h-screen flex flex-col bg-[#05050A]">
        <header className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#05050A]/70 backdrop-blur-xl border-b border-white/5 shadow-lg shadow-black/20' : 'bg-transparent'}`}>
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex justify-between items-center h-[72px]">
              <Logo />

              <nav className="hidden md:flex items-center gap-9">
                <Link href="/how-it-works" className="text-sm text-zinc-400 hover:text-purple-400 font-medium transition-colors">How it Works</Link>
                <Link href="/pricing" className="text-sm text-zinc-400 hover:text-purple-400 font-medium transition-colors">Pricing</Link>
                <Link href="/about" className="text-sm text-zinc-400 hover:text-purple-400 font-medium transition-colors">About</Link>
                <Link href="/detector" className="text-sm text-zinc-400 hover:text-purple-400 font-medium transition-colors inline-flex items-center gap-1.5">AI Detector <span className="text-[9px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded-full">Soon</span></Link>
              </nav>

              <div className="hidden md:flex items-center gap-4">
                <Link href="/login" className="text-sm text-zinc-400 hover:text-purple-400 font-medium transition-colors">Log In</Link>
                <Link href="/signup" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-2xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-purple-600/25">Get Started</Link>
              </div>

              <button className="md:hidden p-2 text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden bg-[#0F0F17] border-b border-white/10 px-6 py-6 flex flex-col gap-4 absolute top-full left-0 w-full shadow-lg backdrop-blur-xl">
              <Link href="/how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-zinc-200 py-1">How it Works</Link>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-zinc-200 py-1">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-zinc-200 py-1">About</Link>
              <Link href="/detector" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-zinc-200 py-1 inline-flex items-center gap-1.5">AI Detector <span className="text-[9px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded-full">Soon</span></Link>
              <div className="h-px bg-white/10 my-1"></div>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-zinc-200 py-1">Log In</Link>
              <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-purple-400 py-1">Get Started</Link>
            </div>
          )}
        </header>

        <main className="flex-1 pt-[72px]">
          {children}
        </main>

        <footer className="bg-black border-t border-white/10 py-16">
          <div className="max-w-7xl mx-auto px-6 text-sm">
            <div className="flex flex-col md:flex-row justify-between gap-12">
              <div>
                <Logo />
                <p className="mt-6 text-gray-400 max-w-xs leading-relaxed">
                  Transform AI-generated text into clear, natural, human-like writing.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-12 sm:gap-16">
                <div>
                  <h4 className="font-semibold text-white mb-4">Product</h4>
                  <ul className="space-y-3 text-gray-400">
                    <li><Link href="/app" className="hover:text-white transition-colors">Humanizer</Link></li>
                    <li><Link href="/how-it-works" className="hover:text-white transition-colors">How it Works</Link></li>
                    <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                    <li><Link href="/detector" className="hover:text-white transition-colors inline-flex items-center gap-1.5">AI Detector <span className="text-[9px] font-bold text-amber-400">Soon</span></Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-4">Company</h4>
                  <ul className="space-y-3 text-gray-400">
                    <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
                    <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-4">Legal</h4>
                  <ul className="space-y-3 text-gray-400">
                    <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
                    <li><Link href="/terms" className="hover:text-white transition-colors">Terms</Link></li>
                    <li><Link href="/acceptable-use" className="hover:text-white transition-colors">Acceptable Use</Link></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-16 pt-8 border-t border-white/10 text-center text-xs text-gray-500">
              © {new Date().getFullYear()} HumaraGPT. All rights reserved. For commercial use only. Academic use strictly prohibited.
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Mobile top bar for app routes */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-zinc-900/90 backdrop-blur-xl border-b border-zinc-800/60 flex items-center justify-between px-4 h-14">
        <Logo />
        <button onClick={() => setAppMenuOpen(!appMenuOpen)} className="p-2 text-zinc-300">
          {appMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {appMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setAppMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static z-50 md:z-auto top-0 left-0 h-full w-60 premium-sidebar flex flex-col py-5 shrink-0 transition-transform duration-200 ${appMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="px-5 mb-6 hidden md:block">
          <Logo />
        </div>
        <div className="px-5 mb-6 md:hidden h-14 flex items-center">
          <Logo />
        </div>
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {appLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setAppMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-950 text-purple-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-purple-400' : ''}`} />
                {link.name}
                {'badge' in link && link.badge && (
                  <span className="ml-auto text-[9px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded-full">{link.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pt-4 mt-4 border-t border-zinc-800 space-y-0.5">
          <Link href="/" className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors group">
            Back to Home <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </Link>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:bg-red-950 hover:text-red-400 w-full transition-colors">
            <LogOut className="w-[18px] h-[18px]" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-zinc-950 premium-bg pt-14 md:pt-0">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}

