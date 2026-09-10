import { normalizeMediaLens, type MediaLens } from "../src/app/mediaLens.js";
import {
  isExternalProviderId,
  parseProviderId,
} from "../src/lib/resolver/providerIdUtility.js";
import {
  extractClientIp,
  checkRateLimit,
} from "./lib/rateLimiter.js";
import type {
  StoryTimeline,
  TimelineMediaType,
  TimelineModelResponse,
  TimelineSeason,
} from "../src/lib/timelineTypes.js";
import {
  resolveTimelineEvidence,
  type TimelineEvidence,
  type TimelineEvidenceResult,
} from "./lib/timelineEvidence.js";
import {
  buildTimelineCacheKey,
  getCachedTimeline,
  setCachedTimeline,
} from "./lib/timelineCache.js";

const MAX_EVENTS = 8;
const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 420;

type TimelineGrounding = {
  title: string;
  originalTitle: string | null;
  mediaType: TimelineMediaType;
  releaseDate: string | null;
  overview: string | null;
  tagline: string | null;
  genres: string[];
  runtimeMinutes: number | null;
  status: string | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  cast: Array<{ name: string; character: string | null }>;
  crew: Array<{ name: string; job: string }>;
  keywords: string[];
  seasons: TimelineSeason[];
  seasonNumber: number | null;
  seasonName: string | null;
  narrativeEvidence: TimelineEvidence | null;
};

type TimelineProviderAttempt = {
  provider: "Gemini" | "Groq";
  model: string;
  text: string | null;
  failureReason?: string;
  status?: number;
};

type TimelineGenerationResult = {
  status: "success" | "provider_failure" | "invalid_response";
  response: TimelineModelResponse | null;
  provider: "Gemini" | "Groq" | null;
  model: string | null;
};

function jsonResponse(payload: unknown, status: number, res?: any) {
  if (res && typeof res.status === "function") {
    return res.status(status).json(payload);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(req: any): Promise<any> {
  if (req && typeof req.json === "function") return req.json();
  if (req?.body && typeof req.body === "object") return req.body;
  if (typeof req?.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function resolveProvider(input: unknown): {
  providerId: string;
  mediaType: TimelineMediaType;
  mediaLens: MediaLens;
} | null {
  if (typeof input !== "string" || !isExternalProviderId(input)) return null;

  const providerId = input.trim();
  const parsed = parseProviderId(providerId);
  if (parsed.provider !== "tmdb" || !/^\d+$/.test(parsed.id)) return null;

  const mediaType = parsed.resourceType === "movie"
    ? "movie"
    : parsed.resourceType === "tv"
      ? "tv"
      : null;
  if (!mediaType) return null;

  return {
    providerId,
    mediaType,
    mediaLens: mediaType === "movie" ? "movies" : "tv",
  };
}

function buildSeasons(rawData: any): TimelineSeason[] {
  if (!Array.isArray(rawData?.seasons)) return [];
  return rawData.seasons
    .map((season: any) => ({
      seasonNumber: typeof season?.season_number === "number" ? season.season_number : null,
      name: String(season?.name ?? "").trim(),
      airDate: String(season?.air_date ?? "").trim() || null,
      episodeCount: typeof season?.episode_count === "number" ? season.episode_count : null,
      overview: String(season?.overview ?? "").trim() || null,
    }))
    .filter((season: TimelineSeason & { seasonNumber: number | null }): season is TimelineSeason => (
      season.seasonNumber !== null && season.seasonNumber > 0 && Boolean(season.name)
    ));
}

function buildGrounding(
  rawData: any,
  mediaType: TimelineMediaType,
  seasons: TimelineSeason[] = [],
  selectedSeason: TimelineSeason | null = null,
): TimelineGrounding | null {
  const title = String(rawData?.title ?? rawData?.name ?? "").trim();
  if (!title) return null;

  const genres = Array.isArray(rawData?.genres)
    ? rawData.genres
      .map((genre: any) => String(genre?.name ?? "").trim())
      .filter(Boolean)
      .slice(0, 12)
    : [];

  const cast = Array.isArray(rawData?.credits?.cast)
    ? rawData.credits.cast
      .map((credit: any) => ({
        name: String(credit?.name ?? "").trim(),
        character: String(credit?.character ?? "").trim() || null,
      }))
      .filter((credit: { name: string }) => credit.name)
      .slice(0, 12)
    : [];

  const crew = Array.isArray(rawData?.credits?.crew)
    ? rawData.credits.crew
      .filter((credit: any) => ["Director", "Writer", "Screenplay"].includes(String(credit?.job ?? "")))
      .map((credit: any) => ({
        name: String(credit?.name ?? "").trim(),
        job: String(credit?.job ?? "").trim(),
      }))
      .filter((credit: { name: string }) => credit.name)
      .slice(0, 8)
    : [];

  const keywordRows = rawData?.keywords?.keywords ?? rawData?.keywords?.results ?? [];
  const keywords = Array.isArray(keywordRows)
    ? keywordRows
      .map((keyword: any) => String(keyword?.name ?? "").trim())
      .filter(Boolean)
      .slice(0, 20)
    : [];

  return {
    title,
    originalTitle: String(rawData?.original_title ?? rawData?.original_name ?? "").trim() || null,
    mediaType,
    releaseDate: String(selectedSeason?.airDate ?? rawData?.release_date ?? rawData?.first_air_date ?? "").trim() || null,
    overview: String(selectedSeason?.overview ?? rawData?.overview ?? "").trim() || null,
    tagline: String(rawData?.tagline ?? "").trim() || null,
    genres,
    runtimeMinutes: typeof rawData?.runtime === "number" ? rawData.runtime : null,
    status: String(rawData?.status ?? "").trim() || null,
    numberOfSeasons: typeof rawData?.number_of_seasons === "number" ? rawData.number_of_seasons : null,
    numberOfEpisodes: selectedSeason?.episodeCount ?? (typeof rawData?.number_of_episodes === "number" ? rawData.number_of_episodes : null),
    cast,
    crew,
    keywords,
    seasons,
    seasonNumber: selectedSeason?.seasonNumber ?? null,
    seasonName: selectedSeason?.name ?? null,
    narrativeEvidence: null,
  };
}

function buildPrompt(grounding: TimelineGrounding): string {
  const tvScope = grounding.mediaType === "tv"
    ? grounding.seasonNumber !== null
      ? `Represent only Season ${grounding.seasonNumber} (${grounding.seasonName ?? "selected season"}) of the series. Do not create episode-level events or use episode-by-episode structure.`
      : "Represent the overall series story only. Do not create episode-level or season-by-season events."
    : "Represent the complete feature-film story.";
  const eventCountGuidance = grounding.mediaType === "tv" && grounding.seasonNumber !== null
    ? "Extract the distinct major beats this season's evidence supports. Do not target a fixed event count; prefer fewer events or an empty array over guessing or padding."
    : "Aim for 3-6 events when the evidence supports them, but prefer fewer events or an empty array over guessing, expanding, or filling gaps.";

  return `You generate a conservative story timeline for Nerdvana.

Return ONLY valid JSON with this exact top-level shape:
{"events":[{"title":"string","description":"string"}]}

Rules:
- Use only NARRATIVE_EVIDENCE to justify story events.
- Treat TMDB_CONTEXTUAL_METADATA as identity and context only. Cast, crew, keywords, genres, dates, runtime, and counts must never independently justify a plot event.
- Extract distinct major plot beats explicitly supported by NARRATIVE_EVIDENCE, in chronological story order rather than release order.
- ${eventCountGuidance}
- Do not invent scenes, characters, motivations, dialogue, locations, outcomes, or causal links that are not supported by NARRATIVE_EVIDENCE.
- Each title must be concise and each description must be one concise sentence grounded in NARRATIVE_EVIDENCE.
- Do not include event IDs, dates, metadata, markdown, commentary, or any text outside the JSON object.
- ${tvScope}

NARRATIVE_EVIDENCE:
${JSON.stringify(grounding.narrativeEvidence)}

TMDB_CONTEXTUAL_METADATA:
${JSON.stringify({ ...grounding, narrativeEvidence: undefined })}
`;
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeModelResponse(raw: string): TimelineModelResponse | null {
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.events)) return null;

    return {
      events: parsed.events.slice(0, MAX_EVENTS).map((event: any) => ({
        title: event?.title,
        description: event?.description,
        order: event?.order,
      })),
    };
  } catch {
    return null;
  }
}

function buildTimeline(
  modelResponse: TimelineModelResponse,
  providerId: string,
  mediaType: TimelineMediaType,
  grounding: TimelineGrounding,
): StoryTimeline {
  const events = modelResponse.events
    .map((event) => ({
      title: typeof event.title === "string" ? event.title.trim().slice(0, MAX_TITLE_LENGTH) : "",
      description: typeof event.description === "string"
        ? event.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
        : "",
    }))
    .filter((event) => event.title && event.description)
    .map((event, index) => ({
      id: `event-${index + 1}`,
      order: index + 1,
      title: event.title,
      description: event.description,
    }));

  return {
    version: "v1",
    providerId,
    mediaType,
    seasonNumber: grounding.seasonNumber,
    seasonName: grounding.seasonName,
    seasons: grounding.seasons,
    events,
  };
}

function emptyTimeline(providerId: string, mediaType: TimelineMediaType, grounding?: TimelineGrounding): StoryTimeline {
  return {
    version: "v1",
    providerId,
    mediaType,
    seasonNumber: grounding?.seasonNumber ?? null,
    seasonName: grounding?.seasonName ?? null,
    seasons: grounding?.seasons ?? [],
    events: [],
  };
}

function classifyProviderHttpError(status: number): string {
  if (status === 401 || status === 403) return "authentication/configuration failure";
  if (status === 404) return "unavailable/invalid model";
  if (status === 429) return "quota/rate limit";
  return "transient provider failure";
}

async function tryGemini(prompt: string, apiKey: string, model: string): Promise<TimelineProviderAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1800, temperature: 0.2 },
        }),
        signal: controller.signal,
      },
    );

    const rawText = await response.text();
    if (!response.ok) {
      const failureReason = classifyProviderHttpError(response.status);
      console.warn("[TIMELINE_PROVIDER_FAILURE]", { provider: "Gemini", model, status: response.status, failureReason });
      return { provider: "Gemini", model, text: null, status: response.status, failureReason };
    }

    const data = JSON.parse(rawText);
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text || "")
      .join("") || null;
    if (!text) {
      console.warn("[TIMELINE_PROVIDER_FAILURE]", { provider: "Gemini", model, status: response.status, failureReason: "empty_provider_response" });
    }
    return { provider: "Gemini", model, text, status: response.status, failureReason: text ? undefined : "empty_provider_response" };
  } catch (error) {
    const failureReason = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "provider_request_error";
    console.warn("[TIMELINE_PROVIDER_FAILURE]", { provider: "Gemini", model, failureReason });
    return { provider: "Gemini", model, text: null, failureReason };
  } finally {
    clearTimeout(timeout);
  }
}

async function tryGroq(prompt: string, apiKey: string): Promise<TimelineProviderAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1800,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const failureReason = classifyProviderHttpError(response.status);
      console.warn("[TIMELINE_PROVIDER_FAILURE]", { provider: "Groq", model: "openai/gpt-oss-120b", status: response.status, failureReason });
      return { provider: "Groq", model: "openai/gpt-oss-120b", text: null, status: response.status, failureReason };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || null;
    if (!text) {
      console.warn("[TIMELINE_PROVIDER_FAILURE]", { provider: "Groq", model: "openai/gpt-oss-120b", status: response.status, failureReason: "empty_provider_response" });
    }
    return { provider: "Groq", model: "openai/gpt-oss-120b", text, status: response.status, failureReason: text ? undefined : "empty_provider_response" };
  } catch (error) {
    const failureReason = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "provider_request_error";
    console.warn("[TIMELINE_PROVIDER_FAILURE]", { provider: "Groq", model: "openai/gpt-oss-120b", failureReason });
    return { provider: "Groq", model: "openai/gpt-oss-120b", text: null, failureReason };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateTimelineModelResponse(
  prompt: string,
  geminiKey: string,
  groqKey?: string,
): Promise<TimelineGenerationResult> {
  let sawProviderText = false;
  let sawInvalidResponse = false;
  const attempts: Array<Promise<TimelineProviderAttempt>> = [tryGemini(prompt, geminiKey, "gemini-3.6-flash")];
  if (groqKey) attempts.push(tryGroq(prompt, groqKey));
  attempts.push(tryGemini(prompt, geminiKey, "gemini-3.5-flash"));

  for (const attemptPromise of attempts) {
    const attempt = await attemptPromise;
    if (!attempt.text) continue;
    sawProviderText = true;
    const parsed = normalizeModelResponse(attempt.text);
    if (parsed) {
      console.log("[TIMELINE_AI_SUCCESS]", { provider: attempt.provider, model: attempt.model, eventCount: parsed.events.length });
      return { status: "success", response: parsed, provider: attempt.provider, model: attempt.model };
    }
    sawInvalidResponse = true;
    console.warn("[TIMELINE_AI_INVALID_RESPONSE]", { provider: attempt.provider, model: attempt.model });
  }

  const status = sawProviderText && sawInvalidResponse ? "invalid_response" : "provider_failure";
  console.warn("[TIMELINE_AI_FAILURE]", { status });
  return { status, response: null, provider: null, model: null };
}

type TimelineHandlerDependencies = {
  getCachedTimeline: typeof getCachedTimeline;
  setCachedTimeline: typeof setCachedTimeline;
  generateTimelineModelResponse: typeof generateTimelineModelResponse;
  resolveTimelineEvidence: (input: {
    title: string;
    originalTitle?: string | null;
    year: number | null;
    mediaType: TimelineMediaType;
    overview?: string | null;
    seasonNumber?: number | null;
    seasonName?: string | null;
  }) => Promise<TimelineEvidenceResult>;
};

const defaultDependencies: TimelineHandlerDependencies = {
  getCachedTimeline,
  setCachedTimeline,
  generateTimelineModelResponse,
  resolveTimelineEvidence,
};

export async function handler(
  req: any,
  res?: any,
  dependencyOverrides: Partial<TimelineHandlerDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };

  if (String(req?.method ?? "POST").toUpperCase() !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405, res);
  }

  try {
    const body = await readBody(req);

    // This check intentionally precedes rate limiting, TMDB access, cache access,
    // and model generation so locked requests cannot reveal or generate spoilers.
    if (body?.spoilerMode !== true) {
      return jsonResponse({ error: "Timeline requires spoiler mode." }, 403, res);
    }

    const provider = resolveProvider(body?.providerId);
    const mediaLens = normalizeMediaLens(body?.mediaLens);
    if (!provider || mediaLens !== provider.mediaLens) {
      return jsonResponse({ error: "A valid TMDB movie or TV provider identity is required." }, 400, res);
    }
    const requestedSeasonNumber = body?.seasonNumber === undefined || body?.seasonNumber === null
      ? null
      : Number(body.seasonNumber);
    if (provider.mediaType === "tv" && requestedSeasonNumber !== null && (!Number.isInteger(requestedSeasonNumber) || requestedSeasonNumber < 1)) {
      return jsonResponse({ error: "A valid TV season number is required." }, 400, res);
    }
    if (provider.mediaType === "movie" && requestedSeasonNumber !== null) {
      return jsonResponse({ error: "Movies do not support season selection." }, 400, res);
    }

    const clientIp = extractClientIp(req);
    if (clientIp !== "unknown") {
      const rateLimit = checkRateLimit(`timeline:${clientIp}`, 12, 60_000);
      if (!rateLimit.allowed) {
        console.log("[TIMELINE_RATE_LIMITED]", { retryAfter: rateLimit.retryAfter });
        return jsonResponse({ error: "Too many timeline requests." }, 429, res);
      }
    }

    const cacheSeasonNumber = provider.mediaType === "tv" ? (requestedSeasonNumber ?? 1) : null;
    const cacheKey = await buildTimelineCacheKey(provider.providerId, provider.mediaType, undefined, undefined, undefined, cacheSeasonNumber);
    const cachedTimeline = await dependencies.getCachedTimeline(cacheKey.documentId);
    if (cachedTimeline) {
      console.log("[TIMELINE_CACHE_HIT]", cacheKey.compositeKey);
      return jsonResponse({ timeline: cachedTimeline, cached: true }, 200, res);
    }
    console.log("[TIMELINE_CACHE_MISS]", cacheKey.compositeKey);

    const env = (globalThis as any).process?.env ?? {};
    const tmdbKey = (env.TMDB_API_KEY || env.VITE_TMDB_API_KEY)?.trim();
    const geminiKey = env.GEMINI_API_KEY?.trim();
    const groqKey = env.GROQ_API_KEY?.trim();
    if (!tmdbKey || !geminiKey) {
      return jsonResponse({ error: "Timeline providers are not configured." }, 503, res);
    }

    const tmdbResponse = await fetch(
      `https://api.themoviedb.org/3/${provider.mediaType}/${provider.providerId.split("::").pop()}?api_key=${tmdbKey}&append_to_response=credits,keywords`,
    );
    if (!tmdbResponse.ok) {
      return jsonResponse({ error: "TMDB grounding data is unavailable." }, 502, res);
    }

    const rawData = await tmdbResponse.json();
    const seasons = provider.mediaType === "tv" ? buildSeasons(rawData) : [];
    const selectedSeason = provider.mediaType === "tv"
      ? seasons.find((season) => season.seasonNumber === cacheSeasonNumber) ?? null
      : null;
    if (provider.mediaType === "tv" && !selectedSeason) {
      return jsonResponse({ error: "The requested TV season is unavailable." }, 404, res);
    }

    const grounding = buildGrounding(rawData, provider.mediaType, seasons, selectedSeason);
    if (!grounding) {
      return jsonResponse({ timeline: emptyTimeline(provider.providerId, provider.mediaType) }, 200, res);
    }

    const releaseYear = grounding.releaseDate && /^\d{4}/.test(grounding.releaseDate)
      ? Number(grounding.releaseDate.slice(0, 4))
      : null;
    const evidenceResult = await dependencies.resolveTimelineEvidence({
      title: grounding.title,
      originalTitle: grounding.originalTitle,
      year: releaseYear,
      mediaType: grounding.mediaType,
      overview: grounding.overview,
      seasonNumber: grounding.seasonNumber,
      seasonName: grounding.seasonName,
    });
    console.log("[TIMELINE_NARRATIVE_EVIDENCE]", {
      providerId: provider.providerId,
      mediaType: provider.mediaType,
      source: evidenceResult.evidence.source,
      reason: evidenceResult.reason,
      pageTitle: evidenceResult.pageTitle,
      characterCount: evidenceResult.evidence.text.length,
    });

    if (evidenceResult.evidence.source === "none" || !evidenceResult.evidence.text) {
      return jsonResponse({ timeline: emptyTimeline(provider.providerId, provider.mediaType, grounding) }, 200, res);
    }

    const generationGrounding = {
      ...grounding,
      narrativeEvidence: evidenceResult.evidence,
    };
    const generation = await dependencies.generateTimelineModelResponse(buildPrompt(generationGrounding), geminiKey, groqKey);
    if (generation.status !== "success" || !generation.response) {
      return jsonResponse({
        error: generation.status === "invalid_response"
          ? "Timeline provider returned an invalid structured response."
          : "Timeline providers failed.",
        code: generation.status === "invalid_response"
          ? "TIMELINE_INVALID_RESPONSE"
          : "TIMELINE_PROVIDER_FAILURE",
      }, 502, res);
    }

    const timeline = buildTimeline(generation.response, provider.providerId, provider.mediaType, grounding);
    if (timeline.events.length === 0) {
      console.log("[TIMELINE_AI_EMPTY]", { provider: generation.provider, model: generation.model });
    }
    if (timeline.events.length > 0) {
      dependencies.setCachedTimeline(cacheKey.documentId, cacheKey.compositeKey, timeline)
        .catch((error) => console.error("[TIMELINE_CACHE_WRITE_ERROR]", error));
    }

    return jsonResponse({
      timeline,
    }, 200, res);
  } catch (error) {
    console.error("[Nerdvana] Timeline generation failed:", error);
    return jsonResponse({ error: "Timeline generation failed." }, 500, res);
  }
}

export default handler;
