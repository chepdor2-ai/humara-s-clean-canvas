'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Lock, User, Eye, EyeOff, Shield, CheckCircle2 } from 'lucide-react';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) {
      alert('Please agree to the terms and privacy policy');
      return;
    }
    setIsLoading(true);
    try {
      // API call here
      console.log('Signing up:', { fullName, email, password });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-brand-950 text-gray-900 font-sans antialiased flex flex-col min-h-screen">
      <main className="flex-grow pt-20">
        <section className="min-h-[80vh] flex items-center justify-center p-6 bg-brand-50">
          <div className="max-w-md w-full bg-white border-2 border-brand-600 shadow-[6px_6px_0px_#fb8c00] p-8 transition-all hover:shadow-[9px_9px_0px_#fb8c00] hover:-translate-x-1 hover:-translate-y-1">
            <div className="flex justify-center mb-6">
              <div className="p-3 bg-brand-100 rounded-lg">
                <CheckCircle2 className="h-8 w-8 text-brand-600" strokeWidth={2} />
              </div>
            </div>
            <h2 className="text-3xl font-black text-center mb-8 text-gray-900">Get Started</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 h-5 w-5 text-brand-600 pointer-events-none" strokeWidth={2} />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 focus:border-brand-500 focus:outline-none transition-colors font-medium"
                    placeholder="J. Doe"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-5 w-5 text-brand-600 pointer-events-none" strokeWidth={2} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 focus:border-brand-500 focus:outline-none transition-colors font-medium"
                    placeholder="user@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-5 w-5 text-brand-600 pointer-events-none" strokeWidth={2} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 border-2 border-gray-200 focus:border-brand-500 focus:outline-none transition-colors font-medium"
                    placeholder=""
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-brand-600 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" strokeWidth={2} />
                    ) : (
                      <Eye className="h-5 w-5" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !agreedToTerms}
                className="w-full bg-brand-500 text-white font-bold py-4 border-2 border-brand-600 shadow-[4px_4px_0px_#1f2937] hover:shadow-[6px_6px_0px_#1f2937] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {isLoading ? 'Creating Account...' : 'Create Free Account'}
              </button>

              <div className="flex items-start space-x-2 mt-4">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer accent-brand-600"
                />
                <label htmlFor="terms" className="text-xs text-gray-500 cursor-pointer">
                  By signing up, you agree to our{' '}
                  <Link href="/terms" className="underline text-gray-600 hover:text-brand-600">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="underline text-gray-600 hover:text-brand-600">
                    Privacy Policy
                  </Link>
                </label>
              </div>
            </form>

            <p className="text-center text-sm font-medium text-gray-500 mt-6">
              Already registered?{' '}
              <Link href="/login" className="text-brand-600 font-bold hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

