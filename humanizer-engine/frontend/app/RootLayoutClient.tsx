'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Edit3, FileText, BrainCircuit, Settings, LogOut, Menu, X, ArrowRight, Link as LinkIcon, AtSign, Send } from 'lucide-react';
import { useState, useEffect } from 'react';

const Logo = () => (
  <Link href="/" className="flex items-center text-2xl font-bold font-sora tracking-tight leading-none group">
    <span className="text-gradient">Humara</span>
    <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-teal-400 ml-1 group-hover:scale-150 transition-transform glow"></div>
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
      <div className="min-h-screen flex flex-col relative z-10">
        <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'glass-strong border-b border-white/10 py-4' : 'bg-transparent py-6'}`}>
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
            <Logo />

            <nav className="hidden md:flex items-center gap-10">
              <Link href="/how-it-works" className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-colors">How it Works</Link>
              <Link href="/pricing" className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-colors">Pricing</Link>
              <Link href="/about" className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-colors">About</Link>
              <Link href="/detector" className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-colors">AI Detector</Link>
            </nav>

            <div className="hidden md:flex items-center gap-6">
              <Link href="/login" className="text-xs font-bold uppercase tracking-wider text-gray-300 hover:text-white transition-colors">Sign In</Link>
              <Link href="/signup" className="relative px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:from-indigo-500 hover:to-indigo-400 transition-all shadow-lg shadow-indigo-500/50 hover:shadow-indigo-500/70 hover:scale-105 active:scale-95 overflow-hidden group">
                <span className="relative z-10">Get Started Free</span>
                <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </Link>
            </div>

            <button className="md:hidden p-2 text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden glass-strong border-b border-white/10 px-6 py-8 flex flex-col gap-6 absolute top-full left-0 w-full shadow-2xl animate-in slide-in-from-top duration-300">
              <Link href="/how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-white">How it Works</Link>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-white">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-white">About</Link>
              <Link href="/detector" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-white">AI Detector</Link>
              <div className="h-px bg-white/10 my-2"></div>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-gray-300">Sign In</Link>
              <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-gradient">Get Started</Link>
            </div>
          )}
        </header>

        <main className="flex-1">
          {children}
        </main>

        <footer className="glass-strong border-t border-white/10 pt-24 pb-12 relative z-10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-16 mb-24">
              <div className="md:col-span-4">
                <Logo />
                <p className="mt-8 text-base text-gray-400 leading-relaxed max-w-sm">
                  The world's most advanced AI humanization platform. Transform AI-generated content into authentic, undetectable human writing.
                </p>
                  <div className="flex gap-4 mt-8">
                    {[LinkIcon, AtSign, Send].map((Icon, i) => (
                      <a key={i} href="#" className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-gray-400 hover:text-indigo-400 hover:border-indigo-400/50 transition-all hover:scale-110 hover:glow">
                        <Icon className="w-4 h-4" />
                      </a>
                    ))}
                  </div>
              </div>
              <div className="md:col-span-2 md:col-start-6">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-8">Platform</h4>
                <ul className="space-y-4 text-sm font-medium text-gray-400">
                  <li><Link href="/app" className="hover:text-white transition-colors">Editor</Link></li>
                  <li><Link href="/detector" className="hover:text-white transition-colors">AI Detector</Link></li>
                  <li><Link href="/how-it-works" className="hover:text-white transition-colors">How It Works</Link></li>
                  <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                </ul>
              </div>
              <div className="md:col-span-2">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-8">Resources</h4>
                <ul className="space-y-4 text-sm font-medium text-gray-400">
                  <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
                  <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
                  <li><Link href="/how-it-works" className="hover:text-white transition-colors">Documentation</Link></li>
                </ul>
              </div>
              <div className="md:col-span-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-8">Stay Updated</h4>
                <p className="text-sm text-gray-400 mb-6">Get the latest updates on AI humanization technology.</p>
                <div className="flex rounded-lg overflow-hidden border border-white/10 glass">
                  <input type="email" placeholder="Enter your email" className="bg-transparent px-4 py-3 text-sm font-medium focus:outline-none w-full placeholder:text-gray-500 text-white" />
                  <button className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-5 py-3 text-xs font-bold uppercase tracking-wider hover:from-indigo-500 hover:to-indigo-400 transition-all">Join</button>
                </div>
              </div>
            </div>
            <div className="pt-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-xs font-medium text-gray-500">
                © {new Date().getFullYear()} Humara. All rights reserved.
              </div>
              <div className="flex gap-8 text-xs font-medium text-gray-500">
                <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden relative z-10">
      <aside className="w-72 glass-strong border-r border-white/10 flex flex-col pt-10 pb-8 shrink-0 relative z-20">
        <div className="px-8 mb-12 flex justify-between items-center">
          <Logo />
        </div>
        <nav className="flex-1 px-5 space-y-2">
          {appLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-4 px-4 py-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all group relative overflow-hidden ${
                  isActive
                    ? 'text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-500 opacity-100"></div>
                )}
                <Icon className={`w-4 h-4 relative z-10 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
                <span className="relative z-10">{link.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-5 pt-8 mt-8 border-t border-white/10">
          <Link href="/" className="flex items-center justify-between px-4 py-4 rounded-lg text-xs font-bold uppercase tracking-wider text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 transition-all mb-3 group">
            Exit to Home <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <button className="flex items-center gap-4 px-4 py-4 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-400 hover:bg-red-500/10 hover:text-red-400 w-full transition-all group">
            <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative">
        <div className="max-w-6xl mx-auto p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
