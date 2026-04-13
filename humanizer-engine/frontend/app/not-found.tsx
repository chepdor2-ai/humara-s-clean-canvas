'use client'

import Link from 'next/link'
import { AlertCircle, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-center p-6 bg-brand-50 text-center">
      <div className="flex justify-center mb-6">
        <AlertCircle className="w-24 h-24 text-brand-500" strokeWidth={1.5} />
      </div>

      <h1 className="text-9xl font-bold text-brand-500 mb-4">404</h1>
      <h2 className="text-3xl font-semibold text-gray-900 mb-6">Oops! Page gone rogue.</h2>
      <p className="text-lg text-gray-600 mb-10 max-w-lg mx-auto">The page you're looking for doesn't exist. Let's get you back to safety.</p>

      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 px-8 rounded-lg transition-colors"
      >
        <Home className="w-5 h-5" />
        Return Home
      </Link>
    </main>
  )
}

