const DETECTOR_DOMAIN_RULES: Array<{ pattern: RegExp; domain: string }> = [
  { pattern: /gptzero/i, domain: "gptzero.me" },
  { pattern: /turnitin/i, domain: "turnitin.com" },
  { pattern: /originality/i, domain: "originality.ai" },
  { pattern: /copyleaks/i, domain: "copyleaks.com" },
  { pattern: /winston/i, domain: "gowinston.ai" },
  { pattern: /zerogpt/i, domain: "zerogpt.com" },
  { pattern: /sapling/i, domain: "sapling.ai" },
  { pattern: /writer/i, domain: "writer.com" },
  { pattern: /crossplag/i, domain: "crossplag.com" },
  { pattern: /content\s*at\s*scale|contentatscale/i, domain: "contentatscale.ai" },
  { pattern: /content\s*detector/i, domain: "contentdetector.ai" },
  { pattern: /smodin/i, domain: "smodin.io" },
  { pattern: /hive/i, domain: "hivemoderation.com" },
  { pattern: /surfer/i, domain: "surferseo.com" },
  { pattern: /quillbot/i, domain: "quillbot.com" },
  { pattern: /grammarly/i, domain: "grammarly.com" },
  { pattern: /scribbr/i, domain: "scribbr.com" },
  { pattern: /pangram/i, domain: "pangram.com" },
  { pattern: /roberta/i, domain: "huggingface.co" },
  { pattern: /openai|gpt-?2\s*output\s*detector|gpt2\s*output\s*detector/i, domain: "openai.com" },
  { pattern: /stealth\s*detector/i, domain: "humaragpt.com" },
];

function normalizeDetectorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getDetectorDomain(name: string): string {
  const normalized = normalizeDetectorName(name);
  const matched = DETECTOR_DOMAIN_RULES.find((rule) => rule.pattern.test(normalized));
  return matched?.domain ?? "humaragpt.com";
}

export function getDetectorIconUrl(name: string, size = 64): string {
  const domain = getDetectorDomain(name);
  // Always fetch 64px minimum for crisp rendering at any display size
  const safeSize = Math.max(64, Math.min(256, Math.round(size * 2)));
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${safeSize}`;
}

export function getDetectorInitials(name: string): string {
  const normalized = normalizeDetectorName(name);
  if (!normalized) return "AI";

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0] ?? "A"}${words[1][0] ?? "I"}`.toUpperCase();
}
