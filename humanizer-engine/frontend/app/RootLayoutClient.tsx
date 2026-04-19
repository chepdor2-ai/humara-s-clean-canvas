'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Edit3, FileText, BrainCircuit, Settings, LogOut, Menu, X, ArrowRight, ShieldCheck, FlaskConical, BookOpen, Shield, Sun, Moon, PenTool, Code2, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';

const ADMIN_EMAILS = ['maguna956@gmail.com', 'maxwellotieno11@gmail.com'];

const Logo = () => (
  <Link href="/" className="flex items-center space-x-3 group">
    <div className="relative logo-shine">
      <Image src="/logo.png" alt="HumaraGPT" width={56} height={56} priority className="w-14 h-14 relative z-10 drop-shadow-[0_0_14px_rgba(6,182,212,0.7)]" />
      {/* Layered cyan glow rings */}
      <div className="absolute -inset-1 rounded-full bg-cyan-500/25 animate-[logoPulse_2.5s_ease-in-out_infinite] blur-md" />
      <div className="absolute -inset-2.5 rounded-full bg-cyan-400/15 animate-[logoPulse_2.5s_ease-in-out_infinite_0.6s] blur-lg" />
      <div className="absolute -inset-4 rounded-full bg-cyan-600/8 animate-[logoPulse_2.5s_ease-in-out_infinite_1.2s] blur-xl" />
    </div>
    <span className="brand-wordmark text-xl font-bold tracking-tight"><span className="brand-humara">Humara</span><span className="brand-gpt uniform-brand-glow">GPT</span></span>
  </Link>
);

const APP_ROUTES = ['/app', '/workspace'];

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
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

  useEffect(() => {
    setMobileMenuOpen(false);
    setAppMenuOpen(false);
  }, [pathname]);

  const isRouteActive = (href: string, matchPaths: string[] = [], exact = false) => {
    const candidates = [href, ...matchPaths];
    return candidates.some((route) => {
      if (route === '/') return pathname === '/';
      if (exact) return pathname === route;
      return pathname === route || pathname.startsWith(route + '/');
    });
  };

  const publicLinks = [
    { name: 'How it Works', href: '/how-it-works' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'About', href: '/about' },
    { name: 'Blog', href: '/blog' },
    { name: 'AI Detector', href: '/detector', badge: 'Soon' },
    { name: 'API', href: '/api-pricing' },
    { name: 'Contact', href: '/contact' },
  ];

  const appExploreLinks = [
    { name: 'Pricing', href: '/pricing' },
    { name: 'Blog', href: '/blog', matchPaths: ['/blog'] },
    { name: 'Contact', href: '/contact' },
  ];

  const primaryAction = user
    ? { href: '/app', label: 'Open App', exact: true }
    : { href: '/signup', label: 'Get Started', exact: true };

  const secondaryAction = user
    ? { href: '/app/dashboard', label: 'Dashboard' }
    : { href: '/login', label: 'Log In', exact: true };

  const appLinks = [
    { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, matchPaths: ['/app/payment/verify'] },
    { name: 'Humanizer', href: '/app', icon: Edit3, exact: true },
    { name: 'Documents', href: '/app/documents', icon: FileText },
    { name: 'AI Detector', href: '/app/detector', icon: ShieldCheck, badge: 'Soon' },
    { name: 'Style Profiles', href: '/app/style', icon: BrainCircuit },
    { name: 'Grammar', href: '/app/grammar', icon: PenTool },
    { name: 'Advanced', href: '/app/advanced', icon: FlaskConical },
    { name: 'API', href: '/app/api-dashboard', icon: Code2 },
    { name: 'Docs', href: '/app/docs', icon: BookOpen },
    { name: 'Settings', href: '/app/settings', icon: Settings },
    ...(isAdmin ? [{ name: 'Admin', href: '/app/admin', icon: Shield }] : []),
  ];

  /* ── App routes are fully handled by AppShell (sidebar + topbar) ── */
  if (isAppRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#05050A]">
        <header className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 dark:bg-[#05050A]/70 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/5 shadow-lg shadow-slate-200/50 dark:shadow-black/20' : 'bg-transparent'}`}>
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex justify-between items-center h-[72px]">
              <Logo />

              <nav className="hidden md:flex items-center gap-2">
                {publicLinks.map((link) => {
                  const isActive = isRouteActive(link.href);
                  return (
                    <Link
                      key={link.name}
                      href={link.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-white/90 text-slate-900 shadow-sm shadow-slate-200/80 dark:bg-white/10 dark:text-white dark:shadow-black/20'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-cyan-500 hover:bg-white/70 dark:hover:bg-white/5'
                      }`}
                    >
                      {link.name}
                      {link.badge && (
                        <span className="text-[9px] font-bold text-amber-500 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/40 px-1.5 py-0.5 rounded-full">
                          {link.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="hidden md:flex items-center gap-4">
                <button
                  onClick={toggle}
                  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                  title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 bg-white/90 dark:bg-zinc-900/80 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span className="text-xs font-semibold">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
                <Link
                  href={secondaryAction.href}
                  aria-current={isRouteActive(secondaryAction.href, [], secondaryAction.exact) ? 'page' : undefined}
                  className={`text-sm font-medium transition-colors ${
                    isRouteActive(secondaryAction.href, [], secondaryAction.exact)
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-cyan-500'
                  }`}
                >
                  {secondaryAction.label}
                </Link>
                <Link href={primaryAction.href} className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-2xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-cyan-600/25">
                  {primaryAction.label}
                </Link>
                {user && (
                  <button onClick={signOut} className="text-sm text-slate-600 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 font-medium transition-colors">
                    Sign Out
                  </button>
                )}
              </div>

              <div className="md:hidden flex items-center gap-2">
                <button
                  onClick={toggle}
                  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                  className="p-2 rounded-lg border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 bg-white/90 dark:bg-zinc-900/80"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button className="p-2 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden bg-white/95 dark:bg-[#0F0F17] border-b border-slate-200 dark:border-white/10 px-6 py-6 flex flex-col gap-4 absolute top-full left-0 w-full shadow-lg backdrop-blur-xl">
              {publicLinks.map((link) => {
                const isActive = isRouteActive(link.href);
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-slate-900 dark:bg-zinc-800/80 dark:text-white'
                        : 'text-slate-700 dark:text-zinc-200'
                    }`}
                  >
                    {link.name}
                    {link.badge && (
                      <span className="text-[9px] font-bold text-amber-500 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/40 px-1.5 py-0.5 rounded-full">
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="h-px bg-slate-200 dark:bg-white/10 my-1"></div>
              <Link href={secondaryAction.href} onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-slate-700 dark:text-zinc-200 py-1">{secondaryAction.label}</Link>
              <Link href={primaryAction.href} onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-cyan-400 py-1">{primaryAction.label}</Link>
              {user && (
                <button onClick={signOut} className="text-left text-sm font-medium text-red-500 dark:text-red-400 py-1">
                  Sign Out
                </button>
              )}
            </div>
          )}
        </header>

        <main className="flex-1 pt-[72px]">
          {children}
        </main>

        <footer className="bg-slate-100 dark:bg-black border-t border-slate-200 dark:border-white/10 py-16">
          <div className="max-w-7xl mx-auto px-6 text-sm">
            <div className="flex flex-col md:flex-row justify-between gap-12">
              <div>
                <Logo />
                <p className="mt-6 text-slate-600 dark:text-gray-400 max-w-xs leading-relaxed">
                  Transform AI-generated text into clear, natural, human-like writing.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-12 sm:gap-16">
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Product</h4>
                  <ul className="space-y-3 text-slate-600 dark:text-gray-400">
                    <li><Link href="/app" className="hover:text-slate-900 dark:hover:text-white transition-colors">Humanizer</Link></li>
                    <li><Link href="/how-it-works" className="hover:text-slate-900 dark:hover:text-white transition-colors">How it Works</Link></li>
                    <li><Link href="/pricing" className="hover:text-slate-900 dark:hover:text-white transition-colors">Pricing</Link></li>
                    <li><Link href="/detector" className="hover:text-slate-900 dark:hover:text-white transition-colors inline-flex items-center gap-1.5">AI Detector <span className="text-[9px] font-bold text-amber-500 dark:text-amber-400">Soon</span></Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Company</h4>
                  <ul className="space-y-3 text-slate-600 dark:text-gray-400">
                    <li><Link href="/about" className="hover:text-slate-900 dark:hover:text-white transition-colors">About</Link></li>
                    <li><Link href="/blog" className="hover:text-slate-900 dark:hover:text-white transition-colors">Blog</Link></li>
                    <li><Link href="/contact" className="hover:text-slate-900 dark:hover:text-white transition-colors">Contact</Link></li>
                    <li><a href="https://wa.me/254743468864" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 dark:hover:text-white transition-colors inline-flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Legal</h4>
                  <ul className="space-y-3 text-slate-600 dark:text-gray-400">
                    <li><Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white transition-colors">Privacy</Link></li>
                    <li><Link href="/terms" className="hover:text-slate-900 dark:hover:text-white transition-colors">Terms</Link></li>
                    <li><Link href="/acceptable-use" className="hover:text-slate-900 dark:hover:text-white transition-colors">Acceptable Use</Link></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-16 pt-8 border-t border-slate-200 dark:border-white/10 text-center text-xs text-slate-500 dark:text-gray-500">
              © {new Date().getFullYear()} HumaraGPT. All rights reserved. For commercial use only. Academic use strictly prohibited.
            </div>
          </div>
        </footer>

        {/* Floating WhatsApp Button */}
        <a
          href="https://wa.me/254743468864?text=Hi%20HumaraGPT%20team!"
          target="_blank"
          rel="noopener noreferrer"
          title="Chat on WhatsApp"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:scale-110 active:scale-95 transition-all"
        >
          <MessageCircle className="w-7 h-7" />
        </a>
      </div>
    );
}

