import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import handler from "../api/timeline.js";
import {
  createMediaWikiEvidenceClient,
  type TimelineEvidenceInput,
  type TimelineEvidenceResult,
} from "../api/lib/timelineEvidence.js";
import type { StoryTimeline, TimelineMediaType } from "../src/lib/timelineTypes.js";
import {
  DETERMINISTIC_FIXTURE_EVIDENCE,
  DETERMINISTIC_FIXTURE_GENERATION,
  TIMELINE_PHASE6A_CASES,
  type FixtureGeneration,
  type TimelineEvaluationCase,
} from "./timeline_phase6a_fixtures.js";

const OUTPUT_PATH = "scratch/timeline_phase6a_results.json";
const hasProviderConfiguration = Boolean(process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY) && Boolean(process.env.GEMINI_API_KEY);
const liveRequested = process.argv.includes("--live");

type GenerationRecord = {
  provider: string | null;
  model: string | null;
  status: "success" | "provider_failure" | "invalid_response" | "not_run_missing_configuration";
  eventCount: number;
};

type ReviewAssessment = {
  status: "NEEDS_HUMAN_REVIEW";
  reason: string;
};

type EvaluationRecord = {
  id: string;
  title: string;
  providerId: string;
  mediaType: TimelineMediaType;
  year: number;
  category: TimelineEvaluationCase["category"];
  evidence: {
    source: "wikipedia_plot" | "tmdb_overview" | "none";
    reason: string;
    pageTitle: string | null;
    pageUrl: string | null;
    characterCount: number;
    paragraphCount: number | null;
    paragraphCountStatus: "available_from_fixture" | "not_exposed_by_current_adapter";
  };
  generation: GenerationRecord;
  quality: {
    chronology: ReviewAssessment;
    duplicateEvents: "NO_DUPLICATE_TITLES_DETECTED" | "DUPLICATES_DETECTED" | ReviewAssessment;
    meaningfulProgression: ReviewAssessment;
    setupCoverage: ReviewAssessment;
    escalationCoverage: ReviewAssessment;
    majorReversalCoverage: ReviewAssessment;
    climaxCoverage: ReviewAssessment;
    resolutionCoverage: ReviewAssessment;
    unsupportedClaims: ReviewAssessment;
    finalEventReachesEnding: ReviewAssessment;
  };
  diagnosis: Array<"A_INSUFFICIENT_NARRATIVE_EVIDENCE" | "B_INCOMPLETE_MEDIAWIKI_EXTRACTION" | "C_MODEL_OVER_COMPRESSION" | "D_EXCESSIVE_CONSERVATISM" | "E_CHRONOLOGY_OR_EVENT_SELECTION" | "F_PRESENTATION_LIMITATION" | "G_UNCLEAR">;
  requestCount: number;
  approximateLatencyMs: number;
  cacheState: "BYPASSED_FRESH";
  humanReviewRequired: true;
};

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

function tmdbFixture(item: TimelineEvaluationCase): Record<string, unknown> {
  const tv = item.mediaType === "tv";
  return {
    id: Number(item.providerId.split("::").pop()),
    title: tv ? undefined : item.tmdbTitle,
    name: tv ? item.tmdbTitle : undefined,
    original_title: tv ? undefined : item.tmdbTitle,
    original_name: tv ? item.tmdbTitle : undefined,
    overview: item.tmdbOverview,
    release_date: tv ? undefined : `${item.year}-01-01`,
    first_air_date: tv ? `${item.year}-01-01` : undefined,
    genres: [{ name: tv ? "Drama" : "Science Fiction" }],
    status: item.mediaType === "tv" ? "Ended" : "Released",
    number_of_seasons: tv ? 1 : undefined,
    number_of_episodes: tv ? 10 : undefined,
    credits: { cast: [], crew: [] },
    keywords: { keywords: [] },
  };
}

function normalizeEventTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function duplicateAssessment(timeline: StoryTimeline | null): EvaluationRecord["quality"]["duplicateEvents"] {
  if (!timeline || timeline.events.length < 2) return "NO_DUPLICATE_TITLES_DETECTED";
  const titles = timeline.events.map((event) => normalizeEventTitle(event.title));
  const duplicates = titles.some((title, index) => titles.slice(0, index).some((previous) => title === previous));
  return duplicates ? "DUPLICATES_DETECTED" : "NO_DUPLICATE_TITLES_DETECTED";
}

function review(reason: string): ReviewAssessment {
  return { status: "NEEDS_HUMAN_REVIEW", reason };
}

function inferDiagnosis(
  evidence: TimelineEvidenceResult,
  generation: GenerationRecord,
  item: TimelineEvaluationCase,
): EvaluationRecord["diagnosis"] {
  if (generation.status !== "success") return ["G_UNCLEAR"];
  if (evidence.evidence.source === "none") return ["A_INSUFFICIENT_NARRATIVE_EVIDENCE", "B_INCOMPLETE_MEDIAWIKI_EXTRACTION"];
  if (evidence.evidence.source === "tmdb_overview" && item.mediaType === "tv") return ["A_INSUFFICIENT_NARRATIVE_EVIDENCE", "B_INCOMPLETE_MEDIAWIKI_EXTRACTION"];
  if (generation.eventCount <= 3 && evidence.evidence.text.length >= 2500) return ["C_MODEL_OVER_COMPRESSION", "D_EXCESSIVE_CONSERVATISM"];
  return ["G_UNCLEAR"];
}

function buildQuality(timeline: StoryTimeline | null): EvaluationRecord["quality"] {
  const eventReason = timeline
    ? `Semantic coverage requires comparing ${timeline.events.length} generated events with the supplied evidence.`
    : "No generated events available for semantic review.";
  return {
    chronology: review("Chronological order cannot be established reliably from event text without human comparison to the evidence."),
    duplicateEvents: duplicateAssessment(timeline),
    meaningfulProgression: review(eventReason),
    setupCoverage: review(eventReason),
    escalationCoverage: review(eventReason),
    majorReversalCoverage: review(eventReason),
    climaxCoverage: review(eventReason),
    resolutionCoverage: review(eventReason),
    unsupportedClaims: review("Unsupported motivations, scenes, causal links, and outcomes require evidence-span review."),
    finalEventReachesEnding: review("Ending coverage requires spoiler-on comparison with the final narrative evidence."),
  };
}

function evidenceInput(item: TimelineEvaluationCase): TimelineEvidenceInput {
  return {
    title: item.tmdbTitle,
    year: item.year,
    mediaType: item.mediaType,
    overview: item.tmdbOverview,
  };
}

function fixtureResult(item: TimelineEvaluationCase): TimelineEvidenceResult {
  return DETERMINISTIC_FIXTURE_EVIDENCE[item.id];
}

async function runOne(
  item: TimelineEvaluationCase,
  mode: "fixture" | "live",
): Promise<EvaluationRecord> {
  const startedAt = Date.now();
  let requestCount = 0;
  let timeline: StoryTimeline | null = null;
  let evidenceResult: TimelineEvidenceResult;
  let generation: GenerationRecord;
  const originalFetch = globalThis.fetch;
  const originalTmdbKey = process.env.TMDB_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  try {
    if (mode === "fixture") {
      process.env.TMDB_API_KEY = "phase6a-fixture-tmdb";
      process.env.GEMINI_API_KEY = "phase6a-fixture-gemini";
      globalThis.fetch = async () => {
        requestCount += 1;
        return new Response(JSON.stringify(tmdbFixture(item)), { status: 200 });
      };
      evidenceResult = fixtureResult(item);
      const fixtureGeneration: FixtureGeneration = DETERMINISTIC_FIXTURE_GENERATION[item.id];
      const response = await handler(request({
        providerId: item.providerId,
        mediaLens: item.mediaType === "tv" ? "tv" : "movies",
        spoilerMode: true,
      }), undefined, {
        getCachedTimeline: async () => null,
        setCachedTimeline: async () => undefined,
        resolveTimelineEvidence: async () => evidenceResult,
        generateTimelineModelResponse: async () => ({
          status: fixtureGeneration.status,
          provider: "Gemini" as const,
          model: fixtureGeneration.model,
          response: fixtureGeneration.status === "success" ? { events: fixtureGeneration.events } : null,
        }),
      });
      const payload = await responseBody(response);
      timeline = payload?.timeline ?? null;
      generation = {
        provider: fixtureGeneration.provider,
        model: fixtureGeneration.model,
        status: fixtureGeneration.status,
        eventCount: timeline?.events?.length ?? 0,
      };
    } else {
      let mediaWikiRequests = 0;
      const client = createMediaWikiEvidenceClient({
        fetchImpl: async (input, init) => {
          mediaWikiRequests += 1;
          return originalFetch(input, init);
        },
      });
      try {
        const liveEvidence = await client.resolve(evidenceInput(item));
        evidenceResult = liveEvidence.evidence.source === "wikipedia_plot"
          ? liveEvidence
          : item.tmdbOverview
            ? {
                evidence: { source: "tmdb_overview", text: item.tmdbOverview, priority: 50, rejectionReason: liveEvidence.reason },
                reason: `tmdb_fallback_${liveEvidence.reason}`,
              }
            : liveEvidence;
      } catch (error) {
        const reason = `wikipedia_request_failed_${String(error).replace(/[^a-z0-9_\-]/gi, "_").slice(0, 80)}`;
        evidenceResult = item.tmdbOverview
          ? {
              evidence: { source: "tmdb_overview", text: item.tmdbOverview, priority: 50, rejectionReason: reason },
              reason: `tmdb_fallback_${reason}`,
            }
          : { evidence: { source: "none", text: "", priority: 0, rejectionReason: reason }, reason };
      }
      requestCount = mediaWikiRequests;

      if (hasProviderConfiguration) {
        const response = await handler(request({
          providerId: item.providerId,
          mediaLens: item.mediaType === "tv" ? "tv" : "movies",
          spoilerMode: true,
        }), undefined, {
          getCachedTimeline: async () => null,
          setCachedTimeline: async () => undefined,
          resolveTimelineEvidence: async () => evidenceResult,
        });
        const payload = await responseBody(response);
        timeline = payload?.timeline ?? null;
        generation = {
          provider: null,
          model: null,
          status: response.ok && timeline ? "success" : "provider_failure",
          eventCount: timeline?.events?.length ?? 0,
        };
      } else {
        generation = { provider: null, model: null, status: "not_run_missing_configuration", eventCount: 0 };
      }
      requestCount += mediaWikiRequests;
    }

    assert(evidenceResult, `Evidence result missing for ${item.id}`);
    return {
      id: item.id,
      title: item.title,
      providerId: item.providerId,
      mediaType: item.mediaType,
      year: item.year,
      category: item.category,
      evidence: {
        source: evidenceResult.evidence.source,
        reason: evidenceResult.reason,
        pageTitle: evidenceResult.evidence.pageTitle ?? evidenceResult.pageTitle ?? null,
        pageUrl: evidenceResult.evidence.pageUrl ?? null,
        characterCount: evidenceResult.evidence.text.length,
        paragraphCount: mode === "fixture" ? 1 : null,
        paragraphCountStatus: mode === "fixture" ? "available_from_fixture" : "not_exposed_by_current_adapter",
      },
      generation,
      quality: buildQuality(timeline),
      diagnosis: inferDiagnosis(evidenceResult, generation, item),
      requestCount,
      approximateLatencyMs: Date.now() - startedAt,
      cacheState: "BYPASSED_FRESH",
      humanReviewRequired: true,
    };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTmdbKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalTmdbKey;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  }
}

function printSummary(mode: string, results: EvaluationRecord[]) {
  const wikipedia = results.filter((result) => result.evidence.source === "wikipedia_plot").length;
  const tmdb = results.filter((result) => result.evidence.source === "tmdb_overview").length;
  const none = results.filter((result) => result.evidence.source === "none").length;
  const generated = results.filter((result) => result.generation.status === "success").length;
  console.log(`Phase 6A ${mode}: ${results.length} cases | Wikipedia ${wikipedia} | TMDB fallback ${tmdb} | none ${none} | generated ${generated}`);
  for (const result of results) {
    console.log(`- ${result.title}: ${result.evidence.source}, ${result.evidence.characterCount} chars, ${result.generation.eventCount} events, ${result.diagnosis.join(",")}`);
  }
}

async function main() {
  const mode: "fixture" | "live" = liveRequested ? "live" : "fixture";
  const results = [];
  for (const item of TIMELINE_PHASE6A_CASES) results.push(await runOne(item, mode));

  const output = {
    generatedAt: new Date().toISOString(),
    phase: "6A",
    mode,
    liveGenerationConfigurationAvailable: hasProviderConfiguration,
    cachePolicy: "bypassed_fresh",
    corpusCorrections: [
      { staleProviderId: "tmdb::movie::565028", actualTitle: "Candyman", correctedProviderId: "tmdb::movie::565743", title: "The Vast of Night" },
    ],
    semanticFields: "NEEDS_HUMAN_REVIEW",
    results,
    limitations: [
      "The current TimelineEvidence contract exposes normalized text but not paragraph boundaries.",
      "The current Timeline response does not expose provider/model metadata, so live runs cannot record those values without production changes.",
      "Semantic chronology, progression, unsupported claims, and ending coverage are intentionally not auto-scored.",
    ],
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  printSummary(mode, results);
  console.log(`Machine-readable results: ${OUTPUT_PATH}`);
}

await main();