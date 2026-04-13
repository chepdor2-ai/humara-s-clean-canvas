'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
  const [googleLoading, setGoogleLoading] = useState(false);

  // Handle OAuth tokens in URL hash (implicit flow fallback)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.push('/app');
        }
      });
    }
  }, [router]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${siteUrl}/auth/callback` },
      });
      if (authError) setError(authError.message);
    } catch {
      setError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

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
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#05050A] premium-dots">
      <main className="flex-grow">
        <section className="min-h-[85vh] flex items-center justify-center p-4 sm:p-6 relative">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/8 rounded-full blur-[120px]" />
            <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[100px]" />
          </div>

          <div className="max-w-md w-full relative z-10">
            <div className="flex justify-center mb-8">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="relative">
                  <Image src="/logo.png" alt="HumaraGPT" width={56} height={56} className="w-14 h-14 relative z-10 drop-shadow-[0_0_14px_rgba(147,51,234,0.7)]" />
                  <div className="absolute -inset-1 rounded-full bg-purple-500/25 animate-[logoPulse_2.5s_ease-in-out_infinite] blur-md" />
                  <div className="absolute -inset-2.5 rounded-full bg-purple-400/15 animate-[logoPulse_2.5s_ease-in-out_infinite_0.6s] blur-lg" />
                  <div className="absolute -inset-4 rounded-full bg-purple-600/8 animate-[logoPulse_2.5s_ease-in-out_infinite_1.2s] blur-xl" />
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]">HumaraGPT</span>
              </Link>
            </div>

            <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl rounded-3xl border border-purple-500/10 shadow-2xl shadow-purple-900/20 p-7 sm:p-9">
              <h2 className="text-2xl font-bold text-center mb-1.5 text-slate-900 dark:text-white tracking-tight">Welcome back</h2>
              <p className="text-center text-slate-500 dark:text-zinc-400 text-sm mb-7">Sign in to continue to HumaraGPT</p>

              {error && (
                <div className="mb-5 p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 bg-slate-100 dark:bg-zinc-800/80 border border-slate-300 dark:border-zinc-700/80 hover:bg-slate-200 dark:hover:bg-zinc-700/80 text-slate-800 dark:text-zinc-200 font-medium py-3 rounded-xl transition-all disabled:opacity-50 text-sm mb-6 hover:border-purple-500/30"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleLoading ? 'Signing in...' : 'Continue with Google'}
              </button>

              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300 dark:border-zinc-800"></div></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-zinc-900 px-3 text-zinc-600">or</span></div>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-zinc-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500 pointer-events-none" strokeWidth={2} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-zinc-700/80 rounded-xl bg-white dark:bg-zinc-950/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all text-sm"
                      placeholder="user@example.com"
                      title="Email address"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-slate-600 dark:text-zinc-300">Password</label>
                    <Link href="/reset-password" className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors">
                      Forgot?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500 pointer-events-none" strokeWidth={2} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 border border-slate-300 dark:border-zinc-700/80 rounded-xl bg-white dark:bg-zinc-950/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all text-sm"
                      placeholder=""
                      title="Password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-zinc-500 hover:text-purple-400 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-lg shadow-purple-600/20 hover:shadow-purple-500/30 active:scale-[0.98]"
                >
                  {isLoading ? 'Logging in...' : 'Log In'}
                </button>
              </form>

              <p className="text-center text-sm text-zinc-500 mt-6">
                Need an account?{' '}
                <Link href="/signup" className="text-purple-400 font-medium hover:text-purple-300 transition-colors">
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#05050A]"><p className="text-zinc-500">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}