'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Suspense } from 'react';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
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
          setTimeout(() => router.push('/app'), 3000);
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
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 shadow-sm p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-brand-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Verifying payment...</h2>
            <p className="text-sm text-slate-500">Please wait while we confirm your payment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Payment Successful!</h2>
            <p className="text-sm text-slate-500 mb-4">Your subscription is now active. Redirecting to the app...</p>
          </>
        )}
        {status === 'failed' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded-xl">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Payment Failed</h2>
            <p className="text-sm text-slate-500 mb-4">We could not verify your payment. Please try again or contact support.</p>
            <button onClick={() => router.push('/pricing')} className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
              Back to Pricing
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>}>
      <VerifyContent />
    </Suspense>
  );
}
