import { NextRequest, NextResponse } from "next/server";
import { humanize } from "@/lib/engine/humanizer";
import { getDetector } from "@/lib/engine/multi-detector";
import { runPipelineAsync } from "@/lib/engine/llm-pipeline";

export const runtime = "nodejs";

// ── Lazy LLM humanizer import ──

let llmHumanize: typeof import("@/lib/engine/llm-humanizer").llmHumanize | null = null;
let hasPipeline = false;

async function initModules() {
  if (llmHumanize === null) {
    try {
      const mod = await import("@/lib/engine/llm-humanizer");
      llmHumanize = mod.llmHumanize;
    } catch { /* LLM humanizer not available */ }
  }
  if (!hasPipeline) {
    try {
      await import("@/lib/engine/llm-pipeline");
      hasPipeline = true;
    } catch { /* pipeline not available */ }
  }
}

// ── Helpers ──

function findDetectorAiScore(detection: Record<string, any>, name: string): number {
  const aliases: Record<string, Set<string>> = {
    originality_ai: new Set(["originality_ai", "originalityai", "originality.ai"]),
    winston_ai: new Set(["winston_ai", "winstonai", "winston.ai"]),
    copyleaks: new Set(["copyleaks", "crossplag"]),
  };

  const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const requested = norm(name);
  const candidates = new Set([norm(name)]);
  if (aliases[name]) for (const v of aliases[name]) candidates.add(norm(v));

  for (const d of detection.detectors ?? []) {
    const detNorm = norm(d.detector ?? "");
    if (candidates.has(detNorm) || detNorm.includes(requested) || requested.includes(detNorm)) {
      return Math.round((100 - d.human_score) * 10) / 10;
    }
  }

  const fallback = 100 - (detection.summary?.overall_human_score ?? 50);
  return Math.round(fallback * 10) / 10;
}

// ── POST /api/humanize ──

export async function POST(req: NextRequest) {
  await initModules();

  const body = (await req.json()) as {
    text?: string;
    engine?: string;
    strength?: string;
    preserve_sentences?: boolean;
    strict_meaning?: boolean;
    tone?: string;
    no_contractions?: boolean;
    enable_post_processing?: boolean;
  };

  if (!body.text?.trim()) {
    return NextResponse.json({ error: "Empty text provided" }, { status: 400 });
  }

  const strengthMap: Record<string, string> = { light: "light", balanced: "medium", deep: "strong" };
  const engineStrength = strengthMap[body.strength ?? "balanced"] ?? "medium";
  let engineUsed = body.engine ?? "ghost_mini";
  let result: string;

  if (body.engine === "ninja" && llmHumanize) {
    try {
      result = await llmHumanize(
        body.text,
        engineStrength,
        body.preserve_sentences ?? true,
        body.strict_meaning ?? true,
        body.tone ?? "neutral",
        body.no_contractions ?? true,
        body.enable_post_processing ?? true,
      );
      engineUsed = "ninja";
    } catch (e) {
      console.log(`[!] Ninja engine failed, falling back to Ghost Pro: ${e}`);
      result = humanize(body.text, {
        strength: engineStrength, preserveSentences: body.preserve_sentences,
        strictMeaning: body.strict_meaning, tone: body.tone,
        mode: "ghost_pro", enablePostProcessing: body.enable_post_processing,
      });
      engineUsed = "ninja_fallback";
    }
  } else if (body.engine === "ghost_pro") {
    result = humanize(body.text, {
      strength: engineStrength, preserveSentences: body.preserve_sentences,
      strictMeaning: body.strict_meaning, tone: body.tone,
      mode: "ghost_pro", enablePostProcessing: body.enable_post_processing,
    });
    engineUsed = "ghost_pro";
  } else {
    result = humanize(body.text, {
      strength: engineStrength, preserveSentences: body.preserve_sentences,
      strictMeaning: body.strict_meaning, tone: body.tone,
      mode: "ghost_mini", enablePostProcessing: body.enable_post_processing,
    });
    engineUsed = "ghost_mini";
  }

  // 8-Phase LLM Pipeline: anti-detection refinement
  if (hasPipeline) {
    try {
      result = await runPipelineAsync(result, body.no_contractions ?? true);
    } catch (e) {
      console.log(`[!] LLM pipeline failed, using raw humanizer output: ${e}`);
    }
  }

  // Run multi-detector on output and input
  const detector = getDetector();
  const outputDetection = detector.analyze(result);
  const outputTop5: Record<string, number> = {
    gptzero: findDetectorAiScore(outputDetection, "gptzero"),
    turnitin: findDetectorAiScore(outputDetection, "turnitin"),
    originality: findDetectorAiScore(outputDetection, "originality_ai"),
    winston: findDetectorAiScore(outputDetection, "winston_ai"),
    copyleaks: findDetectorAiScore(outputDetection, "copyleaks"),
  };
  const outputResults = {
    ...outputTop5,
    zerogpt: findDetectorAiScore(outputDetection, "zerogpt"),
    crossplag: findDetectorAiScore(outputDetection, "crossplag"),
    top5_max: Math.max(...Object.values(outputTop5)),
    overall: 100 - (outputDetection.summary?.overall_human_score ?? 50),
  };

  const inputDetection = detector.analyze(body.text);
  const inputTop5: Record<string, number> = {
    gptzero: findDetectorAiScore(inputDetection, "gptzero"),
    turnitin: findDetectorAiScore(inputDetection, "turnitin"),
    originality: findDetectorAiScore(inputDetection, "originality_ai"),
    winston: findDetectorAiScore(inputDetection, "winston_ai"),
    copyleaks: findDetectorAiScore(inputDetection, "copyleaks"),
  };
  const inputResults = {
    ...inputTop5,
    zerogpt: findDetectorAiScore(inputDetection, "zerogpt"),
    crossplag: findDetectorAiScore(inputDetection, "crossplag"),
    top5_max: Math.max(...Object.values(inputTop5)),
    overall: 100 - (inputDetection.summary?.overall_human_score ?? 50),
  };

  return NextResponse.json({
    original: body.text.slice(0, 200) + (body.text.length > 200 ? "..." : ""),
    humanized: result,
    word_count: result.split(/\s+/).filter(Boolean).length,
    engine_used: engineUsed,
    input_detector_results: inputResults,
    output_detector_results: outputResults,
  });
}
