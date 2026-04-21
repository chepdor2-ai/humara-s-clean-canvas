/**
 * Output Profiles
 * Applies post-processing transformations to match a target writing style.
 *
 * Profiles:
 *   blog       — conversational, varied rhythm, rhetorical variety
 *   wikipedia  — encyclopedic neutral register, third-person, no hedging
 *   academic   — formal academic diction, no contractions, no informality
 *   general    — minimal adjustments, preserves natural flow
 *
 * Usage:
 *   const final = applyOutputProfile(humanized, 'blog', domainResult);
 */

import type { Domain } from './domain-detector';

export type OutputProfile = 'blog' | 'wikipedia' | 'academic' | 'general';

// ── Profile detection helper ──────────────────────────────────────────────────

/**
 * Derive an OutputProfile from tone string and engine name.
 * Returns 'general' when no clear signal is present.
 */
export function resolveOutputProfile(
  tone: string | undefined,
  engine: string | undefined,
): OutputProfile {
  if (tone === 'academic_blog') return 'blog';
  if (engine === 'ghost_pro_wiki') return 'wikipedia';
  if (tone === 'academic') return 'academic';
  if (tone === 'casual' || tone === 'simple') return 'blog';
  return 'general';
}

// ── Per-profile transformations ───────────────────────────────────────────────

/** Blog / academic_blog: conversational warmth, varied rhythm */
function applyBlogProfile(text: string, _domain: Domain): string {
  // Replace stiff academic openers with warmer variants
  const openerMap: Array<[RegExp, string]> = [
    [/^Furthermore,\s/m, 'On top of that, '],
    [/^Moreover,\s/m, 'What\'s more, '],
    [/^Additionally,\s/m, 'And notably, '],
    [/^Consequently,\s/m, 'As a result, '],
    [/^Nevertheless,\s/m, 'Even so, '],
    [/^Notwithstanding\s/m, 'Despite that, '],
  ];

  let result = text;
  for (const [re, replacement] of openerMap) {
    result = result.replace(re, replacement);
  }

  // Soften overly formal noun phrases
  result = result
    .replace(/\butilize\b/g, 'use')
    .replace(/\butilization\b/g, 'use')
    .replace(/\bfacilitate\b/g, 'help')
    .replace(/\bleverage\b/g, 'use')
    .replace(/\boptimize\b/g, 'improve')
    .replace(/\bdemonstrates\b/g, 'shows')
    .replace(/\billustrates\b/g, 'shows');

  return result;
}

/** Wikipedia: encyclopedic neutral prose */
function applyWikipediaProfile(text: string, _domain: Domain): string {
  let result = text;

  // Remove first-person constructions
  result = result
    .replace(/\bI (?:believe|think|feel|argue|suggest|consider)\b/gi, 'It is argued')
    .replace(/\bwe (?:can see|observe|note)\b/gi, 'one can observe')
    .replace(/\bin my (?:view|opinion|experience)\b/gi, 'according to some views');

  // Replace informal hedging with neutral encyclopedic phrasing
  result = result
    .replace(/\bIt is (?:important|crucial|essential|critical) to note that\b/gi, 'Notably,')
    .replace(/\bIt should be noted that\b/gi, 'Notably,')
    .replace(/\bInterestingly,\s/gi, '')
    .replace(/\bSurprisingly,\s/gi, '');

  // Expand contractions (encyclopedic prose avoids them)
  result = result
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bdoesn't\b/g, 'does not')
    .replace(/\bisn't\b/g, 'is not')
    .replace(/\baren't\b/g, 'are not')
    .replace(/\bwasn't\b/g, 'was not')
    .replace(/\bweren't\b/g, 'were not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bshouldn't\b/g, 'should not')
    .replace(/\bwouldn't\b/g, 'would not')
    .replace(/\bcouldn't\b/g, 'could not')
    .replace(/\bhadn't\b/g, 'had not')
    .replace(/\bhasn't\b/g, 'has not')
    .replace(/\bhaven't\b/g, 'have not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bthat's\b/g, 'that is')
    .replace(/\bthey're\b/g, 'they are')
    .replace(/\bthey've\b/g, 'they have')
    .replace(/\bthey'd\b/g, 'they would')
    .replace(/\bthey'll\b/g, 'they will');

  return result;
}

/** Academic: formal diction, no contractions */
function applyAcademicProfile(text: string, _domain: Domain): string {
  let result = text;

  // Expand common contractions
  result = result
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bdoesn't\b/g, 'does not')
    .replace(/\bisn't\b/g, 'is not')
    .replace(/\baren't\b/g, 'are not')
    .replace(/\bwasn't\b/g, 'was not')
    .replace(/\bweren't\b/g, 'were not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bshouldn't\b/g, 'should not')
    .replace(/\bwouldn't\b/g, 'would not')
    .replace(/\bcouldn't\b/g, 'could not')
    .replace(/\bhadn't\b/g, 'had not')
    .replace(/\bhasn't\b/g, 'has not')
    .replace(/\bhaven't\b/g, 'have not')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bthat's\b/g, 'that is');

  // Replace casual vocabulary with academic equivalents
  result = result
    .replace(/\ba lot of\b/gi, 'numerous')
    .replace(/\blots of\b/gi, 'numerous')
    .replace(/\bbig\b(?=\s+\w)/gi, 'significant')
    .replace(/\bgot\b(?=\s+(?:a|an|the)\b)/gi, 'obtained')
    .replace(/\bkind of\b/gi, 'somewhat')
    .replace(/\bsort of\b/gi, 'somewhat');

  return result;
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Apply a writing-style output profile to the humanized text.
 *
 * @param text    - Humanized text after all engine passes.
 * @param profile - Target profile ('blog' | 'wikipedia' | 'academic' | 'general').
 * @param domain  - Document domain from detectDomain().
 * @returns       - Text adjusted to match the profile.
 */
export function applyOutputProfile(
  text: string,
  profile: OutputProfile,
  domain: Domain,
): string {
  if (!text || text.trim().length === 0) return text;

  switch (profile) {
    case 'blog':
      return applyBlogProfile(text, domain);
    case 'wikipedia':
      return applyWikipediaProfile(text, domain);
    case 'academic':
      return applyAcademicProfile(text, domain);
    case 'general':
    default:
      return text; // no-op — preserve natural output as-is
  }
}
