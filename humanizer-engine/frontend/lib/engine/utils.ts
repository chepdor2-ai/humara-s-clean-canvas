/**
 * NLP Utility Functions — ported from utils.py
 * Uses compromise.js instead of spaCy/NLTK for POS tagging, tokenization, NER.
 */

import nlp from "compromise";
import * as rules from "./rules";
import { getDictionary } from "./dictionary";

// ── Real word validation cache ──

const realWordCache = new Map<string, boolean>();

function isRealWord(word: string): boolean {
  if (realWordCache.has(word)) return realWordCache.get(word)!;
  // Quick reject: words with obviously broken suffix patterns
  // e.g., "reductioning", "indicationed", "awarenesses", "managementing", "dataed"
  const lower = word.toLowerCase();
  if (/(?:tion|sion|ment|ness|ance|ence|ship)(?:ing|ed|s|tion|ment|ize)$/i.test(lower) &&
      !['mentioned', 'mentioned', 'sentenced', 'commenced', 'experienced', 'evidenced',
        'referenced', 'influenced', 'silenced', 'fenced', 'balanced', 'financed',
        'advancing', 'announcing', 'bouncing', 'dancing', 'enhancing', 'financing',
        'shipping', 'mentioning', 'sentencing', 'commencing'].includes(lower)) {
    realWordCache.set(word, false);
    return false;
  }
  // Reject doubled suffixes
  if (/(?:tioned|tioning|sioned|sioning|mented|menting|nessed|nessing|shiped)$/i.test(lower) &&
      !['mentioned', 'mentioning', 'augmented', 'augmenting', 'commented', 'commenting',
        'documented', 'documenting', 'experimented', 'experimenting', 'implemented', 'implementing',
        'supplemented', 'supplementing', 'complimented', 'complimenting', 'cemented', 'cementing',
        'lamented', 'lamenting', 'fermented', 'fermenting', 'tormented', 'tormenting',
        'segmented', 'segmenting', 'fragmented', 'fragmenting',
        'ornamented', 'complemented', 'complementing'].includes(lower)) {
    realWordCache.set(word, false);
    return false;
  }
  // Reject words ending in -aed, -ued + ed patterns (dataed, issuesd, etc.)
  if (/(?:ata|ue|ia)(?:ed|ing)$/.test(lower) && !['continued', 'continuing', 'valued', 'valuing',
    'argued', 'arguing', 'issued', 'issuing', 'pursued', 'pursuing', 'rescued', 'rescuing',
    'created', 'creating', 'dated', 'dating', 'updated', 'updating'].includes(lower)) {
    realWordCache.set(word, false);
    return false;
  }
  try {
    const d = getDictionary();
    const result = d.isValidWord(word);
    realWordCache.set(word, result);
    return result;
  } catch {
    realWordCache.set(word, true); // If we can't check, allow it
    return true;
  }
}

// ── Sentence tokenization (replaces NLTK sent_tokenize) ──

export function sentTokenize(text: string): string[] {
  // Normalize: replace single line breaks (mid-sentence) with spaces,
  // but preserve paragraph breaks (double line breaks)
  const normalized = text
    .replace(/\n\s*\n/g, '|||PARAGRAPH|||') // Mark paragraph breaks
    .replace(/\n/g, ' ')                     // Remove single line breaks
    .replace(/\s+/g, ' ')                     // Collapse multiple spaces
    .replace(/\|\|\|PARAGRAPH\|\|\|/g, '\n\n'); // Restore paragraph breaks
  
  const doc = nlp(normalized);
  const sentences: string[] = [];
  doc.sentences().forEach((s: any) => {
    const t = s.text().trim();
    if (t) sentences.push(t);
  });
  if (sentences.length === 0 && normalized.trim()) {
    // Fallback: regex split
    return normalized
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return sentences;
}

// ── Word tokenization (replaces NLTK word_tokenize) ──

export function wordTokenize(text: string): string[] {
  // Keep ⟦PROTn⟧ placeholders as single tokens (Unicode brackets U+27E6/U+27E7)
  return text.match(/\u27E6[^\u27E7]*\u27E7|[\w']+|[^\s\w]/g) ?? [];
}

// ── POS tag mapping (NLTK tags → our categories) ──

const POS_MAP: Record<string, string> = {
  Adjective: "adj",
  Noun: "noun",
  Verb: "verb",
  Adverb: "adv",
};

interface TaggedWord {
  word: string;
  tag: string; // "adj" | "noun" | "verb" | "adv" | ""
}

export function posTag(text: string): TaggedWord[] {
  const doc = nlp(text);
  const result: TaggedWord[] = [];
  doc.terms().forEach((term: any) => {
    const word = term.text();
    const tags = term.json()?.[0]?.tags ?? [];
    let mapped = "";
    for (const t of tags) {
      if (POS_MAP[t]) {
        mapped = POS_MAP[t];
        break;
      }
    }
    result.push({ word, tag: mapped });
  });
  return result;
}

// ── Protected spans (citations, acronyms, years) ──

export function findProtectedSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const pat of rules.PROTECTED_PATTERNS) {
    const re = new RegExp(pat.source, pat.flags.includes("g") ? pat.flags : pat.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  return spans;
}

function isInProtectedSpan(pos: number, spans: [number, number][]): boolean {
  return spans.some(([start, end]) => pos >= start && pos < end);
}

// ── Syllable counter ──

export function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/e$/, "");
  const vowels = "aeiouy";
  let count = 0;
  let prevVowel = false;
  for (const ch of w) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  return Math.max(1, count);
}

// ── Re-inflect a word (add -s, -ed, -ing suffixes) ──

function endsWithDoubleConsonant(word: string): boolean {
  if (word.length < 2) return false;
  const last = word[word.length - 1];
  const secondLast = word[word.length - 2];
  const consonants = "bcdfghjklmnpqrstvwxyz";
  return consonants.includes(last) && consonants.includes(secondLast);
}

function isCVC(word: string): boolean {
  if (word.length < 3) return false;
  const vowels = "aeiou";
  const last = word[word.length - 1];
  const secondLast = word[word.length - 2];
  const thirdLast = word[word.length - 3];
  return (
    !"aeiou".includes(last) &&
    vowels.includes(secondLast) &&
    !"aeiou".includes(thirdLast) &&
    !["w", "x", "y"].includes(last)
  );
}

// Irregular verb forms — prevents "becomed", "goed", "runned", etc.
const IRREGULAR_PAST: Record<string, string> = {
  become: "became", come: "came", run: "ran", give: "gave", go: "went",
  do: "did", see: "saw", take: "took", make: "made", get: "got",
  have: "had", know: "knew", think: "thought", find: "found", tell: "told",
  say: "said", speak: "spoke", write: "wrote", read: "read", begin: "began",
  break: "broke", bring: "brought", build: "built", buy: "bought",
  catch: "caught", choose: "chose", draw: "drew", drink: "drank",
  drive: "drove", eat: "ate", fall: "fell", feel: "felt", fight: "fought",
  fly: "flew", forget: "forgot", freeze: "froze", grow: "grew",
  hang: "hung", hear: "heard", hide: "hid", hold: "held", keep: "kept",
  lay: "laid", lead: "led", leave: "left", lend: "lent", let: "let",
  lie: "lay", lose: "lost", mean: "meant", meet: "met", pay: "paid",
  put: "put", ride: "rode", ring: "rang", rise: "rose", seek: "sought",
  sell: "sold", send: "sent", set: "set", shake: "shook", shine: "shone",
  shoot: "shot", show: "showed", shut: "shut", sing: "sang", sit: "sat",
  sleep: "slept", slide: "slid", spend: "spent", stand: "stood",
  steal: "stole", stick: "stuck", strike: "struck", swim: "swam",
  swing: "swung", teach: "taught", tear: "tore", throw: "threw",
  understand: "understood", wake: "woke", wear: "wore", win: "won",
  withdraw: "withdrew",
};

const IRREGULAR_PARTICIPLE: Record<string, string> = {
  become: "become", come: "come", run: "run", give: "given", go: "gone",
  do: "done", see: "seen", take: "taken", make: "made", get: "gotten",
  have: "had", know: "known", think: "thought", find: "found", tell: "told",
  say: "said", speak: "spoken", write: "written", read: "read", begin: "begun",
  break: "broken", bring: "brought", build: "built", buy: "bought",
  catch: "caught", choose: "chosen", draw: "drawn", drink: "drunk",
  drive: "driven", eat: "eaten", fall: "fallen", feel: "felt", fight: "fought",
  fly: "flown", forget: "forgotten", freeze: "frozen", grow: "grown",
  hang: "hung", hear: "heard", hide: "hidden", hold: "held", keep: "kept",
  lay: "laid", lead: "led", leave: "left", lend: "lent", let: "let",
  lie: "lain", lose: "lost", mean: "meant", meet: "met", pay: "paid",
  put: "put", ride: "ridden", ring: "rung", rise: "risen", seek: "sought",
  sell: "sold", send: "sent", set: "set", shake: "shaken", shine: "shone",
  shoot: "shot", show: "shown", shut: "shut", sing: "sung", sit: "sat",
  sleep: "slept", slide: "slid", spend: "spent", stand: "stood",
  steal: "stolen", stick: "stuck", strike: "struck", swim: "swum",
  swing: "swung", teach: "taught", tear: "torn", throw: "thrown",
  understand: "understood", wake: "woken", wear: "worn", win: "won",
  withdraw: "withdrawn",
};

export function reInflect(base: string, suffix: string): string {
  const lower = base.toLowerCase();
  if (!suffix) return base;

  // Handle irregular verbs for past tense
  if (suffix === "ed") {
    const irregular = IRREGULAR_PAST[lower];
    if (irregular) {
      // Preserve original capitalization
      if (base[0] === base[0].toUpperCase()) return irregular[0].toUpperCase() + irregular.slice(1);
      return irregular;
    }
  }

  if (suffix === "s") {
    if (lower.endsWith("s") || lower.endsWith("x") || lower.endsWith("z") ||
        lower.endsWith("sh") || lower.endsWith("ch")) {
      return base + "es";
    }
    if (lower.endsWith("y") && lower.length > 1 && !"aeiou".includes(lower[lower.length - 2])) {
      return base.slice(0, -1) + "ies";
    }
    return base + "s";
  }

  if (suffix === "ed") {
    if (lower.endsWith("e")) return base + "d";
    if (lower.endsWith("y") && lower.length > 1 && !"aeiou".includes(lower[lower.length - 2])) {
      return base.slice(0, -1) + "ied";
    }
    if (isCVC(lower) && lower.length <= 4) {
      return base + base[base.length - 1] + "ed";
    }
    return base + "ed";
  }

  if (suffix === "ing") {
    if (lower.endsWith("ie")) return base.slice(0, -2) + "ying";
    if (lower.endsWith("e") && !lower.endsWith("ee")) return base.slice(0, -1) + "ing";
    if (isCVC(lower) && lower.length <= 4) {
      return base + base[base.length - 1] + "ing";
    }
    return base + "ing";
  }

  return base + suffix;
}

// ── Rejoin tokens (fix space before punctuation) ──

export function rejoinTokens(tokens: string[]): string {
  if (tokens.length === 0) return "";
  let result = tokens[0];
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/^[.,;:!?)\]}"'\u27E7]/.test(tok)) {
      result += tok;
    } else if (/[(\[{"'\u27E6]$/.test(result)) {
      result += tok;
    } else {
      result += " " + tok;
    }
  }
  return result;
}

// ── Synonym replace (POS-aware) ──

export function synonymReplace(
  sentence: string,
  intensity: number,
  usedWords: Set<string>,
  protectedExtra?: Set<string> | null,
): string {
  const rate = Math.min(rules.SYNONYM_RATE * intensity, 0.85);
  const protectedSpans = findProtectedSpans(sentence);
  const tagged = posTag(sentence);
  const tokens = wordTokenize(sentence);

  // Build word→tag map
  const tagMap = new Map<string, string>();
  for (const t of tagged) {
    tagMap.set(t.word.toLowerCase(), t.tag);
  }

  const newTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const stripped = tok.replace(/^[.,;:!?"'()\[\]{}]+|[.,;:!?"'()\[\]{}]+$/g, "");
    const lower = stripped.toLowerCase();

    // Skip protected words
    if (
      rules.PROTECTED_WORDS.has(lower) ||
      stripped.length <= 2 ||
      usedWords.has(lower) ||
      protectedExtra?.has(lower)
    ) {
      newTokens.push(tok);
      continue;
    }

    // Skip words in multi-word capitalized titles (e.g., "Chief Marketing Officer")
    if (/^[A-Z]/.test(stripped) && stripped.length > 2) {
      const prevTok = i > 0 ? tokens[i - 1].replace(/[^a-zA-Z]/g, "") : "";
      const nextTok = i < tokens.length - 1 ? tokens[i + 1].replace(/[^a-zA-Z]/g, "") : "";
      if ((prevTok && /^[A-Z]/.test(prevTok)) || (nextTok && /^[A-Z]/.test(nextTok))) {
        newTokens.push(tok);
        continue;
      }
    }

    // Skip protected spans
    const tokStart = sentence.indexOf(tok);
    if (tokStart >= 0 && isInProtectedSpan(tokStart, protectedSpans)) {
      newTokens.push(tok);
      continue;
    }

    // Random skip based on rate
    if (Math.random() > rate) {
      newTokens.push(tok);
      continue;
    }

    // Try synonym replacement
    let candidates = rules.SYNONYM_BANK[lower] ?? [];
    let lemmaUsed = false;

    // Lemma-stripping fallback: try common suffix stripping to find base form
    if (!candidates || candidates.length === 0) {
      const suffixMap: [string, string][] = [
        ["ies", "y"], ["ves", "fe"], ["ses", "se"], ["es", "e"],
        ["es", ""], ["s", ""], ["ing", ""], ["ing", "e"],
        ["ed", ""], ["ed", "e"], ["tion", "te"], ["ly", ""],
      ];
      for (const [suffix, replacement] of suffixMap) {
        if (lower.endsWith(suffix) && lower.length > suffix.length + 2) {
          const base = lower.slice(0, -suffix.length) + replacement;
          const baseCandidates = rules.SYNONYM_BANK[base];
          if (baseCandidates && baseCandidates.length > 0) {
            candidates = baseCandidates;
            lemmaUsed = true;
            break;
          }
        }
      }
    }

    if (!candidates || candidates.length === 0) {
      newTokens.push(tok);
      continue;
    }

    // Blacklist: synonyms that are real words but terrible replacements
    // These come from thesaurus entries that are technically related but produce garbled text
    const SYNONYM_BLACKLIST = new Set([
      "caller", "calling", "selling", "flunk", "lesson", "handler",
      "societal", "communal", "assort", "principally", "checker",
      "pleader", "roomer", "settler", "capper", "shaker", "sayer",
      "boss", "wearable", "covering", "tactical", "falling",
      "public", "amend", "planned", "calculated", "construction",
      "substance", "direction", "understandings",
      "quartet", "pity", "associate", "topics", "interplays",
      "advance", "hurdles", "dropping", "dealings",
      "vesture", "coating", "specially", "understanding",
      "interplay", "appraising", "dialogues",
      "earn", "quatern", "concluded", "wearable",
      "transfers", "main",
      "center", "eve", "tactics",
      "lotion", "prosody", "primer", "ticker", "cosmos",
      "formation", "winner", "clean", "maker", "backer",
      "tract", "genesis", "heed", "craft", "deed",
      "lodge", "patch", "file", "register", "post",
      "terminal", "cabinet", "chamber", "trunk", "cell",
      "organ", "press", "plant", "stock", "draft",
      "bark", "pool", "court", "match", "spring",
      "seal", "mold", "cast", "strain", "plot",
      "master", "hindrances", "principally",
      "mentation", "cogitation", "bettor",
      "rivet", "centre", "link",
    ]);

    // Filter candidates: no multi-word, not already used, not same sentence collision, not blacklisted
    const sentWords = new Set(
      sentence.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z']/g, "")),
    );
    const valid = candidates.filter(
      (c) => !c.includes(" ") && !usedWords.has(c.toLowerCase()) && !sentWords.has(c.toLowerCase())
             && !SYNONYM_BLACKLIST.has(c.toLowerCase()),
    );
    if (valid.length === 0) {
      newTokens.push(tok);
      continue;
    }

    let replacement = valid[Math.floor(Math.random() * valid.length)];

    // POS guard: skip replacement if POS category clearly mismatches
    const origTag = tagMap.get(lower);
    if (origTag && (origTag === "noun" || origTag === "verb")) {
      const replDoc = nlp(replacement);
      const replJson = replDoc.json();
      if (replJson.length > 0 && replJson[0].terms?.length > 0) {
        const replTags: string[] = replJson[0].terms[0].tags || [];
        const replIsNoun = replTags.includes("Noun");
        const replIsVerb = replTags.includes("Verb");
        if (origTag === "noun" && replIsVerb && !replIsNoun) {
          newTokens.push(tok);
          continue;
        }
        if (origTag === "verb" && replIsNoun && !replIsVerb) {
          newTokens.push(tok);
          continue;
        }
      }
    }

    // If lemma was used, re-inflect the replacement
    if (lemmaUsed) {
      const suffix = lower.endsWith("ing") ? "ing" : lower.endsWith("ed") ? "ed" :
        lower.endsWith("s") ? "s" : "";
      if (suffix) {
        const inflected = reInflect(replacement, suffix);
        if (isRealWord(inflected)) {
          replacement = inflected;
        } else {
          newTokens.push(tok);
          continue;
        }
      }
    }

    // Preserve casing
    if (stripped[0] === stripped[0].toUpperCase() && stripped[0] !== stripped[0].toLowerCase()) {
      replacement = replacement[0].toUpperCase() + replacement.slice(1);
    }

    // Preserve surrounding punctuation
    const prefix = tok.slice(0, tok.indexOf(stripped));
    const suffix = tok.slice(tok.indexOf(stripped) + stripped.length);

    newTokens.push(prefix + replacement + suffix);
    usedWords.add(lower);
    usedWords.add(replacement.toLowerCase());
  }

  return rejoinTokens(newTokens);
}

// ── Phrase substitute ──

export function phraseSubstitute(sentence: string, intensity: number): string {
  const rate = Math.min(rules.PHRASE_RATE * intensity, 0.95);
  let result = sentence;

  for (const phrase of rules.SORTED_PHRASE_KEYS) {
    const idx = result.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx === -1) continue;
    if (Math.random() > rate) continue;

    // Skip if preceded by an auxiliary verb (e.g., "have played a crucial role"
    // → replacing with "was instrumental" would produce "have was instrumental")
    const AUX_VERBS = new Set([
      "have", "has", "had", "will", "would", "could", "should",
      "must", "can", "may", "might", "shall", "been", "be",
    ]);
    const beforePhrase = result.slice(0, idx).trimEnd();
    const prevWord = beforePhrase.split(/\s+/).pop()?.toLowerCase() ?? "";
    if (AUX_VERBS.has(prevWord)) continue;

    const alternatives = rules.PHRASE_SUBSTITUTIONS[phrase];
    if (!alternatives || alternatives.length === 0) continue;

    const replacement = alternatives[Math.floor(Math.random() * alternatives.length)];
    const original = result.slice(idx, idx + phrase.length);

    // Preserve case of first character
    let finalReplacement = replacement;
    if (
      original[0] === original[0].toUpperCase() &&
      replacement[0] === replacement[0].toLowerCase()
    ) {
      finalReplacement = replacement[0].toUpperCase() + replacement.slice(1);
    }

    result = result.slice(0, idx) + finalReplacement + result.slice(idx + phrase.length);
  }

  return result;
}

// ── Replace AI starters ──

export function replaceAiStarters(sentence: string): string {
  const lowerSent = sentence.toLowerCase();
  for (const [starter, replacements] of Object.entries(rules.AI_STARTER_REPLACEMENTS)) {
    if (lowerSent.startsWith(starter.toLowerCase())) {
      const replacement = replacements[Math.floor(Math.random() * replacements.length)];
      return replacement + sentence.slice(starter.length);
    }
  }
  return sentence;
}

// ── Restructure sentence (clause swap) ──

export function restructureSentence(sentence: string, intensity: number = 1.0): string {
  if (Math.random() > rules.RESTRUCTURE_RATE * intensity) return sentence;

  // Don't restructure sentences with 3+ commas (likely lists)
  const commaCount = (sentence.match(/,/g) || []).length;
  if (commaCount >= 3) return sentence;

  const CLAUSE_VERBS = /\b(?:is|are|was|were|has|have|had|does|do|did|will|would|can|could|should|may|might|must|seems?|appears?|involves?|requires?|suggests?|shows?|provides?|leads?|plays?|helps?|makes?)\b/i;

  const conjunctions = [", and ", ", but ", ", yet ", ", so "];
  for (const conj of conjunctions) {
    const idx = sentence.indexOf(conj);
    if (idx > 0 && idx < sentence.length - conj.length - 5) {
      const part1 = sentence.slice(0, idx);
      const part2 = sentence.slice(idx + conj.length);
      if (part1.split(" ").length >= 4 && part2.split(" ").length >= 4
        && CLAUSE_VERBS.test(part1) && CLAUSE_VERBS.test(part2)) {
        // Capitalize part2, lowercase part1 end
        const newPart2 = part2[0].toUpperCase() + part2.slice(1);
        const newPart1 = part1[0].toLowerCase() + part1.slice(1);
        return newPart2.replace(/\.$/, "") + conj + newPart1 + (sentence.endsWith(".") ? "." : "");
      }
    }
  }
  return sentence;
}

// ── Connector variation ──

const CONNECTOR_ALTERNATIVES: Record<string, string[]> = {
  "However, ": ["That said, ", "Still, ", "Yet, ", "Even so, "],
  "Therefore, ": ["As such, ", "For this reason, ", "Hence, "],
  "Furthermore, ": ["In addition, ", "Beyond this, ", "Also, "],
  "Moreover, ": ["What is more, ", "On top of this, ", "Besides, "],
  "Additionally, ": ["Also, ", "On top of this, ", "Besides, "],
  "Nevertheless, ": ["Even so, ", "Despite this, ", "All the same, "],
  "Consequently, ": ["As a result, ", "Because of this, ", "Due to this, "],
  "Subsequently, ": ["After that, ", "In turn, ", "Following this, "],
};

export function varyConnectors(sentence: string): string {
  for (const [connector, alts] of Object.entries(CONNECTOR_ALTERNATIVES)) {
    if (sentence.startsWith(connector)) {
      if (Math.random() < 0.5) {
        const alt = alts[Math.floor(Math.random() * alts.length)];
        return alt + sentence.slice(connector.length);
      }
    }
  }
  return sentence;
}

// ── Make burstier (vary sentence lengths) ──

export function makeBurstier(
  sentences: string[],
  targetBurstiness: number = rules.BURSTINESS_TARGET,
): string[] {
  if (sentences.length < 3) return sentences;

  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  const currentBurstiness = mean > 0 ? stdDev / mean : 0;

  if (currentBurstiness >= targetBurstiness) return sentences;

  // Need more variance — try splitting long sentences or merging short ones
  const result = [...sentences];

  // Helper: check if text looks like a clause (contains a verb)
  const CLAUSE_VERBS = /\b(?:is|are|was|were|has|have|had|does|do|did|will|would|can|could|should|may|might|must|shall|seems?|appears?|becomes?|remains?|involves?|requires?|suggests?|shows?|demonstrates?|provides?|leads?|plays?|helps?|makes?|takes?|gives?)\b/i;

  for (let i = 0; i < result.length; i++) {
    const words = result[i].split(/\s+/);
    if (words.length > 25 && Math.random() < 0.4) {
      // Don't split sentences with 3+ commas (likely lists)
      const commaCount = (result[i].match(/,/g) || []).length;
      if (commaCount >= 3) continue;

      // Split at a comma
      const mid = Math.floor(words.length / 2);
      for (let offset = 0; offset < Math.min(5, mid); offset++) {
        let didSplit = false;
        for (const pos of [mid + offset, mid - offset]) {
          if (pos > 0 && pos < words.length && words[pos - 1].endsWith(",")) {
            const part1 = words.slice(0, pos).join(" ");
            const part2 = words.slice(pos).join(" ");
            // Verify both parts look like clauses (contain a verb)
            if (!CLAUSE_VERBS.test(part1) || !CLAUSE_VERBS.test(part2)) continue;
            // Skip if part2 starts with a conjunction (list continuation)
            if (/^(?:and|or|but|nor|yet)\b/i.test(part2.trim())) continue;
            const cap2 = part2[0].toUpperCase() + part2.slice(1);
            result.splice(i, 1, part1, cap2);
            didSplit = true;
            break;
          }
        }
        if (didSplit) break;
      }
    }
  }

  return result;
}
