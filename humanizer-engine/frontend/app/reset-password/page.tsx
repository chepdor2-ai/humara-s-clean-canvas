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
    <main className="min-h-[80vh] flex items-center justify-center p-6 bg-brand-50">
      <div className="max-w-md w-full bg-white p-8 sketch-card border border-brand-100 pb-12 shadow-xl">
        <div className="flex justify-center mb-6">
          <div className="bg-brand-100 p-3 rounded-lg">
            <Mail className="w-8 h-8 text-brand-600" />
          </div>
        </div>

        <h2 className="text-3xl font-black text-center mb-4">Reset Password</h2>
        <p className="text-center text-gray-600 font-medium mb-8">Enter your email and we'll send a magic link.</p>

        {submitted ? (
          <div className="bg-green-50 border border-green-200 p-4 rounded text-center">
            <p className="text-green-700 font-black">Check your email!</p>
            <p className="text-green-600 text-sm mt-1 font-medium">We've sent a reset link to {email}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-brand-50 border border-brand-200 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all rounded shadow-sm font-medium"
                placeholder="user@example.com"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-brand-500 text-white font-black py-4 sketch-btn hover:bg-brand-600 transition-all rounded mt-4"
            >
              Send Reset Link
            </button>
          </form>
        )}

        <p className="text-center text-sm font-medium text-gray-500 mt-8">
          <Link href="/login" className="text-brand-600 font-bold hover:underline flex items-center justify-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>
        </p>
      </div>
    </main>
  )
}

