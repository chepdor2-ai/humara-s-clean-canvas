import { NextRequest, NextResponse } from "next/server";
import { getDetector } from "@/lib/engine/multi-detector";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { text?: string };

  if (!body.text?.trim()) {
    return NextResponse.json({ error: "Empty text provided" }, { status: 400 });
  }

  const detector = getDetector();
  const result = detector.analyze(body.text);
  return NextResponse.json(result);
}
