/**
 * Split text into paragraphs by double newline.
 */
export function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}
