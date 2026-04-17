'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Crown } from 'lucide-react';
import { Suspense } from 'react';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [planName, setPlanName] = useState('');
  const reference = searchParams.get('reference') || searchParams.get('trxref');

  useEffect(() => {
    if (!reference) {
      setStatus('failed');
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
        const data = await res.json();
        if (data.status === 'success') {
          setStatus('success');
          setPlanName(data.data?.plan || '');
          setTimeout(() => router.push('/app/dashboard'), 3000);
        } else {
          setStatus('failed');
        }
      } catch {
        setStatus('failed');
      }
    };

    verify();
  }, [reference, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl border border-slate-300 dark:border-zinc-700/60 shadow-2xl shadow-cyan-900/10 p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Verifying payment...</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">Please wait while we confirm your payment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-emerald-950/50 rounded-xl border border-emerald-800/30">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Payment Successful!</h2>
            {planName && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950/40 border border-cyan-800/30 rounded-full mb-3">
                <Crown className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-300 capitalize">{planName} Plan</span>
              </div>
            )}
            <p className="text-sm text-slate-500 dark:text-zinc-400 mb-4">Your subscription is now active. Redirecting to dashboard...</p>
          </>
        )}
        {status === 'failed' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-950/50 rounded-xl border border-red-800/30">
                <XCircle className="w-10 h-10 text-red-400" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Payment Failed</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">We could not verify your payment. Please try again or contact support.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => router.push('/pricing')} className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
                Try Again
              </button>
              <button onClick={() => router.push('/contact')} className="bg-slate-100 dark:bg-zinc-800 hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors border border-slate-300 dark:border-zinc-700">
                Contact Support
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>}>
      <VerifyContent />
    </Suspense>
  );
}
