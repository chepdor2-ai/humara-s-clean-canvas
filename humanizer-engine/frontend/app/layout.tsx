import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Humanizer  Premium Ghost Engine',
  description: 'Transform AI-generated content into authentic text that bypasses all major AI detectors.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-gray-900 min-h-screen font-[Inter]">
        {/* Premium Navbar */}
        <nav className="glass fixed w-full top-0 z-50 shadow-sm border-b border-gray-200/50">
            <div className="w-[90%] max-w-[1600px] mx-auto">
                <div className="flex justify-between items-center h-14">
                    <div className="flex items-center space-x-2 animate-fade-in-up">    
                        <div className="w-8 h-8 bg-gradient-orange rounded flex items-center justify-center shadow-md animate-float">
                            <i className="fas fa-ghost text-white text-sm"></i>
                        </div>
                        <div>
                            <a href="/" className="text-sm font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tight">        
                                GhostEngine
                            </a>
                            <p className="text-[9px] text-gray-500 font-semibold uppercase tracking-widest leading-none mt-0.5">AI Humanization</p>
                        </div>
                    </div>
                    <div className="hidden md:flex items-center space-x-6">
                        <a href="/" className="text-gray-600 hover:text-orange-600 font-bold text-[10px] uppercase tracking-wider transition-colors"><i className="fas fa-home mr-1.5 opacity-70"></i>Home</a>
                        <a href="/detector" className="text-gray-600 hover:text-orange-600 font-bold text-[10px] uppercase tracking-wider transition-colors"><i className="fas fa-shield-alt mr-1.5 opacity-70"></i>AI Detector</a>
                        <a href="/pricing" className="text-gray-600 hover:text-orange-600 font-bold text-[10px] uppercase tracking-wider transition-colors"><i className="fas fa-dollar-sign mr-1.5 opacity-70"></i>Pricing</a>
                        <button className="bg-gradient-orange text-white px-4 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm hover:shadow-md transition-all hover:scale-105 btn-premium">
                            <i className="fas fa-user pr-1"></i> Sign In
                        </button>
                    </div>
                    <button className="md:hidden text-gray-700 hover:text-orange-600 text-sm">
                        <i className="fas fa-bars"></i>
                    </button>
                </div>
            </div>
        </nav>

        {children}

        {/* Footer */}
        <footer className="glass mt-12 border-t border-gray-200">
            <div className="max-w-6xl mx-auto px-4 py-6">
                <div className="text-center text-xs text-gray-500">
                    <p>&copy; 2026 GhostEngine. All rights reserved. <strong>Premium AI Humanization Technology</strong></p>
                    <p className="mt-1.5">Trusted by 500,000+ users worldwide  99.9% Success Rate  24/7 Support</p>
                </div>
            </div>
        </footer>
      </body>
    </html>
  );
}
