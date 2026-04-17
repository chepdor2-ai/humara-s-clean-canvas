'use client';

import { motion } from 'framer-motion';
import { FileSearch, Loader2, Sparkles, Zap } from 'lucide-react';
import { useState } from 'react';
import { DetectorRows, type DetectorResult } from '@/components/detector/detector-rows';
import { RiskGauge } from '@/components/detector/risk-gauge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '../../AuthProvider';

const SAMPLE_HUMAN = `I still remember the sound my grandfather's radio made on quiet Sunday mornings — a low hum before the news, the kind of static that felt like the house itself was breathing. Mom would pour coffee, he'd read the paper backwards, and nothing ever needed to happen quickly.`;

type ApiDetectorRow = {
  detector?: string;
  ai_score?: number;
  verdict?: string;
};

type DetectApiResponse = {
  detectors?: ApiDetectorRow[];
  summary?: {
    overall_ai_score?: number;
  };
  error?: string;
};

export default function DetectorPage() {
  const { session } = useAuth();
  const [input, setInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<{ score: number; rows: DetectorResult[] } | null>(null);

  const runScan = async () => {
    if (!input.trim()) {
      toast.error('Paste some text to analyze.');
      return;
    }
    setScanning(true);
    setResults(null);
    const startMs = Date.now();
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch('/api/detect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: input.trim() }),
      });
      const data: DetectApiResponse = await res.json();
      if (!res.ok) throw new Error(data.error || 'Detection failed');

      const elapsed = Date.now() - startMs;
      const detectorRows = data.detectors ?? [];
      const rows: DetectorResult[] = detectorRows.map((d) => ({
        name: d.detector ?? 'Unknown Detector',
        score: Math.round(d.ai_score ?? 0),
        verdict: String(d.verdict || '').toLowerCase().includes('human')
          ? 'human'
          : String(d.verdict || '').toLowerCase().includes('ai') || String(d.verdict || '').toLowerCase().includes('likely')
            ? 'ai'
            : 'mixed',
        latencyMs: Math.round(elapsed / Math.max(1, detectorRows.length)),
      }));

      const overallScore = Math.round(data.summary?.overall_ai_score ?? 0);
      setResults({ score: overallScore, rows });
      toast.success(`Scan complete across ${rows.length} detectors`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      toast.error(message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FileSearch className="h-3.5 w-3.5" />
            AI Detector
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">Multi-engine AI detection</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground text-pretty">
            Run your text through industry-standard AI detectors in parallel. See exactly where your content
            stands before you publish.
          </p>
        </div>
        <Button onClick={() => setInput(SAMPLE_HUMAN)} variant="ghost" size="sm" className="gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Try a sample
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">Text to analyze</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {input.trim().split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste the text you want to analyze for AI detection..."
          className="h-48 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2.5">
          <span className="text-[11px] text-muted-foreground">
            Your text is processed in memory and never stored after scanning.
          </span>
          <Button onClick={runScan} disabled={scanning} size="sm" className="gap-2">
            {scanning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scanning engines...
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                Run detection
              </>
            )}
          </Button>
        </div>
      </Card>

      {(scanning || results) && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="p-6 lg:col-span-2">
            <div className="text-xs font-medium text-muted-foreground">Aggregate score</div>
            <div className="mt-6 flex items-center justify-center">
              {scanning ? (
                <div className="flex h-[180px] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">Analyzing across detectors...</span>
                </div>
              ) : (
                <RiskGauge score={results!.score} />
              )}
            </div>
            {!scanning && results && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="mt-4 text-center text-xs text-muted-foreground text-balance"
              >
                Averaged across {results.rows.length} industry-standard AI detection engines.
              </motion.p>
            )}
          </Card>

          <Card className="overflow-hidden p-0 lg:col-span-3">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Per-detector breakdown</span>
                {!scanning && results && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                    {results.rows.length} engines
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">Real-time</span>
            </div>
            {scanning ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                      <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <DetectorRows rows={results!.rows} />
            )}
          </Card>
        </div>
      )}

      {!scanning && !results && (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-accent">
            <FileSearch className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-medium">No scan yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground text-pretty">
            Paste your text above and click Run detection to see how AI detectors score your content.
          </p>
        </Card>
      )}
    </div>
  );
}
