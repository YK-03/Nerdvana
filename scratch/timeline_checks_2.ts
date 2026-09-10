import assert from "node:assert/strict";
import handler from "../api/timeline.js";
import {
  createMediaWikiEvidenceClient,
  normalizeTimelineEvidenceText,
  type TimelineEvidenceResult,
} from "../api/lib/timelineEvidence.js";
import {
  buildTimelineCacheKey,
  TIMELINE_EVIDENCE_VERSION,
  TIMELINE_PROMPT_VERSION,
  TIMELINE_SCHEMA_VERSION,
} from "../api/lib/timelineCache.js";
import type { StoryTimeline } from "../src/lib/timelineTypes.js";

function mediaWikiResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function searchPayload(title: string, snippet: string) {
  return { query: { search: [{ title, snippet }] } };
}

function parsePayload(title: string, heading: string, body: string) {
  return {
    parse: {
      title,
      sections: [{ line: heading, index: "1", level: "2" }],
      wikitext: `== ${heading} ==\n${body}\n\n== Production ==\nProduction-only text.`,
    },
  };
}

async function runEvidenceChecks() {
  const calls: string[] = [];
  const client = createMediaWikiEvidenceClient({
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      calls.push(url.search);
      if (url.searchParams.get("action") === "query") {
        return mediaWikiResponse(searchPayload("Example Film", "2020 film starring Example Actor."));
      }
      return mediaWikiResponse(parsePayload(
        "Example Film",
        "Plot",
        "The protagonist begins a difficult journey through a city under pressure. [[Example|The example]] changes the plan and forces the group to confront a rival before the final decision. <!-- hidden --> {{citation needed}} <ref>source</ref>",
      ));
    },
  });
  const movie = await client.resolve({ title: "Example Film", year: 2020, mediaType: "movie" });
  assert.equal(movie.evidence.source, "wikipedia_plot");
  assert.equal(movie.evidence.pageTitle, "Example Film");
  assert.match(movie.evidence.text, /The example changes the plan/);
  assert.doesNotMatch(movie.evidence.text, /hidden|citation needed|source|Production-only/);
  assert.equal(calls.length, 2, "movie matching should search and parse one article");

  const tvClient = createMediaWikiEvidenceClient({
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "query") {
        return mediaWikiResponse(searchPayload("Example Show (TV series)", "A 2020 television series about a team."));
      }
      return mediaWikiResponse(parsePayload("Example Show (TV series)", "Synopsis", "The team forms in a divided city and begins investigating a hidden threat. A rival emerges, forcing the group to change its plans and confront the rival before the team survives the final crisis."));
    },
  });
  const tv = await tvClient.resolve({ title: "Example Show", year: 2020, mediaType: "tv" });
  assert.equal(tv.evidence.source, "wikipedia_plot");
  assert.equal(tv.evidence.pageTitle, "Example Show (TV series)");

  const wrongWorkClient = createMediaWikiEvidenceClient({
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "query") {
        return mediaWikiResponse({ query: { search: [
          { title: "Example Show (comic book)", snippet: "A comic book." },
          { title: "Example Show soundtrack", snippet: "A soundtrack album." },
        ] } });
      }
      throw new Error("wrong work must not be parsed");
    },
  });
  const wrongWork = await wrongWorkClient.resolve({ title: "Example Show", year: 2020, mediaType: "tv" });
  assert.equal(wrongWork.evidence.source, "none");
  assert.equal(wrongWork.reason, "no_acceptable_article_match");

  const ambiguousClient = createMediaWikiEvidenceClient({
    fetchImpl: async () => mediaWikiResponse({ query: { search: [
      { title: "Example Show (TV series)", snippet: "A 2020 television series." },
      { title: "Example Show (television series)", snippet: "A 2020 television series." },
    ] } }),
  });
  const ambiguous = await ambiguousClient.resolve({ title: "Example Show", year: 2020, mediaType: "tv" });
  assert.equal(ambiguous.evidence.source, "none");
  assert.equal(ambiguous.reason, "ambiguous_article_match");

  const weakPremiseClient = createMediaWikiEvidenceClient({
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "query") return mediaWikiResponse(searchPayload("Example Show", "2020 television series."));
      return mediaWikiResponse(parsePayload("Example Show", "Premise", "A teacher begins making difficult choices for his family."));
    },
  });
  const weakPremise = await weakPremiseClient.resolve({ title: "Example Show", year: 2020, mediaType: "tv" });
  assert.equal(weakPremise.evidence.source, "none");
  assert.equal(weakPremise.reason, "no_usable_narrative_section");

  const normalized = normalizeTimelineEvidenceText("[[A|Display text]] {{template}} <ref>x</ref> <!-- note -->  multiple   spaces ");
  assert.equal(normalized, "Display text multiple spaces");

  let retryCalls = 0;
  const delays: number[] = [];
  const retryClient = createMediaWikiEvidenceClient({
    maxRetries: 2,
    baseDelayMs: 10,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    fetchImpl: async (input) => {
      retryCalls += 1;
      const url = new URL(String(input));
      if (retryCalls < 3) return mediaWikiResponse({}, 429);
      if (url.searchParams.get("action") === "query") return mediaWikiResponse(searchPayload("Example Film", "2020 film."));
      return mediaWikiResponse(parsePayload("Example Film", "Plot", "The story develops through several conflicts and reaches a conclusion."));
    },
  });
  await retryClient.resolve({ title: "Example Film", year: 2020, mediaType: "movie" });
  assert.equal(retryCalls, 4, "429 retry must be bounded");
  assert.deepEqual(delays, [10, 20]);
}

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

async function runHandlerChecks() {
  const originalFetch = globalThis.fetch;
  const originalTmdbKey = process.env.TMDB_API_KEY;
  const originalGroqKey = process.env.GROQ_API_KEY;
  process.env.TMDB_API_KEY = "test-tmdb-key";
  process.env.GROQ_API_KEY = "test-groq-key";

  let aiCalls = 0;
  let prompt = "";
  let cachedTimeline: StoryTimeline | null = null;
  const fallbackEvidence: TimelineEvidenceResult = {
    evidence: { source: "tmdb_overview", text: "TMDB overview fallback narrative.", priority: 50, rejectionReason: "ambiguous_match" },
    reason: "tmdb_fallback_ambiguous_match",
  };
  const baseDependencies = {
    getCachedTimeline: async () => cachedTimeline,
    setCachedTimeline: async (_id: string, _key: string, timeline: StoryTimeline) => { cachedTimeline = timeline; },
    resolveTimelineEvidence: async () => fallbackEvidence,
    generateTimelineModelResponse: async (value: string) => {
      aiCalls += 1;
      prompt = value;
      return {
        status: "success" as const,
        provider: "Groq" as const,
        model: "test-model",
        response: { events: [{ title: "Supported beat", description: "Supported by the selected evidence." }] },
      };
    },
  };

  globalThis.fetch = async () => mediaWikiResponse({
    id: 155,
    title: "The Dark Knight",
    original_title: "The Dark Knight",
    overview: "TMDB overview fallback narrative.",
    release_date: "2008-07-18",
    genres: [{ name: "Drama" }],
  });

  const fallbackResponse = await handler(request({ providerId: "tmdb::movie::155", mediaLens: "movies", spoilerMode: true }), undefined, baseDependencies);
  const fallbackPayload = await responseBody(fallbackResponse);
  assert.equal(fallbackResponse.status, 200);
  assert.equal(fallbackPayload.timeline.events.length, 1);
  assert.match(prompt, /NARRATIVE_EVIDENCE/);
  assert.match(prompt, /description must be one concise sentence grounded in NARRATIVE_EVIDENCE/);
  assert.doesNotMatch(prompt, /description must be one concise sentence grounded in the overview/);
  assert.match(prompt, /TMDB_CONTEXTUAL_METADATA/);
  assert.match(prompt, /TMDB overview fallback narrative/);

  cachedTimeline = null;
  const noEvidenceResponse = await handler(request({ providerId: "tmdb::movie::155", mediaLens: "movies", spoilerMode: true }), undefined, {
    ...baseDependencies,
    resolveTimelineEvidence: async () => ({ evidence: { source: "none", text: "", priority: 0 }, reason: "no_narrative_evidence" }),
  });
  const noEvidencePayload = await responseBody(noEvidenceResponse);
  assert.equal(noEvidenceResponse.status, 200);
  assert.deepEqual(noEvidencePayload.timeline.events, []);
  assert.equal(aiCalls, 1, "no evidence must not call the model");

  globalThis.fetch = originalFetch;
  if (originalTmdbKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalTmdbKey;
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqKey;
}

async function runCacheChecks() {
  const current = await buildTimelineCacheKey("tmdb::movie::155", "movie");
  const oldEvidence = await buildTimelineCacheKey("tmdb::movie::155", "movie", TIMELINE_SCHEMA_VERSION, "prompt-v2", "evidence-v0");
  const oldPrompt = await buildTimelineCacheKey("tmdb::movie::155", "movie", TIMELINE_SCHEMA_VERSION, "prompt-v2", TIMELINE_EVIDENCE_VERSION);
  assert.notEqual(current.documentId, oldEvidence.documentId);
  assert.notEqual(current.documentId, oldPrompt.documentId);
  assert.equal(TIMELINE_PROMPT_VERSION, "prompt-v5");
}

try {
  await runEvidenceChecks();
  await runHandlerChecks();
  await runCacheChecks();
  console.log("Timeline Phase 5B deterministic checks passed.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
