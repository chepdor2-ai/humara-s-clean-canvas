import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface SynonymMap {
  [key: string]: string[];
}

let synonymCache: SynonymMap | null = null;

function loadSynonyms(): SynonymMap {
  if (synonymCache) return synonymCache;
  
  // Try multiple paths since cwd varies between dev and build
  const possiblePaths = [
    path.join(process.cwd(), '..', 'dictionaries', 'curated_synonyms.json'),
    path.join(process.cwd(), 'dictionaries', 'curated_synonyms.json'),
    path.join(process.cwd(), '..', '..', 'dictionaries', 'curated_synonyms.json'),
  ];

  for (const dictPath of possiblePaths) {
    try {
      if (fs.existsSync(dictPath)) {
        const data = fs.readFileSync(dictPath, 'utf-8');
        synonymCache = JSON.parse(data);
        console.log('Loaded synonyms from:', dictPath);
        return synonymCache || {};
      }
    } catch (error) {
      console.error('Failed to load synonyms from:', dictPath, error);
    }
  }

  console.error('Could not find curated_synonyms.json in any expected path. CWD:', process.cwd());
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
