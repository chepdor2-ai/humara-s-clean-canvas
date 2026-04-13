'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';

export default function DetectorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-6 animate-in fade-in duration-500">
      <div className="w-20 h-20 rounded-3xl bg-purple-100 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 flex items-center justify-center">
        <Shield className="w-10 h-10 text-purple-500 dark:text-purple-400" />
      </div>
      <div className="text-center space-y-2 max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">AI Detector</h1>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-full">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-300">Coming Soon</span>
        </div>
        <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed mt-3">
          We&apos;re building a more accurate AI detection system. The detector will return with improved reliability across all major AI detection platforms.
        </p>
      </div>
      <Link
        href="/app"
        className="mt-2 px-6 py-2.5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg"
      >
        Back to Humanizer
      </Link>
    </div>
  );
}
