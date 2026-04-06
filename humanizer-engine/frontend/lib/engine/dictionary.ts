/**
 * Smart Semantic Dictionary — ported from dictionary.py
 * Multi-source synonym lookup: curated → thesaurus → fallback
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

// Resolve dictionary directory: try multiple possible locations
function findDictDir(): string {
  const candidates = [
    join(process.cwd(), "..", "dictionaries"),       // frontend/ as cwd
    join(process.cwd(), "dictionaries"),               // humanizer-engine/ as cwd
    resolve(__dirname, "..", "..", "..", "..", "dictionaries"), // relative to this file
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]; // fallback
}

const DICT_DIR = findDictDir();

// ═══ ACADEMIC INPUT GUARD ═══
// Words that must NEVER be replaced by thesaurus synonyms.
// The mega_thesaurus.jsonl is a raw WordNet dump that maps these to wrong senses:
//   analysis → psychoanalysis, pair → mating, null → nada, truancy → hooky, etc.
export const ACADEMIC_INPUT_GUARD = new Set([
  // Statistics & Research
  "hypothesis", "hypotheses", "null", "alternative", "statistical", "statistically",
  "significance", "significant", "mean", "median", "mode", "variance", "deviation",
  "sample", "population", "parameter", "coefficient", "correlation", "regression",
  "anova", "p-value", "alpha", "confidence", "interval", "probability", "distribution",
  "independent", "dependent", "variable", "control", "experimental", "randomized",
  "qualitative", "quantitative", "empirical", "methodology", "observation",
  "validity", "reliability", "sampling", "inferential", "descriptive",
  "predictor", "outcome", "criterion", "covariate", "confounding", "moderator",
  "mediator", "effect", "power", "threshold", "operationalize",
  // Academic Writing
  "dissertation", "thesis", "abstract", "introduction", "conclusion",
  "citation", "reference", "manuscript", "scholarly", "academic", "discourse",
  "premise", "argument", "proposition", "assertion", "postulate", "axiom",
  "theorem", "corollary", "inference", "deduction", "induction",
  // Terms with dangerous thesaurus synonyms
  "analysis", "analyze", "analyzed", "analyzing", "analytical",
  "pair", "paired", "pairing", "pairs",
  "parental", "maternal", "paternal", "familial",
  "truancy", "truant", "absenteeism", "attendance",
  "testing", "test", "tested", "examination", "examine",
  "rate", "rates", "level", "levels", "group", "groups",
  "relationship", "association", "comparison", "compare",
  "difference", "different", "effect", "effects", "measure", "measurement",
  "determine", "assessment", "evaluate", "evaluation", "identification",
  "indicate", "indication", "involvement", "requirement",
  "intervention", "prevention", "program", "curriculum",
  // Education & Social Science
  "student", "teacher", "faculty", "school", "district", "enrollment",
  "participant", "respondent", "survey", "questionnaire",
  "socioeconomic", "demographic", "cohort",
  // Sensitive identity/social terms — thesaurus gives wrong-sense synonyms
  "ethnic", "ethnicity", "racial", "minority", "minorities",
  "indigenous", "gender", "sexuality", "disability", "religion",
  // Health
  "clinical", "diagnosis", "prognosis", "treatment", "therapy",
  "patient", "symptom", "pathology", "etiology", "epidemiology",
  "prevalence", "incidence", "morbidity", "mortality", "placebo",
  // Business, Accounting & Cybersecurity
  "risk", "risks", "management", "accounting", "cybersecurity", "cyber",
  "phishing", "breach", "breaches", "intrusion", "intrusions",
  "encryption", "governance", "compliance", "audit", "auditing",
  "financial", "payroll", "tax", "revenue", "budget", "fiscal",
  "stakeholder", "stakeholders", "resilience", "transparency",
  "vulnerability", "vulnerabilities", "exposure", "threat", "threats",
  "access", "authentication", "authorization", "credential", "credentials",
  "confidentiality", "integrity", "availability",
  "process", "processes", "processing", "system", "systems",
  "implement", "implementation", "framework", "frameworks",
  "component", "essential", "organizations", "organization",
  "information", "data", "security", "controls",
  // Math & Science
  "equation", "formula", "function", "algorithm", "computation",
  "molecule", "atom", "electron", "protein", "genome",
]);

interface ThesaurusEntry {
  word: string;
  synonyms: string[];
}

export class HumanizerDictionary {
  private safeWords: Set<string> = new Set();
  private curated: Map<string, string[]> = new Map();
  thesaurus: Map<string, string[]> = new Map();
  private synonymsCache: Map<string, string[]> = new Map();
  private wordValidityCache: Map<string, boolean> = new Map();

  constructor() {
    this.loadSafeWords();
    this.loadCurated();
    this.loadThesaurus();
  }

  private loadSafeWords(): void {
    // Try mega dictionary first (619K+ words)
    const megaPath = join(DICT_DIR, "mega_dictionary.json");
    if (existsSync(megaPath)) {
      try {
        const data = JSON.parse(readFileSync(megaPath, "utf-8"));
        if (typeof data === "object" && data !== null) {
          for (const key of Object.keys(data)) {
            this.safeWords.add(key.toLowerCase());
          }
          return;
        }
      } catch { /* ignore */ }
    }

    // Fallback: words_dictionary.json
    const jsonPath = join(DICT_DIR, "words_dictionary.json");
    if (existsSync(jsonPath)) {
      try {
        const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
        if (typeof data === "object" && data !== null) {
          for (const key of Object.keys(data)) {
            this.safeWords.add(key.toLowerCase());
          }
          return;
        }
      } catch { /* ignore */ }
    }

    // Fallback: words_alpha.txt
    const txtPath = join(DICT_DIR, "words_alpha.txt");
    if (existsSync(txtPath)) {
      try {
        const lines = readFileSync(txtPath, "utf-8").split("\n");
        for (const line of lines) {
          const w = line.trim().toLowerCase();
          if (w) this.safeWords.add(w);
        }
      } catch { /* ignore */ }
    }
  }

  private loadCurated(): void {
    const path = join(DICT_DIR, "curated_synonyms.json");
    if (!existsSync(path)) return;
    try {
      const data: Record<string, string[]> = JSON.parse(readFileSync(path, "utf-8"));
      for (const [word, syns] of Object.entries(data)) {
        this.curated.set(word.toLowerCase(), syns);
      }
    } catch {
      // ignore
    }
  }

  private loadThesaurus(): void {
    // Load both thesaurus files and merge
    for (const filename of ["mega_thesaurus.jsonl", "en_thesaurus.jsonl"]) {
      const path = join(DICT_DIR, filename);
      if (!existsSync(path)) continue;
      try {
        const lines = readFileSync(path, "utf-8").split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry: ThesaurusEntry = JSON.parse(line);
            const word = entry.word?.toLowerCase();
            if (!word) continue;
            // Lowercase all synonyms (matches Python: s.lower())
            const syns = entry.synonyms.map((s) => s.toLowerCase());
            const existing = this.thesaurus.get(word);
            if (existing) {
              const merged = [...new Set([...existing, ...syns])];
              this.thesaurus.set(word, merged);
            } else {
              this.thesaurus.set(word, syns);
            }
          } catch {
            continue;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  getSynonyms(word: string, maxReturn: number = 8, qualityFilter: boolean = true): string[] {
      const lower = word.toLowerCase();
      const cacheKey = `${lower}_${qualityFilter}`;
      const cached = this.synonymsCache.get(cacheKey);
      if (cached) return cached;

      const synonyms = new Set<string>();

      // Source 1: Curated dictionary (highest priority)
      const curatedSyns = this.curated.get(lower);
      if (curatedSyns) {
        for (const s of curatedSyns) synonyms.add(s);
      }

      // Source 2: Thesaurus — use as fallback when curated didn't have this word
      if (synonyms.size === 0) {
        const thesaurusSyns = this.thesaurus.get(lower);
        if (thesaurusSyns) {
          for (const s of thesaurusSyns) synonyms.add(s);
        }
      }

      // Filter: only keep valid words if quality filter enabled
      let result: string[];
      if (qualityFilter && this.safeWords.size > 0) {
        result = [...synonyms].filter((s) => s !== lower && this.isValidWord(s));
      } else {
        synonyms.delete(lower); // never return the word itself
        result = [...synonyms];
      }

      result = result.slice(0, maxReturn);
      this.synonymsCache.set(cacheKey, result);
      return result;
    }

  replaceWordSmartly(
    word: string,
    context: string,
    avoidWords?: Set<string>,
  ): string {
    const lower = word.toLowerCase();
    const avoid = avoidWords ?? new Set<string>();

    // ═══ ACADEMIC TERM GUARD ═══
    // These words must NEVER be replaced — thesaurus gives wrong-sense synonyms
    // e.g., "analysis" → "psychoanalysis", "pair" → "mating", "null" → "nada"
    if (ACADEMIC_INPUT_GUARD.has(lower)) return word;

    // Use getContextualSynonyms (matches Python: self.get_contextual_synonyms)
    const synonyms = this.getContextualSynonyms(lower, context, 5);
    if (synonyms.length === 0) return word;

    // Words that produce nonsensical output when used as replacements
    const REPLACEMENT_BLOCKLIST = new Set([
      "chassis", "unitedly", "limitless", "lonely", "reply", "retrieve",
      "apparatus", "contrivance", "contraption", "gizmo", "gadget", "doohickey",
      "thingamajig", "whatchamacallit", "doodad", "bric-a-brac", "knickknack",
      "habitation", "domicile", "abode", "dwellings", "lodgings", "berth",
      "vessel", "conduit", "receptacle", "repository", "depository",
      "chiefly", "principally", "predominantly", "preponderantly",
      "hitherto", "heretofore", "henceforth", "therein", "thereof", "hereby",
      "whilst", "amongst", "betwixt", "ere", "whence", "forthwith",
      "corporeal", "ethereal", "ephemeral", "nascent", "cognizant",
      "ameliorate", "expunge", "promulgate", "adjudicate", "pontificate",
      "obfuscate", "prognosticate", "remunerate", "conflagration",
      "perambulate", "masticate", "regurgitate", "cogitate",
      "veritably", "assuredly", "indubitably", "irrefutably",
      // Wrong-sense synonyms that cause nonsensical academic output
      "rotation", "coiffure", "torah", "blow", "exact", "connector",
      "grade", "translation", "target", "quest", "ordinance",
      "surfaced", "yielded", "upgraded", "generated", "resettled",
      "moveded", "leded", "dumpeded", "create",
      "manpower", "context", "emphasis", "worries", "ecological",
      "commodities", "substituted", "fabrication", "manufacture",
      "congregate", "procure", "commence", "terminate", "disseminate",
      "enumerate", "elucidate", "delineate", "perpetuate", "exacerbate",
      // Round 2: more wrong-sense synonyms from test output
      "gyration", "pentateuch", "barren", "connecter", "followers",
      "volunteer", "invite", "site", "scene", "domain", "devoid",
      "agitate", "bettor", "onetime", "diverge", "grooming",
      "coiffure", "focussed", "sizable", "overpopulated", "poll",
      // Round 3: thesaurus wrong-sense synonyms caught in truancy paper
      "psychoanalysis", "depth psychology", "analytic thinking",
      "hooky", "nada", "zilch", "zippo", "naught", "nil", "nix",
      "goose egg", "cipher", "cypher", "aught",
      "mating", "copulate", "copulation", "mate", "intercourse",
      "mingy", "miserly", "meanspirited", "bastardly", "beggarly",
      "hateful", "ungenerous",
      "supposition", "surmisal", "surmise", "hypothecate",
      "enate", "enatic", "agnate", "agnatic",
      "speculation", "conjecture", "guess", "guessing", "guesswork",
      "screening", "appraisal",
      // Wrong-sense identity/religion synonyms
      "pagan", "heathen", "infidel", "gentile", "tribal",
      // Offensive/archaic wrong-sense synonyms
      "quislingism", "quisling", "collaborationism", "treachery",
      "sedition", "subversion", "servility", "subjugation",
      "sycophant", "toady", "lackey", "minion",
    ]);

    // Filter out avoided words, multi-word synonyms, blocked words, and validate
    const candidates = synonyms.filter(
      (s) =>
        !s.includes(" ") &&
        s.toLowerCase() !== lower &&
        !avoid.has(s.toLowerCase()) &&
        !REPLACEMENT_BLOCKLIST.has(s.toLowerCase()) &&
        !ACADEMIC_INPUT_GUARD.has(s.toLowerCase()) &&
        this.isValidWord(s),
    );

    if (candidates.length === 0) return word;

    // Prefer synonyms with similar length to original word, pick from top 3
    candidates.sort((a, b) => Math.abs(a.length - lower.length) - Math.abs(b.length - lower.length));
    const topN = candidates.slice(0, Math.min(3, candidates.length));
    return topN[Math.floor(Math.random() * topN.length)];
  }

  isValidWord(word: string): boolean {
    const lower = word.toLowerCase();
    const cached = this.wordValidityCache.get(lower);
    if (cached !== undefined) return cached;

    // Check against safe words
    let valid = this.safeWords.has(lower) || this.safeWords.size === 0;

    // Fallback: accept basic alphabetic tokens if no safe words loaded
    if (!valid && this.safeWords.size === 0) {
      valid = /^[a-z]+$/i.test(lower);
    }

    this.wordValidityCache.set(lower, valid);
    return valid;
  }

  getContextualSynonyms(word: string, sentence: string, maxReturn: number = 5): string[] {
      // Get wider pool then score by context relevance
      const synonyms = this.getSynonyms(word, maxReturn * 3);
      if (synonyms.length === 0) return [];

      // Extract context words from the sentence (excluding the target word)
      const contextWords = new Set(
        sentence.toLowerCase().split(/\s+/)
          .map(w => w.replace(/[^a-z]/g, ""))
          .filter(w => w.length > 3 && w !== word.toLowerCase())
      );

      // Score each synonym by how many of its own synonyms overlap with context words
      const scored: [string, number][] = synonyms.map(syn => {
        const synSynonyms = this.getSynonyms(syn, 10, false);
        let score = 0;
        // Prefer synonyms whose own synonyms appear in the sentence context
        for (const ss of synSynonyms) {
          if (contextWords.has(ss.toLowerCase())) score += 2;
        }
        // Prefer synonyms with similar length to original word
        const lenDiff = Math.abs(syn.length - word.length);
        if (lenDiff <= 1) score += 2;
        else if (lenDiff <= 3) score += 1;
        else if (lenDiff > 5) score -= 2;
        // Penalize very long words
        if (syn.length > 10) score -= 1;
        return [syn, score] as [string, number];
      });

      // Sort by score descending, then take top N
      scored.sort((a, b) => b[1] - a[1]);
      return scored.slice(0, maxReturn).map(([s]) => s);
    }
}

// Singleton
let _instance: HumanizerDictionary | null = null;

export function getDictionary(): HumanizerDictionary {
  if (!_instance) {
    _instance = new HumanizerDictionary();
  }
  return _instance;
}
