import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ready",
    model_path: "multi-detector (statistical)",
    message: "AI detection available (22 detector profiles)",
    engine: "TypeScript/Next.js",
  });
}
