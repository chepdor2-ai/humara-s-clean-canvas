import { NextRequest, NextResponse } from 'next/server';
import synonymData from '@/data/curated_synonyms.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SynonymMap {
  [key: string]: string[];
}

const synonymCache = synonymData as SynonymMap;

function loadSynonyms(): SynonymMap {
  return synonymCache;
}

export async function POST(req: NextRequest) {
  try {
    const { word } = await req.json();
    
    if (!word || typeof word !== 'string') {
      return NextResponse.json(
        { error: 'Word is required' },
        { status: 400 }
      );
    }

    const normalizedWord = word.toLowerCase().trim();
    const synonyms = loadSynonyms();
    
    // Get synonyms for the word
    const wordSynonyms = synonyms[normalizedWord] || [];
    
    // Build response with original word marked
    const results = [
      { word: word, isOriginal: true },
      ...wordSynonyms.slice(0, 8).map(syn => ({ word: syn, isOriginal: false }))
    ];

    return NextResponse.json({
      success: true,
      word: word,
      synonyms: results
    });

  } catch (error) {
    console.error('Synonym API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch synonyms', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
