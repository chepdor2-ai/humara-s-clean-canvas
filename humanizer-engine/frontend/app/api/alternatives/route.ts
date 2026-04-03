import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { sentence, engine = 'ghost_pro', count = 8 } = await req.json();
    
    if (!sentence || typeof sentence !== 'string') {
      return NextResponse.json(
        { error: 'Sentence is required' },
        { status: 400 }
      );
    }

    // Call the humanizer engine with different strength/tone combos
    const alternatives: { text: string; score: number; variation: string }[] = [];
    
    const variations = [
      { strength: 'light', tone: 'neutral', engine: 'ghost_mini' },
      { strength: 'medium', tone: 'academic', engine },
      { strength: 'medium', tone: 'professional', engine },
      { strength: 'strong', tone: 'neutral', engine },
      { strength: 'light', tone: 'simple', engine: 'ghost_mini' },
      { strength: 'strong', tone: 'academic', engine },
      { strength: 'medium', tone: 'simple', engine },
      { strength: 'strong', tone: 'professional', engine: 'ninja' },
    ];

    const requestCount = Math.min(count, variations.length);

    // Run in parallel for speed
    const promises = variations.slice(0, requestCount).map(async (variation, i) => {
      try {
        const response = await fetch(`${req.nextUrl.origin}/api/humanize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: sentence,
            engine: variation.engine,
            strength: variation.strength,
            tone: variation.tone,
            strict_meaning: true,
            enable_post_processing: true,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            text: data.humanized || sentence,
            score: data.meaning_similarity || 0.9,
            variation: `${variation.strength}-${variation.tone}`
          };
        }
      } catch (error) {
        console.error(`Failed to generate alternative ${i}:`, error);
      }
      return null;
    });

    const results = await Promise.all(promises);
    
    for (const r of results) {
      if (r && r.text && r.text !== sentence) {
        alternatives.push(r);
      }
    }

    // Deduplicate alternatives
    const seen = new Set<string>();
    const unique = alternatives.filter(a => {
      const key = a.text.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // If nothing was generated, return original
    if (unique.length === 0) {
      unique.push({ text: sentence, score: 1.0, variation: 'original' });
    }

    return NextResponse.json({
      success: true,
      original: sentence,
      alternatives: unique
    });

  } catch (error) {
    console.error('Sentence alternatives API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate alternatives', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
