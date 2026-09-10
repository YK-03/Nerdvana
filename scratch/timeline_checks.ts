import assert from "node:assert/strict";
import handler from "../api/timeline.js";
import {
  buildTimelineCacheKey,
  TIMELINE_EVIDENCE_VERSION,
  TIMELINE_PROMPT_VERSION,
  TIMELINE_SCHEMA_VERSION,
} from "../api/lib/timelineCache.js";
import type { StoryTimeline } from "../src/lib/timelineTypes.js";

const originalFetch = globalThis.fetch;

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/timeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response): Promise<any> {
  return response.json();
}

async function runContractChecks() {
  const originalTmdbKey = process.env.TMDB_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.TMDB_API_KEY = "test-tmdb-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";

  let fetchCalls = 0;
  let aiCalls = 0;
  let cacheReads = 0;
  let cacheWrites = 0;
  let cachedTimeline: StoryTimeline | null = null;

  globalThis.fetch = async (input) => {
    fetchCalls += 1;
    const path = new URL(String(input)).pathname;
    if (path.includes("/tv/")) {
      if (path.includes("/season/")) {
        return new Response(JSON.stringify({ name: "Season 1", air_date: "2000-01-01", overview: "Season overview." }), { status: 200 });
      }
      return new Response(JSON.stringify({
        id: 1399,
        name: "Example Show",
        original_name: "Example Show",
        overview: "A TV overview.",
        first_air_date: "2000-01-01",
        seasons: [{ season_number: 1, name: "Season 1", episode_count: 10, overview: "Season overview." }],
        number_of_seasons: 1,
        number_of_episodes: 10,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: 27205,
      title: "Inception",
      original_title: "Inception",
      overview: "A skilled extractor enters layered dreams to plant an idea.",
      genres: [{ name: "Science Fiction" }],
      release_date: "2010-07-15",
      status: "Released",
    }), { status: 200 });
  };

  const dependencies = {
    getCachedTimeline: async () => {
      cacheReads += 1;
      return cachedTimeline;
    },
    setCachedTimeline: async (_id: string, _key: string, timeline: StoryTimeline) => {
      cacheWrites += 1;
      cachedTimeline = timeline;
    },
    resolveTimelineEvidence: async () => ({
      evidence: {
        source: "tmdb_overview" as const,
        text: "A skilled extractor enters layered dreams to plant an idea.",
        priority: 50,
      },
      reason: "deterministic_test_fallback",
    }),
    generateTimelineModelResponse: async () => {
      aiCalls += 1;
      return {
        status: "success" as const,
        provider: "Gemini" as const,
        model: "gemini-test",
        response: {
          events: [
            { title: "The team assembles", description: "Cobb recruits specialists for the extraction." },
            { title: "The inception attempt", description: "The team descends through layered dreams to alter Fischer's idea." },
          ],
        },
      };
    },
  };

  const lockedResponse = await handler(request({
    providerId: "tmdb::movie::27205",
    mediaLens: "movies",
    spoilerMode: false,
  }), undefined, {
    ...dependencies,
    getCachedTimeline: async () => {
      throw new Error("locked request performed a cache lookup");
    },
  });
  assert.equal(lockedResponse.status, 403, "spoiler-off request must be rejected");
  assert.equal(fetchCalls, 0, "spoiler-off request must not fetch TMDB");

  const mismatchResponse = await handler(request({
    providerId: "tmdb::movie::27205",
    mediaLens: "tv",
    spoilerMode: true,
  }), undefined, {
    ...dependencies,
    getCachedTimeline: async () => {
      throw new Error("mismatched request performed a cache lookup");
    },
  });
  assert.equal(mismatchResponse.status, 400, "media identity mismatch must be rejected");
  assert.equal(fetchCalls, 0, "mismatched request must not fetch TMDB");

  const movieResponse = await handler(request({
    providerId: "tmdb::movie::27205",
    mediaLens: "movies",
    spoilerMode: true,
  }), undefined, dependencies);
  const moviePayload = await responseBody(movieResponse);
  assert.equal(movieResponse.status, 200);
  assert.equal(moviePayload.timeline.mediaType, "movie");
  assert.equal(moviePayload.timeline.providerId, "tmdb::movie::27205");
  assert.equal(moviePayload.timeline.events[0].id, "event-1");
  assert.equal(aiCalls, 1, "first identical request must call AI once");
  assert.equal(cacheReads, 1, "first identical request must read cache once");
  assert.equal(cacheWrites, 1, "valid non-empty result must be cached");

  const hitResponse = await handler(request({
    providerId: "tmdb::movie::27205",
    mediaLens: "movies",
    spoilerMode: true,
  }), undefined, dependencies);
  const hitPayload = await responseBody(hitResponse);
  assert.equal(hitResponse.status, 200);
  assert.equal(hitPayload.cached, true);
  assert.equal(aiCalls, 1, "cache hit must not call AI");
  assert.equal(fetchCalls, 1, "cache hit must not fetch TMDB");

  cachedTimeline = null;
  const tvResponse = await handler(request({
    providerId: "tmdb::tv::1399",
    mediaLens: "tv",
    spoilerMode: true,
  }), undefined, dependencies);
  const tvPayload = await responseBody(tvResponse);
  assert.equal(tvResponse.status, 200);
  assert.equal(tvPayload.timeline.mediaType, "tv");
  assert.equal(tvPayload.timeline.providerId, "tmdb::tv::1399");

  cachedTimeline = null;
  const writesBeforeFailure = cacheWrites;
  const malformedResponse = await handler(request({
    providerId: "tmdb::movie::27205",
    mediaLens: "movies",
    spoilerMode: true,
  }), undefined, {
    ...dependencies,
    generateTimelineModelResponse: async () => ({
      status: "provider_failure" as const,
      provider: null,
      model: null,
      response: null,
    }),
  });
  assert.equal(malformedResponse.status, 502);
  assert.equal(cacheWrites, writesBeforeFailure, "failed generation must not write cache");

  const movieKey = await buildTimelineCacheKey("tmdb::movie::27205", "movie");
  const tvKey = await buildTimelineCacheKey("tmdb::tv::1399", "tv");
  const otherMovieKey = await buildTimelineCacheKey("tmdb::movie::155", "movie");
  const nextPromptKey = await buildTimelineCacheKey("tmdb::movie::27205", "movie", TIMELINE_SCHEMA_VERSION, "prompt-v6", TIMELINE_EVIDENCE_VERSION);
  const nextSchemaKey = await buildTimelineCacheKey("tmdb::movie::27205", "movie", "v2", TIMELINE_PROMPT_VERSION, TIMELINE_EVIDENCE_VERSION);
  assert.notEqual(movieKey.documentId, tvKey.documentId, "movie and TV identities must differ");
  assert.notEqual(movieKey.documentId, otherMovieKey.documentId, "TMDB IDs must differ");
  assert.notEqual(movieKey.documentId, nextPromptKey.documentId, "prompt versions must differ");
  assert.notEqual(movieKey.documentId, nextSchemaKey.documentId, "schema versions must differ");

  console.log("Timeline Phase 2 contract checks passed.");

  if (originalTmdbKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalTmdbKey;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
}

async function runLiveProbe() {
  const hasTmdb = Boolean(process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  if (!hasTmdb || !hasGemini) {
    console.log("Live Timeline probe skipped: TMDB_API_KEY and GEMINI_API_KEY are required.");
    return;
  }

  const titles = [
    ["The Dark Knight", "tmdb::movie::155", "movies"],
    ["Inception", "tmdb::movie::27205", "movies"],
    ["Breaking Bad", "tmdb::tv::1399", "tv"],
  ] as const;

  for (const [title, providerId, mediaLens] of titles) {
    const response = await handler(request({ providerId, mediaLens, spoilerMode: true }), undefined, {
      getCachedTimeline: async () => null,
      setCachedTimeline: async () => undefined,
    });
    const payload = await responseBody(response);
    console.log(JSON.stringify({ title, status: response.status, timeline: payload.timeline ?? null }, null, 2));
  }
}

try {
  await runContractChecks();
  await runLiveProbe();
} finally {
  globalThis.fetch = originalFetch;
}
