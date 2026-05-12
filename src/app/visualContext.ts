import { DEFAULT_MEDIA_LENS, normalizeMediaLens, type MediaLens } from "./mediaLens";
export type VisualEntityType =
  | "movie"
  | "tv"
  | "anime"
  | "game"
  | "comic"
  | "character"
  | "unknown";

export type VisualMediaType = MediaLens | "unknown";

export type VisualEntityKind =
  | "title"
  | "franchise"
  | "character"
  | "team"
  | "issue"
  | "run"
  | "creator"
  | "location"
  | "event"
  | "unknown";

export interface GameVisuals {
  title: string;
  image: string | null;
  year: number | null;
  rating: number | null;
  genres: string[];
  studio: string | null;
}

export interface VisualContext {
  entity: string;
  entityType: VisualEntityType;
  year: number | null;
  changed: boolean;
  mediaLens?: MediaLens;
  mediaType?: VisualMediaType;
  entityKind?: VisualEntityKind;
  gameVisuals?: GameVisuals | null;
}

function toDisplayEntity(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function normalizeVisualEntityType(value: unknown): VisualEntityType {
  if (typeof value !== "string") return "unknown";

  const normalized = value.trim().toLowerCase();
  if (normalized === "movie") return "movie";
  if (normalized === "tv") return "tv";
  if (normalized === "anime") return "anime";
  if (normalized === "game") return "game";
  if (normalized === "comic") return "comic";
  if (normalized === "character") return "character";
  return "unknown";
}

export function normalizeVisualEntityKind(value: unknown): VisualEntityKind {
  if (typeof value !== "string") return "unknown";

  const normalized = value.trim().toLowerCase();
  if (normalized === "title") return "title";
  if (normalized === "franchise") return "franchise";
  if (normalized === "character") return "character";
  if (normalized === "team") return "team";
  if (normalized === "issue") return "issue";
  if (normalized === "run") return "run";
  if (normalized === "creator") return "creator";
  if (normalized === "location") return "location";
  if (normalized === "event") return "event";
  return "unknown";
}

export function inferMediaTypeFromEntityType(entityType: VisualEntityType): VisualMediaType {
  if (entityType === "movie") return "movies";
  if (entityType === "tv") return "tv";
  if (entityType === "anime") return "anime";
  if (entityType === "game") return "games";
  if (entityType === "comic") return "comics";
  return "unknown";
}

export function normalizeVisualMediaType(
  value: unknown,
  fallback: unknown = DEFAULT_MEDIA_LENS,
): VisualMediaType {
  if (typeof value === "string" && value.trim().toLowerCase() === "unknown") {
    return "unknown";
  }

  if (typeof value === "string") {
    return normalizeMediaLens(value);
  }

  if (typeof fallback === "string") {
    if (fallback.trim().toLowerCase() === "unknown") return "unknown";
    return normalizeMediaLens(fallback);
  }

  return DEFAULT_MEDIA_LENS;
}

export function normalizeVisualContext(
  rawContext: unknown,
  fallbackLens: unknown,
  gameVisuals?: GameVisuals | null,
): VisualContext | null {
  if (!rawContext || typeof rawContext !== "object") return null;

  const value = rawContext as Record<string, unknown>;
  const entity = String(value.entity ?? "").trim();
  if (!entity) return null;

  const entityType = normalizeVisualEntityType(value.entityType);
  const lens = normalizeMediaLens(fallbackLens);
  const inferredMediaType = inferMediaTypeFromEntityType(entityType);
  const mediaType =
    normalizeVisualMediaType(value.mediaType, inferredMediaType !== "unknown" ? inferredMediaType : lens);
  const normalizedEntityKind = normalizeVisualEntityKind(value.entityKind);
  const entityKind =
    normalizedEntityKind !== "unknown"
      ? normalizedEntityKind
      : entityType === "character"
        ? "character"
        : entityType !== "unknown"
          ? "title"
          : "unknown";

  return {
    entity,
    entityType,
    year: typeof value.year === "number" && Number.isFinite(value.year) ? value.year : null,
    changed: Boolean(value.changed),
    mediaLens: lens,
    mediaType,
    entityKind: entityKind === "unknown" && entityType === "character" ? "character" : entityKind,
    gameVisuals: gameVisuals ?? null,
  };
}

export function createOptimisticVisualContext(
  query: string,
  fallbackLens: unknown,
  resolvedItem?: string | null,
): VisualContext | null {
  const lens = normalizeMediaLens(fallbackLens);
  const trimmedQuery = query.trim();
  const candidateEntity = resolvedItem
    ? toDisplayEntity(resolvedItem)
    : trimmedQuery.split(/\s+/).filter(Boolean).length <= 4
      ? trimmedQuery
      : "";

  if (!candidateEntity) return null;

  return {
    entity: candidateEntity,
    entityType: "unknown",
    year: null,
    changed: false,
    mediaLens: lens,
    mediaType: lens,
    entityKind: resolvedItem ? "franchise" : "unknown",
    gameVisuals: null,
  };
}
