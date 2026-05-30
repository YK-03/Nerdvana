/**
 * sanitizeHtml.ts
 * Implements a strict sanitization pipeline for all external descriptions.
 * - Strips HTML tags
 * - Decodes entities
 * - Normalizes whitespace
 * - Truncates safely
 */

export function sanitizeExternalDescription(htmlStr: string | null | undefined, maxLength: number = 400): string {
  if (!htmlStr) return "";

  // 1. Strip HTML tags using regex
  let text = htmlStr.replace(/<[^>]*>?/gm, " ");

  // 2. Decode common HTML entities
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&cent;": "¢",
    "&pound;": "£",
    "&yen;": "¥",
    "&euro;": "€",
    "&copy;": "©",
    "&reg;": "®"
  };

  text = text.replace(/&(amp|lt|gt|quot|#39|apos|nbsp|cent|pound|yen|euro|copy|reg);/g, (match) => {
    return entities[match] || match;
  });
  
  // Try to decode decimal/hex entities as well
  text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  text = text.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

  // 3. Normalize whitespace (remove newlines, extra spaces)
  text = text.replace(/\s+/g, " ").trim();

  // 4. Truncate safely at word boundary
  if (text.length > maxLength) {
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + "...";
    }
    return truncated + "...";
  }

  return text;
}
