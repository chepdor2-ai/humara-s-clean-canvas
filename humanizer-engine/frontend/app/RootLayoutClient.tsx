'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Edit3, FileText, BrainCircuit, Settings, LogOut, Menu, X, ArrowRight, Link as LinkIcon, AtSign, Send, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';

const Logo = () => (
  <div className="flex items-center space-x-2">
      <svg className="h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2c-3.3 0-6 2.7-6 6v4c0 1.1-.9 2-2 2v2h16v-2c-1.1 0-2-.9-2-2V8c0-3.3-2.7-6-6-6zM8 18h8m-5 4h2" />
      </svg>
      <Link href="/" className="text-2xl font-bold text-gray-900">Humara<span className="text-brand-600">.</span></Link>
  </div>
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
    { name: 'AI Detector', href: '/app/detector', icon: ShieldCheck },
    { name: 'Style Memory', href: '/app/style', icon: BrainCircuit },
    { name: 'Settings', href: '/app/settings', icon: Settings },
  ];

  if (!isAppRoute) {
    return (
      <div className="min-h-screen flex flex-col bg-brand-950 selection:bg-brand-500/10">
        <header className={`fixed w-full z-50 glass-nav transition-all duration-300`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-20">
              <Logo />

              <nav className="hidden md:flex space-x-8">
                <Link href="/how-it-works" className="text-gray-600 hover:text-brand-600 font-medium transition-colors">How it Works</Link>
                <Link href="/pricing" className="text-gray-600 hover:text-brand-600 font-medium transition-colors">Pricing</Link>
                <Link href="/about" className="text-gray-600 hover:text-brand-600 font-medium transition-colors">About Us</Link>
                <Link href="/detector" className="text-gray-600 hover:text-brand-600 font-medium transition-colors">AI Detector</Link>
              </nav>

              <div className="hidden md:flex items-center space-x-4">
                <Link href="/login" className="text-gray-600 hover:text-brand-600 font-medium transition-colors">Log In</Link>
                <Link href="/signup" className="bg-brand-500 text-white px-6 py-2.5 rounded-none font-medium sketch-btn">Get Started →</Link>
              </div>

              <button className="md:hidden p-2 text-gray-900" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden bg-white border-b border-gray-100 px-6 py-8 flex flex-col gap-6 absolute top-full left-0 w-full shadow-2xl animate-in slide-in-from-top duration-300">
              <Link href="/how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-lg font-medium text-gray-900">How it Works</Link>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-lg font-medium text-gray-900">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="text-lg font-medium text-gray-900">About Us</Link>
              <Link href="/detector" onClick={() => setMobileMenuOpen(false)} className="text-lg font-medium text-gray-900">AI Detector</Link>
              <div className="h-px bg-gray-100 my-2"></div>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-lg font-medium text-gray-900">Log In</Link>
              <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="text-lg font-semibold text-brand-600">Get Started</Link>
            </div>
          )}
        </header>

        <main className="flex-1 mt-20">
          {children}
        </main>

        <footer className="bg-white border-t border-gray-200 pt-16 pb-8">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">
              <div className="md:col-span-4">
                <Logo />
                <p className="mt-6 text-sm text-gray-600 leading-relaxed max-w-sm">
                  Turn your AI-generated text into clear, natural, and human-like writing quickly and easily.
                </p>
                  <div className="flex gap-3 mt-6">
                    {[LinkIcon, AtSign, Send].map((Icon, i) => (
                      <a key={i} href="#" className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:text-brand-600 hover:border-brand-600 transition-all">
                        <Icon className="w-4 h-4" />
                      </a>
                    ))}
                  </div>
              </div>
              <div className="md:col-span-2 md:col-start-6">
                <h4 className="text-xs font-semibold text-gray-900 mb-4">Platform</h4>
                <ul className="space-y-3 text-sm text-gray-600">
                  <li><Link href="/app" className="hover:text-gray-900 transition-colors">The Editor</Link></li>
                  <li><Link href="/how-it-works" className="hover:text-gray-900 transition-colors">Our Engine</Link></li>
                  <li><Link href="/pricing" className="hover:text-gray-900 transition-colors">Pricing</Link></li>
                </ul>
              </div>
              <div className="md:col-span-2">
                <h4 className="text-xs font-semibold text-gray-900 mb-4">Resources</h4>
                <ul className="space-y-3 text-sm text-gray-600">
                  <li><Link href="/about" className="hover:text-gray-900 transition-colors">About Us</Link></li>
                  <li><Link href="/blog" className="hover:text-gray-900 transition-colors">Journal</Link></li>
                  <li><Link href="/contact" className="hover:text-gray-900 transition-colors">Contact</Link></li>
                </ul>
              </div>
              <div className="md:col-span-3">
                <h4 className="text-xs font-semibold text-gray-900 mb-4">Subscribe</h4>
                <p className="text-sm text-gray-600 mb-4">Receive insights on the future of AI and writing.</p>
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  <input type="email" placeholder="Email address" className="bg-white px-4 py-2.5 text-sm focus:outline-none w-full placeholder:text-gray-400" />
                  <button className="bg-brand-500 text-white px-5 py-2.5 text-sm font-medium hover:bg-brand-600 transition-colors">Join</button>
                </div>
              </div>
            </div>
            <div className="pt-8 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-sm text-gray-600">
                © {new Date().getFullYear()} Humara. All rights reserved.
              </div>
              <div className="flex gap-6 text-sm text-gray-600">
                <Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-gray-900 transition-colors">Terms of Service</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col py-6 shrink-0">
        <div className="px-6 mb-8">
          <Logo />
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {appLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                {link.name}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 pt-6 mt-6 border-t border-gray-200 space-y-2">
          <Link href="/" className="flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 transition-all group">
            Exit Dashboard <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 w-full transition-all group">
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

