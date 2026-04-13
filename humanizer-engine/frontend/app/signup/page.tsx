'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, User, Eye, EyeOff, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
      setError('Google sign-up failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) {
      setError('Please agree to the terms and privacy policy');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      setSuccess(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-white dark:bg-[#05050A] relative overflow-hidden premium-dots">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-600/[0.06] rounded-full blur-[120px]" />
        </div>
        <main className="flex-grow flex items-center justify-center px-4 sm:px-6 py-12 relative z-10">
          <div className="w-full max-w-[420px]">
            <div className="bg-zinc-900/60 backdrop-blur-2xl rounded-2xl border border-slate-300 dark:border-zinc-800/80 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] p-8 sm:p-10 text-center">
              <div className="flex justify-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-800/30 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" strokeWidth={1.8} />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Check your email</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mb-2 leading-relaxed">
                We sent a confirmation link to
              </p>
              <p className="text-sm text-slate-900 dark:text-white font-medium mb-6">{email}</p>
              <p className="text-xs text-zinc-500 mb-6">Click the link in your email to activate your account.</p>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-purple-400 font-medium text-sm hover:text-purple-300 transition-colors">
                Back to Login <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#05050A] relative overflow-hidden premium-dots">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[800px] h-[600px] bg-purple-600/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-500/[0.04] rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-0 w-[300px] h-[500px] bg-purple-400/[0.03] rounded-full blur-[80px]" />
      </div>

      <main className="flex-grow flex items-center justify-center px-4 sm:px-6 py-12 relative z-10">
        <div className="w-full max-w-[420px]">
          {/* Logo */}
          <div className="flex justify-center mb-10">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <Image src="/logo.png" alt="HumaraGPT" width={56} height={56} className="w-14 h-14 relative z-10 drop-shadow-[0_0_14px_rgba(147,51,234,0.7)]" />
                <div className="absolute -inset-1 rounded-full bg-purple-500/25 animate-[logoPulse_2.5s_ease-in-out_infinite] blur-md" />
                <div className="absolute -inset-2.5 rounded-full bg-purple-400/15 animate-[logoPulse_2.5s_ease-in-out_infinite_0.6s] blur-lg" />
                <div className="absolute -inset-4 rounded-full bg-purple-600/8 animate-[logoPulse_2.5s_ease-in-out_infinite_1.2s] blur-xl" />
              </div>
              <span className="text-[22px] font-bold bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]">HumaraGPT</span>
            </Link>
          </div>

          {/* Card */}
          <div className="bg-zinc-900/60 backdrop-blur-2xl rounded-2xl border border-slate-300 dark:border-zinc-800/80 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] p-8 sm:p-10">
            <h1 className="text-[26px] font-bold text-center text-slate-900 dark:text-white tracking-tight">Create your account</h1>
            <p className="text-center text-zinc-500 text-sm mt-1.5 mb-8">Start humanizing AI text for free</p>

            {error && (
              <div className="mb-6 px-4 py-3 bg-red-950/50 border border-red-900/40 rounded-xl text-sm text-red-400 flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
                {error}
              </div>
            )}

            {/* Google button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-slate-100 dark:bg-white/[0.04] border border-slate-300 dark:border-zinc-700/60 hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:border-zinc-600 text-slate-800 dark:text-zinc-200 font-medium py-3 rounded-xl transition-all disabled:opacity-50 text-sm"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {googleLoading ? 'Signing upâ€¦' : 'Continue with Google'}
            </button>

            {/* Divider */}
            <div className="relative my-7">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300 dark:border-zinc-800/80" /></div>
              <div className="relative flex justify-center"><span className="bg-white dark:bg-zinc-900 px-4 text-xs text-zinc-600 uppercase tracking-wider">or</span></div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[13px] font-medium text-slate-500 dark:text-zinc-400 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[16px] w-[16px] text-zinc-600 pointer-events-none" strokeWidth={1.8} />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all text-sm"
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-500 dark:text-zinc-400 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[16px] w-[16px] text-zinc-600 pointer-events-none" strokeWidth={1.8} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all text-sm"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-500 dark:text-zinc-400 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[16px] w-[16px] text-zinc-600 pointer-events-none" strokeWidth={1.8} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-12 py-3 rounded-xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all text-sm"
                    placeholder="Min. 6 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.8} /> : <Eye className="h-4 w-4" strokeWidth={1.8} />}
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-zinc-700 bg-zinc-950 accent-purple-600 cursor-pointer"
                />
                <span className="text-xs text-zinc-500 leading-relaxed">
                  I agree to the{' '}
                  <Link href="/terms" className="text-purple-400/80 hover:text-purple-300 underline underline-offset-2">Terms of Service</Link>{' '}and{' '}
                  <Link href="/privacy" className="text-purple-400/80 hover:text-purple-300 underline underline-offset-2">Privacy Policy</Link>
                </span>
              </label>

              <button
                type="submit"
                disabled={isLoading || !agreedToTerms}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-lg shadow-purple-600/25 hover:shadow-purple-500/30 active:scale-[0.98] mt-2"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Creating account…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Create Free Account <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-zinc-600 mt-8">
              Already have an account?{' '}
              <Link href="/login" className="text-purple-400 font-medium hover:text-purple-300 transition-colors">
                Sign in
              </Link>
            </p>
          </div>

          {/* Trust badge */}
          <p className="text-center text-xs text-zinc-700 mt-6">
            No credit card required &middot; Free tier included
          </p>
        </div>
      </main>
    </div>
  );
}
