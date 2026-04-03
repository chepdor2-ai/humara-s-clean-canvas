'use client';
import { useAuth } from '../AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login?redirect=/app');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RotateCcw className="w-6 h-6 text-brand-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
