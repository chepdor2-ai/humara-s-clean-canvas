/**
 * Context Analyzer — ported from context_analyzer.py
 * Pre-scans input text for topic, protected terms, entities, tone.
 * Uses compromise.js instead of spaCy for NER.
 */

import nlp from "compromise";

const DOMAIN_TERMS: string[] = [
  "artificial intelligence", "machine learning", "deep learning", "neural network",
  "natural language processing", "computer vision", "climate change", "global warming",
  "greenhouse gas", "carbon emissions", "renewable energy", "fossil fuels",
  "mental health", "public health", "health care", "social media",
  "economic growth", "income inequality", "sustainable development", "human rights",
  "data privacy", "cyber security", "block chain", "quantum computing",
  "gene editing", "stem cell", "clinical trial", "peer review",
  "supply chain", "monetary policy", "fiscal policy", "trade deficit",
  "foreign policy", "civil society", "democratic governance", "rule of law",
  "cultural heritage", "social mobility", "gender equality", "racial discrimination",
  "biodiversity loss", "ecosystem services", "carbon footprint", "circular economy",
  "digital transformation", "internet of things", "cloud computing", "big data",
  "higher education", "primary education", "secondary education", "vocational training",
  "critical thinking", "problem solving", "decision making", "risk assessment",
  "evidence based", "peer reviewed", "cross sectional", "longitudinal study",
  "case study", "meta analysis", "systematic review", "randomized controlled",
  "standard deviation", "confidence interval", "statistical significance", "sample size",
  "gross domestic product", "purchasing power", "consumer price", "unemployment rate",
  "interest rate", "exchange rate", "balance of payments", "current account",
  "world health organization", "united nations", "world bank", "international monetary fund",
  "european union", "african union", "association of southeast asian nations",
];

const ALWAYS_PROTECT = new Set([
  "AI", "GDP", "UN", "EU", "WHO", "IMF", "NATO", "NASA",
  "DNA", "RNA", "HIV", "AIDS", "CEO", "CFO", "CTO", "NGO",
  "IoT", "API", "URL", "SQL", "CPU", "GPU", "RAM", "SSD",
  "STEM", "OECD", "OPEC", "ASEAN", "BRICS", "WTO",
]);

const TOPIC_KEYWORDS: Record<string, string[]> = {
  technology: ["technology", "digital", "software", "hardware", "algorithm", "data", "computing", "internet", "cyber", "automation"],
  environment: ["environment", "climate", "pollution", "ecosystem", "biodiversity", "sustainability", "carbon", "renewable", "conservation", "ecology"],
  education: ["education", "learning", "teaching", "school", "university", "curriculum", "student", "academic", "literacy", "pedagogy"],
  health: ["health", "medical", "disease", "treatment", "patient", "clinical", "therapy", "diagnosis", "pharmaceutical", "wellness"],
  economics: ["economy", "economic", "market", "trade", "finance", "investment", "inflation", "monetary", "fiscal", "commerce"],
  politics: ["political", "government", "policy", "democracy", "legislation", "governance", "election", "parliament", "constitution", "sovereignty"],
  society: ["social", "society", "community", "cultural", "demographic", "inequality", "justice", "welfare", "migration", "urbanization"],
  science: ["science", "research", "experiment", "hypothesis", "theory", "empirical", "methodology", "observation", "laboratory", "analysis"],
};

export interface TextContext {
  topics: string[];
  primaryTopic: string;
  tone: string;
  protectedTerms: Set<string>;
  namedEntities: Set<string>;
  domainBigrams: Set<string>;
  wordFreq: Map<string, number>;
  avgSentenceLength: number;
  totalWords: number;
  hasFirstPerson: boolean;
}

export function analyze(text: string): TextContext {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z']+/g) ?? [];
  const totalWords = words.length;

  // Word frequency
  const wordFreq = new Map<string, number>();
  for (const w of words) {
    wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }

  // Topic detection
  const topicScores: Record<string, number> = {};
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > 0) topicScores[topic] = score;
  }
  const topics = Object.entries(topicScores)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  const primaryTopic = topics[0] ?? "general";

  // Named entities via compromise
  const doc = nlp(text);
  const namedEntities = new Set<string>();
  doc.people().forEach((m: any) => namedEntities.add(m.text()));
  doc.places().forEach((m: any) => namedEntities.add(m.text()));
  doc.organizations().forEach((m: any) => namedEntities.add(m.text()));

  // Protected terms
  const protectedTerms = new Set<string>([...ALWAYS_PROTECT, ...namedEntities]);

  // Domain bigrams
  const domainBigrams = new Set<string>();
  for (const term of DOMAIN_TERMS) {
    if (lower.includes(term)) {
      domainBigrams.add(term);
      // Protect multi-word domain terms
      protectedTerms.add(term);
    }
  }

  // Frequency-based protection (words appearing 3+ times)
  for (const [w, count] of wordFreq) {
    if (count >= 3 && w.length > 4) {
      protectedTerms.add(w);
    }
  }

  // Sentence stats
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const avgSentenceLength =
    sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length
      : 0;

  // First person detection
  const firstPersonMarkers = new Set(["i", "me", "my", "mine", "myself", "we", "us", "our", "ours"]);
  const hasFirstPerson = words.some((w) => firstPersonMarkers.has(w));

  // Tone detection (heuristic with academic, casual, persuasive markers)
  const ACADEMIC_MARKERS = new Set([
    "furthermore", "moreover", "consequently", "nevertheless", "notwithstanding",
    "empirically", "theoretically", "methodology", "hypothesis", "peer-reviewed",
    "scholarly", "corpus", "paradigm", "framework", "discourse", "ontological",
    "epistemological", "heuristic", "axiom", "postulate",
  ]);
  const CASUAL_MARKERS = new Set([
    "gonna", "wanna", "kinda", "basically", "like",
    "awesome", "cool", "stuff", "things", "guys", "okay", "ok",
    "super", "really", "honestly",
  ]);
  const PERSUASIVE_MARKERS = new Set([
    "must", "should", "crucial", "essential", "imperative",
    "vital", "urgent", "demand", "require", "advocate", "compel",
    "undeniable", "indisputable", "unquestionable",
  ]);

  let tone = "neutral";
  const academicCount = words.filter((w) => ACADEMIC_MARKERS.has(w)).length;
  const casualCount = words.filter((w) => CASUAL_MARKERS.has(w)).length;
  const persuasiveCount = words.filter((w) => PERSUASIVE_MARKERS.has(w)).length;
  if (lower.includes("pretty much") || lower.includes("lot of") || lower.includes("tons of")) {
    // Boost casual count for multi-word markers
    // casualCount already checked individual words; just use it
  }
  const maxTone = Math.max(academicCount, casualCount, persuasiveCount);
  if (maxTone > 0) {
    if (academicCount === maxTone && academicCount > casualCount + 1) tone = "formal";
    else if (casualCount === maxTone && casualCount > academicCount + 1) tone = "casual";
    else if (persuasiveCount === maxTone && persuasiveCount > 2) tone = "persuasive";
  }

  return {
    topics,
    primaryTopic,
    tone,
    protectedTerms,
    namedEntities,
    domainBigrams,
    wordFreq,
    avgSentenceLength,
    totalWords,
    hasFirstPerson,
  };
}

/** Check if a single word should NOT be synonym-swapped. */
export function isProtected(ctx: TextContext, word: string): boolean {
  return ctx.protectedTerms.has(word.toLowerCase());
}

/** Check if word at position pos is part of a protected compound term. */
export function spanOverlapsCompound(ctx: TextContext, text: string, word: string, pos: number): boolean {
  const window = text.slice(Math.max(0, pos - 40), pos + word.length + 40).toLowerCase();
  for (const term of ctx.domainBigrams) {
    if (window.includes(term)) {
      const wl = word.toLowerCase();
      if (term.split(/\s+/).includes(wl)) {
        return true;
      }
    }
  }
  return false;
}
