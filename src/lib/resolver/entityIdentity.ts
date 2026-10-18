import type { MediaLens } from "../../app/mediaLens.js";

const GENERIC_MEDIA_LABELS: Record<MediaLens, Set<string>> = {
  movies: new Set(["movie", "movies"]),
  tv: new Set(["tv", "television", "show", "shows"]),
  anime: new Set(["anime"]),
  games: new Set(["game", "games", "video game", "video games"]),
  comics: new Set(["comic", "comics", "manga"]),
};

export function normalizeEntityTitle(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGenericMediaLabel(value: unknown, mediaLens: MediaLens): boolean {
  return GENERIC_MEDIA_LABELS[mediaLens].has(normalizeEntityTitle(value));
}

/** Exact identity matching intentionally does not use token overlap. */
export function titlesReferToSameEntity(
  expectedTitle: unknown,
  candidateTitle: unknown,
  aliases: unknown[] = [],
): boolean {
  const expected = normalizeEntityTitle(expectedTitle);
  const candidate = normalizeEntityTitle(candidateTitle);
  if (!expected || !candidate) return false;

  return [expected, ...aliases.map(normalizeEntityTitle)].some(
    (alias) => alias.length > 0 && alias === candidate,
  );
}

export function fallbackIdentityMatches(
  expectedTitle: unknown,
  candidateTitle: unknown,
  mediaLens: MediaLens,
  aliases: unknown[] = [],
): boolean {
  if (isGenericMediaLabel(expectedTitle, mediaLens)) return false;
  return titlesReferToSameEntity(expectedTitle, candidateTitle, aliases);
}
