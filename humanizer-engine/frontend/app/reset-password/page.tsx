'use client'

import Link from 'next/link'
import { Mail, ArrowLeft } from 'lucide-react'
import { useState } from 'react'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <main className="min-h-[80vh] flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="flex justify-center mb-6">
          <div className="bg-brand-50 p-3 rounded-xl">
            <Mail className="w-8 h-8 text-brand-600" />
          </div>
        </div>

        <h2 className="text-2xl font-semibold text-center mb-4">Reset Password</h2>
        <p className="text-center text-gray-500 mb-8">Enter your email and we&apos;ll send a magic link.</p>

        {submitted ? (
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-center">
            <p className="text-green-700 font-semibold">Check your email!</p>
            <p className="text-green-600 text-sm mt-1">We&apos;ve sent a reset link to {email}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
                placeholder="user@example.com"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Send Reset Link
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-8">
          <Link href="/login" className="text-brand-600 font-medium hover:underline flex items-center justify-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>
        </p>
      </div>
    </main>
  )
}

