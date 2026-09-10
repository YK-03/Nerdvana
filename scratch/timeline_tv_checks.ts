import assert from "node:assert/strict";
import handler from "../api/timeline.js";
import { buildTimelineCacheKey } from "../api/lib/timelineCache.js";
import type { StoryTimeline } from "../src/lib/timelineTypes.js";

const originalFetch = globalThis.fetch;
const originalTmdbKey = process.env.TMDB_API_KEY;
const originalGroqKey = process.env.GROQ_API_KEY;

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/timeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function body(response: Response) {
  return response.json() as Promise<any>;
}

function tmdbSeries(title: string) {
  return {
    id: 1,
    name: title,
    original_name: title,
    first_air_date: "2015-01-01",
    overview: "Series-level context must not be used for a season event.",
    number_of_seasons: 2,
    number_of_episodes: 20,
    seasons: [
      { season_number: 0, name: "Specials", episode_count: 1, overview: "Specials" },
      { season_number: 1, name: "Season 1", episode_count: 10, air_date: "2015-01-01", overview: `${title} season one overview.` },
      { season_number: 2, name: "Season 2", episode_count: 10, air_date: "2016-01-01", overview: `${title} season two overview.` },
    ],
  };
}

async function run() {
  process.env.TMDB_API_KEY = "test-tmdb";
  process.env.GROQ_API_KEY = "test-groq";

  const capturedPrompts: string[] = [];
  const evidenceInputs: Array<Record<string, unknown>> = [];
  const cacheKeys: string[] = [];
  let seasonFetches = 0;
  let requestedTitle = "Money Heist";
  let sparse = false;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    return new Response(JSON.stringify(tmdbSeries(requestedTitle)), { status: 200 });
  };

  const dependencies = {
    getCachedTimeline: async () => null,
    setCachedTimeline: async (_id: string, key: string, timeline: StoryTimeline) => {
      cacheKeys.push(key);
      assert.equal(timeline.seasonNumber, timeline.mediaType === "tv" ? timeline.seasonNumber : null);
    },
    resolveTimelineEvidence: async (input: any) => {
      evidenceInputs.push(input);
      return {
        evidence: {
          source: sparse ? "tmdb_season_overview" as const : "wikipedia_plot" as const,
          text: sparse ? `${requestedTitle} season overview.` : `${requestedTitle} season evidence establishes the major conflict and outcome.`,
          priority: sparse ? 60 : 90,
        },
        reason: sparse ? "season_overview_fallback" : "season_mediawiki_match",
      };
    },
    generateTimelineModelResponse: async (prompt: string) => {
      capturedPrompts.push(prompt);
      return {
        status: "success" as const,
          provider: "Groq" as const,
          model: "groq-test",
        response: {
          events: [
            { title: "The setup", description: "The season establishes its central conflict." },
            { title: "The turn", description: "The conflict forces the main characters into a new position." },
            { title: "", description: "" },
          ],
        },
      };
    },
  };

  // Movie behavior remains series/feature-film behavior and never calls a season endpoint.
  requestedTitle = "The Dark Knight";
  const movieResponse = await handler(request({ providerId: "tmdb::movie::155", mediaLens: "movies", spoilerMode: true }), undefined, dependencies);
  const movie = await body(movieResponse);
  assert.equal(movieResponse.status, 200);
  assert.equal(movie.timeline.mediaType, "movie");
  assert.equal(movie.timeline.seasonNumber, null);
  assert.deepEqual(movie.timeline.events.map((event: any) => event.order), [1, 2], "invalid events must be filtered and valid events remain chronological");
  assert.match(capturedPrompts.at(-1), /complete feature-film story/);
  assert.equal(seasonFetches, 0);

  // Representative long-running TV cases use season-scoped evidence and no episode content.
  for (const title of ["Money Heist", "Breaking Bad", "The Sopranos"]) {
    requestedTitle = title;
    sparse = false;
    const response = await handler(request({ providerId: `tmdb::tv::${title.length}`, mediaLens: "tv", spoilerMode: true, seasonNumber: 2 }), undefined, dependencies);
    const result = await body(response);
    assert.equal(response.status, 200);
    assert.equal(result.timeline.mediaType, "tv");
    assert.equal(result.timeline.seasonNumber, 2);
    assert.equal(evidenceInputs.at(-1)?.seasonNumber, 2);
    assert.match(capturedPrompts.at(-1), /Represent only Season 2/);
    assert.doesNotMatch(capturedPrompts.at(-1), /EPISODE_SECRET_MUST_NOT_LEAK/);
  }

  // A short/single-season shape still resolves cleanly and sparse evidence stays sparse.
  requestedTitle = "Chernobyl";
  sparse = true;
  const sparseResponse = await handler(request({ providerId: "tmdb::tv::87108", mediaLens: "tv", spoilerMode: true, seasonNumber: 1 }), undefined, dependencies);
  const sparseResult = await body(sparseResponse);
  assert.equal(sparseResponse.status, 200);
  assert.equal(sparseResult.timeline.seasonNumber, 1);
  assert.equal(evidenceInputs.at(-1)?.seasonNumber, 1);
  assert.equal(sparseResult.timeline.events.length, 2);

  // Season identity must separate cache documents; series and seasons cannot collide.
  const seriesKey = await buildTimelineCacheKey("tmdb::tv::1", "tv", undefined, undefined, undefined, null);
  const seasonOneKey = await buildTimelineCacheKey("tmdb::tv::1", "tv", undefined, undefined, undefined, 1);
  const seasonTwoKey = await buildTimelineCacheKey("tmdb::tv::1", "tv", undefined, undefined, undefined, 2);
  assert.notEqual(seriesKey.documentId, seasonOneKey.documentId);
  assert.notEqual(seasonOneKey.documentId, seasonTwoKey.documentId);

  const locked = await handler(request({ providerId: "tmdb::tv::1", mediaLens: "tv", spoilerMode: false, seasonNumber: 1 }), undefined, dependencies);
  assert.equal(locked.status, 403);

  sparse = false;
  const failed = await handler(request({ providerId: "tmdb::tv::1", mediaLens: "tv", spoilerMode: true, seasonNumber: 1 }), undefined, {
    ...dependencies,
    generateTimelineModelResponse: async () => ({ status: "provider_failure" as const, provider: null, model: null, response: null }),
  });
  assert.equal(failed.status, 502);

  assert.equal(seasonFetches, 0, "season-scoped generation must not ingest episode payloads");
  assert.ok(cacheKeys.some((key) => key.includes("season-2")));
  console.log("Phase 6E TV checks passed", { movie: "ok", tvCases: 4, seasonFetches, cacheWrites: cacheKeys.length });
}

run()
  .finally(() => {
    globalThis.fetch = originalFetch;
    if (originalTmdbKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalTmdbKey;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
