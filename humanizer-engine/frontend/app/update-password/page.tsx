'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase auto-detects the recovery token from the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    // Also check if session already exists (user may have already loaded token)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/app'), 3000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#05050A] relative premium-dots">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-md w-full relative z-10">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="relative">
              <Image src="/logo.png" alt="HumaraGPT" width={56} height={56} className="w-14 h-14 relative z-10 drop-shadow-[0_0_14px_rgba(147,51,234,0.7)]" />
              <div className="absolute -inset-1 rounded-full bg-purple-500/25 animate-[logoPulse_2.5s_ease-in-out_infinite] blur-md" />
              <div className="absolute -inset-2.5 rounded-full bg-purple-400/15 animate-[logoPulse_2.5s_ease-in-out_infinite_0.6s] blur-lg" />
              <div className="absolute -inset-4 rounded-full bg-purple-600/8 animate-[logoPulse_2.5s_ease-in-out_infinite_1.2s] blur-xl" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]">HumaraGPT</span>
          </Link>
        </div>

        <div className="bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-purple-500/10 shadow-2xl shadow-purple-900/20 p-7 sm:p-9">
          <div className="flex justify-center mb-6">
            <div className="bg-purple-950/40 p-3 rounded-xl">
              <Lock className="w-8 h-8 text-purple-400" />
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-center mb-2 text-white">Set New Password</h2>
          <p className="text-center text-zinc-500 text-sm mb-8">Enter your new password below.</p>

          {success ? (
            <div className="bg-emerald-950/30 border border-emerald-900 p-4 rounded-xl text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-emerald-400 font-semibold">Password updated!</p>
              <p className="text-emerald-500 text-sm mt-1">Redirecting to your dashboard...</p>
            </div>
          ) : !sessionReady ? (
            <div className="text-center py-4">
              <p className="text-zinc-400 text-sm">Verifying reset link...</p>
              <p className="text-zinc-600 text-xs mt-2">If this takes too long, try requesting a new reset link.</p>
              <Link href="/reset-password" className="inline-block mt-4 text-purple-400 text-sm font-medium hover:text-purple-300 transition-colors">
                Request new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-sm text-red-400">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500 pointer-events-none" strokeWidth={2} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-zinc-700/80 bg-zinc-950/80 text-white placeholder-zinc-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all text-sm"
                    placeholder="Min. 6 characters"
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
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500 pointer-events-none" strokeWidth={2} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-700/80 bg-zinc-950/80 text-white placeholder-zinc-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all text-sm"
                    placeholder="Confirm password"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-purple-600/20 hover:shadow-purple-500/30 active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-zinc-500 mt-8">
            <Link href="/login" className="text-purple-400 font-medium hover:text-purple-300 transition-colors">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
