/**
 * Style Memory Module — ported from style_memory.py
 * Stores and retrieves statistical writing fingerprints.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// Keep runtime file tracing scoped to frontend/data for Turbopack builds.
function findDictDir(): string {
  return join(process.cwd(), "data");
}

const DICT_DIR = findDictDir();
const PROFILES_PATH = join(DICT_DIR, "style_profiles.json");

export interface PunctuationRates {
  semicolons_per_1k: number;
  colons_per_1k: number;
  dashes_per_1k: number;
}

export interface StyleProfile {
  name: string;
  description: string;
  avg_sentence_length: number;
  sentence_length_std: number;
  hedging_rate: number;
  clause_density: number;
  passive_voice_rate: number;
  lexical_diversity: number;
  avg_paragraph_length: number;
  punctuation_rates: PunctuationRates;
}

export function createDefaultProfile(name: string): StyleProfile {
  return {
    name,
    description: "",
    avg_sentence_length: 22.0,
    sentence_length_std: 8.0,
    hedging_rate: 0.18,
    clause_density: 1.4,
    passive_voice_rate: 0.20,
    lexical_diversity: 0.62,
    avg_paragraph_length: 4.5,
    punctuation_rates: {
      semicolons_per_1k: 2.5,
      colons_per_1k: 1.8,
      dashes_per_1k: 1.2,
    },
  };
}

export function profileSummaryText(profile: StyleProfile): string {
  const pr = profile.punctuation_rates;
  return (
    `Target style profile (${profile.name}):\n` +
    `- Average sentence length: ~${profile.avg_sentence_length.toFixed(0)} words (std ≈ ${profile.sentence_length_std.toFixed(0)})\n` +
    `- Hedging rate: ~${(profile.hedging_rate * 100).toFixed(0)}% of sentences\n` +
    `- Clause density: ~${profile.clause_density.toFixed(1)} clauses/sentence\n` +
    `- Passive voice: ~${(profile.passive_voice_rate * 100).toFixed(0)}% of sentences\n` +
    `- Lexical diversity (TTR): ~${profile.lexical_diversity.toFixed(2)}\n` +
    `- Paragraph length: ~${profile.avg_paragraph_length.toFixed(1)} sentences\n` +
    `- Semicolons: ~${pr.semicolons_per_1k.toFixed(1)}/1k words\n` +
    `- Colons: ~${pr.colons_per_1k.toFixed(1)}/1k words\n` +
    `- Dashes: ~${pr.dashes_per_1k.toFixed(1)}/1k words`
  );
}

const BUILTIN_PROFILES: StyleProfile[] = [
  {
    name: "academic_2005",
    description: "Pre-2010 journal article style: long sentences, heavy hedging, formal",
    avg_sentence_length: 28.0, sentence_length_std: 10.0,
    hedging_rate: 0.25, clause_density: 1.8,
    passive_voice_rate: 0.30, lexical_diversity: 0.65,
    avg_paragraph_length: 5.0,
    punctuation_rates: { semicolons_per_1k: 3.2, colons_per_1k: 2.0, dashes_per_1k: 0.8 },
  },
  {
    name: "academic_2010",
    description: "2010-era journal: moderate length, balanced hedging, some variation",
    avg_sentence_length: 24.0, sentence_length_std: 9.0,
    hedging_rate: 0.20, clause_density: 1.5,
    passive_voice_rate: 0.22, lexical_diversity: 0.63,
    avg_paragraph_length: 4.5,
    punctuation_rates: { semicolons_per_1k: 2.5, colons_per_1k: 1.8, dashes_per_1k: 1.2 },
  },
  {
    name: "journal_natural",
    description: "Natural social-science journal prose: varied rhythm, moderate formality",
    avg_sentence_length: 22.0, sentence_length_std: 8.5,
    hedging_rate: 0.18, clause_density: 1.3,
    passive_voice_rate: 0.18, lexical_diversity: 0.60,
    avg_paragraph_length: 4.0,
    punctuation_rates: { semicolons_per_1k: 2.0, colons_per_1k: 1.5, dashes_per_1k: 1.5 },
  },
  {
    name: "thesis_formal",
    description: "Formal thesis/dissertation style: longer paragraphs, high formality",
    avg_sentence_length: 26.0, sentence_length_std: 11.0,
    hedging_rate: 0.22, clause_density: 1.6,
    passive_voice_rate: 0.28, lexical_diversity: 0.64,
    avg_paragraph_length: 6.0,
    punctuation_rates: { semicolons_per_1k: 2.8, colons_per_1k: 2.2, dashes_per_1k: 0.6 },
  },
  {
    name: "accessible_academic",
    description: "Readable academic style: shorter sentences, less hedging, clearer",
    avg_sentence_length: 18.0, sentence_length_std: 6.0,
    hedging_rate: 0.12, clause_density: 1.1,
    passive_voice_rate: 0.12, lexical_diversity: 0.58,
    avg_paragraph_length: 3.5,
    punctuation_rates: { semicolons_per_1k: 1.0, colons_per_1k: 1.2, dashes_per_1k: 2.0 },
  },
];

export class StyleMemory {
  profiles: Map<string, StyleProfile> = new Map();

  constructor() {
    this.load();
  }

  private load(): void {
    let loaded = false;
    if (existsSync(PROFILES_PATH)) {
      try {
        const data: StyleProfile[] = JSON.parse(readFileSync(PROFILES_PATH, "utf-8"));
        for (const item of data) {
          this.profiles.set(item.name, item);
        }
        loaded = true;
      } catch {
        // ignore
      }
    }
    if (!loaded) {
      for (const item of BUILTIN_PROFILES) {
        this.profiles.set(item.name, item);
      }
    }
  }

  save(): void {
    mkdirSync(dirname(PROFILES_PATH), { recursive: true });
    const data = [...this.profiles.values()];
    writeFileSync(PROFILES_PATH, JSON.stringify(data, null, 2), "utf-8");
  }

  get(name: string): StyleProfile | undefined {
    return this.profiles.get(name);
  }

  getDefault(): StyleProfile {
    return this.profiles.get("academic_2010") ?? BUILTIN_PROFILES[1];
  }

  listNames(): string[] {
    return [...this.profiles.keys()];
  }

  selectForTone(tone: string): StyleProfile {
    const toneMap: Record<string, string> = {
      academic: "academic_2005",
      professional: "academic_2010",
      neutral: "journal_natural",
      simple: "accessible_academic",
    };
    const name = toneMap[tone] ?? "journal_natural";
    return this.profiles.get(name) ?? this.getDefault();
  }
}

let _instance: StyleMemory | null = null;

export function getStyleMemory(): StyleMemory {
  if (!_instance) _instance = new StyleMemory();
  return _instance;
}
