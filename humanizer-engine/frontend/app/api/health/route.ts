import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
    engines: ['ghost_mini', 'ghost_pro', 'ninja'],
    features: {
      dictionary: true,
      multi_detector: true,
      semantic_guard: true,
      style_profiles: true,
      post_processor: true,
    },
  });
}
