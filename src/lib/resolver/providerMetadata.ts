export type ComicProviderType =
  | "character"
  | "volume"
  | "issue"
  | "event"
  | "story_arc"
  | "team"
  | "publisher"
  | "universe";

export type ProviderType =
  | ComicProviderType
  | "movie"
  | "tv"
  | "anime"
  | "game"
  | "book";

export type ProviderName =
  | "tmdb"
  | "jikan"
  | "igdb"
  | "comicvine"
  | "googlebooks"
  | "anilist"
  | "rawg";

export type ProviderMetadata = {
  provider: ProviderName;
  id: string | number;
  confidence: number;
  canonicalTitle?: string | null;
  franchiseRoot?: string | null;
  releaseYear?: number | null;
  popularity?: number | null;
  universe?: string | null;
  providerType?: ProviderType | null;
  providerResourceType?: string | null;
  publisherLabel?: string | null;
};

const EVENT_TITLE_OVERRIDES = new Set([
  "civil war",
  "flashpoint",
  "secret wars",
  "crisis on infinite earths",
  "infinite crisis",
  "final crisis",
]);

const STORY_ARC_TITLE_OVERRIDES = new Set([
  "kingdom come",
]);

const QUERY_TYPE_OVERRIDES: Record<string, ComicProviderType> = {
  batman: "character",
  joker: "character",
  "civil war": "event",
  crisis: "event",
  flashpoint: "event",
  "secret wars": "event",
  "kingdom come": "story_arc",
  "ultimate spider-man": "volume",
};

function normalizeComicValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeComicVineResourceType(
  resourceType?: string | null,
  title?: string | null,
): ComicProviderType {
  const normalizedResource = String(resourceType ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]+/g, "_");
  const normalizedTitle = normalizeComicValue(title ?? "");

  if (normalizedResource === "character") return "character";
  if (normalizedResource === "volume") return "volume";
  if (normalizedResource === "issue") return "issue";
  if (normalizedResource === "team") return "team";
  if (normalizedResource === "publisher") return "publisher";
  if (normalizedResource === "story_arc") {
    if (EVENT_TITLE_OVERRIDES.has(normalizedTitle)) return "event";
    return "story_arc";
  }
  if (normalizedResource === "concept") return "universe";

  if (EVENT_TITLE_OVERRIDES.has(normalizedTitle)) return "event";
  if (STORY_ARC_TITLE_OVERRIDES.has(normalizedTitle)) return "story_arc";
  return "volume";
}

export function comicProviderTypeLabel(providerType?: string | null): string {
  switch (providerType) {
    case "character":
      return "Character";
    case "volume":
      return "Volume";
    case "issue":
      return "Issue";
    case "event":
      return "Event";
    case "story_arc":
      return "Story Arc";
    case "team":
      return "Team";
    case "publisher":
      return "Publisher";
    case "universe":
      return "Universe";
    default:
      return "Comics";
  }
}

export function classifyComicsQueryType(query: string): ComicProviderType | null {
  const normalized = normalizeComicValue(query);
  if (!normalized) return null;

  if (QUERY_TYPE_OVERRIDES[normalized]) {
    return QUERY_TYPE_OVERRIDES[normalized];
  }

  if (/#\s*\d+/.test(query) || /\bissue\s+\d+\b/i.test(query)) {
    return "issue";
  }

  if (/\b(avengers|justice league|guardians|x men|xmen|teen titans|suicide squad)\b/i.test(normalized)) {
    return "team";
  }

  if (/\b(volume|vol)\b/i.test(query)) {
    return "volume";
  }

  if (/\b(comics|marvel|dc)\b/i.test(normalized) && normalized.split(" ").length <= 2) {
    return "publisher";
  }

  return null;
}

export function inferProviderTypeFromId(providerId?: string | null): ProviderType | null {
  const parts = String(providerId ?? "").split("::");
  if (parts.length < 3) return null;

  const resourceType = parts[1];
  if (parts[0] === "comicvine") {
    return normalizeComicVineResourceType(resourceType, null);
  }

  if (parts[0] === "tmdb") {
    return resourceType === "tv" ? "tv" : "movie";
  }

  if (parts[0] === "igdb") return "game";
  if (parts[0] === "jikan") return "anime";
  if (parts[0] === "googlebooks") return "book";
  return null;
}

export function isCompatibleComicVineType(expected: string, actual: string): boolean {
  if (!expected || !actual) return true;
  const e = expected.toLowerCase().trim();
  const a = actual.toLowerCase().trim();
  if (e === a) return true;

  // Group 1: Volume, Story Arc, Event
  const group1 = new Set(["volume", "story_arc", "event"]);
  if (group1.has(e) && group1.has(a)) return true;

  // Group 2: Collection, Issue-group, Volume, Issue
  const group2 = new Set(["collection", "issue_group", "issue-group", "volume", "issue"]);
  if (group2.has(e) && group2.has(a)) return true;

  return false;
}
