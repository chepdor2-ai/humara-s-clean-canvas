"use client";

import { motion } from "framer-motion";
import { Activity, Zap, BrainCircuit, Hash, Layers, Braces } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  signals: Record<string, number>;
};

function resolveColor(score: number, invert = false) {
  // score is 0-100 indicating AI likeness (unless inverted)
  const v = invert ? 100 - score : score;
  if (v < 30) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  if (v < 60) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
  return "text-rose-500 bg-rose-500/10 border-rose-500/20";
}

function getBgColor(score: number, invert = false) {
  const v = invert ? 100 - score : score;
  if (v < 30) return "bg-emerald-500";
  if (v < 60) return "bg-amber-500";
  return "bg-rose-500";
}

export function SignalMetrics({ signals }: Props) {
  if (!signals || Object.keys(signals).length === 0) return null;

  const groups = [
    {
      name: "Perplexity & Entropy",
      description: "Language model likelihood and token predictability.",
      icon: BrainCircuit,
      metrics: [
        { label: "Perplexity", value: signals.perplexity, invert: true },
        { label: "Token Entropy", value: signals.shannon_entropy, invert: true },
        { label: "Predictability", value: signals.token_predictability },
      ],
    },
    {
      name: "Structure & Burstiness",
      description: "Sentence length variance and punctuation flow.",
      icon: Activity,
      metrics: [
        { label: "Burstiness", value: signals.burstiness, invert: true },
        { label: "Sentence Uniformity", value: signals.sentence_uniformity },
        { label: "Paragraph Uniformity", value: signals.paragraph_uniformity },
      ],
    },
    {
      name: "Discourse & Stylometry",
      description: "AI-style phrase patterns and starter repetitive structures.",
      icon: Layers,
      metrics: [
        { label: "AI Pattern Score", value: signals.ai_pattern_score },
        { label: "Starter Diversity", value: signals.starter_diversity, invert: true },
        { label: "Stylometric Score", value: signals.stylometric_score, invert: true },
      ],
    },
    {
      name: "Semantic Redundancy",
      description: "N-gram reuse and high-probability function word density.",
      icon: Hash,
      metrics: [
        { label: "N-gram Repetition", value: signals.ngram_repetition },
        { label: "Function Word Freq", value: signals.function_word_freq },
        { label: "Word Commonality", value: signals.avg_word_commonality },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {groups.map((g, i) => (
        <motion.div
          key={g.name}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          className="rounded-xl border bg-card p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-cyan-500/10 text-cyan-500`}>
              <g.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{g.name}</h3>
              <p className="text-xs text-muted-foreground">{g.description}</p>
            </div>
          </div>
          <div className="space-y-3">
            {g.metrics.map((m) => (
              <div key={m.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-muted-foreground">{m.label}</span>
                  <span className="font-mono">{m.value?.toFixed(1) ?? "0.0"}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${m.value ?? 0}%` }}
                    transition={{ duration: 1, delay: 0.3 }}
                    className={cn("h-full rounded-full", getBgColor(m.value ?? 50, m.invert))}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
