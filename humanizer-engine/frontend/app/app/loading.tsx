import { RotateCcw } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <RotateCcw className="w-6 h-6 text-brand-600 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      </div>
    </div>
  );
}
