'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';

export default function DetectorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 px-6 py-12">
      <div className="w-20 h-20 rounded-3xl bg-purple-50 flex items-center justify-center">
        <Shield className="w-10 h-10 text-purple-500" />
      </div>
      <div className="text-center space-y-3 max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI Detector</h1>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-sm font-semibold text-amber-600">Coming Soon</span>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed mt-3">
          We&apos;re building a more accurate AI detection system. The detector will return with improved reliability across all major AI detection platforms.
        </p>
      </div>
      <Link
        href="/app"
        className="mt-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg"
      >
        Back to Humanizer
      </Link>
    </div>
  );
}
