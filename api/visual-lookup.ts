import { getIGDBToken } from "./igdbAuth.js";
import {
  isCompatibleComicVineType,
  normalizeComicVineResourceType,
  inferProviderTypeFromId,
} from "../src/lib/resolver/providerMetadata.js";
import { normalizeMediaLens } from "../src/app/mediaLens.js";
import {
  rankCandidates,
  validateVisualAssetCompatibility,
  validateCandidateCompatibility,
  type ValidatedVisualAsset,
  type CanonicalResolution,
  type ResolverCandidate,
  type ScoringContext,
  type ResolverContextPacket,
} from "../src/app/canonicalResolver.js";
import {
  buildVisualArbitrationContext,
  applyMultimodalArbitrationToCandidate,
} from "../src/lib/resolver/multimodal/visualLookupArbitration.js";
import type { ProductionRetrievalTelemetry } from "../src/lib/resolver/multimodal/productionRetrievalTelemetry.js";
import { sanitizeExternalDescription } from "../src/lib/utils/sanitizeHtml.js";

// ─── Types ────────────────────────────────────────────────────────────

export type RetrievalConfidence = "high" | "medium" | "low" | "fallback";

export type RetrievalMode =
  | "STRICT"
  | "RELAXED"
  | "FRANCHISE"
  | "ENTITY"
  | "POPULARITY";

export interface RetrievalTraceEntry {
  candidate: string;
  source: string;
  score: number;
  confidence: RetrievalConfidence;
  mode: RetrievalMode;
  entityGrounding: number;
  franchiseGrounding: number;
  providerReliability: number;
  entityTypeAlignment: boolean;
  matchedAnchors: string[];
  boosts: string[];
  penalties: string[];
  rejected?: boolean;
  rejectionReason?: string;
  // Phase 12.8 diagnostics
  tokenOverlap?: number;
  normalizedSimilarity?: number;
  relaxationStage?: RetrievalMode;
  multimodalBoosts?: string[];
  multimodalPenalties?: string[];
}

export type RetrievalOutcome =
  | {
      state: "SUCCESS";
      asset: ValidatedVisualAsset;
      confidence: RetrievalConfidence;
      mode: RetrievalMode;
      retrievalTrace?: RetrievalTraceEntry[];
      productionTelemetry?: ProductionRetrievalTelemetry;
    }
  | {
      state: "NO_COMPATIBLE_RESULTS";
      reason?: string;
      retrievalTrace?: RetrievalTraceEntry[];
      productionTelemetry?: ProductionRetrievalTelemetry;
    }
  | { state: "PROCESSING_ERROR"; error: string }
  | { state: "API_ERROR"; error: string };

// ─── Utilities ────────────────────────────────────────────────────────

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
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

// ─── Token Overlap Guard ──────────────────────────────────────────────

/**
 * Tokenizes a string into a set of normalized lowercase alpha-numeric words,
 * stripping stop-words and punctuation. Used for hard overlap comparison.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or",
  "is", "was", "are", "be", "been", "by", "from", "with", "as", "that",
  "this", "it", "its", "part", "season", "episode", "vol", "volume"
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 2 && !STOP_WORDS.has(t))
  );
}

/**
 * Returns the Jaccard-style overlap ratio between the query anchor tokens
 * and the candidate name tokens.
 * 
 * A score of 0 means zero shared tokens — the candidate is completely
 * unrelated to the query and must be rejected regardless of any scoring.
 */
function computeTokenOverlap(candidateName: string, anchors: string[]): number {
  if (!anchors.length) return 0;

  const candidateTokens = tokenize(candidateName);
  if (candidateTokens.size === 0) return 0;

  // Build a unified set of query anchor tokens
  const queryTokens = new Set<string>();
  for (const anchor of anchors) {
    for (const t of tokenize(anchor)) queryTokens.add(t);
  }
  if (queryTokens.size === 0) return 0;

  // Count shared tokens
  let shared = 0;
  for (const t of candidateTokens) {
    if (queryTokens.has(t)) shared++;
  }

  // Overlap = shared / smaller set (bias toward query)
  return shared / Math.min(candidateTokens.size, queryTokens.size);
}

/**
 * Phase 12.8 Hard Title Verification Gate.
 *
 * Before any relaxed winner is accepted, this gate verifies that the
 * candidate name shares meaningful token overlap with the grounding anchors.
 * Candidates with zero or near-zero overlap are rejected immediately,
 * regardless of their scored confidence or URL availability.
 *
 * This prevents semantic neighbor bleed: e.g. "Thus Spoke Kishibe Rohan"
 * winning for query "Johan Liebert Monster anime".
 *
 * RELAXATION MUST NEVER MEAN SEMANTIC REINTERPRETATION.
 * It only tolerates: punctuation variance, article variance, subtitle stripping.
 */
function verifyTitleAlignment(
  candidateName: string,
  packet: ResolverContextPacket,
  mode: RetrievalMode
): { passed: boolean; tokenOverlap: number; rejectionReason?: string } {
  // Build anchor pool: entity name + franchise name tokens are authoritative
  const anchors = [
    packet.canonicalEntity,
    packet.expandedEntity,
    packet.parentFranchise,
    ...(packet.entityAliases ?? [])
  ].filter(Boolean) as string[];

  const tokenOverlap = computeTokenOverlap(candidateName, anchors);

  // STRICT mode: already has its own validation chain — still run overlap
  // as an additional diagnostic but don't add a new rejection layer here
  // (STRICT already rejects on entityGrounding < 0.5).
  if (mode === "STRICT") {
    return { passed: true, tokenOverlap };
  }

  // RELAXED / FRANCHISE / ENTITY / POPULARITY:
  // Must share at least 1 meaningful token with canonical entity or franchise.
  // Threshold: 0.10 (i.e., at least ~1 shared token in a 10-token query).
  // This is intentionally low — we want to catch complete non-overlaps
  // like "Thus Spoke Kishibe Rohan" vs "Johan Liebert Monster".
  const OVERLAP_THRESHOLD = 0.10;

  if (tokenOverlap < OVERLAP_THRESHOLD) {
    return {
      passed: false,
      tokenOverlap,
      rejectionReason: `token_overlap_too_low (${tokenOverlap.toFixed(3)} < ${OVERLAP_THRESHOLD}) — candidate "${candidateName}" shares no meaningful tokens with entity anchors`
    };
  }

  return { passed: true, tokenOverlap };
}

// ─── Progressive Descriptor Simplification ───────────────────────────

/**
 * Returns a tiered set of search targets from most specific to most general.
 * Implements Phase 6: Smart Descriptor Relaxation.
 */
function buildDescriptorTiers(packet: ResolverContextPacket): {
  strict: string;
  relaxed: string;
  franchise: string;
  entity: string;
  popularity: string;
} {
  const entity = packet.expandedEntity || packet.canonicalEntity;
  const franchise = packet.parentFranchise;
  const descriptor = packet.retrievalDescriptor;

  // STRICT: Full semantic descriptor (e.g. "Carl Johnson Grand Theft Auto San Andreas game character")
  const strict = descriptor || entity;

  // RELAXED: Entity + franchise shorthand
  const relaxed = franchise
    ? `${entity} ${franchise}`.trim()
    : entity;

  // FRANCHISE: Franchise only (e.g. "Grand Theft Auto San Andreas" or "Monster anime")
  const franchiseTarget = franchise || entity;

  // ENTITY: Expanded canonical name only (e.g. "Carl Johnson")
  const entityTarget = entity;

  // POPULARITY: Short alias or first meaningful word
  const words = entity.split(/\s+/);
  const popularity = words.length > 1 ? words.slice(0, 2).join(" ") : entity;

  return {
    strict,
    relaxed,
    franchise: franchiseTarget,
    entity: entityTarget,
    popularity,
  };
}

// ─── Provider Adapters ────────────────────────────────────────────────

async function fetchTMDB(
  query: string,
  type: "movie" | "tv",
  apiKey: string
): Promise<ResolverCandidate[]> {
  const endpoint = type === "movie" ? "movie" : "tv";
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/${endpoint}?query=${encodeURIComponent(query)}&api_key=${apiKey}`
    );

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.error(`[Nerdvana] TMDB auth FAILED (${res.status}) for ${type}. Check TMDB_API_KEY value.`);
        return [];
      }
      // Non-auth failure: try multi-search fallback
      const multiRes = await fetch(
        `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${apiKey}`
      );
      if (!multiRes.ok) return [];
      const multiData = await multiRes.json();
      const results = Array.isArray(multiData?.results) ? multiData.results : [];
      return results
        .filter((r: any) => r && r.media_type === type)
        .map((r: any) => mapTMDBToCandidate(r, type));
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((r: any) => mapTMDBToCandidate(r, type));
  } catch (err) {
    console.warn(`[Nerdvana] TMDB fetch failed for ${type}:`, err);
    return [];
  }
}

function mapTMDBToCandidate(r: any, type: string): ResolverCandidate {
  const name = r.title ?? r.name ?? r.original_title ?? r.original_name ?? "Unknown Title";
  const dateStr = r.release_date || r.first_air_date;
  let year: number | null = null;
  if (typeof dateStr === "string" && dateStr.length >= 4) {
    const parsed = parseInt(dateStr.slice(0, 4));
    if (!isNaN(parsed)) year = parsed;
  }
  return {
    name,
    source: "tmdb",
    bucket: "title",
    imageUrl: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
    year,
    popularity: typeof r.vote_average === "number" ? r.vote_average * 10 : null,
    genres: [],
    raw: r,
    posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w780${r.poster_path}` : (r.backdrop_path ? `https://image.tmdb.org/t/p/w780${r.backdrop_path}` : null),
    backdropUrl: r.backdrop_path ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}` : null,
  };
}

async function fetchJikan(query: string, mediaType: string): Promise<ResolverCandidate[]> {
  const candidates: ResolverCandidate[] = [];
  try {
    const animeRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8`);
    if (animeRes.ok) {
      const data = await animeRes.json();
      const results = Array.isArray(data?.data) ? data.data : [];
      candidates.push(...results.map((r: any) => ({
        name: r.title_english ?? r.title ?? "",
        source: "jikan",
        bucket: "title",
        imageUrl: r.images?.jpg?.large_image_url ?? r.images?.jpg?.image_url ?? null,
        year: r.aired?.prop?.from?.year ?? null,
        popularity: r.score ? r.score * 10 : null,
        raw: r,
        posterUrl: r.images?.jpg?.large_image_url ?? r.images?.jpg?.image_url ?? null,
        backdropUrl: null,
      } as ResolverCandidate)));
    }
  } catch (err) {}

  if (mediaType === "manga" || candidates.length === 0) {
    try {
      await new Promise(r => setTimeout(r, 400));
      const mangaRes = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=5`);
      if (mangaRes.ok) {
        const data = await mangaRes.json();
        const results = Array.isArray(data?.data) ? data.data : [];
        candidates.push(...results.map((r: any) => ({
          name: r.title_english ?? r.title ?? "",
          source: "jikan",
          bucket: "title",
          imageUrl: r.images?.jpg?.large_image_url ?? r.images?.jpg?.image_url ?? null,
          year: r.published?.prop?.from?.year ?? null,
          popularity: r.score ? r.score * 10 : null,
          raw: r,
          posterUrl: r.images?.jpg?.large_image_url ?? r.images?.jpg?.image_url ?? null,
          backdropUrl: null,
        } as ResolverCandidate)));
      }
    } catch (err) {}
  }

  return candidates;
}

async function fetchRAWG(query: string, apiKey: string): Promise<ResolverCandidate[]> {
  try {
    const res = await fetch(`https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(query)}&page_size=5`);
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((r: any) => ({
      name: r.name ?? "",
      source: "rawg",
      bucket: "title",
      imageUrl: r.background_image ?? null,
      year: r.released ? parseInt(r.released.slice(0, 4)) : null,
      popularity: r.rating ? r.rating * 20 : null,
      genres: (r.genres ?? []).map((g: any) => g.name),
      raw: r,
      posterUrl: r.background_image ?? null,
      backdropUrl: r.background_image ?? null,
    }));
  } catch { return []; }
}

async function fetchIGDB(query: string, clientId: string, clientSecret: string): Promise<ResolverCandidate[]> {
  try {
    const cachedIGDBToken = await getIGDBToken(clientId, clientSecret);
    if (!cachedIGDBToken) return [];

    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${cachedIGDBToken}`,
        "Content-Type": "text/plain",
      },
      body: `search "${query}"; fields name, cover.url, first_release_date, rating, genres.name, involved_companies.company.name; limit 5;`,
    });

    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data) ? data : [];
    return results.map((r: any) => ({
      name: r.name ?? "",
      source: "igdb",
      bucket: "title",
      imageUrl: r.cover?.url ? `https:${r.cover.url.replace("t_thumb", "t_cover_big")}` : null,
      year: r.first_release_date ? new Date(r.first_release_date * 1000).getFullYear() : null,
      popularity: r.rating ?? null,
      genres: r.genres?.map((g: any) => g.name) || [],
      publisher: r.involved_companies?.[0]?.company?.name || null,
      raw: r,
      posterUrl: r.cover?.url ? `https:${r.cover.url.replace("t_thumb", "t_cover_big")}` : null,
      backdropUrl: null,
    }));
  } catch { return []; }
}

async function fetchComicVine(query: string, apiKey: string): Promise<ResolverCandidate[]> {
  try {
    const url = `https://comicvine.gamespot.com/api/search/?api_key=${apiKey}&query=${encodeURIComponent(query + " comics")}&resources=volume,character&field_list=name,image,description,start_year,publisher,deck&format=json&limit=5`;
    const res = await fetch(url, { headers: { "User-Agent": "Nerdvana/1.0" } });
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((r: any) => ({
      name: r.name ?? "",
      source: "comicvine",
      bucket: "title",
      imageUrl: r.image?.super_url || r.image?.medium_url || null,
      year: r.start_year ? parseInt(r.start_year) : null,
      popularity: null,
      publisher: r.publisher?.name || null,
      raw: r,
      posterUrl: r.image?.super_url || r.image?.medium_url || null,
      backdropUrl: null,
    }));
  } catch { return []; }
}

async function fetchGoogleBooks(query: string): Promise<ResolverCandidate[]> {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`intitle:${query} subject:comics`)}&maxResults=3`);
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data?.items) ? data.items : [];
    return results.map((r: any) => {
      const info = r.volumeInfo ?? {};
      return {
        name: info.title ?? "",
        source: "googlebooks",
        bucket: "title",
        imageUrl: info.imageLinks?.thumbnail?.replace("http://", "https://") || null,
        year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : null,
        popularity: null,
        raw: info,
        posterUrl: info.imageLinks?.thumbnail?.replace("http://", "https://") || null,
        backdropUrl: null,
      };
    });
  } catch { return []; }
}

// ─── Provider Orchestration ───────────────────────────────────────────

async function fetchCandidates(
  query: string,
  mediaLens: string,
  keys: { tmdb?: string; rawg?: string; igdbId?: string; igdbSecret?: string; comicVine?: string }
): Promise<ResolverCandidate[]> {
  try {
    if (mediaLens === "movies") {
      if (keys.tmdb) return await fetchTMDB(query, "movie", keys.tmdb);
      console.warn("[Nerdvana] TMDB key missing for movies.");
      return [];
    }
    if (mediaLens === "tv") {
      if (keys.tmdb) return await fetchTMDB(query, "tv", keys.tmdb);
      console.warn("[Nerdvana] TMDB key missing for TV.");
      return [];
    }
    if (mediaLens === "anime") {
      return await fetchJikan(query, "anime");
    }
    if (mediaLens === "games") {
      if (keys.igdbId && keys.igdbSecret) {
        const igdb = await fetchIGDB(query, keys.igdbId, keys.igdbSecret);
        if (igdb.length > 0) return igdb;
      }
      if (keys.rawg) return await fetchRAWG(query, keys.rawg);
      return [];
    }
    if (mediaLens === "comics") {
      if (keys.comicVine) {
        const cv = await fetchComicVine(query, keys.comicVine);
        if (cv.length > 0) return cv;
      }
      return await fetchGoogleBooks(query);
    }
  } catch (err) {
    console.error("[Nerdvana] fetchCandidates exception:", err);
  }
  return [];
}

// ─── Canonical Arbitration ───────────────────────────────────────────

function performCanonicalArbitration(
  candidate: ResolverCandidate,
  packet: ResolverContextPacket
) {
  const name = candidate.name.toLowerCase();
  const raw = (candidate.raw ?? {}) as Record<string, any>;
  
  // 1. Entity Grounding (Phase 3)
  const entityAliases = packet.entityAliases ?? [];
  const entityMatch = entityAliases.some(alias => name.includes(alias.toLowerCase()));
  
  // 2. Franchise Grounding (Phase 2)
  const franchiseAliases = packet.franchiseAliases ?? [];
  const searchableMetadata = [
    name,
    ...(candidate.genres ?? []),
    candidate.publisher,
    raw.overview,
    raw.description,
    raw.deck,
    raw.tagline,
    ...(raw.franchises?.map((f: any) => f.name) ?? []),
    raw.franchise?.name,
    raw.collection?.name,
    ...(raw.genres?.map((g: any) => g.name) ?? []),
  ].filter(Boolean).map(s => String(s).toLowerCase());

  let franchiseHits = 0;
  const matchedAnchors: string[] = [];
  
  for (const anchor of franchiseAliases) {
    if (searchableMetadata.some(m => m.includes(anchor.toLowerCase()))) {
      franchiseHits++;
      matchedAnchors.push(anchor);
    }
  }

  // 3. Provider Semantic Intelligence (Phase 6)
  let providerReliability = 1.0;
  if (candidate.source === "jikan" && packet.entityKind === "character") {
    // Jikan often returns series posters for characters
    if (!name.includes(packet.expandedEntity.toLowerCase())) {
      providerReliability *= 0.6;
    }
  }
  if (candidate.source === "igdb" && (name.includes("dlc") || name.includes("edition"))) {
    providerReliability *= 0.8;
  }

  // 4. Entity Type Alignment (Phase 8)
  let typeAlignment = true;
  if (packet.entityKind === "character") {
    // Characters usually from TMDB person (not handled) or character buckets
    if (candidate.bucket === "title" && !entityMatch) {
      typeAlignment = false;
    }
  }

  const entityGrounding = entityMatch ? 1.0 : 0.2;
  const franchiseGrounding = franchiseAliases.length > 0 
    ? Math.min(1.0, franchiseHits / Math.max(1, Math.min(3, franchiseAliases.length)))
    : 0.5;

  return {
    entityGrounding,
    franchiseGrounding,
    providerReliability,
    entityTypeAlignment: typeAlignment,
    matchedAnchors: matchedAnchors.slice(0, 5),
  };
}

// ─── Score & Trace ────────────────────────────────────────────────────

function scoreCandidatesWithTrace(
  candidates: ResolverCandidate[],
  ctx: ScoringContext,
  mode: RetrievalMode,
  trace: RetrievalTraceEntry[],
  packet: ResolverContextPacket,
  mmCtx?: ReturnType<typeof buildVisualArbitrationContext>
): Array<ResolverCandidate & { finalScore: number }> {
  const { ranked } = rankCandidates(candidates, ctx);
  const multimodal = mmCtx ?? buildVisualArbitrationContext(packet);

  for (const c of ranked) {
    const arb = performCanonicalArbitration(c, packet);

    const arbWeight = (arb.entityGrounding * 0.4) + (arb.franchiseGrounding * 0.4) + (arb.providerReliability * 0.2);
    let finalScore = c.finalScore * arbWeight * (arb.entityTypeAlignment ? 1.0 : 0.7);

    const mmAdjust = applyMultimodalArbitrationToCandidate(c, packet, multimodal, finalScore);
    finalScore = mmAdjust.finalScore;

    c.finalScore = Math.round(finalScore);

    trace.push({
      candidate: c.name,
      source: c.source,
      score: c.finalScore,
      confidence: modeToConfidence(mode),
      mode,
      entityGrounding: arb.entityGrounding,
      franchiseGrounding: arb.franchiseGrounding,
      providerReliability: arb.providerReliability,
      entityTypeAlignment: arb.entityTypeAlignment,
      matchedAnchors: arb.matchedAnchors,
      boosts: mmAdjust.boosts,
      penalties: mmAdjust.penalties,
      multimodalBoosts: mmAdjust.boosts,
      multimodalPenalties: mmAdjust.penalties,
    });
  }

  return ranked.sort((a, b) => b.finalScore - a.finalScore);
}

// ─── Validation (Score-Degraded, Not Binary) ──────────────────────────

// Phase 12.8 minimum score floor per relaxation mode.
// Even with a valid URL, a winner must clear this floor — otherwise
// the system is accepting semantically desperate guesses.
const RELAXED_SCORE_FLOORS: Record<RetrievalMode, number> = {
  STRICT:     0,   // STRICT has its own hard entityGrounding gate
  RELAXED:    18,  // must have survived scoring — not a near-zero ghost
  FRANCHISE:  12,
  ENTITY:     8,
  POPULARITY: 0,   // POPULARITY is gated separately (disabled for anime)
};

function tryValidate(
  best: ResolverCandidate & { finalScore: number },
  resolution: CanonicalResolution,
  validationContext: any,
  mode: RetrievalMode,
  trace: RetrievalTraceEntry[],
  packet: ResolverContextPacket
): ValidatedVisualAsset | null {
  const rawOverview = (best.raw as any)?.overview ?? (best.raw as any)?.description ?? (best.raw as any)?.deck ?? "";

  const visualDataInput = {
    url: best.imageUrl ?? null,
    title: best.name,
    source: best.source,
    mediaType: resolution.mediaType,
    franchise: resolution.parentFranchise ?? undefined,
    year: best.year ?? null,
    overview: sanitizeExternalDescription(rawOverview),
    genres: best.genres ?? [],
    raw: best.raw,
    posterUrl: best.posterUrl ?? best.imageUrl ?? null,
    backdropUrl: best.backdropUrl ?? null,
  };

  const validated = validateVisualAssetCompatibility(visualDataInput, resolution, validationContext);
  const arb = performCanonicalArbitration(best, packet);
  const traceEntry = trace.find(t => t.candidate === best.name && t.mode === mode);

  // ── Phase 12.8: Hard Title Verification Gate ────────────────────────
  // Run on ALL modes. A candidate that shares zero meaningful tokens with
  // the canonical entity or franchise MUST be rejected — no exceptions.
  const titleCheck = verifyTitleAlignment(best.name, packet, mode);
  if (traceEntry) {
    traceEntry.tokenOverlap = titleCheck.tokenOverlap;
    traceEntry.relaxationStage = mode;
  }

  if (!titleCheck.passed) {
    console.log(
      `[Nerdvana] [${mode}] ✗ TITLE VERIFICATION FAILED — "${best.name}" rejected.`,
      `tokenOverlap=${titleCheck.tokenOverlap.toFixed(3)}`,
      titleCheck.rejectionReason
    );
    if (traceEntry) {
      traceEntry.rejected = true;
      traceEntry.rejectionReason = titleCheck.rejectionReason;
    }
    return null;
  }

  // ── Phase 12.8: Minimum Score Confidence Gate ───────────────────────
  // Even if the candidate passes title verification, if its score is
  // below the floor for this mode, the system is semantically desperate.
  const scoreFloor = RELAXED_SCORE_FLOORS[mode];
  if (scoreFloor > 0 && best.finalScore < scoreFloor) {
    console.log(
      `[Nerdvana] [${mode}] ✗ SCORE FLOOR FAILED — "${best.name}" score ${best.finalScore} < floor ${scoreFloor}. Rejecting.`
    );
    if (traceEntry) {
      traceEntry.rejected = true;
      traceEntry.rejectionReason = `score_below_floor (${best.finalScore} < ${scoreFloor})`;
    }
    return null;
  }

  // ── Hard Rejection Rules (Phase 5, preserved) ────────────────────────
  if (mode === "STRICT") {
    // Reject isolated name collisions (e.g. "Eren the Southpaw")
    if (arb.entityGrounding > 0.8 && arb.franchiseGrounding < 0.3) {
      if (traceEntry) {
        traceEntry.rejected = true;
        traceEntry.rejectionReason = "isolated_name_collision";
      }
      return null;
    }
    if (!validated?.validated || !validated.url || arb.entityGrounding < 0.5) {
      if (traceEntry) {
        traceEntry.rejected = true;
        traceEntry.rejectionReason = "strict_validation_failed";
      }
      return null;
    }
    return validated;
  }

  // For RELAXED → POPULARITY: reject if no URL exists.
  if (!validated?.url) {
    if (traceEntry) {
      traceEntry.rejected = true;
      traceEntry.rejectionReason = "no_image_url";
    }
    return null;
  }

  // Apply score penalty for degraded modes.
  const modeScalars: Record<RetrievalMode, number> = {
    STRICT:     1.0,
    RELAXED:    0.82,
    FRANCHISE:  0.65,
    ENTITY:     0.5,
    POPULARITY: 0.35,
  };
  const degradedScore = (validated.compatibilityScore ?? 0.5) * modeScalars[mode];
  return { ...validated, compatibilityScore: Math.max(0.1, degradedScore) };
}

function modeToConfidence(mode: RetrievalMode): RetrievalConfidence {
  if (mode === "STRICT") return "high";
  if (mode === "RELAXED") return "medium";
  if (mode === "FRANCHISE") return "medium";
  if (mode === "ENTITY") return "low";
  return "fallback";
}

async function fetchDirectProvider(
  providerId: string,
  keys: { tmdb?: string; rawg?: string; igdbId?: string; igdbSecret?: string; comicVine?: string }
): Promise<ResolverCandidate | null> {
  const parts = providerId.split("::");
  if (parts.length < 3) return null;
  const source = parts[0];
  const type = parts[1]; // movie or tv or game
  const id = parts[2];

  const prefixMap: Record<string, string> = {
    character: "4005",
    volume: "4050",
    issue: "4000",
    story_arc: "4045",
    event: "4015",
    team: "4060",
    publisher: "4010"
  };

  if (source === "comicvine" && keys.comicVine) {
    try {
      const prefix = prefixMap[type];
      if (prefix) {
        console.log(`[COMICVINE_DIRECT_FETCH] Fetching direct ComicVine resource: ${type} with ID ${id}`);
        const url = `https://comicvine.gamespot.com/api/${type}/${prefix}-${id}/?api_key=${keys.comicVine}&format=json&field_list=id,name,image,description,deck,start_year,publisher,resource_type`;
        const res = await fetch(url, { headers: { "User-Agent": "Nerdvana/1.0" } });
        if (res.ok) {
          const data = await res.json();
          const r = data?.results;
          if (r) {
            return {
              name: r.name ?? "",
              source: "comicvine",
              bucket: "title",
              imageUrl: r.image?.super_url || r.image?.medium_url || null,
              year: r.start_year ? parseInt(r.start_year) : null,
              popularity: null,
              publisher: r.publisher?.name || null,
              raw: r,
            };
          }
        }
      }
    } catch (e) {
      console.error("[Nerdvana] Direct ComicVine fetch failed:", e);
    }
  }

  if (source === "tmdb" && keys.tmdb) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${keys.tmdb}`);
      if (res.ok) {
        const raw = await res.json();
        return mapTMDBToCandidate(raw, type);
      }
    } catch (e) {
      console.error("[Nerdvana] Direct TMDB fetch failed:", e);
    }
  }

  if (source === "rawg" && keys.rawg) {
    try {
      const res = await fetch(`https://api.rawg.io/api/games/${id}?key=${keys.rawg}`);
      if (res.ok) {
        const raw = await res.json();
        return {
          name: raw.name ?? "",
          source: "rawg",
          bucket: "title",
          imageUrl: raw.background_image ?? null,
          year: raw.released ? parseInt(raw.released.slice(0, 4)) : null,
          popularity: raw.rating ? raw.rating * 20 : null,
          genres: (raw.genres ?? []).map((g: any) => g.name),
          raw,
        };
      }
    } catch (e) {
      console.error("[Nerdvana] Direct RAWG fetch failed:", e);
    }
  }

  if (source === "igdb" && keys.igdbId && keys.igdbSecret) {
    try {
      const igdbToken = await getIGDBToken(keys.igdbId, keys.igdbSecret);
      if (igdbToken) {
        const res = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: {
            "Client-ID": keys.igdbId,
            Authorization: `Bearer ${igdbToken}`,
            "Content-Type": "text/plain",
          },
          body: `fields name, cover.url, first_release_date, rating, genres.name, involved_companies.company.name; where id = ${id}; limit 1;`,
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const r = data[0];
            return {
              name: r.name ?? "",
              source: "igdb",
              bucket: "title",
              imageUrl: r.cover?.url ? `https:${r.cover.url.replace("t_thumb", "t_cover_big")}` : null,
              year: r.first_release_date ? new Date(r.first_release_date * 1000).getFullYear() : null,
              popularity: r.rating ?? null,
              genres: r.genres?.map((g: any) => g.name) || [],
              publisher: r.involved_companies?.[0]?.company?.name || null,
              raw: r,
            };
          }
        }
      }
    } catch (e) {
      console.error("[Nerdvana] Direct IGDB fetch failed:", e);
    }
  }

  if (source === "jikan") {
    try {
      const endpoint = type === "manga" ? "manga" : "anime";
      const res = await fetch(`https://api.jikan.moe/v4/${endpoint}/${id}`);
      if (res.ok) {
        const raw = await res.json();
        const r = raw?.data;
        if (r) {
          return {
            name: r.title_english ?? r.title ?? "",
            source: "jikan",
            bucket: "title",
            imageUrl: r.images?.jpg?.large_image_url ?? r.images?.jpg?.image_url ?? null,
            year: (r.aired || r.published)?.prop?.from?.year ?? null,
            popularity: r.score ? r.score * 10 : null,
            raw: r,
          };
        }
      }
    } catch (e) {
      console.error("[Nerdvana] Direct Jikan fetch failed:", e);
    }
  }

  return null;
}

async function fetchAnimeVisualByCanonicalId(anilistId: number): Promise<ResolverCandidate | null> {
  const query = `
    query ($id: Int) {
      Media (id: $id, type: ANIME) {
        id
        title {
          romaji
          english
          native
        }
        synonyms
        meanScore
        coverImage {
          extraLarge
          large
        }
        bannerImage
        startDate {
          year
        }
        description
        genres
      }
    }
  `;
  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { id: anilistId }
      })
    });
    if (!response.ok) return null;
    const json = await response.json();
    const media = json?.data?.Media;
    if (!media) return null;
    
    return {
      name: media.title.english ?? media.title.romaji ?? media.title.native ?? "",
      source: "anilist",
      bucket: "title",
      imageUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
      year: media.startDate?.year ?? null,
      popularity: media.meanScore ?? null,
      genres: media.genres ?? [],
      raw: media,
      posterUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
      backdropUrl: media.bannerImage ?? null,
    };
  } catch (err) {
    console.error("[Nerdvana] fetchAnimeVisualByCanonicalId error:", err);
    return null;
  }
}

// ─── Adaptive Retrieval Engine ────────────────────────────────────────

async function adaptiveRetrieve(
  packet: ResolverContextPacket,
  keys: { tmdb?: string; rawg?: string; igdbId?: string; igdbSecret?: string; comicVine?: string }
): Promise<{
  asset: ValidatedVisualAsset;
  confidence: RetrievalConfidence;
  mode: RetrievalMode;
  trace: RetrievalTraceEntry[];
  productionTelemetry: ProductionRetrievalTelemetry;
} | null> {
  const trace: RetrievalTraceEntry[] = [];
  const mmCtx = buildVisualArbitrationContext(packet);

  // ─── AniList Deterministic Visual Fetch Bypass ───
  if (packet.mediaLens === "anime" && packet.providerMetadata && packet.providerMetadata.provider === "anilist") {
    const anilistId = packet.providerMetadata.id;
    const confidence = packet.providerMetadata.confidence ?? 1.0;
    
    // STEP 4 — Confidence Gating
    if (confidence < 0.85) {
      console.log(`[Nerdvana] [ANILIST] ✗ Confidence is weak (${confidence} < 0.85). Terminating anime visual branch.`);
      return null;
    }

    // Explicit Logging Constraint 7
    console.log("[Anime Visual Fetch]", {
      anilistId,
      deterministic: true
    });

    const candidate = await fetchAnimeVisualByCanonicalId(anilistId);
    if (!candidate) {
      console.log(`[Nerdvana] [ANILIST] ✗ AniList ID fetch failed or returned null for ID: ${anilistId}`);
      return null;
    }

    console.log(`[Nerdvana] [ANILIST] ✓ Deterministic Winner locked: "${candidate.name}"`);
    const asset: ValidatedVisualAsset = {
      url: candidate.imageUrl ?? "",
      title: candidate.name,
      source: candidate.source,
      compatibilityScore: 1.0,
      validated: true,
      genres: candidate.genres ?? [],
      year: candidate.year,
      overview: candidate.raw?.description ?? "",
      raw: candidate.raw,
      posterUrl: candidate.posterUrl ?? candidate.imageUrl ?? null,
      backdropUrl: candidate.backdropUrl ?? null,
    };

    return {
      asset,
      confidence: "high",
      mode: "STRICT",
      trace: [{
        candidate: candidate.name,
        mode: "STRICT",
        score: 100,
        finalScore: 100,
        compatibilityScore: 1.0,
        tokenOverlap: 1.0,
        stageScores: { lexical: 100 },
        stageCalculations: { compatibilityScore: 1.0 },
        rules: ["deterministic-anilist-id-lock"],
        accepted: true,
        traceId: "anilist-lock",
      } as any],
      productionTelemetry: mmCtx.telemetry,
    };
  }

  // ─── Direct Provider Native ID Bypass (Deterministic Lookup System A) ────
  if (packet.providerId) {
    const isDeterministicMode = packet.executionMode === "DETERMINISTIC_PROVIDER";
    const expectedSource = packet.providerId.split("::")[0];
    if (isDeterministicMode) {
      console.log(`[DETERMINISTIC OWNERSHIP PROPAGATED] Adaptive visual search starting for: "${packet.canonicalEntity}" (${packet.providerId})`);
    }

    console.log(`[Nerdvana] [DIRECT] Fetching native provider asset by ID: "${packet.providerId}"`);
    let directCandidate = null;
    try {
      directCandidate = await fetchDirectProvider(packet.providerId, keys);
    } catch (e: any) {
      console.log(`[Nerdvana] Direct provider fetch error: ${e.message}`);
    }

    if (expectedSource === "comicvine" && isDeterministicMode) {
      if (!directCandidate) {
        console.log("[DETERMINISTIC_RETRIEVAL_ABORTED] ComicVine direct retrieval failed. Aborting.");
        console.log("[STRICT_SEMANTIC_FIREWALL] ComicVine direct fetch returned null. Fallback blocked.");
        console.log("[SEMANTIC_FALLBACK_BLOCKED] ComicVine direct fetch failed in DETERMINISTIC_PROVIDER mode. Fallback blocked. Returning null.");
        return null;
      }
    }

    if (directCandidate) {
      // Post-Visual Ownership Verification (Visual Mismatch Check)
      if (isDeterministicMode && packet.providerMetadata) {
        const expectedType = packet.providerMetadata.providerType;
        const expectedTitle = packet.providerMetadata.canonicalTitle || packet.canonicalEntity;
        const expectedRoot = packet.providerMetadata.franchiseRoot || "";
        const expectedPublisher = packet.providerMetadata.publisherLabel || "";

        const gotType = directCandidate.raw?.resource_type
          ? normalizeComicVineResourceType(directCandidate.raw.resource_type, directCandidate.name)
          : (packet.providerId ? inferProviderTypeFromId(packet.providerId) : null);

        const gotPublisher = directCandidate.publisher || directCandidate.raw?.publisher?.name || "";

        const cleanCandidateName = directCandidate.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanExpectedTitle = expectedTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanExpectedRoot = expectedRoot.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanExpectedPublisher = expectedPublisher.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanGotPublisher = gotPublisher.toLowerCase().replace(/[^a-z0-9]/g, "");

        const titleMatch = cleanCandidateName.includes(cleanExpectedTitle) || cleanExpectedTitle.includes(cleanCandidateName);
        const rootMatch = cleanExpectedRoot ? cleanCandidateName.includes(cleanExpectedRoot) : true;
        const typeMatch = expectedType && gotType
          ? (expectedSource === "comicvine" ? isCompatibleComicVineType(expectedType, gotType) : expectedType === gotType)
          : true;
        const publisherMatch = cleanExpectedPublisher && cleanGotPublisher
          ? cleanGotPublisher.includes(cleanExpectedPublisher) || cleanExpectedPublisher.includes(cleanGotPublisher)
          : true;

        if (!titleMatch || !rootMatch || !typeMatch || !publisherMatch) {
          console.log("[TYPED_OWNERSHIP_REJECTED] Visual ownership validation failed:", {
            titleMatch, expectedTitle, gotTitle: directCandidate.name,
            rootMatch, expectedRoot,
            typeMatch, expectedType, gotType,
            publisherMatch, expectedPublisher, gotPublisher
          });
          console.log("[DETERMINISTIC_RETRIEVAL_ABORTED] Visual validation gate failed. Mismatch rejected.");
          console.log("[SEMANTIC_FALLBACK_BLOCKED] Visual drift detected. Returning null.");
          return null;
        }

        console.log("[TYPED_OWNERSHIP_VALIDATED] Visual asset ownership verified:", {
          title: directCandidate.name,
          type: gotType,
          publisher: gotPublisher
        });
        console.log(`[DETERMINISTIC_PROVIDER_LOCK] Deterministic winner locked: "${directCandidate.name}"`);
      }

      // Rule 8 Assertion: Explicit ID lock integrity
      if (directCandidate.source !== expectedSource) {
        throw new Error(`[Nerdvana] [Assertion Failed] Provider ID source mismatch: expected "${expectedSource}", got "${directCandidate.source}"`);
      }

      console.log(`[Nerdvana] [DIRECT] ✓ Direct Winner locked: "${directCandidate.name}"`);
      const asset: ValidatedVisualAsset = {
        url: directCandidate.imageUrl ?? "",
        title: directCandidate.name,
        source: directCandidate.source,
        compatibilityScore: 1.0,
        validated: true,
        genres: directCandidate.genres ?? [],
        year: directCandidate.year,
        overview: directCandidate.raw?.overview ?? "",
        raw: directCandidate.raw,
        posterUrl: directCandidate.posterUrl ?? directCandidate.imageUrl ?? null,
        backdropUrl: directCandidate.backdropUrl ?? null,
      };
      return {
        asset,
        confidence: "high",
        mode: "STRICT",
        trace: [{
          candidate: directCandidate.name,
          mode: "STRICT",
          score: 100,
          finalScore: 100,
          compatibilityScore: 1.0,
          tokenOverlap: 1.0,
          stageScores: { lexical: 100 },
          stageCalculations: { compatibilityScore: 1.0 },
          rules: ["direct-provider-id-lock"],
          accepted: true,
          traceId: "direct-lock",
        }],
        productionTelemetry: mmCtx.telemetry,
      };
    }

    // Direct fetch failed - if DETERMINISTIC_PROVIDER, attempt Constrained Franchise Recovery ONLY (for non-comics)
    if (isDeterministicMode && expectedSource !== "comicvine" && packet.providerMetadata?.franchiseRoot) {
      console.log(`[Nerdvana] Direct provider ID lookup failed. Attempting constrained deterministic recovery inside root: "${packet.providerMetadata.franchiseRoot}"`);
      const recoveryQuery = packet.providerMetadata.franchiseRoot;
      const candidates = await fetchCandidates(recoveryQuery, packet.mediaLens, keys);
      
      if (candidates.length > 0) {
        const cleanExpectedRoot = packet.providerMetadata.franchiseRoot.toLowerCase().replace(/[^a-z0-9]/g, "");
        const filteredCandidates = candidates.filter(c => {
          const normName = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normName.includes(cleanExpectedRoot);
        });

        if (filteredCandidates.length > 0) {
          const ranked = scoreCandidatesWithTrace(filteredCandidates, baseScoringCtx, "FRANCHISE", trace, packet, mmCtx);
          for (const best of ranked.slice(0, 3)) {
            const asset = tryValidate(best, resolution, baseValidationContext, "FRANCHISE", trace, packet);
            if (asset) {
              console.log(`[Nerdvana] [FRANCHISE] ✓ Constrained Recovery Winner: "${best.name}" (score: ${best.finalScore})`);
              return { asset, confidence: "medium", mode: "FRANCHISE", trace, productionTelemetry: mmCtx.telemetry };
            }
          }
        }
      }
    }

    // If deterministic mode and direct/recovery failed, HARD FAILURE. Do not relax.
    if (isDeterministicMode) {
      console.log("[DETERMINISTIC_RETRIEVAL_ABORTED] Strict deterministic retrieval failed. Aborting.");
      console.log("[STRICT_SEMANTIC_FIREWALL] Strict deterministic retrieval failed. Fallback and semantic relaxation blocked.");
      console.log("[SEMANTIC_FALLBACK_BLOCKED] Retrieval failed and recovery exhausted in DETERMINISTIC_PROVIDER mode. Returning null.");
      return null;
    }
  }

  // --- SEMANTIC RELAXATION FIREWALL ---
  if (packet.executionMode === "DETERMINISTIC_PROVIDER") {
    console.log("[SEMANTIC_ENRICHMENT_ONLY] Semantic fallback and relaxation disabled under deterministic mode.");
    console.log("[STRICT_SEMANTIC_FIREWALL] Strict deterministic retrieval failed. Fallback and semantic relaxation blocked.");
    console.log("[SEMANTIC_RELAXATION_BLOCKED] Strict deterministic retrieval failed. Fallback and semantic relaxation blocked.");
    return null;
  }

  const tiers = buildDescriptorTiers(packet);
  const { mediaLens } = packet;

  const resolution: CanonicalResolution = {
    canonicalEntity: packet.canonicalEntity,
    parentFranchise: packet.parentFranchise ?? undefined,
    contextualSearchQuery: packet.contextualSearchQuery,
    intent: packet.entityKind as any,
    mediaType: packet.mediaLens as any,
    confidence: packet.confidence,
    source: "visual_lookup",
    selectedVisualType: packet.entityKind === "character" ? "character" : "poster",
    score: 0,
    debug: [],
    alternatives: [],
  };

  const baseValidationContext = {
    query: {
      original: packet.canonicalEntity,
      normalized: packet.contextualSearchQuery,
      canonical: packet.expandedEntity || packet.canonicalEntity,
      wasAlias: !!packet.expandedEntity,
    },
    contextualEntity: packet.canonicalEntity,
    parentFranchise: packet.parentFranchise ?? null,
    contextualSearchQuery: packet.contextualSearchQuery,
    visualAnchors: packet.visualAnchors,
  };

  const baseScoringCtx: ScoringContext = {
    normalizedQuery: packet.contextualSearchQuery,
    canonicalEntity: packet.canonicalEntity,
    intent: packet.entityKind as any,
    mediaLens: packet.mediaLens as any,
    franchiseRoot: packet.providerMetadata?.franchiseRoot,
    retrievalDescriptor: packet.retrievalDescriptor,
    visualAnchors: packet.visualAnchors,
  };

  // ── TIER 1: STRICT ──────────────────────────────────────────────────
  {
    const mode: RetrievalMode = "STRICT";
    console.log(`[Nerdvana] [${mode}] Fetching: "${tiers.strict}"`);
    const candidates = await fetchCandidates(tiers.strict, mediaLens, keys);
    if (candidates.length > 0) {
      const ranked = scoreCandidatesWithTrace(candidates, baseScoringCtx, mode, trace, packet, mmCtx);
      for (const best of ranked.slice(0, 3)) {
        const asset = tryValidate(best, resolution, baseValidationContext, mode, trace, packet);
        if (asset) {
          console.log(`[Nerdvana] [${mode}] ✓ Winner: "${best.name}" (score: ${best.finalScore})`);
          return { asset, confidence: "high", mode, trace, productionTelemetry: mmCtx.telemetry };
        }
      }
    }
    console.log(`[Nerdvana] [${mode}] No survivors. Relaxing...`);
  }

  const hasDeterministicId = !!packet.providerId;
  const strongLexicalSimilarity = packet.confidence >= 0.35;
  const allowedToRelax = packet.confidence >= 0.5 || hasDeterministicId || strongLexicalSimilarity;
  const relaxationBlocked = !allowedToRelax;

  console.log("[Grounding Confidence]", {
    query: packet.canonicalEntity,
    canonicalTitle: packet.canonicalEntity,
    aliases: packet.entityAliases,
    confidence: packet.confidence,
    deterministicId: packet.providerId,
    relaxationBlocked
  });

  if (relaxationBlocked) {
    console.log("[Nerdvana] STRICT retrieval exhausted and relaxation blocked due to low canonical grounding confidence. Returning null.");
    return null;
  }

  // ── TIER 2: RELAXED ──────────────────────────────────────────────────
  {
    const mode: RetrievalMode = "RELAXED";
    console.log(`[Nerdvana] [${mode}] Fetching: "${tiers.relaxed}"`);
    const candidates = await fetchCandidates(tiers.relaxed, mediaLens, keys);
    if (candidates.length > 0) {
      const ranked = scoreCandidatesWithTrace(candidates, baseScoringCtx, mode, trace, packet, mmCtx);
      for (const best of ranked.slice(0, 3)) {
        const asset = tryValidate(best, resolution, baseValidationContext, mode, trace, packet);
        if (asset) {
          console.log(`[Nerdvana] [${mode}] ✓ Winner: "${best.name}" (score: ${best.finalScore})`);
          return { asset, confidence: "medium", mode, trace, productionTelemetry: mmCtx.telemetry };
        }
      }
    }
  }

  // ── TIER 3: FRANCHISE ────────────────────────────────────────────────
  {
    const mode: RetrievalMode = "FRANCHISE";
    console.log(`[Nerdvana] [${mode}] Fetching: "${tiers.franchise}"`);
    const candidates = await fetchCandidates(tiers.franchise, mediaLens, keys);
    if (candidates.length > 0) {
      const ranked = scoreCandidatesWithTrace(candidates, baseScoringCtx, mode, trace, packet, mmCtx);
      for (const best of ranked.slice(0, 3)) {
        const asset = tryValidate(best, resolution, baseValidationContext, mode, trace, packet);
        if (asset) {
          console.log(`[Nerdvana] [${mode}] ✓ Winner: "${best.name}" (score: ${best.finalScore})`);
          return { asset, confidence: "medium", mode, trace, productionTelemetry: mmCtx.telemetry };
        }
      }
    }
  }

  // ── TIER 4: ENTITY ───────────────────────────────────────────────────
  {
    const mode: RetrievalMode = "ENTITY";
    console.log(`[Nerdvana] [${mode}] Fetching: "${tiers.entity}"`);
    const candidates = await fetchCandidates(tiers.entity, mediaLens, keys);
    if (candidates.length > 0) {
      const ranked = scoreCandidatesWithTrace(candidates, baseScoringCtx, mode, trace, packet, mmCtx);
      for (const best of ranked.slice(0, 3)) {
        const asset = tryValidate(best, resolution, baseValidationContext, mode, trace, packet);
        if (asset) {
          console.log(`[Nerdvana] [${mode}] ✓ Winner: "${best.name}" (score: ${best.finalScore})`);
          return { asset, confidence: "low", mode, trace, productionTelemetry: mmCtx.telemetry };
        }
      }
    }
  }

  // ── TIER 5: POPULARITY ───────────────────────────────────────────────
  // Phase 12.8: POPULARITY tier is DISABLED for anime and character-level
  // queries. The 2-word shorthand is completely unanchored and causes
  // catastrophic cross-franchise bleed (e.g. "Johan Liebert" → any popular
  // anime). For movie/tv/games/comics the risk is lower due to provider
  // specificity, but we still gate it behind a character-kind check.
  {
    const mode: RetrievalMode = "POPULARITY";
    const isAnime = mediaLens === "anime";
    const isCharacterQuery = packet.entityKind === "character";
    const popularityBlocked = isAnime || isCharacterQuery;

    if (popularityBlocked) {
      console.log(
        `[Nerdvana] [${mode}] SKIPPED — popularity tier is disabled for lens="${mediaLens}" entityKind="${packet.entityKind ?? "unknown"}" to prevent cross-franchise bleed.`
      );
    } else {
      console.log(`[Nerdvana] [${mode}] Fetching: "${tiers.popularity}"`);
      const candidates = await fetchCandidates(tiers.popularity, mediaLens, keys);
      if (candidates.length > 0) {
        const ranked = scoreCandidatesWithTrace(candidates, baseScoringCtx, mode, trace, packet, mmCtx);
        for (const best of ranked.slice(0, 3)) {
          const asset = tryValidate(best, resolution, baseValidationContext, mode, trace, packet);
          if (asset) {
            console.log(`[Nerdvana] [${mode}] ✓ Winner: "${best.name}" (score: ${best.finalScore})`);
            return { asset, confidence: "fallback", mode, trace, productionTelemetry: mmCtx.telemetry };
          }
        }
      }
    }
  }

  console.log("[Nerdvana] All adaptive retrieval tiers exhausted. Returning null.");
  return null;
}

// ─── Main Handler ─────────────────────────────────────────────────────

export default async function handler(req: any, res?: any) {
  const method = String(req?.method ?? "POST").toUpperCase();
  if (method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405, res);

  try {
    const body = await readBody(req);
    const packet: ResolverContextPacket = body.contextPacket;

    if (!packet || !packet.canonicalEntity) {
      return jsonResponse({ state: "API_ERROR", error: "Missing or invalid contextPacket" }, 400, res);
    }

    const env = (globalThis as any).process?.env ?? {};
    const keys = {
      tmdb: (env.TMDB_API_KEY || env.VITE_TMDB_API_KEY)?.trim() || undefined,
      rawg: (env.RAWG_API_KEY || env.VITE_RAWG_API_KEY)?.trim() || undefined,
      igdbId: (env.IGDB_CLIENT_ID || env.VITE_IGDB_CLIENT_ID)?.trim() || undefined,
      igdbSecret: (env.IGDB_CLIENT_SECRET || env.VITE_IGDB_CLIENT_SECRET)?.trim() || undefined,
      comicVine: (env.COMICVINE_API_KEY || env.VITE_COMICVINE_API_KEY)?.trim() || undefined,
    };

    const result = await adaptiveRetrieve(packet, keys);

    if (!result) {
      const mmCtx = buildVisualArbitrationContext(packet);
      const outcome: RetrievalOutcome = {
        state: "NO_COMPATIBLE_RESULTS",
        reason: "All retrieval tiers exhausted.",
        productionTelemetry: mmCtx.telemetry,
      };
      return jsonResponse(outcome, 200, res);
    }

    // Post-visual Ownership Verification (Structural Integrity)
    if (packet.providerMetadata?.franchiseRoot) {
      const visualRoot = (result.asset.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const expectedRoot = packet.providerMetadata.franchiseRoot.toLowerCase().replace(/[^a-z0-9]/g, "");
      
      if (!visualRoot.includes(expectedRoot)) {
        console.log(`[IDENTITY OVERRIDE BLOCKED] Post-visual validation failed: "${result.asset.title}" does not align with root "${packet.providerMetadata.franchiseRoot}"`);
        const mmCtx = buildVisualArbitrationContext(packet);
        const outcome: RetrievalOutcome = {
          state: "NO_COMPATIBLE_RESULTS",
          reason: "Constrained recovery exhausted. Franchise mismatch.",
          productionTelemetry: mmCtx.telemetry,
        };
        return jsonResponse(outcome, 200, res);
      }
    }

    const outcome: RetrievalOutcome = {
      state: "SUCCESS",
      asset: result.asset,
      confidence: result.confidence,
      mode: result.mode,
      retrievalTrace: result.trace,
      productionTelemetry: result.productionTelemetry,
    };

    return jsonResponse(outcome, 200, res);

  } catch (error: any) {
    console.error("[Nerdvana] Visual Lookup Fatal Error:", error);
    return jsonResponse({
      state: "PROCESSING_ERROR",
      error: String(error),
    }, 500, res);
  }
}
