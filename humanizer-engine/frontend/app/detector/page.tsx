"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ShieldAlert, Cpu, Fingerprint, Activity, ChevronRight, ScanSearch, AlertTriangle } from "lucide-react";
import { RiskGauge } from "@/components/detector/risk-gauge";
import { DetectorRows, type DetectorResult } from "@/components/detector/detector-rows";
import { SignalMetrics } from "@/components/detector/signal-metrics";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DetectorPage() {
  const [text, setText] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"detectors" | "signals">("detectors");

  async function handleScan() {
    if (text.trim().split(/\s+/).length < 15) {
      alert("Please enter at least 15 words for a reliable analysis.");
      return;
    }
    
    setIsScanning(true);
    setResults(null);
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      
      // Post-process latency simulation for visual effect
      const processedDetectors = (data.detectors || []).map((d: any) => ({
        name: d.detector,
        score: d.ai_score,
        verdict: d.verdict === "Human-Written" ? "human" : d.verdict === "Mixed / Uncertain" ? "mixed" : "ai",
        latencyMs: Math.floor(Math.random() * 400 + 150),
      }));

      setResults({ ...data, detectors: processedDetectors });
    } catch (e: any) {
      alert(e.message || "An error occurred");
    } finally {
      setIsScanning(false);
    }
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-12 space-y-12">
      {/* Header Section */}
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-cyan-50 flex items-center justify-center mb-6">
          <Shield className="w-8 h-8 text-cyan-500" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          Deep AI Detection
        </h1>
        <p className="text-muted-foreground md:text-lg">
          Paste your text below to scan it against our ensemble of 22 detection models, using state-of-the-art LM likelihood matching and stylometric variance profiling.
        </p>
      </div>

      {/* Input Section */}
      <div className="mx-auto max-w-4xl relative">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 blur-3xl rounded-[3rem] -z-10" />
        <div className="bg-card border shadow-xl rounded-3xl overflow-hidden flex flex-col">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isScanning}
            placeholder="Paste your document here (minimum 15 words)..."
            className="w-full h-64 p-6 bg-transparent border-0 resize-none focus:ring-0 leading-relaxed text-foreground placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between border-t bg-muted/30 px-6 py-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className={wordCount < 15 && wordCount > 0 ? "text-amber-500" : ""}>
                {wordCount} words
              </span>
              <span>{text.length} characters</span>
            </div>
            <Button
              onClick={handleScan}
              disabled={isScanning || wordCount < 5}
              className="gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl px-8 h-12 shadow-md hover:shadow-lg transition-all"
            >
              {isScanning ? (
                <>
                  <Activity className="h-5 w-5 animate-pulse" /> Scanning Core Signals...
                </>
              ) : (
                <>
                  <ScanSearch className="h-5 w-5" /> Analyze Text
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <AnimatePresence mode="wait">
        {results && !isScanning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid lg:grid-cols-12 gap-8"
          >
            {/* Left Col - Overview */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-card border shadow-sm rounded-3xl p-8 flex flex-col items-center">
                <h3 className="font-semibold text-lg mb-6 self-start w-full border-b pb-4">Detection Master Verdict</h3>
                <RiskGauge score={results.summary.overall_ai_score} size={260} />
                <div className="mt-8 space-y-3 w-full">
                  <div className="flex justify-between items-center py-2 border-b text-sm">
                    <span className="text-muted-foreground">Analyzed Sentences</span>
                    <span className="font-medium">{results.summary.sentence_count}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b text-sm">
                    <span className="text-muted-foreground">Length Reliability</span>
                    <span className="font-medium text-emerald-600">{Math.round(results.summary.length_reliability * 100)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-sm">
                    <span className="text-muted-foreground">Active Detectors</span>
                    <span className="font-medium">{results.summary.total_detectors} Models</span>
                  </div>
                </div>
              </div>
              
              {results.summary.overall_ai_score > 50 && (
                <div className="bg-rose-50/50 border border-rose-100 rounded-3xl p-6 dark:bg-rose-950/20 dark:border-rose-900/50">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-rose-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-rose-800 dark:text-rose-400">AI Artifacts Detected</h4>
                      <p className="text-sm text-rose-600/80 mt-1 dark:text-rose-300/80">
                        We recommend running this through the Stealth Humanizer to break down predictability and uniformity markers.
                      </p>
                      <Link href="/app">
                        <Button variant="outline" className="mt-4 w-full border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-900/30">
                          Humanize Text
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Col - Breakdown */}
            <div className="lg:col-span-8">
              <div className="bg-card border shadow-sm rounded-3xl overflow-hidden h-full flex flex-col">
                <div className="flex items-center gap-4 border-b px-6 pt-4 bg-muted/10">
                  <button
                    onClick={() => setActiveTab("detectors")}
                    className={cn(
                      "pb-4 text-sm font-semibold border-b-2 transition-colors",
                      activeTab === "detectors" ? "border-cyan-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4" /> 22 Detector Evaluation
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("signals")}
                    className={cn(
                      "pb-4 text-sm font-semibold border-b-2 transition-colors",
                      activeTab === "signals" ? "border-cyan-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Fingerprint className="h-4 w-4" /> Core Signals Engine
                    </div>
                  </button>
                </div>
                
                <div className="flex-1 p-6 bg-muted/5">
                  {activeTab === "detectors" ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-12 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <div className="col-span-4">Model</div>
                        <div className="col-span-5">Confidence</div>
                        <div className="col-span-2 text-right">Score</div>
                        <div className="col-span-1 text-right">Verdict</div>
                      </div>
                      <DetectorRows rows={results.detectors} />
                    </div>
                  ) : (
                    <div className="h-full">
                       <SignalMetrics signals={results.signals} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

