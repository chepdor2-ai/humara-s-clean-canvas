'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        return;
      }
      const redirect = searchParams.get('redirect') || '/app';
      router.push(redirect);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-grow">
        <section className="min-h-[85vh] flex items-center justify-center p-6 bg-slate-50">
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-8">
            <div className="flex justify-center mb-6">
              <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center">
                <Lock className="h-6 w-6 text-brand-600" strokeWidth={2} />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-center mb-8 text-slate-900">Welcome back</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-400 pointer-events-none" strokeWidth={2} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-50 focus:outline-none transition-all text-sm"
                    placeholder="user@example.com"
                    title="Email address"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-sm font-medium text-slate-700">Password</label>
                  <Link href="/reset-password" className="text-xs font-medium text-brand-600 hover:underline">
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-400 pointer-events-none" strokeWidth={2} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2.5 border border-slate-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-50 focus:outline-none transition-all text-sm"
                    placeholder=""
                    title="Password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-brand-600 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4.5 w-4.5" strokeWidth={2} />
                    ) : (
                      <Eye className="h-4.5 w-4.5" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-2"
              >
                {isLoading ? 'Logging in...' : 'Log In'}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-6">
              Need an account?{' '}
              <Link href="/signup" className="text-brand-600 font-medium hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-slate-500">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}

