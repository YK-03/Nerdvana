/**
 * queryNormalizer.ts
 *
 * Normalizes query string and resolves canonical aliases.
 */

export interface NormalizedQuery {
  original: string;
  normalized: string;
  canonical: string | null;
  wasAlias: boolean;
}

export const CANONICAL_ALIASES: Record<string, string> = {};

export function normalizeQuery(raw: string): NormalizedQuery {
  const original = raw.trim();
  const normalized = original
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[-_]+/g, " ")
    .replace(/[^a-z0-9\s'":]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const canonical = CANONICAL_ALIASES[normalized] ?? null;

  return {
    original,
    normalized,
    canonical,
    wasAlias: canonical !== null,
  };
}

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^a-z0-9\s:&/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips all non-alphanumeric characters and whitespace for strict identity comparison.
 */
export function cleanAlphanumeric(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export const GENERIC_ALIAS_BLACKLIST = [
  "dark",
  "monster",
  "hero",
  "knight",
  "anime",
  "movie",
  "tv",
  "animated"
];

export function uniqueNormalized(values: unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const text = normalizeText(value);
    if (!text || seen.has(text)) continue;
    if (GENERIC_ALIAS_BLACKLIST.includes(text.toLowerCase())) {
      console.warn("[GENERIC_ALIAS_REJECTED]", text);
      continue;
    }
    seen.add(text);
    normalized.push(text);
  }

  return normalized;
}

export function tokenize(value: string): string[] {
  return uniqueNormalized(value.split(/\s+/)).filter((token) => token.length >= 3);
}
