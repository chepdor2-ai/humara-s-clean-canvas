import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required.' }, { status: 400 });
    }

    // Call the internal humanizer API to process the document text
    // using the 'ai_analysis' engine (Auto mode — API-free, no EssayWritingSupport dependency)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/humanize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        engine: 'ai_analysis',
        strength: 'strong',
        tone: 'academic',
        strict_meaning: false,
        enable_post_processing: true,
        post_processing_profile: 'undetectability',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Humanize pipeline failed:', errorData);
      throw new Error(errorData.error || 'Humanization failed');
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      humanized: data.humanized || text, // fallback to original if missing
    });
  } catch (error) {
    console.error('Workspace Humanize error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal humanize error' },
      { status: 500 }
    );
  }
}
