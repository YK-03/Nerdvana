export interface ParsedProviderId {
  provider: string | null;
  resourceType: string | null;
  id: string;
  original: string;
}

export const VALID_PROVIDER_PREFIXES = [
  "comicvine",
  "tmdb",
  "rawg",
  "igdb",
  "jikan",
  "anilist",
  "googlebooks",
] as const;

export type ValidProviderPrefix = typeof VALID_PROVIDER_PREFIXES[number];

/**
 * Validates whether an identifier is an external upstream provider ID
 * (e.g. "igdb::game::1234", "tmdb::movie::496243") versus an internal
 * topology ID (e.g. "Gaming::...", "Marvel::...", "DC::...").
 */
export function isExternalProviderId(identifier: string | null | undefined): boolean {
  if (!identifier || typeof identifier !== "string") return false;
  return /^(comicvine|tmdb|rawg|igdb|jikan|anilist|googlebooks)::/.test(identifier);
}

/**
 * Parses a unified provider ID string (e.g. "tmdb::movie::496243") into its constituent parts.
 * If the string does not match the expected format, it gracefully falls back.
 */
export function parseProviderId(identifier: string | null | undefined): ParsedProviderId {
  if (!identifier) {
    return { provider: null, resourceType: null, id: "", original: "" };
  }

  const parts = identifier.split("::");
  
  if (parts.length === 3) {
    return {
      provider: parts[0],
      resourceType: parts[1],
      id: parts[2],
      original: identifier
    };
  }

  // Fallback for non-standard or partial IDs
  return {
    provider: parts.length > 0 ? parts[0] : null,
    resourceType: parts.length > 1 ? parts[1] : null,
    id: parts.length > 2 ? parts[2] : identifier,
    original: identifier
  };
}

/**
 * Extracts just the raw ID portion from a unified provider ID string.
 * Equivalent to the old extractProviderId helper.
 */
export function extractRawId(identifier: string | null | undefined): string | null {
  if (!identifier) return null;
  const parts = identifier.split("::");
  if (parts.length === 3) return parts[2];
  return identifier;
}

/**
 * Extracts the namespace (provider) from a unified provider ID string.
 */
export function extractNamespace(identifier: string | null | undefined): string | null {
  if (!identifier) return null;
  return identifier.split("::")[0] || null;
}
