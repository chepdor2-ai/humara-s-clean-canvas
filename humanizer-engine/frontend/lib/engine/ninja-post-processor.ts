/**
 * Ninja Post-Processor — Deterministic Non-LLM Phases
 * ====================================================
 * 4 quick cleanup passes run after the LLM pipeline.
 */

/** Phase 1: Fix sentence boundaries, double spaces, hanging punctuation. */
function phase1StructuralCleanup(text: string): string {
  text = text.replace(/\s+/g, " ");
  text = text.replace(/([.?!])\s*([a-z])/g, (_, p, c) => `${p} ${c.toUpperCase()}`);
  text = text.replace(/\s+([,.:;?!])/g, "$1");
  text = text.replace(/\.\. /g, ". ").replace(/\.\./g, ".");
  return text.trim();
}

/** Phase 2: Balance transition words, remove clichés. */
function phase2AcademicStyle(text: string): string {
  const fluff = ["game-changing", "crucial", "leveraging", "in conclusion", "to summarize"];
  for (const word of fluff) {
    text = text.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "");
  }
  text = text.replace(/Furthermore,/g, "In addition,").replace(/Moreover,/g, "Additionally,");
  return text.replace(/\s+/g, " ").trim();
}

/** Phase 3: Trim repetitive phrases locally. */
function phase3ClarityCompression(text: string): string {
  text = text.replace(/due to the fact that/gi, "because");
  text = text.replace(/in order to/gi, "to");
  text = text.replace(/a large number of/gi, "many");
  return text;
}

/** Phase 4: Ensure grammatical consistency, no orphaned bullets. */
function phase4FactAndFormat(text: string): string {
  text = text.replace(/^- /gm, "");
  text = text.replace(/ ,/g, ",").replace(/ \./g, ".");
  return text;
}

/** Run all 4 non-LLM post-processing phases. */
export function executeNinjaNonLlmPhases(text: string): string {
  text = phase1StructuralCleanup(text);
  text = phase2AcademicStyle(text);
  text = phase3ClarityCompression(text);
  text = phase4FactAndFormat(text);
  return text;
}
