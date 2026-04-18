import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SynonymMap {
  [key: string]: string[];
}

let synonymCache: SynonymMap | null = null;

function getDictionaryPaths(): string[] {
  return [
    path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'curated_synonyms.json'),
    path.join(/* turbopackIgnore: true */ process.cwd(), '..', 'dictionaries', 'curated_synonyms.json'),
    path.join(/* turbopackIgnore: true */ process.cwd(), 'dictionaries', 'curated_synonyms.json'),
  ];
}

function loadSynonyms(): SynonymMap {
  if (synonymCache) return synonymCache;

  for (const dictionaryPath of getDictionaryPaths()) {
    try {
      if (!fs.existsSync(dictionaryPath)) continue;
      const data = fs.readFileSync(dictionaryPath, 'utf-8');
      synonymCache = JSON.parse(data);
      return synonymCache || {};
    } catch (error) {
      console.error('Failed to load curated_synonyms.json:', dictionaryPath, error);
    }
  }

  return {};
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
