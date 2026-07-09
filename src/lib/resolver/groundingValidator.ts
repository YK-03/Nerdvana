/**
 * groundingValidator.ts
 *
 * Grounding validator for candidates and visual assets.
 */

import type { MediaLens } from "../../app/mediaLens.js";
import {
  normalizeQuery,
  normalizeText,
  uniqueNormalized,
  tokenize,
  type NormalizedQuery
} from "./queryNormalizer.js";
import {
  classifyBucket,
  type MediaType,
  type QueryIntent,
  type CandidateBucket,
  type ResolverCandidate,
  type CompatibilityResult
} from "./candidateScorer.js";
import { sourceSupportsLens } from "./lensFence.js";
import {
  classifyComicsQueryType,
  normalizeComicVineResourceType,
  isCompatibleComicVineType,
} from "./providerMetadata.js";

export type VisualType = "poster" | "logo" | "character" | "key_visual";

export interface CanonicalResolution {
  canonicalEntity: string;
  parentFranchise?: string;
  contextualSearchQuery: string;
  intent: QueryIntent;
  mediaType: MediaType;
  confidence: number;
  source: string;
  selectedVisualType: VisualType;
  score: number;
  debug: any[];
  alternatives: ResolverCandidate[];
}

export type ValidatedVisualAsset = {
  url: string;
  source: string;
  mediaType: string;
  franchise?: string;
  compatibilityScore: number;
  validated: boolean;
  title: string;
  year?: number | null;
  genres?: string[];
  overview?: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

export type VisualAssetValidationInput = {
  url: string | null | undefined;
  title: string;
  source: string;
  mediaType: string;
  franchise?: string;
  overview?: string;
  genres?: string[];
  raw?: unknown;
  publisher?: string | null;
  year?: number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

export type CandidateMetadata = {
  texts: string[];
  genres: string[];
  studios: string[];
  publishers: string[];
  tags: string[];
  associatedTitles: string[];
  associatedFranchises: string[];
  mediaKinds: string[];
};

export type ValidationContext = {
  query: NormalizedQuery;
  contextualEntity: string;
  parentFranchise: string | null;
  contextualSearchQuery: string;
  visualAnchors?: string[];
};

export const NEGATIVE_PATTERNS = [
  "music video",
  "album",
  "single",
  "song",
  "soundtrack",
  "amv",
  "fan edit",
  "tribute",
  "nightcore",
  "remix",
  "lyric video",
] as const;

const VINTAGE_YEAR_THRESHOLD = 1960;
const NEGATIVE_PATTERN_REGEX = new RegExp(
  `\\b(${NEGATIVE_PATTERNS.map((pattern) => pattern.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "i",
);

export const CHARACTER_FRANCHISE_MAP: Record<string, string> = {
  goku: "Dragon Ball", vegeta: "Dragon Ball", gohan: "Dragon Ball", frieza: "Dragon Ball",
  luffy: "One Piece", zoro: "One Piece", nami: "One Piece", sanji: "One Piece",
  naruto: "Naruto", sasuke: "Naruto", sakura: "Naruto", kakashi: "Naruto",
  ichigo: "Bleach", rukia: "Bleach", aizen: "Bleach",
  "light yagami": "Death Note", "l lawliet": "Death Note", ryuk: "Death Note", light: "Death Note",
  eren: "Attack on Titan", mikasa: "Attack on Titan", levi: "Attack on Titan",
  gojo: "Jujutsu Kaisen", sukuna: "Jujutsu Kaisen", itadori: "Jujutsu Kaisen",
  tanjiro: "Demon Slayer", nezuko: "Demon Slayer", zenitsu: "Demon Slayer",
  deku: "My Hero Academia", "all might": "My Hero Academia",
  saitama: "One Punch Man", genos: "One Punch Man",
  gon: "Hunter x Hunter", killua: "Hunter x Hunter",
  edward: "Fullmetal Alchemist", alphonse: "Fullmetal Alchemist",
  spike: "Cowboy Bebop",
  lelouch: "Code Geass",
  shinji: "Neon Genesis Evangelion",
  // Movies / TV
  "tony stark": "Iron Man", "peter parker": "Spider-Man", "bruce wayne": "Batman",
  "clark kent": "Superman", "barry allen": "The Flash", "diana prince": "Wonder Woman",
  "bruce banner": "Hulk", "steve rogers": "Captain America", "natasha romanoff": "Black Widow",
  "wanda maximoff": "Scarlet Witch",
  "frodo": "The Lord of the Rings", "gandalf": "The Lord of the Rings", "aragorn": "The Lord of the Rings",
  "luke skywalker": "Star Wars", "darth vader": "Star Wars", "yoda": "Star Wars",
  "walter white": "Breaking Bad", "jesse pinkman": "Breaking Bad",
  "jon snow": "Game of Thrones", "daenerys": "Game of Thrones",
  // Games
  "master chief": "Halo", "cortana": "Halo",
  kratos: "God of War", atreus: "God of War",
  link: "The Legend of Zelda",
  "geralt": "The Witcher",
  "joel": "The Last of Us", "ellie": "The Last of Us",
  "arthur morgan": "Red Dead Redemption",
  "solid snake": "Metal Gear",
  // Prompt 3 Character Expansion
  "carl johnson": "Grand Theft Auto: San Andreas",
  cj: "Grand Theft Auto: San Andreas",
  franklin: "Grand Theft Auto V",
  "franklin clinton": "Grand Theft Auto V",
  johan: "Monster",
  "johan liebert": "Monster",
};

export const SIDE_CONTENT_PATTERN =
  /\b(dlc|soundtrack|ost|bundle|pack|ova|special|remaster|remastered|collector.?s?\s*edition|season\s*pass|add[\s-]?on|addon|skin|skins|costume|movie\s*skin|demo|trial|beta|prologue|epilogue|bonus|sampler|anthology|compilation)\b/i;

export function sanitizeApiResults<T extends { name?: string; title?: string; image?: string | null }>(
  results: T[],
): T[] {
  return results.filter((item) => {
    const name = (item.name ?? item.title ?? "").trim();
    // Filter empty names
    if (!name) return false;
    // Filter malformed titles (single character, only symbols)
    if (name.length < 2) return false;
    if (/^[^a-zA-Z0-9]+$/.test(name)) return false;
    return true;
  });
}

function pushIfPresent(target: unknown[], ...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      pushIfPresent(target, ...value);
    } else if (value != null && value !== "") {
      target.push(value);
    }
  }
}

function buildResolutionTerms(
  resolution: CanonicalResolution,
  validation: ValidationContext,
): string[] {
  const terms: unknown[] = [
    validation.query.original,
    validation.query.normalized,
    validation.query.canonical,
    validation.contextualEntity,
    resolution.canonicalEntity,
    resolution.parentFranchise,
    validation.parentFranchise,
    resolution.contextualSearchQuery,
    validation.contextualSearchQuery,
  ];

  const characterFranchise = CHARACTER_FRANCHISE_MAP[normalizeText(validation.contextualEntity)];
  if (characterFranchise) terms.push(characterFranchise);

  return uniqueNormalized(terms);
}

function collectStringsFromRaw(raw: unknown, out: unknown[]) {
  if (raw == null) return;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    out.push(String(raw));
    return;
  }
  if (Array.isArray(raw)) {
    for (const value of raw) collectStringsFromRaw(value, out);
    return;
  }
  if (typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      collectStringsFromRaw(value, out);
    }
  }
}

export function extractCandidateMetadata(candidate: ResolverCandidate): CandidateMetadata {
  const raw = (candidate.raw ?? {}) as Record<string, any>;
  const texts: unknown[] = [
    candidate.name,
    candidate.publisher,
    candidate.genres,
    raw.title,
    raw.name,
    raw.original_title,
    raw.original_name,
    raw.title_english,
    raw.title_japanese,
    raw.synopsis,
    raw.overview,
    raw.description,
    raw.deck,
    raw.tagline,
    raw.status,
    raw.type,
    raw.media_type,
  ];

  pushIfPresent(
    texts,
    raw.genres?.map((entry: any) => entry?.name ?? entry),
    raw.genre_ids,
    raw.themes?.map((entry: any) => entry?.name ?? entry),
    raw.demographics?.map((entry: any) => entry?.name ?? entry),
    raw.studios?.map((entry: any) => entry?.name ?? entry),
    raw.publishers?.map((entry: any) => entry?.name ?? entry),
    raw.publisher?.name,
    raw.involved_companies?.map((entry: any) => entry?.company?.name ?? entry?.name),
    raw.collections?.map((entry: any) => entry?.name ?? entry),
    raw.collection?.name,
    raw.belongs_to_collection?.name,
    raw.franchises?.map((entry: any) => entry?.name ?? entry),
    raw.franchise?.name,
    raw.keywords?.map((entry: any) => entry?.name ?? entry),
    raw.keyword?.map((entry: any) => entry?.name ?? entry),
    raw.anime?.map((entry: any) => entry?.anime?.title ?? entry?.name ?? entry),
    raw.manga?.map((entry: any) => entry?.manga?.title ?? entry?.name ?? entry),
    raw.characters?.map((entry: any) => entry?.name ?? entry),
    raw.related_titles,
    raw.associated_anime,
    raw.associated_manga,
    raw.tags?.map((entry: any) => entry?.name ?? entry),
    raw.involved_companies?.map((entry: any) => entry?.developer ? "developer" : entry?.publisher ? "publisher" : null),
  );
  collectStringsFromRaw(raw, texts);

  const genres = uniqueNormalized([
    ...(candidate.genres ?? []),
    ...(raw.genres?.map((entry: any) => entry?.name ?? entry) ?? []),
    ...(raw.themes?.map((entry: any) => entry?.name ?? entry) ?? []),
    ...(raw.demographics?.map((entry: any) => entry?.name ?? entry) ?? []),
  ]);
  const studios = uniqueNormalized([
    ...(raw.studios?.map((entry: any) => entry?.name ?? entry) ?? []),
    ...(raw.networks?.map((entry: any) => entry?.name ?? entry) ?? []),
    ...(raw.involved_companies?.map((entry: any) => entry?.company?.name ?? entry?.name) ?? []),
  ]);
  const publishers = uniqueNormalized([
    candidate.publisher,
    raw.publisher?.name,
    ...(raw.publishers?.map((entry: any) => entry?.name ?? entry) ?? []),
  ]);
  const tags = uniqueNormalized([
    ...(raw.tags?.map((entry: any) => entry?.name ?? entry) ?? []),
    ...(raw.keywords?.map((entry: any) => entry?.name ?? entry) ?? []),
    ...(raw.keyword?.map((entry: any) => entry?.name ?? entry) ?? []),
  ]);
  const associatedTitles = uniqueNormalized([
    ...(raw.anime?.map((entry: any) => entry?.anime?.title ?? entry?.name ?? entry) ?? []),
    ...(raw.manga?.map((entry: any) => entry?.manga?.title ?? entry?.name ?? entry) ?? []),
    ...(raw.related_titles ?? []),
    raw.belongs_to_collection?.name,
    raw.collection?.name,
  ]);
  const associatedFranchises = uniqueNormalized([
    ...(raw.franchises?.map((entry: any) => entry?.name ?? entry) ?? []),
    raw.franchise?.name,
    raw.collection?.name,
    raw.belongs_to_collection?.name,
    candidate.publisher,
  ]);
  const mediaKinds = uniqueNormalized([
    candidate.bucket,
    candidate.source,
    raw.type,
    raw.media_type,
    raw.format,
    raw.kind,
  ]);

  return {
    texts: uniqueNormalized(texts),
    genres,
    studios,
    publishers,
    tags,
    associatedTitles,
    associatedFranchises,
    mediaKinds,
  };
}

export function hasTermOverlap(terms: string[], haystack: string[]): boolean {
  return terms.some((term) => haystack.some((text) => text.includes(term) || term.includes(text)));
}

export function countSemanticSignals(terms: string[], haystack: string[]): number {
  const matched = new Set<string>();
  for (const term of terms) {
    if (term.length < 3) continue;
    if (haystack.some((text) => text.includes(term))) matched.add(term);
    else {
      const tokens = tokenize(term);
      if (tokens.some((token) => haystack.some((text) => text.includes(token)))) {
        matched.add(term);
      }
    }
  }
  return matched.size;
}

export function sourceMatchesAssetHost(source: string, url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const expectedHostPatterns: Record<string, string[]> = {
      tmdb: ["tmdb.org", "themoviedb.org"],
      jikan: ["jikan.moe", "myanimelist.net", "cdn.myanimelist.net"],
      mal: ["myanimelist.net", "cdn.myanimelist.net"],
      igdb: ["igdb.com", "images.igdb.com"],
      rawg: ["rawg.io", "media.rawg.io"],
      comicvine: ["comicvine.gamespot.com", "gamespot.com"],
      googlebooks: ["books.google.com", "googleusercontent.com"],
    };
    const patterns = expectedHostPatterns[source] ?? [];
    return patterns.length === 0 || patterns.some((pattern) => hostname.includes(pattern));
  } catch {
    return false;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validateNegativePatterns(
  candidate: ResolverCandidate,
  resolution: CanonicalResolution,
  metadata: CandidateMetadata,
  result: CompatibilityResult,
) {
  const searchable = metadata.texts.join(" ");
  const matches = NEGATIVE_PATTERNS.filter((pattern) => new RegExp(pattern.replace(/\s+/g, "\\s+"), "i").test(searchable));
  if (matches.length === 0 && !SIDE_CONTENT_PATTERN.test(searchable) && !NEGATIVE_PATTERN_REGEX.test(candidate.name)) {
    return;
  }

  result.penalties.push(`negative_pattern:${matches.join("|") || "side_content"}`);

  const rejectForLens =
    resolution.mediaType === "anime" ||
    resolution.mediaType === "movies" ||
    resolution.mediaType === "tv" ||
    (resolution.mediaType === "games" && (matches.includes("soundtrack") || searchable.includes("dlc") || searchable.includes("bundle")));

  if (rejectForLens) {
    result.eligible = false;
    result.reasons.push("negative_pattern_mismatch");
    result.confidenceAdjustment -= 0.2;
  } else {
    result.confidenceAdjustment -= 0.08;
  }
}

function validateLensCompatibility(
  candidate: ResolverCandidate,
  resolution: CanonicalResolution,
  metadata: CandidateMetadata,
  result: CompatibilityResult,
) {
  if (!sourceSupportsLens(candidate.source, resolution.mediaType)) {
    result.eligible = false;
    result.reasons.push(`conflicting_media_lens:expected_${resolution.mediaType}_got_${candidate.source}`);
    result.confidenceAdjustment -= 0.50; // Hard drop
    return;
  }

  const searchable = metadata.texts.join(" ");
  if (resolution.mediaType === "anime") {
    const animeSignals = ["anime", "manga", "tv", "ova", "ona", "shounen", "seinen"];
    if (!animeSignals.some((signal) => searchable.includes(signal)) && candidate.source !== "jikan" && candidate.source !== "mal") {
      result.eligible = false;
      result.reasons.push("conflicting_media_lens:expected_anime_signals_missing");
      result.confidenceAdjustment -= 0.3;
    }
  }

  if (resolution.mediaType === "games") {
    if (searchable.includes("soundtrack") || searchable.includes("album")) {
      result.eligible = false;
      result.reasons.push("conflicting_media_lens:expected_game_got_soundtrack");
      result.confidenceAdjustment -= 0.4;
    }
  }

  if (resolution.mediaType === "movies" && searchable.includes("tv series")) {
    result.eligible = false;
    result.reasons.push("conflicting_media_lens:expected_movie_got_tv");
    result.confidenceAdjustment -= 0.4;
  }

  if (resolution.mediaType === "tv" && searchable.includes("movie")) {
    result.penalties.push("adjacent_media_lens:expected_tv_got_movie_signal");
    result.confidenceAdjustment -= 0.1;
  }
}

function validateFranchiseCompatibility(
  resolution: CanonicalResolution,
  validation: ValidationContext,
  metadata: CandidateMetadata,
  result: CompatibilityResult,
) {
  const franchise = normalizeText(resolution.parentFranchise ?? validation.parentFranchise ?? "");
  if (!franchise) return;

  const franchiseTerms = uniqueNormalized([franchise, ...tokenize(franchise)]);
  const searchable = [
    ...metadata.texts,
    ...metadata.associatedTitles,
    ...metadata.associatedFranchises,
    ...metadata.tags,
  ];
  if (!hasTermOverlap(franchiseTerms, searchable)) {
    result.eligible = false;
    result.reasons.push(`franchise_mismatch:${franchise}`);
    result.confidenceAdjustment -= 0.2;
  }
}

function validateIntentCompatibility(
  candidate: ResolverCandidate,
  resolution: CanonicalResolution,
  result: CompatibilityResult,
) {
  if (resolution.intent === "character" && candidate.bucket === "sideContent") {
    result.eligible = false;
    result.reasons.push("character_intent_side_content");
    result.confidenceAdjustment -= 0.12;
  }

  if (resolution.intent === "franchise" && candidate.bucket === "character") {
    result.eligible = false;
    result.reasons.push("franchise_intent_character_result");
    result.confidenceAdjustment -= 0.1;
  }
}

function validateProviderTypeContinuity(
  candidate: ResolverCandidate,
  resolution: CanonicalResolution,
  result: CompatibilityResult,
) {
  if (resolution.mediaType !== "comics" && candidate.source !== "comicvine") return;

  const rawQueryType = classifyComicsQueryType(resolution.canonicalEntity);
  const expectedType = rawQueryType || (resolution.intent !== "franchise" && resolution.intent !== "title" ? resolution.intent : null);

  const rawResourceType = candidate.raw?.resource_type;
  const candidateType = rawResourceType
    ? normalizeComicVineResourceType(rawResourceType, candidate.name)
    : classifyComicsQueryType(candidate.name);

  if (expectedType && candidateType && !isCompatibleComicVineType(expectedType, candidateType)) {
    result.eligible = false;
    result.reasons.push(`comics_type_mismatch:${expectedType}->${candidateType}`);
    result.confidenceAdjustment -= 0.6; // Heavy drop
  }
}

function validateSemanticMetadata(
  resolution: CanonicalResolution,
  validation: ValidationContext,
  metadata: CandidateMetadata,
  result: CompatibilityResult,
) {
  const resolutionTerms = buildResolutionTerms(resolution, validation);
  const tokens = uniqueNormalized(resolutionTerms.flatMap((term) => tokenize(term)));
  const expectedSignals = uniqueNormalized([...resolutionTerms, ...tokens]);
  const searchable = [
    ...metadata.texts,
    ...metadata.genres,
    ...metadata.studios,
    ...metadata.publishers,
    ...metadata.tags,
    ...metadata.associatedTitles,
    ...metadata.associatedFranchises,
  ];

  const directHits = countSemanticSignals(resolutionTerms, searchable);
  const tokenHits = countSemanticSignals(tokens, searchable);
  const threshold = resolution.parentFranchise || validation.parentFranchise || resolution.intent === "character" ? 2 : 1;
  const totalHits = directHits + tokenHits;

  if (totalHits < threshold || !hasTermOverlap(expectedSignals, searchable)) {
    result.eligible = false;
    result.reasons.push("semantic_overlap_too_weak");
    result.confidenceAdjustment -= 0.15;
  }
}

function validateCharacterUniverse(
  candidate: ResolverCandidate,
  resolution: CanonicalResolution,
  validation: ValidationContext,
  metadata: CandidateMetadata,
  result: CompatibilityResult,
) {
  if (resolution.intent !== "character") return;

  const characterUniverse =
    normalizeText(resolution.parentFranchise ?? validation.parentFranchise ?? "") ||
    normalizeText(CHARACTER_FRANCHISE_MAP[normalizeText(validation.contextualEntity)] ?? "");
  if (!characterUniverse) return;

  const searchable = [
    ...metadata.texts,
    ...metadata.associatedTitles,
    ...metadata.associatedFranchises,
    ...metadata.tags,
  ];

  if (!hasTermOverlap([characterUniverse, ...tokenize(characterUniverse)], searchable)) {
    result.eligible = false;
    result.reasons.push(`character_universe_mismatch:${characterUniverse}`);
    result.confidenceAdjustment -= 0.2;
  }

  if (candidate.source === "jikan") {
    const raw = (candidate.raw ?? {}) as Record<string, any>;
    const associatedAnime = uniqueNormalized([
      ...(raw.anime?.map((entry: any) => entry?.anime?.title ?? entry?.name ?? entry) ?? []),
      ...(raw.manga?.map((entry: any) => entry?.manga?.title ?? entry?.name ?? entry) ?? []),
    ]);
    if (associatedAnime.length === 0 && candidate.bucket === "character") {
      result.penalties.push("jikan_character_missing_associated_anime");
      result.confidenceAdjustment -= 0.05;
    }
  }
}

function validateSourceSpecificRules(
  candidate: ResolverCandidate,
  resolution: CanonicalResolution,
  metadata: CandidateMetadata,
  result: CompatibilityResult,
) {
  const searchable = metadata.texts.join(" ");
  const raw = (candidate.raw ?? {}) as Record<string, any>;

  if (candidate.source === "tmdb") {
    const inferredMediaType = raw.media_type
      ?? (raw.first_air_date ? "tv" : null)
      ?? (raw.release_date ? "movie" : null)
      ?? "";
    const mediaType = normalizeText(inferredMediaType);
    if (resolution.mediaType === "movies" && mediaType === "tv") {
      result.eligible = false;
      result.reasons.push("conflicting_media_lens:expected_movies_got_tv");
      result.confidenceAdjustment -= 0.5;
    }
    if (resolution.mediaType === "tv" && mediaType === "movie") {
      result.eligible = false;
      result.reasons.push("conflicting_media_lens:expected_tv_got_movie");
      result.confidenceAdjustment -= 0.5;
    }
  }

  if (candidate.source === "comicvine") {
    if (resolution.mediaType === "comics" && metadata.publishers.length === 0 && !searchable.includes("comic")) {
      result.penalties.push("comicvine_missing_publisher_context");
      result.confidenceAdjustment -= 0.04;
    }
  }

  if (candidate.source === "igdb" || candidate.source === "rawg") {
    if (searchable.includes("dlc") || searchable.includes("expansion") || searchable.includes("season pass")) {
      result.eligible = false;
      result.reasons.push("game_side_content_mismatch");
      result.confidenceAdjustment -= 0.15;
    }
  }
}

export function validateCandidateCompatibility(
  candidate: ResolverCandidate,
  resolution: CanonicalResolution,
  validation?: ValidationContext,
): CompatibilityResult {
  const result: CompatibilityResult = {
    eligible: true,
    reasons: [],
    penalties: [],
    confidenceAdjustment: 0,
  };

  const fallbackValidation: ValidationContext = validation ?? {
    query: normalizeQuery(resolution.canonicalEntity),
    contextualEntity: resolution.canonicalEntity,
    parentFranchise: resolution.parentFranchise ?? null,
    contextualSearchQuery: resolution.contextualSearchQuery,
  };
  const bucket = classifyBucket(candidate.name, resolution.intent, fallbackValidation.query.normalized);
  const normalizedCandidate: ResolverCandidate = { ...candidate, bucket };
  const metadata = extractCandidateMetadata(normalizedCandidate);

  validateNegativePatterns(normalizedCandidate, resolution, metadata, result);
  validateLensCompatibility(normalizedCandidate, resolution, metadata, result);
  validateFranchiseCompatibility(resolution, fallbackValidation, metadata, result);
  validateIntentCompatibility(normalizedCandidate, resolution, result);
  validateProviderTypeContinuity(normalizedCandidate, resolution, result);
  validateSemanticMetadata(resolution, fallbackValidation, metadata, result);
  validateCharacterUniverse(normalizedCandidate, resolution, fallbackValidation, metadata, result);
  validateSourceSpecificRules(normalizedCandidate, resolution, metadata, result);

  result.reasons = uniqueNormalized(result.reasons);
  result.penalties = uniqueNormalized(result.penalties);
  return result;
}

export function validateVisualAssetCompatibility(
  asset: VisualAssetValidationInput,
  resolution: CanonicalResolution,
  validation?: ValidationContext,
): ValidatedVisualAsset | null {
  const url = String(asset.url ?? "").trim();
  if (!url) return null;

  const fallbackValidation: ValidationContext = validation ?? {
    query: normalizeQuery(resolution.canonicalEntity),
    contextualEntity: resolution.canonicalEntity,
    parentFranchise: resolution.parentFranchise ?? null,
    contextualSearchQuery: resolution.contextualSearchQuery,
  };

  const pseudoCandidate: ResolverCandidate = {
    name: asset.title,
    source: asset.source,
    bucket: classifyBucket(asset.title, resolution.intent, fallbackValidation.query.normalized),
    imageUrl: url,
    year: asset.year ?? null,
    publisher: asset.publisher ?? null,
    genres: asset.genres ?? [],
    raw: {
      ...(typeof asset.raw === "object" && asset.raw != null ? asset.raw as Record<string, unknown> : {}),
      overview: asset.overview ?? "",
      franchise: asset.franchise ? { name: asset.franchise } : undefined,
      media_type: asset.mediaType,
      image_url: url,
    },
  };

  const compatibility = validateCandidateCompatibility(pseudoCandidate, resolution, fallbackValidation);
  const trustedHost = sourceMatchesAssetHost(asset.source, url);
  const compatibleMediaType = normalizeText(asset.mediaType) === normalizeText(resolution.mediaType);

  if (!trustedHost) {
    compatibility.eligible = false;
    compatibility.reasons.push("asset_host_mismatch");
    compatibility.confidenceAdjustment -= 0.15;
  }

  if (!compatibleMediaType) {
    compatibility.eligible = false;
    compatibility.reasons.push(`asset_media_type_mismatch:${asset.mediaType}->${resolution.mediaType}`);
    compatibility.confidenceAdjustment -= 0.15;
  }

  const compatibilityScore = clamp(
    0.7
      + compatibility.confidenceAdjustment
      - (compatibility.reasons.length * 0.18)
      - (compatibility.penalties.length * 0.04)
      + (compatibility.eligible ? 0.2 : 0),
    0,
    1,
  );

  return {
    url,
    source: asset.source,
    mediaType: asset.mediaType,
    franchise: asset.franchise ?? resolution.parentFranchise,
    compatibilityScore: Number(compatibilityScore.toFixed(2)),
    validated: compatibility.eligible && compatibilityScore >= 0.5,
    title: asset.title,
    year: asset.year,
    genres: asset.genres,
    overview: asset.overview,
    posterUrl: asset.posterUrl ?? url,
    backdropUrl: asset.backdropUrl ?? null,
  };
}
