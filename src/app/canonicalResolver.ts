/**
 * canonicalResolver.ts
 *
 * Centralized canonical media identity resolver for Nerdvana.
 * Now decomposed into specialized modules, serving as an orchestration wrapper.
 */

import type { MediaLens } from "./mediaLens.js";
import { findFranchiseContext, type FranchiseContext } from "../lib/resolver/franchiseContextRegistry.js";
import { findModularTopology } from "../lib/resolver/topology/registry.js";
import { ResolvedTopology, ContinuityType } from "../lib/resolver/topology/topologyTypes.js";
import { getSuggestionEngine } from "../lib/resolver/ml/semanticSuggestionEngine.js";
import { validateExpansion } from "../lib/resolver/ml/deterministicValidator.js";
import { SemanticSuggestion } from "../lib/resolver/ml/expansionTypes.js";
import { getNeighborhoodEngine } from "../lib/resolver/embeddings/semanticNeighborhoodEngine.js";
import { CandidateHistoryEntry } from "../lib/resolver/provenanceTypes.js";
import type { CanonicalGroundingResult } from "../lib/resolver/canonicalGrounding.js";
import { 
  type CanonRelationship,
  determineAdaptationLineage, 
  getRelationship, 
  getVariantFamily
} from "../lib/resolver/topologyIntelligence.js";
import { getTopologyEngine } from "../lib/resolver/topology/inheritanceEngine.js";
import { resolveContinuity } from "../lib/resolver/continuityResolver.js";
import { hydrateContinuityGraphFromComicVine } from "../lib/resolver/continuityGraph.js";
import type { ProviderMetadata } from "../lib/resolver/providerMetadata.js";
import {
  classifyComicsQueryType,
  inferProviderTypeFromId,
} from "../lib/resolver/providerMetadata.js";

// Import from new sub-modules
import {
  normalizeQuery,
  normalizeText,
  uniqueNormalized,
  tokenize,
  CANONICAL_ALIASES,
  type NormalizedQuery
} from "../lib/resolver/queryNormalizer.js";

import {
  scoreCandidate,
  computeConfidence,
  rankCandidates,
  buildDebugEntry,
  logResolverTelemetry,
  classifyBucket,
  getFranchiseAliases,
  SOURCE_PRIORITY,
  KNOWN_FRANCHISES,
  FRANCHISE_ALIASES,
  SIDE_CONTENT_PATTERN,
  type QueryIntent,
  type MediaType,
  type CandidateBucket,
  type ResolverDebug,
  type ResolverCandidate,
  type CompatibilityResult,
  type ScoringContext
} from "../lib/resolver/candidateScorer.js";

import {
  validateCandidateCompatibility,
  validateVisualAssetCompatibility,
  sanitizeApiResults,
  NEGATIVE_PATTERNS,
  CHARACTER_FRANCHISE_MAP,
  type VisualType,
  type CanonicalResolution,
  type ValidatedVisualAsset,
  type VisualAssetValidationInput,
  type ValidationContext
} from "../lib/resolver/groundingValidator.js";

export interface ActiveVisualOwnerMetadata {
  providerId: string | null;
  canonicalTitle: string | null;
  mediaType: string;
  providerType: string | null;
  franchiseRoot: string | null;
  executionMode: string;
}

export interface ActiveVisualOwner extends ActiveVisualOwnerMetadata {
  asset: ValidatedVisualAsset;
  lockedAt: number;
}

import {
  sourceSupportsLens,
  lensScore,
  type LensAuthority
} from "../lib/resolver/lensFence.js";

// Re-export EVERYTHING from sub-modules for backward compatibility
export {
  normalizeQuery,
  normalizeText,
  uniqueNormalized,
  tokenize,
  CANONICAL_ALIASES,
  scoreCandidate,
  computeConfidence,
  rankCandidates,
  buildDebugEntry,
  logResolverTelemetry,
  classifyBucket,
  getFranchiseAliases,
  validateCandidateCompatibility,
  validateVisualAssetCompatibility,
  sanitizeApiResults,
  sourceSupportsLens,
  lensScore,
  SOURCE_PRIORITY,
  KNOWN_FRANCHISES,
  FRANCHISE_ALIASES,
  SIDE_CONTENT_PATTERN,
  NEGATIVE_PATTERNS,
  CHARACTER_FRANCHISE_MAP
};

export type {
  NormalizedQuery,
  QueryIntent,
  MediaType,
  CandidateBucket,
  ResolverDebug,
  ResolverCandidate,
  CompatibilityResult,
  ScoringContext,
  VisualType,
  CanonicalResolution,
  ValidatedVisualAsset,
  VisualAssetValidationInput,
  ValidationContext,
  LensAuthority
};

// ─── Ambiguous Entities ──────────────────────────────────────────────

const AMBIGUOUS_ENTITIES = new Set([
  "light", "joker", "flash", "doom", "halo", "bleach", "fate",
  "loki", "avatar", "link", "arcane", "sonic", "castlevania",
  "batman", "superman", "spider-man", "spiderman", "wolverine",
  "daredevil", "punisher", "the witcher", "witcher",
  "walking dead", "the walking dead", "death note",
  "naruto", "dragon ball", "one piece", "star wars",
  "the last of us", "last of us",
]);

// ─── Contextual Entity Map (lens-aware disambiguation) ───────────────

type ContextualEntityEntry = Partial<Record<MediaType, string>>;

export const CONTEXTUAL_ENTITY_MAP: Record<string, ContextualEntityEntry> = {
  joker: { comics: "Joker DC Comics", movies: "Joker (2019)", tv: "Gotham Joker", anime: "Joker Game" },
  flash: { comics: "The Flash DC Comics", tv: "The Flash TV Series", movies: "The Flash" },
  avatar: { movies: "Avatar", anime: "Avatar: The Last Airbender", tv: "Avatar: The Last Airbender" },
  halo: { games: "Halo", tv: "Halo TV Series", movies: "Halo" },
  doom: { games: "DOOM", movies: "Doom" },
  loki: { comics: "Loki Marvel Comics", tv: "Loki", movies: "Loki Marvel Cinematic Universe" },
  batman: { comics: "Batman DC Comics", movies: "The Batman", tv: "Batman TV Series", games: "Batman Arkham", anime: "Batman Ninja" },
  superman: { comics: "Superman DC Comics", movies: "Superman", tv: "Superman and Lois", games: "Superman" },
  "spider-man": { comics: "Spider-Man Marvel Comics", movies: "Spider-Man", tv: "Spider-Man TV", games: "Marvel's Spider-Man" },
  spiderman: { comics: "Spider-Man Marvel Comics", movies: "Spider-Man", tv: "Spider-Man TV", games: "Marvel's Spider-Man" },
  "iron man": { comics: "Iron Man Marvel Comics", movies: "Iron Man" },
  wolverine: { comics: "Wolverine Marvel Comics", movies: "Logan" },
  "wonder woman": { comics: "Wonder Woman DC Comics", movies: "Wonder Woman" },
  "the witcher": { games: "The Witcher 3: Wild Hunt", tv: "The Witcher", comics: "The Witcher Comics" },
  witcher: { games: "The Witcher 3: Wild Hunt", tv: "The Witcher", comics: "The Witcher Comics" },
  daredevil: { comics: "Daredevil Marvel Comics", tv: "Daredevil", movies: "Daredevil" },
  punisher: { comics: "Punisher Marvel Comics", tv: "The Punisher" },
  "walking dead": { comics: "The Walking Dead Comics", tv: "The Walking Dead" },
  "the walking dead": { comics: "The Walking Dead Comics", tv: "The Walking Dead" },
  bleach: { anime: "Bleach", comics: "Bleach Manga" },
  naruto: { anime: "Naruto", comics: "Naruto Manga", games: "Naruto Ultimate Ninja Storm" },
  "death note": { anime: "Death Note", movies: "Death Note", comics: "Death Note Manga" },
  fate: { anime: "Fate/stay night", games: "Fate/Grand Order" },
  castlevania: { games: "Castlevania", anime: "Castlevania", tv: "Castlevania" },
  "dragon ball": { anime: "Dragon Ball", games: "Dragon Ball FighterZ", comics: "Dragon Ball Manga" },
  "one piece": { anime: "One Piece", movies: "One Piece Film", comics: "One Piece Manga" },
  arcane: { tv: "Arcane", games: "League of Legends" },
  sonic: { games: "Sonic the Hedgehog", movies: "Sonic the Hedgehog", anime: "Sonic X" },
  "star wars": { movies: "Star Wars", tv: "Star Wars", games: "Star Wars Jedi", comics: "Star Wars Comics", anime: "Star Wars: Visions" },
  zelda: { games: "The Legend of Zelda" },
  "god of war": { games: "God of War" },
  "last of us": { games: "The Last of Us", tv: "The Last of Us" },
  "the last of us": { games: "The Last of Us", tv: "The Last of Us" },
};

export type ConversationMode =
  | "canon-lookup"
  | "simple-comparison"
  | "spoiler-analysis"
  | "deep-theory"
  | "cross-universe-analysis"
  | "philosophical-analysis";

export type ResolverContextPacket = {
  version: "v1";
  executionMode: "SEMANTIC" | "DETERMINISTIC_PROVIDER";
  deterministicOwnershipFailure?: boolean;
  ownershipGenerationId: string | null;
  canonicalEntity: string;
  expandedEntity: string;
  entityType: string;
  entityKind: string;
  parentFranchise: string | null;
  universe: string | null;
  continuity: string | null;
  mediaLens: MediaType;
  activeUniverse: string;
  spoilerPolicy: string;
  confidence: number;
  providerId: string | null; // Unified provider-native identifier (e.g. tmdb::movie::496243)
  providerType?: string | null;
  providerMetadata?: ProviderMetadata | null;
  groundingConfidence: {
    authoritative: number;  // Deterministic certainty
    inferred: number;      // ML Expansion certainty
    embeddingRecall: number; // Phase 6: Vector certainty
    topology: number;
    continuity: number;
    lens: number;
  };
  contextualSearchQuery: string;
  retrievalDescriptor: string;
  visualAnchors: string[];
  entityAliases: string[];
  franchiseAliases: string[];
  conversationMode: conversationMode;
  queryMode: "entity" | "exploration";
  canonContext?: {
    universe?: string;
    continuity?: string;
    relationshipType?: CanonRelationship;
    parentEntity?: string;
    canonicalAuthority: "primary" | "derived" | "variant" | "adaptation";
  };
  telemetry: {
    groundingType: "topology" | "registry" | "heuristic" | "fallback";
    expansionUsed: boolean;
    expansionAccepted: boolean;
    expansionType: string | null;
    embeddingUsed: boolean;
    embeddingAccepted: boolean;
    continuityType: ContinuityType | "none";
    isAmbiguous: boolean;
    isSelfReferential: boolean;
    inheritanceDepth: number;
    qualifiedId: string | null;
    candidateHistory: CandidateHistoryEntry[];
    lens: string;
    topologyUsed: boolean;
    candidatePoolSize: number;
    rejectedCrossLensCandidates: number;
    embeddingEntropyScore?: number;
    visualEntropyScore?: number;
    canonRelationshipPath?: string;
    continuitySource?: "inherited" | "pivoted" | "direct" | "none";
    variantResolution?: string[];
    inheritedUniverse?: string | null;
    adaptationLineage?: string | null;
    canonAuthority?: "primary" | "derived" | "variant" | "adaptation";
    canonicalGrounding?: {
      ambiguityLevel: string;
      behavior: string;
      confidence: number;
      suggestionCount: number;
      namespaceConflict: boolean;
      explicitSelectionUsed: boolean;
    };
    multimodalArbitration?: {
      arbitrationAttempted: boolean;
      difficultCase: boolean;
      acceptedUnderUncertainty: boolean;
      resolutionCourage: number;
      arbitrationScore?: number;
      namespaceConfidence?: number;
    };
  };
};

// ─── Intent Analysis ─────────────────────────────────────────────────

const CHARACTER_SIGNALS = [
  "who is", "tell me about", "character", "backstory",
  "powers of", "abilities of", "origin of",
];

const CREATOR_SIGNALS = [
  "director", "author", "writer", "creator", "mangaka",
  "actor", "actress", "voice actor", "seiyuu", "directed by",
];

const EVENT_SIGNALS = [
  "battle of", "war of", "arc", "saga", "event",
  "tournament", "invasion",
];

const LOCATION_SIGNALS = [
  "where is", "planet", "city of", "kingdom of",
  "realm of", "world of",
];

export function analyzeQueryIntent(
  normalizedQuery: string,
  canonicalEntity: string | null,
  mediaLens: MediaLens,
): QueryIntent {
  const q = normalizedQuery.toLowerCase();

  // Check explicit signals first
  for (const sig of CREATOR_SIGNALS) {
    if (q.includes(sig)) return "creator";
  }
  for (const sig of EVENT_SIGNALS) {
    if (q.includes(sig)) return "event";
  }
  for (const sig of LOCATION_SIGNALS) {
    if (q.includes(sig)) return "location";
  }

  // Check if query matches a known franchise
  const entityToCheck = (canonicalEntity ?? normalizedQuery).toLowerCase();
  if (KNOWN_FRANCHISES.has(entityToCheck)) {
    return "franchise";
  }

  // Character signals — only if explicit
  for (const sig of CHARACTER_SIGNALS) {
    if (q.includes(sig)) return "character";
  }

  // Multi-word personal name heuristic (e.g., "light yagami", "tony stark")
  const words = q.split(/\s+/).filter(Boolean);
  if (
    words.length === 2 &&
    !KNOWN_FRANCHISES.has(q) &&
    /^[a-z]+$/.test(words[0]) &&
    /^[a-z]+$/.test(words[1])
  ) {
    // Two plain words, not a known franchise — could be a character name
    // But default to title unless character signals exist
    return "title";
  }

  // Default: treat as title
  return "title";
}

export function detectQueryMode(query: string): "entity" | "exploration" {
  const q = query.toLowerCase();
  const explorationSignals = [
    "best", "top", "like", "similar to", "about",
    "games with", "movies with", "shows with", "anime with",
    "games about", "movies about", "shows about", "anime about",
    "darkest", "funniest", "scariest", "greatest"
  ];
  if (explorationSignals.some(sig => q.includes(sig))) {
    return "exploration";
  }
  return "entity";
}

// ─── Visual Validation ──────────────────────────────────────────────

export function selectVisualType(
  intent: QueryIntent,
  bucket: CandidateBucket,
): VisualType {
  if (intent === "character" && bucket === "character") return "character";
  if (intent === "franchise") return "key_visual";
  return "poster";
}

// ─── Contextual Identity Resolution ──────────────────────────────────

export function isAmbiguousEntity(entity: string): boolean {
  return AMBIGUOUS_ENTITIES.has(entity.toLowerCase().trim());
}

const MULTIMODAL_DESCRIPTOR_PHRASES = [
  "rich vigilante",
  "dark armored vigilante",
  "masked billionaire hero",
  "silver-haired anime swordsman",
  "silver-haired swordsman",
  "glowing-eyed antihero",
  "masked antihero with trauma",
  "alien superhero reporter",
  "multiverse speedster",
  "anime genius strategist",
  "batman beyond",
  "dc prime",
];

export function shouldPrioritizeMultimodalArbitration(
  entity: string,
  mediaType: MediaType
): boolean {
  const norm = entity.toLowerCase().trim();
  if (MULTIMODAL_DESCRIPTOR_PHRASES.some((p) => norm.includes(p))) return true;
  if (
    (norm.includes("gotham") || norm.includes("mcu") || norm.includes("marvel") || norm.includes("anime")) &&
    norm.split(/\s+/).length >= 3
  ) {
    return true;
  }
  if (norm.split(/\s+/).length >= 4 && !findModularTopology(entity, mediaType)) {
    return true;
  }
  return false;
}

export async function resolveContextualIdentity(
  entity: string,
  mediaType: MediaType,
  intent: QueryIntent,
  franchiseHint?: string,
  temporaryEntities?: any[]
): Promise<{ 
  contextualEntity: string; 
  parentFranchise: string | null; 
  universe?: string; 
  continuity?: string;
  continuityType?: ContinuityType;
  topology?: ResolvedTopology;
  context?: FranchiseContext;
  expansionSource?: SemanticSuggestion;
  embeddingCandidate?: boolean;
  candidateHistory: CandidateHistoryEntry[];
  entropyScore: number;
  visualEntropyScore?: number;
  arbitrationScore?: number;
  arbitrationAttempted?: boolean;
  difficultCase?: boolean;
  acceptedUnderUncertainty?: boolean;
  namespaceConfidence?: number;
}> {
  const norm = entity.toLowerCase().trim();
  const history: CandidateHistoryEntry[] = [];

  // 0. Temporary Ingested Entities Cache Check
  if (temporaryEntities && temporaryEntities.length > 0) {
    const normKey1 = entity.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
    const normKey2 = (() => {
      let norm = entity.toLowerCase().trim().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
      const words = norm.split(" ");
      if (words.length > 1 && ["the", "a", "an"].includes(words[0])) {
        return words.slice(1).join(" ");
      }
      return norm;
    })();

    const tempMatch = temporaryEntities.find(t => {
      if (t.lens !== mediaType) return false;
      const tNorm1 = t.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
      const tNorm2 = (() => {
        let norm = t.title.toLowerCase().trim().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
        const words = norm.split(" ");
        if (words.length > 1 && ["the", "a", "an"].includes(words[0])) {
          return words.slice(1).join(" ");
        }
        return norm;
      })();
      return tNorm1 === normKey1 || tNorm2 === normKey2 || tNorm1 === normKey2 || tNorm2 === normKey1 || t.id === entity;
    });

    if (tempMatch) {
      history.push({
        stage: "deterministic",
        candidate: tempMatch.id,
        accepted: true,
        reason: "Dynamic session entity match",
      });
      return {
        contextualEntity: tempMatch.title,
        parentFranchise: null,
        universe: tempMatch.source.toUpperCase(),
        continuity: tempMatch.metadata?.releaseYear ? String(tempMatch.metadata.releaseYear) : undefined,
        candidateHistory: history,
        entropyScore: 0
      };
    }
  }

  // 1. Authoritative Modular Topology (Phase 4)
  const modularMatch = findModularTopology(entity, mediaType);
  if (modularMatch) {
    history.push({
      stage: "deterministic",
      candidate: modularMatch.id,
      accepted: true,
      reason: "Exact or deterministic match",
    });
    return {
      contextualEntity: modularMatch.canonicalEntity,
      parentFranchise: modularMatch.parentFranchise,
      universe: modularMatch.universe ?? undefined,
      continuity: modularMatch.continuity ?? undefined,
      continuityType: modularMatch.continuityType,
      topology: modularMatch,
      candidateHistory: history,
      entropyScore: 0
    };
  }

  // 2. ML-Assisted Semantic Expansion (Phase 5)
  const prioritizeMultimodal = shouldPrioritizeMultimodalArbitration(entity, mediaType);
  const suggestions = prioritizeMultimodal
    ? []
    : await getSuggestionEngine().getSuggestions(entity, mediaType);
  for (const suggestion of suggestions) {
    const suggestedNode = findModularTopology(suggestion.targetId, mediaType);
    if (suggestedNode) {
      const validation = validateExpansion(suggestion, suggestedNode, mediaType);
      
      history.push({
        stage: "semantic_expansion",
        candidate: suggestedNode.id,
        accepted: validation.valid,
        reason: validation.reason ?? "Passed ML gatekeeper",
      });

      if (validation.valid) {
        return {
          contextualEntity: suggestedNode.canonicalEntity,
          parentFranchise: suggestedNode.parentFranchise,
          universe: suggestedNode.universe ?? undefined,
          continuity: suggestedNode.continuity ?? undefined,
          continuityType: suggestedNode.continuityType,
          topology: suggestedNode,
          expansionSource: suggestion,
          candidateHistory: history,
          entropyScore: 0
        };
      }
    }
  }

  // 3. Embedding Semantic Neighborhoods (Phase 6)
  const neighborhood = await getNeighborhoodEngine().discover(
    entity,
    mediaType,
    0,
    franchiseHint
  );
  history.push(...neighborhood.history);

  if (neighborhood.acceptedNode) {
    const arb = neighborhood.arbitration;
    return {
      contextualEntity: neighborhood.acceptedNode.canonicalEntity,
      parentFranchise: neighborhood.acceptedNode.parentFranchise,
      universe: neighborhood.acceptedNode.universe ?? undefined,
      continuity: neighborhood.acceptedNode.continuity ?? undefined,
      continuityType: neighborhood.acceptedNode.continuityType,
      topology: neighborhood.acceptedNode,
      embeddingCandidate: true,
      candidateHistory: history,
      entropyScore: neighborhood.entropyScore,
      visualEntropyScore: neighborhood.visualEntropyScore,
      arbitrationScore: arb?.arbitrationScore,
      arbitrationAttempted: Boolean(arb?.courageAttempt),
      difficultCase: arb?.difficultCase,
      acceptedUnderUncertainty: arb?.acceptedUnderUncertainty,
      namespaceConfidence: arb?.namespaceConfidence ?? undefined,
    };
  }

  // 4. Hierarchical Registry (Legacy Fallback)
  const registryMatch = findFranchiseContext(entity, mediaType);
  if (registryMatch) {
    history.push({
      stage: "heuristic",
      candidate: registryMatch.entity,
      accepted: true,
      reason: "Legacy registry fallback match",
    });
    return { 
      contextualEntity: registryMatch.entity, 
      parentFranchise: registryMatch.parentFranchise, 
      universe: registryMatch.universe, 
      context: registryMatch,
      candidateHistory: history,
      entropyScore: 0
    };
  }

  // 5. Check contextual entity map (Legacy Fallback)
  const contextEntry = CONTEXTUAL_ENTITY_MAP[norm];
  if (contextEntry) {
    const contextual = contextEntry[mediaType];
    if (contextual) {
      const parent = CHARACTER_FRANCHISE_MAP[contextual.toLowerCase()] ?? contextual;
      history.push({
        stage: "heuristic",
        candidate: contextual,
        accepted: true,
        reason: "Legacy contextual map match",
      });
      return { 
        contextualEntity: contextual, 
        parentFranchise: parent, 
        candidateHistory: history,
        entropyScore: 0
      };
    }
  }

  // 6. Check character → franchise map
  if (intent === "character") {
    const franchise = CHARACTER_FRANCHISE_MAP[norm];
    if (franchise) {
      history.push({
        stage: "heuristic",
        candidate: entity,
        accepted: true,
        reason: "Legacy character franchise map match",
      });
      return { 
        contextualEntity: entity, 
        parentFranchise: franchise, 
        candidateHistory: history,
        entropyScore: 0
      };
    }
  }

  history.push({
    stage: "heuristic",
    candidate: entity,
    accepted: false,
    reason: "No matches found across all stages",
  });

  return { 
    contextualEntity: entity, 
    parentFranchise: null, 
    candidateHistory: history,
    entropyScore: 0
  };
}

// ─── Contextual Search Query Builder ─────────────────────────────────

const MEDIA_SUFFIX: Record<MediaType, string> = {
  anime: "anime adaptation",
  movies: "movie film adaptation",
  tv: "tv series",
  games: "game series",
  comics: "comics",
};

export function buildContextualSearchQuery(
  entity: string,
  mediaType: MediaType,
  parentFranchise: string | null,
  intent: QueryIntent,
): string {
  const suffix = MEDIA_SUFFIX[mediaType] ?? "";
  const parts: string[] = [entity];

  if (parentFranchise && parentFranchise.toLowerCase() !== entity.toLowerCase()) {
    parts.push(parentFranchise);
  }

  if (suffix) {
    parts.push(suffix);
  }

  return parts.join(" ");
}

// ─── Main Pipeline ───────────────────────────────────────────────────

export async function resolveCanonicalEntity(
  rawQuery: string,
  mediaLens: MediaLens,
  apiCandidates: ResolverCandidate[],
): Promise<CanonicalResolution> {
  const query = normalizeQuery(rawQuery);
  const mt = mediaLens as MediaType;
  const intent = analyzeQueryIntent(query.normalized, query.canonical, mediaLens);

  // Contextual identity resolution
  const baseEntity = query.canonical ?? query.original;
  const { contextualEntity, parentFranchise } = await resolveContextualIdentity(baseEntity, mt, intent);
  const contextualSearchQuery = buildContextualSearchQuery(contextualEntity, mt, parentFranchise, intent);

  const sanitized = sanitizeApiResults(apiCandidates);
  const provisionalResolution: CanonicalResolution = {
    canonicalEntity: contextualEntity,
    parentFranchise: parentFranchise ?? undefined,
    contextualSearchQuery,
    intent,
    mediaType: mt ?? "movies",
    confidence: query.wasAlias ? 0.9 : 0.6,
    source: "compatibility_probe",
    selectedVisualType: selectVisualType(intent, intent === "character" ? "character" : "title"),
    score: 0,
    debug: [],
    alternatives: [],
  };
  const validationContext: ValidationContext = {
    query,
    contextualEntity,
    parentFranchise,
    contextualSearchQuery,
  };

  const compatibilityMap = new Map<string, CompatibilityResult>();
  const validationDebug: ResolverDebug[] = [];
  const eligibleCandidates = sanitized.filter((candidate) => {
    const normalizedCandidate = {
      ...candidate,
      bucket: classifyBucket(candidate.name, intent, query.normalized),
    };
    const compatibility = validateCandidateCompatibility(normalizedCandidate, provisionalResolution, validationContext);
    compatibilityMap.set(`${normalizedCandidate.source}::${normalizedCandidate.name}`, compatibility);
    validationDebug.push(buildDebugEntry(
      normalizedCandidate,
      compatibility.eligible ? 0 : -100,
      [],
      compatibility.penalties,
      compatibility,
    ));
    return compatibility.eligible;
  });

  const ctx: ScoringContext = {
    normalizedQuery: query.normalized,
    canonicalEntity: contextualEntity,
    intent,
    mediaLens,
  };

  const { ranked, debug: rankedDebug } = rankCandidates(eligibleCandidates, ctx, compatibilityMap);
  const debug = [...rankedDebug, ...validationDebug.filter((entry) => entry.eligible === false)];

  const winner = ranked[0] ?? null;
  const canonicalEntity = winner?.name ?? contextualEntity;
  const score = winner?.finalScore ?? 0;
  let confidence = computeConfidence(score);

  // Confidence boost when contextual interpretation succeeds
  if (parentFranchise && isAmbiguousEntity(query.normalized)) {
    confidence = Math.min(0.99, confidence + 0.15);
  }

  const groundingTelemetry = {
    missingFranchiseContext: !parentFranchise,
    isSelfReferential: parentFranchise === canonicalEntity,
    fallbackUsed: !findFranchiseContext(canonicalEntity, mt),
  };

  // Log telemetry with full context
  logResolverTelemetry(debug, canonicalEntity, {
    rawQuery: rawQuery,
    mediaLens,
    parentFranchise: parentFranchise ?? undefined,
    contextualSearchQuery,
    confidence,
    ...groundingTelemetry,
  });

  return {
    canonicalEntity,
    parentFranchise: parentFranchise ?? undefined,
    contextualSearchQuery,
    intent,
    mediaType: mt ?? "movies",
    confidence,
    source: winner?.source ?? "none",
    selectedVisualType: selectVisualType(intent, winner?.bucket ?? "title"),
    score,
    debug,
    alternatives: ranked.slice(1, 5),
  };
}

// ─── LLM Override ────────────────────────────────────────────────────

export function applyResolverOverride(
  resolverResult: CanonicalResolution,
  llmEntity: string | null,
  llmEntityType: string | null,
): { entity: string; entityType: string; wasOverridden: boolean } {
  if (resolverResult.confidence >= 0.8 && resolverResult.canonicalEntity) {
    const resolverEntityType = intentToEntityType(resolverResult.intent, resolverResult.mediaType);
    const llmSaidCharacter = llmEntityType === "character";
    const resolverSaysNotCharacter = resolverResult.intent !== "character";

    if (llmSaidCharacter && resolverSaysNotCharacter) {
      console.log(
        `[Canonical Resolver] OVERRIDE: LLM said "${llmEntity}" (${llmEntityType}), ` +
        `resolver corrected to "${resolverResult.canonicalEntity}" (${resolverEntityType}) ` +
        `with confidence ${resolverResult.confidence}`,
      );
      return {
        entity: resolverResult.canonicalEntity,
        entityType: resolverEntityType,
        wasOverridden: true,
      };
    }
  }

  return {
    entity: llmEntity ?? resolverResult.canonicalEntity,
    entityType: llmEntityType ?? "unknown",
    wasOverridden: false,
  };
}

function intentToEntityType(intent: QueryIntent, mediaType: MediaType): string {
  if (intent === "character") return "character";
  if (mediaType === "anime") return "anime";
  if (mediaType === "movies") return "movie";
  if (mediaType === "tv") return "tv";
  if (mediaType === "games") return "game";
  if (mediaType === "comics") return "comic";
  return "unknown";
}

// ─── Franchise Lock ──────────────────────────────────────────────────

export function shouldMaintainFranchiseLock(
  previousEntity: string | null,
  currentQuery: string,
): boolean {
  if (!previousEntity) return false;

  const q = currentQuery.toLowerCase().trim();

  const switchSignals = [
    "what about", "switch to", "tell me about", "now about",
    "change to", "different", "instead",
  ];
  for (const sig of switchSignals) {
    if (q.startsWith(sig)) return false;
  }

  const prevNorm = previousEntity.toLowerCase();
  for (const franchise of KNOWN_FRANCHISES) {
    if (franchise !== prevNorm && q.includes(franchise)) {
      return false;
    }
  }

  return true;
}

// ─── Utility Exports ─────────────────────────────────────────────────

export function isObscureContent(name: string): boolean {
  return SIDE_CONTENT_PATTERN.test(name);
}

export function getCanonicalName(query: string): string | null {
  return CANONICAL_ALIASES[query.toLowerCase().trim()] ?? null;
}

async function resolveAnimeThroughAniList(
  resolvedTitle: string,
  rawQuery: string
): Promise<{ id: number; confidence: number; name: string } | null> {
  const queryGraphQL = `
    query ($search: String) {
      Page (page: 1, perPage: 10) {
        media (search: $search, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          synonyms
          meanScore
          startDate {
            year
          }
        }
      }
    }
  `;

  // Normalize string for exact matching
  const cleanString = (str: string) => {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  };

  const cleanResolved = cleanString(resolvedTitle);
  const cleanRaw = cleanString(rawQuery);

  const searchTerms = [resolvedTitle, rawQuery].filter(Boolean);
  
  for (const term of searchTerms) {
    try {
      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          query: queryGraphQL,
          variables: { search: term }
        })
      });

      if (!response.ok) continue;
      const json = await response.json();
      const mediaList = json?.data?.Page?.media;
      if (!Array.isArray(mediaList) || mediaList.length === 0) continue;

      let bestCandidate: any = null;
      let maxConfidence = 0.0;

      for (const media of mediaList) {
        const english = media.title?.english || "";
        const romaji = media.title?.romaji || "";
        const native = media.title?.native || "";
        const synonyms = media.synonyms || [];

        const titles = [english, romaji, native, ...synonyms].filter(Boolean);
        let matchConfidence = 0.0;

        for (const title of titles) {
          const cleanTitle = cleanString(title);
          // 1. Exact alias match or exact title match = 1.0
          if (cleanTitle === cleanResolved || cleanTitle === cleanRaw) {
            matchConfidence = 1.0;
            break;
          }
        }

        // 2. Strong synonym overlap = 0.9+
        if (matchConfidence < 1.0) {
          const resolvedTokens = resolvedTitle.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
          const rawTokens = rawQuery.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
          
          for (const title of titles) {
            const titleTokens = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
            if (titleTokens.length === 0) continue;

            const getOverlap = (tokens: string[]) => {
              if (tokens.length === 0) return 0;
              const shared = tokens.filter(t => titleTokens.includes(t));
              return shared.length / Math.min(tokens.length, titleTokens.length);
            };

            const overlap = Math.max(getOverlap(resolvedTokens), getOverlap(rawTokens));
            if (overlap >= 0.85) {
              matchConfidence = Math.max(matchConfidence, 0.9);
            }
          }
        }

        if (matchConfidence > maxConfidence) {
          maxConfidence = matchConfidence;
          bestCandidate = media;
        } else if (matchConfidence === maxConfidence && bestCandidate && media.meanScore > bestCandidate.meanScore) {
          bestCandidate = media;
        }
      }

      if (bestCandidate && maxConfidence >= 0.85) {
        const result = {
          id: bestCandidate.id,
          confidence: maxConfidence,
          name: bestCandidate.title?.english ?? bestCandidate.title?.romaji ?? bestCandidate.title?.native ?? resolvedTitle
        };

        // Explicit Logging Constraint 7
        console.log("[Anime Resolver]", {
          query: rawQuery,
          selectedTitle: resolvedTitle,
          anilistId: result.id,
          confidence: result.confidence
        });

        return result;
      }
    } catch (err) {
      console.error("[Nerdvana] resolveAnimeThroughAniList error:", err);
    }
  }

  // Explicit Logging Constraint 7 for failed/low confidence resolutions
  console.log("[Anime Resolver] Failed to deterministically ground anime", {
    query: rawQuery,
    selectedTitle: resolvedTitle
  });

  return null;
}

// ─── Semantic Grounding Helpers ─────────────────────────────────────

function generateRetrievalDescriptor(
  entity: string,
  kind: string,
  lens: MediaType,
  franchise: string | null
): string {
  const parts: string[] = [entity];
  
  if (franchise && franchise.toLowerCase() !== entity.toLowerCase() && !entity.toLowerCase().includes(franchise.toLowerCase())) {
    parts.push(franchise);
  }

  if (lens === "games") parts.push("game");
  else if (lens === "anime") parts.push("anime");
  else if (lens === "movies") parts.push("movie");
  else if (lens === "tv") parts.push("television series");
  else if (lens === "comics") parts.push("comic");

  if (kind === "character") parts.push("character");

  return parts.join(" ");
}

function generateVisualAnchors(
  entity: string,
  franchise: string | null,
  lens: MediaType
): string[] {
  const anchors = new Set<string>();
  
  anchors.add(entity.toLowerCase());
  if (franchise) anchors.add(franchise.toLowerCase());
  
  if (lens === "games") {
    anchors.add("game");
    if (franchise?.includes("GTA")) {
      anchors.add("rockstar games");
      if (franchise.includes("San Andreas")) anchors.add("grove street");
    }
    if (franchise?.includes("God of War")) {
      anchors.add("spartan");
      anchors.add("playstation");
      anchors.add("sony santa monica");
    }
  } else if (lens === "anime") {
    anchors.add("anime");
    anchors.add("manga");
  }

  return Array.from(anchors);
}

export async function buildContextPacket(
  query: string,
  mediaLens: MediaType,
  spoilerMode: boolean,
  previousEntity?: string | null,
  grounding?: CanonicalGroundingResult | null
): Promise<ResolverContextPacket> {
  const selectionVal = grounding?.selectedSelectionValue;
  const isProviderId = selectionVal?.startsWith("tmdb::") || selectionVal?.startsWith("rawg::") || selectionVal?.startsWith("igdb::") || selectionVal?.startsWith("comicvine::") || selectionVal?.startsWith("jikan::") || selectionVal?.startsWith("googlebooks::");

  const hasValidProviderOwnership = isProviderId && 
    selectionVal && 
    (grounding?.providerMetadata?.canonicalTitle || grounding?.selectedCanonicalEntity);

  const executionMode = hasValidProviderOwnership ? "DETERMINISTIC_PROVIDER" : "SEMANTIC";
  const providerId = isProviderId ? selectionVal : null;

  console.log(
    "[PROVIDER_ID_RECEIVED] Received provider ID:",
    providerId
  );

  console.log("[EXECUTION_MODE]", {
    mode: executionMode,
    query,
    providerId,
    deterministic: executionMode === "DETERMINISTIC_PROVIDER"
  });

  const explicitSelectionUsed = grounding?.telemetry?.explicitSelectionUsed === true;
  const hasDeterministicOwnershipFailure = explicitSelectionUsed && (
    !providerId ||
    executionMode !== "DETERMINISTIC_PROVIDER"
  );

  if (
    grounding?.telemetry?.explicitSelectionUsed &&
    !grounding?.providerMetadata
  ) {
    console.error(
      "[PROVIDER_METADATA_LOST]",
      "Explicit selection reached resolver without providerMetadata."
    );
  }

  if (hasDeterministicOwnershipFailure) {
    console.error(
      "[DETERMINISTIC_OWNERSHIP_FAILURE]",
      "Explicit selection used but provider ownership could not be established!"
    );
  }

  const canonicalQuery = normalizeQuery(query);
  const intent = analyzeQueryIntent(
    canonicalQuery.normalized,
    canonicalQuery.canonical,
    mediaLens as any
  );
  
  let finalTopology = null;
  let finalContextualEntity = query;
  let finalUniverse = null;
  let finalContinuity = null;
  let finalContinuityType = "none";
  let finalParentFranchise = null;
  let continuitySource: "inherited" | "pivoted" | "direct" | "none" = "direct";
  let inheritedUniverse: string | null = null;
  let canonRelationshipPath: string | undefined = undefined;
  let adaptationLineage: string | null = null;

  let expansionSource = null;
  let embeddingCandidate = false;
  let candidateHistory: any[] = [];
  let entropyScore = 0;
  let visualEntropyScore = 0;
  let arbitrationScore = undefined;
  let arbitrationAttempted = false;
  let difficultCase = false;
  let acceptedUnderUncertainty = false;
  let namespaceConfidence = undefined;
  let context = null;

  let fetchedComicVineData: any = null;
  if (executionMode === "DETERMINISTIC_PROVIDER" && providerId?.startsWith("comicvine::")) {
    const env = (globalThis as any).process?.env ?? {};
    const comicVineKey = (env.COMICVINE_API_KEY || env.VITE_COMICVINE_API_KEY)?.trim() || undefined;
    if (comicVineKey) {
      const cvParts = providerId.split("::");
      const resourceType = cvParts[1];
      const cvId = cvParts[2];
      const prefixMap: Record<string, string> = {
        character: "4005",
        volume: "4050",
        issue: "4000",
        story_arc: "4045",
        event: "4015",
        team: "4060",
        publisher: "4010"
      };
      const prefix = prefixMap[resourceType];
      if (prefix) {
        try {
          console.log(`[COMICVINE_DIRECT_FETCH] Hydrating continuity context for direct ID ${providerId}`);
          const url = `https://comicvine.gamespot.com/api/${resourceType}/${prefix}-${cvId}/?api_key=${comicVineKey}&format=json&field_list=id,name,description,deck,start_year,publisher,aliases,concepts,teams,character_credits,volume_credits`;
          const res = await fetch(url, { headers: { "User-Agent": "Nerdvana/1.0" } });
          if (res.ok) {
            const data = await res.json();
            if (data?.results) {
              fetchedComicVineData = data.results;
              hydrateContinuityGraphFromComicVine(providerId!, fetchedComicVineData);
              console.log("[DIRECT_PROVIDER_CONTEXT] Successfully hydrated ComicVine metadata:", {
                id: cvId,
                name: fetchedComicVineData.name,
                publisher: fetchedComicVineData.publisher?.name,
                start_year: fetchedComicVineData.start_year
              });
            }
          } else {
            console.error(`[COMICVINE_DIRECT_FETCH] Failed with status ${res.status}`);
          }
        } catch (e) {
          console.error("[COMICVINE_DIRECT_FETCH] Exception during hydration:", e);
        }
      }
    }
  }

  if (executionMode === "DETERMINISTIC_PROVIDER") {
    console.log("[SEMANTIC_ENRICHMENT_ONLY] Semantic systems locked as read-only. Ownership, type, and franchise root mutations disabled.");
    // EXACT PROVIDER GOVERNANCE ONLY
    if (fetchedComicVineData) {
      const cvParts = providerId ? providerId.split("::") : [];
      const resourceType = cvParts[1];
      const safeNameForFranchise = typeof fetchedComicVineData.name === 'string' ? fetchedComicVineData.name : "";
      const franchiseRoot = safeNameForFranchise ? safeNameForFranchise.split(/[:\- ]/)[0].toLowerCase() : null;
      const concepts = fetchedComicVineData.concepts || [];
      const cvUniverse = concepts.find((c: any) => c.name?.toLowerCase().includes("universe") || c.name?.toLowerCase().includes("earth"))?.name || null;

      finalContextualEntity = fetchedComicVineData.name || query;
      finalParentFranchise = franchiseRoot || null;
      finalUniverse = cvUniverse || fetchedComicVineData.publisher?.name || null;
      finalContinuity = fetchedComicVineData.start_year ? String(fetchedComicVineData.start_year) : null;
      finalContinuityType = "prime";
    } else {
      finalContextualEntity = grounding?.providerMetadata?.canonicalTitle || grounding?.selectedCanonicalEntity || query;
      finalParentFranchise = grounding?.providerMetadata?.franchiseRoot || grounding?.selectedFranchise || null;
      finalUniverse = grounding?.providerMetadata?.universe || null;
      finalContinuity = grounding?.providerMetadata?.releaseYear ? String(grounding.providerMetadata.releaseYear) : null;
      finalContinuityType = "prime";
    }
    console.log(`[DETERMINISTIC OWNERSHIP ACQUIRED] Exact provider governance locked for ID "${selectionVal}": Canonical "${finalContextualEntity}", root "${finalParentFranchise}"`);
  } else if (hasDeterministicOwnershipFailure) {
    // Zero-Semantic Recovery Firewall
    finalContextualEntity = query;
    finalParentFranchise = null;
    finalUniverse = null;
    finalContinuity = null;
    finalContinuityType = "none";
    console.log(
      "[DETERMINISTIC_OWNERSHIP_FAILURE]",
      "Short-circuiting semantic recovery."
    );
  } else {
    // Semantic mode - run resolveContextualIdentity and other legacy fallbacks
    const previousIdentity = previousEntity ? await resolveContextualIdentity(previousEntity, mediaLens as any, "franchise" as any) : null;
    const franchiseHint = previousIdentity?.parentFranchise;
    const previousNodeId = previousIdentity?.topology?.id ?? previousEntity;

    const resolutionSeed = grounding?.selectedSelectionValue ?? grounding?.selectedCanonicalEntity ?? canonicalQuery.canonical ?? query;

    const res = await resolveContextualIdentity(
      resolutionSeed,
      mediaLens as any,
      intent,
      franchiseHint ?? undefined,
      grounding?.temporaryEntities
    );

    finalTopology = res.topology;
    finalContextualEntity = res.contextualEntity;
    finalUniverse = res.universe;
    finalContinuity = res.continuity;
    finalContinuityType = res.continuityType ?? "none";
    finalParentFranchise = res.parentFranchise;
    expansionSource = res.expansionSource ?? null;
    embeddingCandidate = !!res.embeddingCandidate;
    candidateHistory = res.candidateHistory;
    entropyScore = res.entropyScore;
    visualEntropyScore = res.visualEntropyScore ?? 0;
    arbitrationScore = res.arbitrationScore;
    arbitrationAttempted = !!res.arbitrationAttempted;
    difficultCase = !!res.difficultCase;
    acceptedUnderUncertainty = !!res.acceptedUnderUncertainty;
    namespaceConfidence = res.namespaceConfidence;
    context = res.context ?? null;

    if (res.topology) {
      const resContinuity = resolveContinuity(query, res.topology, previousNodeId);
      finalTopology = resContinuity.currentNode;
      finalContextualEntity = resContinuity.currentNode.canonicalEntity;
      finalUniverse = resContinuity.currentNode.universe ?? undefined;
      finalContinuity = resContinuity.currentNode.continuity ?? undefined;
      finalContinuityType = resContinuity.currentNode.continuityType;
      continuitySource = resContinuity.continuitySource;
      inheritedUniverse = resContinuity.inheritedUniverse;
      canonRelationshipPath = resContinuity.relationshipPath;

      if (resContinuity.previousNode && resContinuity.currentNode.continuityType === "adaptation") {
        adaptationLineage = determineAdaptationLineage(resContinuity.previousNode, resContinuity.currentNode);
      } else if (resContinuity.currentNode.baseId) {
        const baseNode = getTopologyEngine().resolve(resContinuity.currentNode.baseId);
        if (baseNode) {
          adaptationLineage = determineAdaptationLineage(baseNode, resContinuity.currentNode);
        }
      }
    }
  }

  const canonAuthority = (() => {
    if (!finalTopology) return "primary";
    const ct = finalTopology.continuityType;
    if (ct === "prime") return "primary";
    if (ct === "adaptation") return "adaptation";
    if (ct === "variant") return "variant";
    return "derived";
  })();

  const canonContext = finalTopology ? {
    universe: finalUniverse,
    continuity: finalContinuity,
    relationshipType: finalTopology.baseId ? (getRelationship(finalTopology.id, finalTopology.baseId)?.type ?? undefined) : undefined,
    parentEntity: finalTopology.baseId ?? undefined,
    canonicalAuthority: canonAuthority,
  } : undefined;

  const variantResolution = finalTopology 
    ? getVariantFamily(finalTopology.id).map(v => v.id)
    : [];

  if (executionMode === "DETERMINISTIC_PROVIDER") {
    finalContextualEntity = grounding?.providerMetadata?.canonicalTitle || grounding?.selectedCanonicalEntity || finalContextualEntity;
    finalParentFranchise = grounding?.providerMetadata?.franchiseRoot || grounding?.selectedFranchise || finalParentFranchise || null;
    console.log(`[DETERMINISTIC OWNERSHIP ACQUIRED] Locked provider identity for ID "${selectionVal}": Expected canonical "${finalContextualEntity}", root "${finalParentFranchise}"`);
  }

  const contextualSearchQuery = buildContextualSearchQuery(
    finalContextualEntity,
    mediaLens as any,
    finalParentFranchise,
    intent
  );

  const expandedEntity = finalTopology 
    ? finalTopology.canonicalEntity 
    : (isProviderId 
        ? (grounding?.providerMetadata?.canonicalTitle ?? grounding?.selectedCanonicalEntity ?? canonicalQuery.canonical ?? finalContextualEntity) 
        : (grounding?.selectedSelectionValue ?? grounding?.selectedCanonicalEntity ?? canonicalQuery.canonical ?? finalContextualEntity)
      );

  let providerMetadata: ProviderMetadata | null = null;
  if (fetchedComicVineData) {
    const cvParts = providerId ? providerId.split("::") : [];
    const resourceType = cvParts[1];
    const safeNameForFranchise = typeof fetchedComicVineData.name === 'string' ? fetchedComicVineData.name : "";
    const franchiseRoot = safeNameForFranchise ? safeNameForFranchise.split(/[:\- ]/)[0].toLowerCase() : null;
    const concepts = fetchedComicVineData.concepts || [];
    const cvUniverse = concepts.find((c: any) => c.name?.toLowerCase().includes("universe") || c.name?.toLowerCase().includes("earth"))?.name || null;
    
    providerMetadata = {
      provider: "comicvine",
      id: String(fetchedComicVineData.id),
      confidence: 0.99,
      canonicalTitle: fetchedComicVineData.name,
      franchiseRoot,
      releaseYear: fetchedComicVineData.start_year ? parseInt(fetchedComicVineData.start_year) : null,
      providerType: grounding?.providerMetadata?.providerType || inferProviderTypeFromId(providerId),
      providerResourceType: resourceType,
      publisherLabel: fetchedComicVineData.publisher?.name ?? null,
      universe: cvUniverse || fetchedComicVineData.publisher?.name || null,
    };
    console.log(`[DETERMINISTIC_PROVIDER_LOCK] Locked direct ComicVine providerMetadata:`, providerMetadata);
  } else if (grounding?.providerMetadata) {
    providerMetadata = grounding.providerMetadata;
  } else if (mediaLens === "anime") {
    const animeTitleToResolve = finalParentFranchise || finalContextualEntity;
    const resolution = await resolveAnimeThroughAniList(animeTitleToResolve, query);
    if (resolution) {
      providerMetadata = {
        provider: "anilist" as const,
        id: resolution.id,
        confidence: resolution.confidence,
        providerType: "anime",
      };
    }
  }
  const retrievalDescriptor = generateRetrievalDescriptor(
    expandedEntity,
    intent,
    mediaLens,
    finalParentFranchise
  );
  
  const visualAnchors = uniqueNormalized([
    ...generateVisualAnchors(expandedEntity, finalParentFranchise, mediaLens),
    ...(context?.visualAnchors ?? []),
    ...(finalTopology?.visualAnchors ?? []),
  ]);

  const cvAliases = fetchedComicVineData?.aliases
    ? String(fetchedComicVineData.aliases).split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean)
    : [];
  const entityAliases: string[] = uniqueNormalized([
    expandedEntity,
    finalContextualEntity,
    query,
    ...(canonicalQuery.canonical ? [canonicalQuery.canonical] : []),
    ...cvAliases,
    ...(context?.aliases ?? []),
    ...(finalTopology?.aliases ?? []),
  ]);

  const franchiseAliases: string[] = getFranchiseAliases(finalParentFranchise);

  const lensConfidence = 1.0; 
  let authoritativeConfidence = finalTopology && !expansionSource && !embeddingCandidate ? 0.99 : context ? 0.95 : 0.4;
  let inferredConfidence = expansionSource ? expansionSource.score : 0;
  let embeddingRecallConfidence = embeddingCandidate
    ? arbitrationScore != null
      ? Math.min(0.92, Number(arbitrationScore.toFixed(2)))
      : 0.9
    : 0;

  let topologyConfidence = finalTopology ? 0.98 : 0.5;
  let continuityConfidence = finalContinuity ? 0.95 : 0.3;

  if (embeddingCandidate && namespaceConfidence != null) {
    const multimodalConfidence = Math.min(
      0.92,
      namespaceConfidence * 0.35 +
        topologyConfidence * 0.35 +
        embeddingRecallConfidence * 0.2 +
        continuityConfidence * 0.1
    );
    embeddingRecallConfidence = multimodalConfidence;
  }

  let overallConfidence = Number((
    (authoritativeConfidence * 0.4) + 
    (inferredConfidence * 0.2) + 
    (embeddingRecallConfidence * 0.2) +
    (topologyConfidence * 0.1) +
    (continuityConfidence * 0.1)
  ).toFixed(2));

  if (executionMode === "DETERMINISTIC_PROVIDER") {
    overallConfidence = 0.99;
  } else if (isProviderId) {
    overallConfidence = grounding?.providerMetadata?.confidence ?? 0.99;
  } else if (grounding && grounding.confidence >= 0.95 && grounding.telemetry?.exactTitleHit) {
    overallConfidence = grounding.confidence;
  }

  const resolutionCourage =
    arbitrationAttempted && (embeddingCandidate || (difficultCase && namespaceConfidence != null && namespaceConfidence >= 0.8))
      ? 1
      : 0;

  let conversationMode: ConversationMode = "canon-lookup";
  const qLower = query.toLowerCase();

  if (qLower.includes("theory") || qLower.includes("what if") || qLower.includes("symbolism")) {
    conversationMode = "deep-theory";
  } else if (qLower.includes(" vs ") || qLower.includes("versus") || qLower.includes("stronger") || qLower.includes("better")) {
    conversationMode = "simple-comparison";
  } else if (qLower.includes("die") || qLower.includes("death") || qLower.includes("end") || qLower.includes("kill")) {
    conversationMode = "spoiler-analysis";
  } else if (qLower.includes("meaning") || qLower.includes("philosophy")) {
    conversationMode = "philosophical-analysis";
  }

  const activeUniverse = finalUniverse ?? finalParentFranchise ?? finalContextualEntity;
  const classifiedComicType =
    mediaLens === "comics"
      ? classifyComicsQueryType(grounding?.selectedCanonicalEntity || query)
      : null;
  const resolvedProviderType = providerMetadata?.providerType ?? classifiedComicType ?? null;
  const entityType =
    resolvedProviderType && (executionMode === "DETERMINISTIC_PROVIDER" || mediaLens === "comics")
      ? resolvedProviderType
      : intentToEntityType(intent, mediaLens);

  if (resolvedProviderType) {
    console.log("[TYPED_PROVIDER_PROPAGATED]", {
      query,
      providerId,
      providerType: resolvedProviderType,
      providerResourceType: providerMetadata?.providerResourceType ?? null,
      executionMode,
    });
  }

  const packet: ResolverContextPacket = {
    version: "v1",
    executionMode,
    deterministicOwnershipFailure: hasDeterministicOwnershipFailure,
    ownershipGenerationId: executionMode === "DETERMINISTIC_PROVIDER" ? `gen_own_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` : null,
    canonicalEntity: finalContextualEntity,
    expandedEntity,
    entityType,
    entityKind: intent,
    parentFranchise: finalParentFranchise ?? null,
    universe: finalUniverse ?? null,
    continuity: finalContinuity ?? null,
    mediaLens,
    activeUniverse,
    spoilerPolicy: spoilerMode ? "safe" : "strict",
    confidence: overallConfidence,
    providerId: providerId ?? null,
    providerType: resolvedProviderType,
    providerMetadata: providerMetadata ?? null,
    groundingConfidence: {
      authoritative: authoritativeConfidence,
      inferred: inferredConfidence,
      embeddingRecall: embeddingRecallConfidence,
      topology: topologyConfidence,
      lens: lensConfidence,
      continuity: continuityConfidence
    },
    contextualSearchQuery,
    retrievalDescriptor,
    visualAnchors,
    entityAliases,
    franchiseAliases,
    conversationMode,
    queryMode: detectQueryMode(query),
    canonContext,
    telemetry: {
      groundingType: finalTopology ? "topology" : context ? "registry" : finalParentFranchise ? "heuristic" : "fallback",
      expansionUsed: Boolean(expansionSource),
      expansionAccepted: Boolean(expansionSource && finalTopology),
      expansionType: expansionSource?.relationshipType ?? null,
      embeddingUsed: candidateHistory.some(h => h.stage === "embedding_neighbor"),
      embeddingAccepted: Boolean(embeddingCandidate),
      continuityType: (finalContinuityType as ContinuityType) ?? "none",
      isAmbiguous: isAmbiguousEntity(query),
      isSelfReferential: finalParentFranchise === finalContextualEntity,
      inheritanceDepth: finalTopology?.inheritanceDepth ?? 0,
      qualifiedId: finalTopology?.id ?? null,
      candidateHistory,
      embeddingEntropyScore: entropyScore,
      visualEntropyScore: visualEntropyScore ?? 0,
      canonRelationshipPath,
      continuitySource,
      variantResolution,
      inheritedUniverse,
      adaptationLineage,
      canonAuthority,
      canonicalGrounding: grounding
        ? {
            ambiguityLevel: grounding.ambiguityLevel,
            behavior: grounding.behavior,
            confidence: grounding.confidence,
            suggestionCount: grounding.suggestions.length,
            namespaceConflict: grounding.telemetry.namespaceConflict,
            explicitSelectionUsed: grounding.telemetry.explicitSelectionUsed,
          }
        : undefined,
      multimodalArbitration: {
        arbitrationAttempted: Boolean(arbitrationAttempted),
        difficultCase: Boolean(difficultCase),
        acceptedUnderUncertainty: Boolean(acceptedUnderUncertainty),
        resolutionCourage,
        arbitrationScore,
        namespaceConfidence,
      },
    }
  };

  if (executionMode === "DETERMINISTIC_PROVIDER") {
    if (packet.providerMetadata) {
      Object.freeze(packet.providerMetadata);
    }
    Object.freeze(packet);
  }

  return packet;
}
