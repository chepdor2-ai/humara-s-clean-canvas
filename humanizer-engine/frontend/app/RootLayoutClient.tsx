'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Edit3, FileText, BrainCircuit, Settings, LogOut, Menu, X, ArrowRight, ShieldCheck, Sun, Moon, FlaskConical, BookOpen } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { useAuth } from './AuthProvider';

const Logo = () => (
  <Link href="/" className="flex items-center space-x-2.5">
      <Image src="/logo.png" alt="HumaraGPT" width={32} height={32} className="w-8 h-8" />
      <span className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">HumaraGPT</span>
  </Link>
);

const APP_ROUTES = ['/app'];

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const isAppRoute = APP_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const appLinks = [
    { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
    { name: 'Humanizer', href: '/app', icon: Edit3 },
    { name: 'Documents', href: '/app/documents', icon: FileText },
    { name: 'AI Detector', href: '/app/detector', icon: ShieldCheck },
    { name: 'Style Profiles', href: '/app/style', icon: BrainCircuit },
    { name: 'Advanced', href: '/app/advanced', icon: FlaskConical },
    { name: 'Docs', href: '/app/docs', icon: BookOpen },
    { name: 'Settings', href: '/app/settings', icon: Settings },
  ];

  if (!isAppRoute) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'glass-nav shadow-sm' : 'bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm border-b border-slate-100 dark:border-zinc-800'}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Logo />

              <nav className="hidden md:flex items-center space-x-8">
                <Link href="/how-it-works" className="text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">How it Works</Link>
                <Link href="/pricing" className="text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">Pricing</Link>
                <Link href="/about" className="text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">About</Link>
                <Link href="/detector" className="text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">AI Detector</Link>
              </nav>

              <div className="hidden md:flex items-center space-x-3">
                <button onClick={toggleTheme} className="p-2 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors" title="Toggle theme">
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <Link href="/login" className="text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors px-4 py-2">Log In</Link>
                <Link href="/signup" className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">Get Started</Link>
              </div>

              <button className="md:hidden p-2 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800 px-6 py-6 flex flex-col gap-4 absolute top-full left-0 w-full shadow-lg">
              <Link href="/how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-slate-700 dark:text-zinc-200 py-1">How it Works</Link>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-slate-700 dark:text-zinc-200 py-1">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-slate-700 dark:text-zinc-200 py-1">About</Link>
              <Link href="/detector" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-slate-700 dark:text-zinc-200 py-1">AI Detector</Link>
              <div className="h-px bg-slate-100 dark:bg-zinc-800 my-1"></div>
              <button onClick={() => { toggleTheme(); setMobileMenuOpen(false); }} className="text-sm font-medium text-slate-700 dark:text-zinc-200 py-1 text-left flex items-center gap-2">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-slate-700 dark:text-zinc-200 py-1">Log In</Link>
              <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-brand-600 py-1">Get Started</Link>
            </div>
          )}
        </header>

        <main className="flex-1 pt-16">
          {children}
        </main>

        <footer className="bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 pt-12 pb-8">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
              <div className="md:col-span-4">
                <Logo />
                <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-xs">
                  Transform AI-generated text into clear, natural, human-like writing.
                </p>
              </div>
              <div className="md:col-span-2 md:col-start-7">
                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Product</h4>
                <ul className="space-y-2 text-sm text-slate-500">
                  <li><Link href="/app" className="hover:text-slate-900 transition-colors">Humanizer</Link></li>
                  <li><Link href="/how-it-works" className="hover:text-slate-900 transition-colors">How it Works</Link></li>
                  <li><Link href="/pricing" className="hover:text-slate-900 transition-colors">Pricing</Link></li>
                </ul>
              </div>
              <div className="md:col-span-2">
                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Company</h4>
                <ul className="space-y-2 text-sm text-slate-500">
                  <li><Link href="/about" className="hover:text-slate-900 transition-colors">About</Link></li>
                  <li><Link href="/contact" className="hover:text-slate-900 transition-colors">Contact</Link></li>
                </ul>
              </div>
              <div className="md:col-span-2">
                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Legal</h4>
                <ul className="space-y-2 text-sm text-slate-500">
                  <li><Link href="/privacy" className="hover:text-slate-900 transition-colors">Privacy</Link></li>
                  <li><Link href="/terms" className="hover:text-slate-900 transition-colors">Terms</Link></li>
                </ul>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
              <div className="text-xs text-slate-400">
                © {new Date().getFullYear()} HumaraGPT. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-zinc-950 overflow-hidden">
      {/* Mobile top bar for app routes */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between px-4 h-14">
        <Logo />
        <button onClick={() => setAppMenuOpen(!appMenuOpen)} className="p-2 text-slate-700 dark:text-zinc-300">
          {appMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {appMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setAppMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static z-50 md:z-auto top-0 left-0 h-full w-60 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 flex flex-col py-5 shrink-0 transition-transform duration-200 ${appMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
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
                    ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-brand-600' : ''}`} />
                {link.name}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pt-4 mt-4 border-t border-slate-100 dark:border-zinc-800 space-y-0.5">
          <button onClick={toggleTheme} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white w-full transition-colors">
            {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <Link href="/" className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white transition-colors group">
            Back to Home <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </Link>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 w-full transition-colors">
            <LogOut className="w-[18px] h-[18px]" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-zinc-950 pt-14 md:pt-0">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

