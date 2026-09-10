import { getAdminDb } from "./firebaseAdmin.js";
import type {
  StoryTimeline,
  TimelineMediaType,
} from "../../src/lib/timelineTypes.js";

export const TIMELINE_SCHEMA_VERSION = "v1";
export const TIMELINE_PROMPT_VERSION = "prompt-v5";
export const TIMELINE_EVIDENCE_VERSION = "evidence-v2";

const COLLECTION = "timeline_cache";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TimelineCacheDocument = {
  timeline: StoryTimeline;
  cachedAt: number;
  cacheKey: string;
  providerId: string;
  mediaType: TimelineMediaType;
  schemaVersion: string;
  promptVersion: string;
  evidenceVersion: string;
  seasonNumber: number | null;
};

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildTimelineCacheKey(
  providerId: string,
  mediaType: TimelineMediaType,
  schemaVersion = TIMELINE_SCHEMA_VERSION,
  promptVersion = TIMELINE_PROMPT_VERSION,
  evidenceVersion = TIMELINE_EVIDENCE_VERSION,
  seasonNumber: number | null = null,
): Promise<{ compositeKey: string; documentId: string }> {
  const normalizedProviderId = providerId.toLowerCase().trim();
  const normalizedMediaType = mediaType.toLowerCase().trim();
  const normalizedSchemaVersion = schemaVersion.toLowerCase().trim();
  const normalizedPromptVersion = promptVersion.toLowerCase().trim();
  const normalizedEvidenceVersion = evidenceVersion.toLowerCase().trim();
  const normalizedSeason = seasonNumber === null ? "series" : `season-${seasonNumber}`;
  const compositeKey = [
    `timeline-${normalizedSchemaVersion}`,
    normalizedProviderId,
    normalizedMediaType,
    normalizedPromptVersion,
    normalizedEvidenceVersion,
    normalizedSeason,
  ].join("|");

  return {
    compositeKey,
    documentId: await sha256Hex(compositeKey),
  };
}

function isStoryTimeline(value: unknown): value is StoryTimeline {
  if (!value || typeof value !== "object") return false;

  const timeline = value as Partial<StoryTimeline>;
  return timeline.version === TIMELINE_SCHEMA_VERSION
    && typeof timeline.providerId === "string"
    && (timeline.mediaType === "movie" || timeline.mediaType === "tv")
    && (timeline.seasonNumber == null || (timeline.mediaType === "tv" && Number.isInteger(timeline.seasonNumber) && timeline.seasonNumber > 0))
    && (timeline.seasonName == null || typeof timeline.seasonName === "string")
    && (timeline.seasons == null || (
      timeline.mediaType === "tv"
      && Array.isArray(timeline.seasons)
      && timeline.seasons.every((season) => (
        !!season
        && Number.isInteger(season.seasonNumber)
        && season.seasonNumber > 0
        && typeof season.name === "string"
      ))
    ))
    && Array.isArray(timeline.events)
    && timeline.events.every((event) => (
      !!event
      && typeof event.id === "string"
      && typeof event.order === "number"
      && typeof event.title === "string"
      && typeof event.description === "string"
    ));
}

export async function getCachedTimeline(documentId: string): Promise<StoryTimeline | null> {
  try {
    const snapshot = await getAdminDb().collection(COLLECTION).doc(documentId).get();
    if (!snapshot.exists) return null;

    const data = snapshot.data() as Partial<TimelineCacheDocument> | undefined;
    if (!data?.cachedAt || Date.now() - data.cachedAt > TTL_MS) {
      if (data?.cacheKey) console.log("[TIMELINE_CACHE_MISS] stale entry", data.cacheKey);
      return null;
    }

    if (!isStoryTimeline(data.timeline)) return null;
    if (data.timeline.providerId !== data.providerId || data.timeline.mediaType !== data.mediaType) {
      return null;
    }
    if ((data.seasonNumber ?? null) !== (data.timeline.seasonNumber ?? null)) return null;
    if (
      data.schemaVersion !== TIMELINE_SCHEMA_VERSION
      || data.promptVersion !== TIMELINE_PROMPT_VERSION
      || data.evidenceVersion !== TIMELINE_EVIDENCE_VERSION
    ) {
      return null;
    }

    return data.timeline;
  } catch (error) {
    console.error("[TIMELINE_CACHE_READ_ERROR]", error);
    return null;
  }
}

export async function setCachedTimeline(
  documentId: string,
  compositeKey: string,
  timeline: StoryTimeline,
): Promise<void> {
  const payload: TimelineCacheDocument = {
    timeline,
    cachedAt: Date.now(),
    cacheKey: compositeKey,
    providerId: timeline.providerId,
    mediaType: timeline.mediaType,
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    promptVersion: TIMELINE_PROMPT_VERSION,
    evidenceVersion: TIMELINE_EVIDENCE_VERSION,
    seasonNumber: timeline.seasonNumber ?? null,
  };

  await getAdminDb().collection(COLLECTION).doc(documentId).set(payload);
  console.log("[TIMELINE_CACHE_WRITE]", compositeKey);
}
