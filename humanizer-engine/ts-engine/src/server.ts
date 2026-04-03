/**
 * Hono Server — Ghost Humanizer API (TypeScript port)
 * ====================================================
 * Replaces FastAPI. Runs on Bun.
 *
 * Start: bun run src/server.ts
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { humanize } from "./humanizer.js";
import { getDetector } from "./multi-detector.js";
import { runPipelineAsync } from "./llm-pipeline.js";

// ── Lazy LLM humanizer import ──

let llmHumanize: typeof import("./llm-humanizer.js").llmHumanize | null = null;
try {
  const mod = await import("./llm-humanizer.js");
  llmHumanize = mod.llmHumanize;
  console.log("[OK] LLM humanizer module loaded");
} catch (e) {
  console.log(`[*] LLM humanizer not available: ${e}`);
}

// ── Lazy Premium humanizer import ──

let premiumHumanize: typeof import("./premium-humanizer.js").premiumHumanize | null = null;
try {
  const premMod = await import("./premium-humanizer.js");
  premiumHumanize = premMod.premiumHumanize;
  console.log("[OK] Premium humanizer module loaded");
} catch (e) {
  console.log(`[*] Premium humanizer not available: ${e}`);
}

let hasPipeline = false;
try {
  // Verify pipeline can be imported
  await import("./llm-pipeline.js");
  hasPipeline = true;
  console.log("[OK] 8-phase LLM pipeline loaded");
} catch (e) {
  console.log(`[*] LLM pipeline not available: ${e}`);
}

// ── Detector init ──

const detector = getDetector();
console.log(`[OK] Multi-detector initialized (${(detector as any).profiles?.length ?? '?'} engines)`);

// ── App ──

const app = new Hono();

app.use("/*", cors());

// ── Request types ──

interface HumanizeRequest {
  text: string;
  engine?: string;       // ghost_mini | ghost_pro | ninja
  strength?: string;     // light | balanced | deep
  preserve_sentences?: boolean;
  strict_meaning?: boolean;
  no_contractions?: boolean;
  tone?: string;
  enable_post_processing?: boolean;
  premium?: boolean;     // Premium mode: purely AI-driven pipeline
}

interface DetectRequest {
  text: string;
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

// ── API routes ──

app.post("/api/humanize", async (c) => {
  const body = await c.req.json<HumanizeRequest>();

  const strengthMap: Record<string, string> = { light: "light", balanced: "medium", deep: "strong" };
  const engineStrength = strengthMap[body.strength ?? "balanced"] ?? "medium";
  let engineUsed = body.engine ?? "ghost_mini";
  let result: string;

  // ── Premium Mode: Purely AI-driven pipeline ──
  if (body.premium && premiumHumanize) {
    try {
      result = await premiumHumanize(
        body.text,
        body.engine ?? "ghost_pro",
        engineStrength,
        body.tone ?? "neutral",
        body.strict_meaning ?? true,
      );
      engineUsed = `premium_${body.engine ?? "ghost_pro"}`;
    } catch (e) {
      console.log(`[!] Premium engine failed, falling back to standard: ${e}`);
      // Fall through to standard pipeline
      result = humanize(body.text, {
        strength: engineStrength, preserveSentences: body.preserve_sentences,
        strictMeaning: body.strict_meaning, tone: body.tone,
        mode: "ghost_pro", enablePostProcessing: body.enable_post_processing,
      });
      engineUsed = "premium_fallback";
    }
  } else if (body.engine === "ninja" && llmHumanize) {
    // Ninja: LLM multi-pass pipeline
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

  // 8-Phase LLM Pipeline: anti-detection refinement (skip for premium — already fully AI)
  if (hasPipeline && !body.premium) {
    try {
      result = await runPipelineAsync(result, body.no_contractions ?? true);
      console.log(`[OK] LLM pipeline refinement complete (${engineUsed})`);
    } catch (e) {
      console.log(`[!] LLM pipeline failed, using raw humanizer output: ${e}`);
    }
  }

  // Run multi-detector on humanized output
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

  // Run multi-detector on input text
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

  return c.json({
    original: body.text.slice(0, 200) + (body.text.length > 200 ? "..." : ""),
    humanized: result,
    word_count: result.split(/\s+/).filter(Boolean).length,
    engine_used: engineUsed,
    input_detector_results: inputResults,
    output_detector_results: outputResults,
  });
});

app.post("/api/detect", async (c) => {
  const body = await c.req.json<DetectRequest>();
  if (!body.text?.trim()) return c.json({ error: "Empty text provided" }, 400);
  const result = detector.analyze(body.text);
  return c.json(result);
});

app.get("/api/detector-status", (c) => {
  return c.json({
    status: "ready",
    model_path: "multi-detector (statistical)",
    message: "AI detection available (22 detector profiles)",
  });
});

app.post("/api/analyze", async (c) => {
  const body = await c.req.json<{ text: string; strength?: string; detect_ai?: boolean }>();
  if (!body.text?.trim()) return c.json({ error: "Empty text provided" }, 400);

  const humanized = humanize(body.text, {
    strength: body.strength ?? "medium",
    mode: "ghost_mini",
  });

  const humanizedDetection = detector.analyze(humanized);
  const originalDetection = detector.analyze(body.text);

  return c.json({
    original_text: body.text.slice(0, 200) + (body.text.length > 200 ? "..." : ""),
    humanized_text: humanized,
    word_count: humanized.split(/\s+/).filter(Boolean).length,
    is_ai_generated: humanizedDetection.summary.overall_ai_score > 50,
    ai_confidence: humanizedDetection.summary.overall_ai_score,
    original_ai_score: originalDetection.summary.overall_ai_score,
  });
});

// ── Static files (serve ../static) ──

app.use("/static/*", serveStatic({ root: "../" }));

// Page routes
const pages = [
  ["/", "index.html"],
  ["/app", "app.html"],
  ["/detector", "detector.html"],
  ["/login", "login.html"],
  ["/signup", "signup.html"],
  ["/reset-password", "reset-password.html"],
  ["/pricing", "pricing.html"],
  ["/about", "about.html"],
  ["/how-it-works", "how-it-works.html"],
  ["/terms", "terms.html"],
  ["/privacy", "privacy.html"],
] as const;

for (const [route, file] of pages) {
  app.get(route, serveStatic({ path: `../static/${file}` }));
}

// 404 fallback
app.notFound((c) => {
  return c.html(Bun.file("../static/404.html").text(), 404);
});

// ── Start ──

const port = parseInt(process.env.PORT ?? "8000", 10);
console.log(`Ghost Humanizer API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
