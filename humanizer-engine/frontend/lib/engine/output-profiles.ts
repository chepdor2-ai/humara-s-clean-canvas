/**
 * Output Profiles
 * Applies post-processing transformations to match a target writing style.
 *
 * Profiles:
 *   blog       — natural flowing blog prose, pre-2010 Wikipedia style, zero AI phrases
 *   wikipedia  — encyclopedic neutral register, third-person, no hedging, no AI vocabulary
 *   academic   — formal academic diction, no contractions, no informality, no AI jargon
 *   general    — universal AI phrase + word sweep, preserves natural flow
 *
 * Usage:
 *   const final = applyOutputProfile(humanized, 'blog', domainResult);
 */

import type { Domain } from './domain-detector';

export type OutputProfile = 'blog' | 'wikipedia' | 'academic' | 'general';

// ── Shared AI phrase killers applied to every profile ────────────────────────

/**
 * Universal AI vocabulary and phrase removal.
 * Runs on ALL profiles — ensures no detector-flagged language survives.
 * Modelled on pre-2010 Wikipedia and older academic article style.
 */
function applyUniversalAIStrip(text: string): string {
  let r = text;

  // ── Phrase-level kills (multi-word patterns first) ──────────────────────
  const phraseKills: Array<[RegExp, string]> = [
    [/\bit is important to note that\s*/gi, ''],
    [/\bit is worth noting that\s*/gi, ''],
    [/\bit should be noted that\s*/gi, ''],
    [/\bit must be noted that\s*/gi, ''],
    [/\bit is (?:clear|evident|apparent|obvious) that\s*/gi, ''],
    [/\bit goes without saying (?:that\s*)?/gi, ''],
    [/\bneedless to say,?\s*/gi, ''],
    [/\bwithout a doubt,?\s*/gi, ''],
    [/\bthere is no doubt that\s*/gi, ''],
    [/\bof course,?\s*/gi, ''],
    [/\bnaturally,?\s*/gi, ''],
    [/\bin today'?s (?:world|society|landscape|era|age|environment|digital age)\b/gi, 'today'],
    [/\bin the (?:modern|current|contemporary|present-day|digital) (?:era|age|world|landscape)\b/gi, 'today'],
    [/\bin an (?:ever-changing|ever-evolving|rapidly changing|fast-paced) (?:world|landscape)\b/gi, 'today'],
    [/\bever-(?:changing|evolving|growing)\b/gi, 'changing'],
    [/\brapidly (?:evolving|changing|advancing)\b/gi, 'changing'],
    [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|central|major|essential) role in\b/gi, 'is central to'],
    [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|central|major|essential) role\b/gi, 'matters'],
    [/\bhas a (?:significant|major|profound|substantial|considerable|direct) (?:impact|effect|influence) on\b/gi, 'affects'],
    [/\bcannot be overstated\b/gi, 'matters greatly'],
    [/\bof (?:paramount|critical|crucial|vital) importance\b/gi, 'very important'],
    [/\ba (?:wide|broad|vast|diverse|rich|extensive) (?:range|array|spectrum|variety|selection) of\b/gi, 'many'],
    [/\ba (?:plethora|myriad|multitude|wealth|abundance|profusion) of\b/gi, 'many'],
    [/\ban? (?:growing|increasing|mounting|emerging) body of (?:evidence|research|literature|work|data)\b/gi, 'more research'],
    [/\bdue to the fact that\b/gi, 'because'],
    [/\bowing to the fact that\b/gi, 'because'],
    [/\bby virtue of the fact that\b/gi, 'because'],
    [/\bgiven the fact that\b/gi, 'since'],
    [/\bfirst and foremost\b/gi, 'first'],
    [/\beach and every\b/gi, 'every'],
    [/\bin summary,?\s*/gi, 'overall, '],
    [/\bto summarize,?\s*/gi, 'in short, '],
    [/\bin conclusion,?\s*/gi, 'overall, '],
    [/\bto conclude,?\s*/gi, 'overall, '],
    [/\ball in all,?\s*/gi, 'overall, '],
    [/\btaken together,?\s*/gi, 'overall, '],
    [/\bultimately,?\s*/gi, 'in the end, '],
    [/\bat the end of the day\b/gi, 'in the end'],
    [/\blast but not least,?\s*/gi, 'also, '],
    [/\bthat being said,?\s*/gi, 'still, '],
    [/\bhaving said that,?\s*/gi, 'still, '],
    [/\bwith that in mind,?\s*/gi, 'given that, '],
    [/\bin other words,?\s*/gi, 'put simply, '],
    [/\bto put it (?:simply|plainly|differently|another way),?\s*/gi, 'simply put, '],
    [/\bto elaborate(?:,)?\s*/gi, 'to explain, '],
    [/\bas (?:mentioned|discussed|noted|stated|described|explained) (?:earlier|above|previously|before)\b/gi, 'as noted'],
    [/\bas (?:previously|earlier|already) (?:mentioned|stated|discussed|noted)\b/gi, 'as noted'],
    [/\bthis (?:goes|serves) to (?:show|illustrate|demonstrate)\b/gi, 'this shows'],
    [/\bthis (?:essay|article|blog|blog post|paper|piece|post|section|chapter|report) (?:will|aims to|seeks to) (?:discuss|explore|examine|cover|address|analyze|present)\b/gi, ''],
    [/\ballow me to (?:explain|discuss|outline|present|explore)\b/gi, 'to explain:'],
    [/\blet(?:'?s| us) (?:explore|discuss|examine|look at|consider|dive into|delve into)\b/gi, 'looking at'],
    [/\bwe (?:can|will|shall|should) (?:examine|explore|discuss|consider|look at|see)\b/gi, 'looking at'],
    [/\bas we (?:can |)(?:see|observe|note|explore|discuss)\b/gi, 'as seen'],
    [/\bwhen we (?:look at|consider|examine|think about)\b/gi, 'looking at'],
    [/\binterestingly(?:,| enough,)?\s*/gi, ''],
    [/\bsurprisingly(?:,| enough,)?\s*/gi, ''],
    [/\bremarkably(?:,)?\s*/gi, ''],
    [/\bstrikingly(?:,)?\s*/gi, ''],
    [/\btruly\s+(?=(?:important|valuable|remarkable|significant|meaningful|vital|crucial|essential))/gi, ''],
    [/\bserves? as a (?:testament|reminder|catalyst|cornerstone|foundation|beacon|symbol)\b/gi, 'shows'],
    [/\bsheds? light on\b/gi, 'clarifies'],
    [/\bpaves? the way (?:for|to)\b/gi, 'enables'],
    [/\bdelves? (?:deep |deeply )?into\b/gi, 'examines'],
    [/\bdives? (?:deep |deeply )?into\b/gi, 'examines'],
    [/\bnot only (.{5,80}?) but also\b/gi, '$1 and also'],
    [/\b(?:this|these) (?:findings?|results?|data|studies) (?:suggest|indicate|demonstrate|reveal|show|confirm|highlight) that\b/gi, 'this shows that'],
    [/\bstudies (?:have |)(?:shown|demonstrated|found|indicated|revealed) that\b/gi, 'research shows that'],
    [/\bmoving forward\b/gi, 'from here'],
    [/\bgoing forward\b/gi, 'from here'],
    [/\bwhen it comes to\b/gi, 'regarding'],
    [/\bin terms of\b/gi, 'in'],
    [/\bhas the potential to\b/gi, 'could'],
    [/\bhave the potential to\b/gi, 'could'],
    [/\bthe fact that\b/gi, 'that'],
    [/\bcutting-edge\b/gi, 'advanced'],
    [/\bstate-of-the-art\b/gi, 'advanced'],
    [/\bthought-provoking\b/gi, 'interesting'],
    [/\bgame-changing\b/gi, 'important'],
    [/\bseamlessly\b/gi, 'smoothly'],
    [/\bempow(?:er|ers|ered|ering)\b/gi, 'enable'],
    [/\bempowerment\b/gi, 'ability'],
    [/\bthought leader(?:s|ship)?\b/gi, 'expert'],
    [/\bsynerg(?:y|ies|ize|istic)\b/gi, 'combined effort'],
    [/\bhighlight(?:s|ed|ing)?\b/gi, 'show'],
    [/\bshowcase[sd]?\b/gi, 'show'],
    [/\bunderscore[sd]?\b/gi, 'show'],
    [/\bexemplif(?:y|ies|ied|ying)\b/gi, 'show'],
    [/\bellucidates?\b/gi, 'explains'],
    [/\billuminates?\b/gi, 'shows'],
    [/\bencompass(?:es|ed|ing)?\b/gi, 'include'],
    [/\bcatalyz(?:e|es|ed|ing)\b/gi, 'drive'],
    [/\bspearhead(?:s|ed|ing)?\b/gi, 'lead'],
    [/\bgarner(?:s|ed|ing)?\b/gi, 'get'],
    [/\benhance[sd]?\b/gi, 'improve'],
    [/\bbolster(?:s|ed|ing)?\b/gi, 'support'],
    [/\bfoster(?:s|ed|ing)?\b/gi, 'support'],
    [/\butili[sz](?:e|es|ed|ing)\b/gi, 'use'],
    [/\bleverag(?:e|es|ed|ing)\b/gi, 'use'],
    [/\bfacilitat(?:e|es|ed|ing)\b/gi, 'help'],
    [/\boptimi[sz](?:e|es|ed|ing)\b/gi, 'improve'],
    [/\brobust\b/gi, 'strong'],
    [/\bimpactful\b/gi, 'important'],
    [/\bparadigm(?:atic|s)?\b/gi, 'model'],
    [/\bsynergize[sd]?\b/gi, 'combine'],
    [/\bholistic(?:ally)?\b/gi, 'complete'],
    [/\bseamless\b/gi, 'smooth'],
    [/\btransformative\b/gi, 'significant'],
    [/\btransformational\b/gi, 'significant'],
    [/\blandscape\b/gi, 'field'],
    [/\bpivotal\b/gi, 'important'],
    [/\bcrucial\b/gi, 'important'],
    [/\bgroundbreaking\b/gi, 'pioneering'],
    [/\bnuanced?\b/gi, 'detailed'],
    [/\binherent(?:ly)?\b/gi, 'natural'],
    [/\boverarching\b/gi, 'main'],
    [/\bfundamental(?:ly)?\b(?=\s+(?:to|in|for|aspect|principle|concept|change|shift|role))/gi, 'important'],
  ];

  for (const [pattern, replacement] of phraseKills) {
    r = r.replace(pattern, (match, ...groups) => {
      let rep = replacement;
      for (let i = 0; i < groups.length; i++) {
        if (typeof groups[i] === 'string') rep = rep.replace(`$${i + 1}`, groups[i]);
      }
      if (!rep) return '';
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase() && rep[0] === rep[0].toLowerCase()) {
        return rep[0].toUpperCase() + rep.slice(1);
      }
      return rep;
    });
  }

  // Clean up double spaces from removed phrases
  r = r.replace(/ {2,}/g, ' ');
  r = r.replace(/\.\s{2,}/g, '. ');
  r = r.replace(/,\s{2,}/g, ', ');
  r = r.trim();
  return r;
}

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

/**
 * Blog: naturally flowing prose, pre-2010 Wikipedia / older blog style.
 * No AI buzzwords, no marketing jargon, no hedging filler.
 * Direct, varied sentences; reads like a well-written personal article.
 */
function applyBlogProfile(text: string, _domain: Domain): string {
  // First strip all universal AI phrases
  let result = applyUniversalAIStrip(text);

  // Replace stiff formal openers with natural alternatives
  const openerMap: Array<[RegExp, string]> = [
    [/^Furthermore,\s/gm, 'Also, '],
    [/^Moreover,\s/gm, 'Also, '],
    [/^Additionally,\s/gm, 'Also, '],
    [/^Consequently,\s/gm, 'Because of this, '],
    [/^Nevertheless,\s/gm, 'Still, '],
    [/^Nonetheless,\s/gm, 'Still, '],
    [/^Notwithstanding\s/gm, 'Despite this, '],
    [/^Subsequently,\s/gm, 'After that, '],
    [/^Therefore,\s/gm, 'So, '],
    [/^Thus,\s/gm, 'So, '],
    [/^Hence,\s/gm, 'So, '],
    [/^Accordingly,\s/gm, 'So, '],
    [/^Indeed,\s/gm, 'In fact, '],
    [/^Notably,\s/gm, 'Worth noting, '],
    [/^Significantly,\s/gm, 'Importantly, '],
    [/^Evidently,\s/gm, 'Clearly, '],
    [/^Undoubtedly,\s/gm, 'Clearly, '],
    [/^Undeniably,\s/gm, 'Clearly, '],
    [/^Crucially,\s/gm, 'Importantly, '],
    [/^Essentially,\s/gm, 'In practice, '],
    [/^Fundamentally,\s/gm, 'At its core, '],
    [/^Arguably,\s/gm, 'Some would say '],
    [/^Importantly,\s/gm, 'Worth noting, '],
    [/^Specifically,\s/gm, 'In particular, '],
  ];

  for (const [re, replacement] of openerMap) {
    result = result.replace(re, replacement);
  }

  // Expand contractions — pre-2010 blog style avoids them in body text
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
    .replace(/\bthat's\b/g, 'that is')
    .replace(/\bthey're\b/g, 'they are')
    .replace(/\bthey've\b/g, 'they have')
    .replace(/\bthey'd\b/g, 'they would')
    .replace(/\bthey'll\b/g, 'they will')
    .replace(/\bwe're\b/g, 'we are')
    .replace(/\bwe've\b/g, 'we have')
    .replace(/\bwe'll\b/g, 'we will')
    .replace(/\byou're\b/g, 'you are')
    .replace(/\byou've\b/g, 'you have')
    .replace(/\byou'll\b/g, 'you will')
    .replace(/\bwho's\b/g, 'who is')
    .replace(/\bwhat's\b/g, 'what is')
    .replace(/\bwhere's\b/g, 'where is');

  return result;
}

/** Wikipedia: encyclopedic neutral prose, pre-2010 style */
function applyWikipediaProfile(text: string, _domain: Domain): string {
  // First strip all universal AI phrases
  let result = applyUniversalAIStrip(text);

  // Remove first-person constructions
  result = result
    .replace(/\bI (?:believe|think|feel|argue|suggest|consider)\b/gi, 'It is argued')
    .replace(/\bwe (?:can see|observe|note)\b/gi, 'one can observe')
    .replace(/\bin my (?:view|opinion|experience)\b/gi, 'according to some views');

  // Expand contractions (encyclopedic prose never uses them)
  const contractionMap: Array<[RegExp, string]> = [
    [/\bcan't\b/g, 'cannot'], [/\bdon't\b/g, 'do not'], [/\bdoesn't\b/g, 'does not'],
    [/\bisn't\b/g, 'is not'], [/\baren't\b/g, 'are not'], [/\bwasn't\b/g, 'was not'],
    [/\bweren't\b/g, 'were not'], [/\bwon't\b/g, 'will not'], [/\bshouldn't\b/g, 'should not'],
    [/\bwouldn't\b/g, 'would not'], [/\bcouldn't\b/g, 'could not'], [/\bhadn't\b/g, 'had not'],
    [/\bhasn't\b/g, 'has not'], [/\bhaven't\b/g, 'have not'], [/\bit's\b/g, 'it is'],
    [/\bthat's\b/g, 'that is'], [/\bthey're\b/g, 'they are'], [/\bthey've\b/g, 'they have'],
    [/\bthey'd\b/g, 'they would'], [/\bthey'll\b/g, 'they will'], [/\bwe're\b/g, 'we are'],
    [/\bwe've\b/g, 'we have'], [/\bwe'll\b/g, 'we will'], [/\bwho's\b/g, 'who is'],
    [/\bwhat's\b/g, 'what is'], [/\bwhere's\b/g, 'where is'],
  ];
  for (const [re, rep] of contractionMap) result = result.replace(re, rep);

  return result;
}

/** Academic: formal diction, no contractions, no AI jargon */
function applyAcademicProfile(text: string, _domain: Domain): string {
  // First strip all universal AI phrases
  let result = applyUniversalAIStrip(text);

  // Expand contractions
  const contractionMap: Array<[RegExp, string]> = [
    [/\bcan't\b/g, 'cannot'], [/\bdon't\b/g, 'do not'], [/\bdoesn't\b/g, 'does not'],
    [/\bisn't\b/g, 'is not'], [/\baren't\b/g, 'are not'], [/\bwasn't\b/g, 'was not'],
    [/\bweren't\b/g, 'were not'], [/\bwon't\b/g, 'will not'], [/\bshouldn't\b/g, 'should not'],
    [/\bwouldn't\b/g, 'would not'], [/\bcouldn't\b/g, 'could not'], [/\bhadn't\b/g, 'had not'],
    [/\bhasn't\b/g, 'has not'], [/\bhaven't\b/g, 'have not'], [/\bit's\b/g, 'it is'],
    [/\bthat's\b/g, 'that is'],
  ];
  for (const [re, rep] of contractionMap) result = result.replace(re, rep);

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
      // For 'general', still strip universal AI phrases so every output is clean
      return applyUniversalAIStrip(text);
  }
}

