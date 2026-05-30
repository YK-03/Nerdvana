import type { MediaLens } from "../../app/mediaLens.js";
import { FRANCHISE_REGISTRY } from "./franchiseContextRegistry.js";
import { TOPOLOGY_REGISTRY } from "./continuityRegistry.js";
import { listModularTopologies } from "./topology/registry.js";
import type { AliasDescriptor, AliasOrigin, ContinuityType } from "./topology/topologyTypes.js";
import type { TemporaryCanonicalEntity } from "./dynamicEntityIngestion.js";
import { lensScore, type CatalogEntry } from "./lensFence.js";
import {
  inferProviderTypeFromId,
  type ProviderMetadata,
} from "./providerMetadata.js";

function debugLog(...args: any[]) {
  const isDebug = (typeof process !== 'undefined' && process.env?.DEBUG_AUTOCOMPLETE === "true") ||
                  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEBUG_AUTOCOMPLETE === "true") ||
                  (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEBUG_AUTOCOMPLETE === "true");
  if (isDebug) {
    console.log(...args);
  }
}

function debugWarn(...args: any[]) {
  const isDebug = (typeof process !== 'undefined' && process.env?.DEBUG_AUTOCOMPLETE === "true") ||
                  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEBUG_AUTOCOMPLETE === "true") ||
                  (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEBUG_AUTOCOMPLETE === "true");
  if (isDebug) {
    console.warn(...args);
  }
}

export type AmbiguityLevel = "low" | "medium" | "high";
export type GroundingBehavior = "auto_resolve" | "suggest" | "require_selection";

export interface CanonicalSuggestion {
  canonicalEntity: string;
  selectionValue: string;
  displayTitle: string;
  franchise: string | null;
  mediaLens: MediaLens;
  mediaLabel: string;
  namespaceLabel: string;
  continuityLabel: string | null;
  metadataLabel: string;
  universe: string | null;
  source: "topology" | "continuity" | "registry" | "supplemental";
  score: number;
  qualifiedId: string | null;
  thumbnailUrl: string | null;
  aliases: string[];
  matchReasons: string[];
}

export interface GroundingTelemetry {
  hotspot: boolean;
  explicitSelectionUsed: boolean;
  autoResolved: boolean;
  overrideRequired: boolean;
  failedAutoResolution: boolean;
  namespaceConflict: boolean;
  suggestionCount: number;
  lens: string;
  topologyUsed: boolean;
  candidatePoolSize: number;
  rejectedCrossLensCandidates: number;
  exactTitleHit?: boolean;
  preNormalizedScore?: number;
  postNormalizedScore?: number;
  tokenCoverageRatio?: number;
  rejectedByForbiddenPrefix?: boolean;
}

export interface GroundingPolicy {
  suggestionVisibility: "minimal" | "soft" | "expanded";
  tightenNamespace: boolean;
  narrowRetrieval: boolean;
  arbitrationThresholdBias: number;
  retrievalBreadth: number;
}

export interface CanonicalGroundingResult {
  originalQuery: string;
  normalizedQuery: string;
  selectedCanonicalEntity: string | null;
  selectedSelectionValue: string | null;
  selectedFranchise: string | null;
  ambiguityLevel: AmbiguityLevel;
  behavior: GroundingBehavior;
  confidence: number;
  suggestions: CanonicalSuggestion[];
  telemetry: GroundingTelemetry;
  policy: GroundingPolicy;
  temporaryEntities?: TemporaryCanonicalEntity[];
  providerMetadata?: ProviderMetadata | null;
}

type ExactCandidateKind = "canonical" | "display" | "alias";

type StrictAliasCandidate = {
  value: string;
  origin: AliasOrigin;
};


// SUPPLEMENTAL_ENTRIES removed to eliminate hardcoded autocomplete bleed.

const HIGH_AMBIGUITY_TOKENS = new Set([
  "seven",
  "spawn",
  "halo",
  "avatar",
  "doom",
  "loki",
  "joker",
  "bleach",
  "link",
]);

const MEDIUM_AMBIGUITY_TOKENS = new Set([
  "flash",
  "batman",
  "spider-man",
  "spiderman",
  "witcher",
  "the witcher",
  "sonic",
  "venom",
]);

const LENS_SUPPRESSION: Record<MediaLens, MediaLens[]> = {
  movies: ["anime", "games", "comics"],
  tv: ["anime", "games", "comics"],
  anime: ["movies", "tv"],
  games: ["movies", "tv", "comics"],
  comics: ["movies", "tv", "games"],
};

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function deriveNamespaceLabel(value: string | null, mediaLens: MediaLens): string {
  if (!value) return mediaLens[0].toUpperCase() + mediaLens.slice(1);
  const prefix = value.split("::")[0] ?? value;
  return prefix.replace(/[-_]/g, " ");
}

function lensLabel(lens: MediaLens): string {
  if (lens === "movies") return "Film";
  if (lens === "tv") return "TV";
  if (lens === "anime") return "Anime";
  if (lens === "games") return "Games";
  return "Comics";
}

function continuityDisplay(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/\bTimeline\b/gi, "")
    .replace(/\bReboot\b/gi, "")
    .replace(/\bGames\b/gi, "Games")
    .replace(/\bPrime Comic\b/gi, "Main Canon")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDisplayTitle(value: string, qualifiedId: string | null, continuityLabel: string | null): string {
  if (qualifiedId === "DC::Batman::Reeves") return "The Batman";
  if (qualifiedId === "DC::Batman::Arkham") return "Batman: Arkham";
  if (qualifiedId?.includes("Batman::Beyond")) return "Batman Beyond";
  if (qualifiedId === "DC::Flash") return "The Flash";
  if (qualifiedId?.includes("Spider-Man::MCU")) return "Spider-Man";
  if (qualifiedId?.includes("Spider-Man::Marvel Comics")) return "Spider-Man";
  if (qualifiedId?.includes("Flash::Arrowverse")) return "The Flash";
  if (value === "Reeves" && continuityLabel) return `Batman (${continuityDisplay(continuityLabel)})`;
  if (value === "Arkham") return "Batman: Arkham";
  if (value === "MCU") return "Spider-Man";
  return value;
}

function formatMetadataLabel(
  franchise: string | null,
  continuityLabel: string | null,
  mediaLabel: string,
  namespaceLabel: string,
  displayTitle?: string
): string {
  if (mediaLabel === "Games") {
    const title = (displayTitle ?? "").toLowerCase();
    
    // Exact mapping matches for the 15 priority gaming franchises
    if (title.includes("arkham knight")) return "ARKHAM KNIGHT · ARKHAM TIMELINE";
    if (title.includes("arkham city")) return "ARKHAM · ARKHAM TIMELINE";
    if (title.includes("arkham origins")) return "ARKHAM · ARKHAM TIMELINE";
    if (title.includes("arkham")) return "ARKHAM · ARKHAM TIMELINE";
    
    if (title.includes("halo 3")) return "HALO 3 · RECLAIMER SAGA";
    if (title.includes("reach")) return "HALO REACH · FALL OF REACH";
    if (title.includes("infinite")) return "HALO INFINITE · FORERUNNER CONTINUITY";
    if (title.includes("halo")) return "HALO · GAME CANON";
    
    if (title.includes("mass effect 2")) return "MASS EFFECT 2 · SHEPARD ARC";
    if (title.includes("mass effect 3")) return "MASS EFFECT 3 · SHEPARD ARC";
    if (title.includes("mass effect") && !title.includes("andromeda")) return "MASS EFFECT · SHEPARD ARC";
    if (title.includes("andromeda")) return "MASS EFFECT · ANDROMEDA INITIATIVE";
    
    if (title.includes("elden ring")) return "ELDEN RING · MAIN WORLD";
    
    if (title.includes("red dead redemption 2") || title.includes("rdr2")) return "RDR2 · VAN DER LINDE ERA";
    if (title.includes("red dead redemption") || title.includes("rdr1")) return "RED DEAD REDEMPTION · MARSTON ERA";
    
    if (title.includes("persona 5") || title.includes("p5")) return "PERSONA 5 · PHANTOM THIEVES";
    
    if (title.includes("grand theft auto v") || title.includes("gta v") || title.includes("gta 5")) return "GTA V · HD UNIVERSE";
    if (title.includes("carl johnson") || title.includes("cj")) return "CJ · 3D UNIVERSE";
    if (title.includes("grand theft auto") || title.includes("gta")) return "GTA · GAME CANON";
    
    if (title.includes("last of us part i") || title.includes("last of us part 1")) return "THE LAST OF US · PART I";
    if (title.includes("last of us part ii") || title.includes("last of us part 2")) return "THE LAST OF US · PART II";
    if (title.includes("last of us")) return "THE LAST OF US · MAIN CANON";
    
    if (title.includes("god of war (2018)") || title.includes("ragnarok") || title.includes("god of war 4")) return "GOD OF WAR · NORSE ERA";
    if (title.includes("god of war iii") || title.includes("god of war 3")) return "GOD OF WAR · GREEK ERA";
    if (title.includes("god of war")) return "GOD OF WAR · MAIN CANON";
    
    if (title.includes("final fantasy vii remake")) return "FINAL FANTASY VII · REMAKE CONTINUITY";
    if (title.includes("final fantasy vii") || title.includes("ff7")) return "FINAL FANTASY VII · COMPILATION TIMELINE";
    if (title.includes("final fantasy") || title.includes("ff")) return "FINAL FANTASY · GAME CANON";
    
    if (title.includes("metal gear solid 3") || title.includes("snake eater")) return "METAL GEAR · BIG BOSS SAGA";
    if (title.includes("metal gear solid") || title.includes("solid snake")) return "METAL GEAR · SOLID SNAKE SAGA";
    if (title.includes("metal gear")) return "METAL GEAR · MAIN TIMELINE";
    
    if (title.includes("resident evil 4") || title.includes("re4")) return "RESIDENT EVIL 4 · SURVIVAL ARC";
    if (title.includes("resident evil village") || title.includes("re8") || title.includes("village")) return "RESIDENT EVIL · WINTERS SAGA";
    if (title.includes("resident evil") || title.includes("biohazard")) return "RESIDENT EVIL · SURVIVAL ARC";
    
    if (title.includes("witcher 3") || title.includes("wild hunt")) return "THE WITCHER 3 · GERALT SAGA";
    if (title.includes("witcher")) return "THE WITCHER · CDPR TIMELINE";
    
    if (title.includes("cyberpunk")) return "CYBERPUNK · NIGHT CITY ERA";
    
    if (title.includes("assassin's creed ii") || title.includes("assassin's creed 2")) return "ASSASSIN'S CREED II · EZIO TRILOGY";
    if (title.includes("valhalla")) return "ASSASSIN'S CREED · LAYLA HASSAN ARC";
    if (title.includes("assassin")) return "ASSASSIN'S CREED · CANON TIMELINE";

    if (title.includes("mortal kombat")) return "MORTAL KOMBAT · NETHERREALM ERA";
    
    // General high-fidelity fallback for games
    const cleanPrimary = (franchise ?? namespaceLabel ?? "").toUpperCase();
    const cleanContinuity = continuityLabel ? continuityDisplay(continuityLabel).toUpperCase() : "";
    
    if (cleanPrimary === "GAMES" || !cleanPrimary) {
      if (displayTitle) {
        return `${displayTitle.toUpperCase()} · GAME CANON`;
      }
      return "GAME CANON";
    }
    
    if (cleanContinuity && cleanContinuity !== cleanPrimary) {
      return `${cleanPrimary} · ${cleanContinuity}`;
    }
    
    if (displayTitle && displayTitle.toUpperCase() !== cleanPrimary) {
      return `${cleanPrimary} · ${displayTitle.toUpperCase()}`;
    }
    
    return `${cleanPrimary} · GAME CANON`;
  }

  const primary = franchise ?? namespaceLabel;
  const continuity = continuityDisplay(continuityLabel);
  const secondary = continuity && normalize(continuity) !== normalize(primary) ? continuity : mediaLabel;
  if (normalize(primary) === normalize(secondary)) {
    return primary;
  }
  return `${primary} · ${secondary}`;
}

function sanitizeNamespaceLabel(
  namespaceLabel: string,
  franchise: string | null,
  continuityLabel: string | null,
  mediaLabel: string
): string {
  if (normalize(namespaceLabel) !== normalize(mediaLabel)) {
    return namespaceLabel;
  }
  const continuity = continuityDisplay(continuityLabel);
  if (continuity) {
    return continuity;
  }
  if (franchise) {
    return franchise;
  }
  return namespaceLabel;
}

const GENERIC_ALIAS_BLACKLIST = new Set([
  "dark",
  "monster",
  "hero",
  "knight",
  "anime",
  "movie",
  "tv",
  "animated"
]);

function filterAliases(aliases: (string | null | undefined)[]): string[] {
  const filtered: string[] = [];
  for (const alias of aliases) {
    if (!alias) continue;
    const lower = alias.trim().toLowerCase();
    if (GENERIC_ALIAS_BLACKLIST.has(lower)) {
      debugWarn("[GENERIC_ALIAS_REJECTED]", alias);
      continue;
    }
    filtered.push(alias);
  }
  return filtered;
}

function dedupeAliasDescriptors(descriptors: AliasDescriptor[]): AliasDescriptor[] {
  const seen = new Set<string>();
  const result: AliasDescriptor[] = [];

  for (const descriptor of descriptors) {
    const norm = normalize(descriptor.value);
    if (!norm || seen.has(`${norm}::${descriptor.origin}`)) continue;
    seen.add(`${norm}::${descriptor.origin}`);
    result.push(descriptor);
    debugLog("[ALIAS_PROVENANCE]", descriptor.origin, descriptor.value);
  }

  return result;
}

function strictAliasCandidatesForEntry(entry: CatalogEntry): StrictAliasCandidate[] {
  const strict: StrictAliasCandidate[] = [];
  const seen = new Set<string>();
  const provenance = entry.aliasProvenance ?? [];

  for (const alias of provenance) {
    const norm = normalize(alias.value);
    if (!norm) continue;

    if (alias.origin === "franchise") {
      debugLog("[FRANCHISE_ALIAS_BLOCKED]", entry.canonicalEntity, alias.value);
      continue;
    }

    if (alias.origin === "inherited") {
      debugLog("[INHERITED_ALIAS_BLOCKED]", entry.canonicalEntity, alias.value);
      continue;
    }

    if (seen.has(norm)) continue;
    seen.add(norm);
    strict.push({ value: alias.value, origin: alias.origin });
    debugLog("[STRICT_ALIAS_ACCEPTED]", entry.canonicalEntity, alias.value, alias.origin);
  }

  return strict;
}

function sourceAuthority(entry: CatalogEntry): number {
  if (entry.source === "topology") return 40;
  if (entry.source === "continuity") return 28;
  if (entry.source === "registry") return 16;
  return 8;
}

function exactCandidateScore(entry: CatalogEntry, kind: ExactCandidateKind, origin: AliasOrigin = "direct"): number {
  let score = sourceAuthority(entry);
  if (kind === "canonical") score += 300;
  else if (kind === "display") score += 240;
  else if (origin === "direct") score += 180;
  else if (origin === "semantic") score += 120;
  else if (origin === "inherited") score += 40;
  else if (origin === "franchise") score += 0;
  return score;
}

function registerExactKey(
  map: Map<string, CatalogEntry>,
  scoreMap: Map<string, number>,
  key: string,
  entry: CatalogEntry,
  kind: ExactCandidateKind,
  origin: AliasOrigin = "direct"
) {
  const existing = map.get(key);
  const incomingScore = exactCandidateScore(entry, kind, origin);
  if (!existing) {
    map.set(key, entry);
    scoreMap.set(key, incomingScore);
    return;
  }

  const existingScore = scoreMap.get(key) ?? 0;
  debugWarn("[EXACT_ALIAS_COLLISION]", key, existing.canonicalEntity, entry.canonicalEntity);

  if (incomingScore > existingScore) {
    map.set(key, entry);
    scoreMap.set(key, incomingScore);
  }
}

function buildCatalogByLens(): Record<MediaLens, CatalogEntry[]> {
  const catalogs: Record<MediaLens, Map<string, CatalogEntry>> = {
    movies: new Map(),
    anime: new Map(),
    games: new Map(),
    comics: new Map(),
    tv: new Map()
  };

  for (const node of listModularTopologies()) {
    const mediaLenses = (node.mediaDomains.filter(Boolean) as MediaLens[]) || ["movies"];
    const mediaLabel = lensLabel((mediaLenses[0] as MediaLens) ?? "movies");
    const displayTitle = formatDisplayTitle(node.canonicalEntity, node.id, node.continuity ?? null);
    const namespaceLabel = sanitizeNamespaceLabel(
      deriveNamespaceLabel(node.id, (node.mediaDomains[0] as MediaLens) ?? "movies"),
      node.parentFranchise ?? null,
      node.continuity ?? null,
      mediaLabel
    );
    const key = `topology:${node.id}`;
    if (node.parentFranchise) {
      debugLog("[FRANCHISE_ALIAS_BLOCKED]", node.canonicalEntity, node.parentFranchise);
    }
    const aliasProvenance = dedupeAliasDescriptors([
      ...(node.aliasProvenance ?? []),
      { value: node.canonicalEntity, origin: "direct" },
    ]);
    const entry: CatalogEntry = {
      canonicalEntity: node.canonicalEntity,
      selectionValue: node.id,
      displayTitle,
      franchise: node.parentFranchise ?? null,
      mediaLenses,
      mediaLabel,
      namespaceLabel,
      continuityLabel: node.continuity ?? null,
      continuityType: node.continuityType ?? null,
      metadataLabel: formatMetadataLabel(node.parentFranchise ?? null, node.continuity ?? null, mediaLabel, namespaceLabel, displayTitle),
      universe: node.universe ?? null,
      qualifiedId: node.id,
      aliases: filterAliases(aliasProvenance.map((alias) => alias.value)),
      directAliases: node.directAliases ?? [],
      inheritedAliases: node.inheritedAliases ?? [],
      aliasProvenance,
      source: "topology",
      thumbnailUrl: null,
    };
    for (const lens of mediaLenses) catalogs[lens as MediaLens]?.set(key, entry);
  }

  for (const node of TOPOLOGY_REGISTRY) {
    const mediaLenses = (node.mediaDomains?.filter(Boolean) as MediaLens[]) || ["movies"];
    const mediaLabel = lensLabel((mediaLenses[0] as MediaLens) ?? "movies");
    const namespaceLabel = sanitizeNamespaceLabel(
      node.universe?.includes("Marvel")
        ? "Marvel"
        : node.universe?.includes("DC")
          ? "DC"
          : deriveNamespaceLabel(node.universe ?? null, (node.mediaDomains?.[0] as MediaLens) ?? "movies"),
      node.franchise ?? null,
      node.continuity ?? null,
      mediaLabel
    );
    const key = `continuity:${node.canonicalEntity}:${node.mediaDomains?.join(",")}`;
    const displayTitle = node.canonicalEntity.replace(/\s+\(\d{4}\)$/, "");
    if (node.franchise) {
      debugLog("[FRANCHISE_ALIAS_BLOCKED]", node.canonicalEntity, node.franchise);
    }
    const aliasProvenance = dedupeAliasDescriptors([
      { value: node.canonicalEntity, origin: "direct" },
      ...filterAliases(node.aliases ?? []).map((value) => ({ value, origin: "direct" as const })),
    ]);
    const entry: CatalogEntry = {
      canonicalEntity: node.canonicalEntity,
      selectionValue: node.canonicalEntity,
      displayTitle,
      franchise: node.franchise ?? null,
      mediaLenses,
      mediaLabel,
      namespaceLabel,
      continuityLabel: node.continuity ?? null,
      continuityType: node.continuityType ?? null,
      metadataLabel: formatMetadataLabel(node.franchise ?? null, node.continuity ?? null, mediaLabel, namespaceLabel, displayTitle),
      universe: node.universe ?? null,
      qualifiedId: null,
      aliases: filterAliases(aliasProvenance.map((alias) => alias.value)),
      aliasProvenance,
      source: "continuity",
      thumbnailUrl: null,
    };
    for (const lens of mediaLenses) catalogs[lens as MediaLens]?.set(key, entry);
  }

  for (const entry of FRANCHISE_REGISTRY) {
    const mediaLenses = (entry.mediaDomains?.filter(Boolean) as MediaLens[]) || ["movies"];
    const mediaLabel = lensLabel((mediaLenses[0] as MediaLens) ?? "movies");
    const namespaceLabel = sanitizeNamespaceLabel(
      entry.universe?.includes("Marvel")
      ? "Marvel"
      : entry.universe?.includes("DC")
        ? "DC"
        : deriveNamespaceLabel(entry.universe ?? null, (entry.mediaDomains?.[0] as MediaLens) ?? "movies"),
      entry.parentFranchise ?? null,
      null,
      mediaLabel
    );
    const key = `registry:${entry.entity}:${entry.mediaDomains?.join(",")}`;
    const displayTitle = entry.entity.replace(/\s+\(\d{4}\)$/, "");
    if (entry.parentFranchise) {
      debugLog("[FRANCHISE_ALIAS_BLOCKED]", entry.entity, entry.parentFranchise);
    }
    const aliasProvenance = dedupeAliasDescriptors([
      { value: entry.entity, origin: "direct" },
      ...filterAliases(entry.aliases ?? []).map((value) => ({ value, origin: "direct" as const })),
      ...filterAliases(entry.relatedEntities ?? []).map((value) => ({ value, origin: "semantic" as const })),
    ]);
    const catalogEntry: CatalogEntry = {
      canonicalEntity: entry.entity,
      selectionValue: entry.entity,
      displayTitle,
      franchise: entry.parentFranchise ?? null,
      mediaLenses,
      mediaLabel,
      namespaceLabel,
      continuityLabel: null,
      continuityType: null,
      metadataLabel: formatMetadataLabel(entry.parentFranchise ?? null, null, mediaLabel, namespaceLabel, displayTitle),
      universe: entry.universe ?? null,
      qualifiedId: null,
      aliases: filterAliases(aliasProvenance.map((alias) => alias.value)),
      aliasProvenance,
      source: "registry",
      thumbnailUrl: null,
    };
    for (const lens of mediaLenses) catalogs[lens as MediaLens]?.set(key, catalogEntry);
  }

// Supplemental processing removed to prevent bleed.

  return {
    movies: Array.from(catalogs.movies.values()),
    anime: Array.from(catalogs.anime.values()),
    games: Array.from(catalogs.games.values()),
    comics: Array.from(catalogs.comics.values()),
    tv: Array.from(catalogs.tv.values())
  };
}

let _CATALOG_BY_LENS: Record<MediaLens, CatalogEntry[]> | null = null;
function getCatalogByLens() {
  if (!_CATALOG_BY_LENS) _CATALOG_BY_LENS = buildCatalogByLens();
  return _CATALOG_BY_LENS;
}

let _PREFIX_INDEX_BY_LENS: Record<MediaLens, Map<string, CatalogEntry[]>> | null = null;
function getPrefixIndexByLens() {
  if (!_PREFIX_INDEX_BY_LENS) {
    const catalog = getCatalogByLens();
    _PREFIX_INDEX_BY_LENS = {
      movies: buildPrefixIndex(catalog.movies),
      anime: buildPrefixIndex(catalog.anime),
      games: buildPrefixIndex(catalog.games),
      comics: buildPrefixIndex(catalog.comics),
      tv: buildPrefixIndex(catalog.tv),
    };
  }
  return _PREFIX_INDEX_BY_LENS;
}

function safeNormalize(value: string): string {
  let norm = value.toLowerCase().trim();
  // Strip punctuation
  norm = norm.replace(/[^a-z0-9\s]+/g, " ");
  // Compress multiple spaces
  norm = norm.replace(/\s+/g, " ").trim();
  
  // Article normalization (lookup-only): strip leading articles
  const words = norm.split(" ");
  if (words.length > 1 && ["the", "a", "an"].includes(words[0])) {
    return words.slice(1).join(" ");
  }
  return norm;
}

const EXACT_LOOKUP_BY_LENS: Record<MediaLens, Map<string, CatalogEntry>> = {
  movies: new Map(),
  tv: new Map(),
  anime: new Map(),
  games: new Map(),
  comics: new Map(),
};

const EXACT_LOOKUP_SCORE_BY_LENS: Record<MediaLens, Map<string, number>> = {
  movies: new Map(),
  tv: new Map(),
  anime: new Map(),
  games: new Map(),
  comics: new Map(),
};

let exactLookupBuilt = false;
function ensureExactLookupBuilt() {
  if (exactLookupBuilt) return;
  const catalog = getCatalogByLens();
  for (const lens of Object.keys(catalog) as MediaLens[]) {
    const map = EXACT_LOOKUP_BY_LENS[lens];
    const scoreMap = EXACT_LOOKUP_SCORE_BY_LENS[lens];
    const entries = catalog[lens] || [];
    for (const entry of entries) {
      const strictAliases = strictAliasCandidatesForEntry(entry);
      const exactCandidates: Array<{ value: string; kind: ExactCandidateKind; origin: AliasOrigin }> = [
        { value: entry.canonicalEntity, kind: "canonical", origin: "direct" },
        { value: entry.displayTitle, kind: "display", origin: "direct" },
        ...strictAliases.map((alias) => ({ value: alias.value, kind: "alias" as const, origin: alias.origin })),
      ];

      for (const candidate of exactCandidates) {
        if (!candidate.value) continue;
        const keys = new Set<string>();
        const norm = normalize(candidate.value);
        if (norm) keys.add(norm);
        const sNorm = safeNormalize(candidate.value);
        if (sNorm) keys.add(sNorm);

        for (const k of keys) {
          registerExactKey(map, scoreMap, k, entry, candidate.kind, candidate.origin);
        }
      }
    }
  }
  exactLookupBuilt = true;
}

function buildPrefixIndex(catalog: CatalogEntry[]): Map<string, CatalogEntry[]> {
  const index = new Map<string, CatalogEntry[]>();

  for (const entry of catalog) {
    const strictAliases = strictAliasCandidatesForEntry(entry).map((alias) => alias.value);
    const terms = new Set<string>([
      normalize(entry.displayTitle),
      normalize(entry.canonicalEntity),
      ...strictAliases.map(normalize),
    ]);

    for (const term of terms) {
      if (!term) continue;
      const maxPrefix = Math.min(term.length, 8);
      for (let size = 1; size <= maxPrefix; size++) {
        const prefix = term.slice(0, size);
        const bucket = index.get(prefix) ?? [];
        bucket.push(entry);
        index.set(prefix, bucket);
      }
    }
  }

  return index;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (a.length > b.length) {
      i++;
    } else if (b.length > a.length) {
      j++;
    } else {
      i++;
      j++;
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

const FORBIDDEN_PREFIXES = new Set([
  "the",
  "a",
  "an",
  "best",
  "top",
  "history",
  "about",
  "movie",
  "movies",
  "show",
  "shows",
  "anime",
  "game",
  "games",
  "comic",
  "comics",
  "tv",
  "john",
  "bat",
  "super",
  "attack",
  "death",
  "flash",
  "joker"
]);

function lexicalScore(query: string, entry: CatalogEntry): {
  score: number;
  reasons: string[];
  preNormalizedScore: number;
  postNormalizedScore: number;
  tokenCoverageRatio: number;
} {
  const reasons: string[] = [];
  let score = 0;
  const aliases = entry.aliases.map(normalize);
  const aliasOrigins = new Map<string, AliasOrigin>(
    (entry.aliasProvenance ?? []).map((alias) => [normalize(alias.value), alias.origin])
  );
  const canonical = normalize(entry.canonicalEntity);
  const queryTokens = tokenize(query);

  let meaningfulQueryTokens = queryTokens.filter(t => !["the", "a", "an", "of", "in", "at", "and", "on"].includes(t));
  if (meaningfulQueryTokens.length === 0) meaningfulQueryTokens = queryTokens;

  const entryTokens = new Set([
      ...tokenize(canonical),
      ...aliases.flatMap(tokenize)
  ]);

  let overlapCount = 0;
  for (const token of meaningfulQueryTokens) {
      if (entryTokens.has(token)) {
          overlapCount++;
      } else {
          if (Array.from(entryTokens).some(et => et.includes(token))) overlapCount++;
      }
  }

  const coverage = overlapCount / meaningfulQueryTokens.length;
  if (overlapCount < meaningfulQueryTokens.length && coverage < 0.7) {
      return { score: 0, reasons: ["failed-token-coverage"], preNormalizedScore: 0, postNormalizedScore: 0, tokenCoverageRatio: coverage };
  }

  if (canonical === query) {
    score += 90;
    reasons.push("canonical-exact");
  }
  if (canonical.startsWith(query) && canonical !== query) {
    const isSingleTokenCanonicalPrefix =
      queryTokens.length === 1 &&
      canonical.split(/\s+/).filter(Boolean).length > 1;
    if (isSingleTokenCanonicalPrefix) {
      debugWarn("[SINGLE_TOKEN_PREFIX_REJECTED]", query, canonical);
    } else {
      score += 40;
      reasons.push("canonical-prefix");
    }
  }

  for (const alias of aliases) {
    const aliasOrigin = aliasOrigins.get(alias) ?? "direct";
    if (alias === query) {
      let aliasScore = 80;
      const isInherited = aliasOrigin === "inherited";
      if (isInherited) {
        aliasScore = Math.round(aliasScore * 0.5);
        reasons.push("inherited-alias-penalty");
        debugLog("[INHERITED_ALIAS_PENALIZED]", query, alias);
      }

      score += aliasScore;
      reasons.push("alias-exact");
      break;
    }

    const isSingleToken = queryTokens.length === 1;
    const isMultiWordAlias = alias.split(/\s+/).filter(Boolean).length > 1;

    if (alias.startsWith(query)) {
      if (isSingleToken && isMultiWordAlias) {
        debugWarn("[SINGLE_TOKEN_PREFIX_REJECTED]", query, alias);
        continue;
      }

      let aliasScore = 30;
      const isInherited = aliasOrigin === "inherited";
      if (isInherited) {
        aliasScore = Math.round(aliasScore * 0.5);
        reasons.push("inherited-alias-penalty");
        debugLog("[INHERITED_ALIAS_PENALIZED]", query, alias);
      }

      score += aliasScore;
      reasons.push("prefix");
      break;
    }
    if (alias.includes(query)) {
      if (isSingleToken && isMultiWordAlias) {
        debugWarn("[SINGLE_TOKEN_PREFIX_REJECTED]", query, alias);
        continue;
      }

      let aliasScore = 26;
      const isInherited = aliasOrigin === "inherited";
      if (isInherited) {
        aliasScore = Math.round(aliasScore * 0.5);
        reasons.push("inherited-alias-penalty");
        debugLog("[INHERITED_ALIAS_PENALIZED]", query, alias);
      }

      score += aliasScore;
      reasons.push("substring");
      break;
    }
  }

  for (const token of queryTokens) {
    if (canonical.includes(token)) {
      score += 8;
    }
  }

  const queryStem = query.slice(0, Math.min(5, query.length));
  const aliasStemHit =
    queryStem.length >= 5 &&
    !queryStem.includes(" ") &&
    aliases.some(
      (alias) => {
        const isSingleTokenNearPrefixBlocked =
          queryTokens.length === 1 &&
          alias.split(/\s+/).filter(Boolean).length > 1;
        if (isSingleTokenNearPrefixBlocked) {
          return false;
        }

        return (
          alias.length >= 5 &&
          alias.startsWith(queryStem[0]) &&
          editDistanceAtMostOne(queryStem, alias.slice(0, queryStem.length))
        );
      }
    );
  if (aliasStemHit) {
    score += 16;
    reasons.push("near-prefix");
  }

  const preNormalizedScore = score;
  const isExactMatch = canonical === query || aliases.some(a => a === query);
  const semanticDensity = isExactMatch ? 1 : (1 + (entry.aliases.length * 0.12) + (entry.franchise ? 0.1 : 0));
  const finalScore = Math.round(score / semanticDensity);

  return { score: finalScore, reasons, preNormalizedScore, postNormalizedScore: finalScore, tokenCoverageRatio: coverage };
}


function authorityScore(entry: CatalogEntry): number {
  if (entry.source === "topology") return 32;
  if (entry.source === "continuity") return 26;
  if (entry.source === "registry") return 20;
  return 12;
}

function rawCandidateEntriesForQuery(query: string, activeLens: MediaLens): CatalogEntry[] {
  const index = getPrefixIndexByLens()[activeLens];
  if (!query) return getCatalogByLens()[activeLens] || [];
  
  const maxLength = Math.min(query.length, 8);
  for (let len = maxLength; len >= 3; len--) {
    const prefix = query.slice(0, len);
    const indexed = index.get(prefix);
    if (indexed && indexed.length > 0) {
      if (query.length > len && FORBIDDEN_PREFIXES.has(prefix.trim())) {
        return [];
      }
      return indexed;
    }
  }
  if (query.length < 3) {
    const head = index.get(query.slice(0, 1));
    return head || [];
  }
  return [];
}

function franchiseScore(query: string, entry: CatalogEntry): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const normQuery = normalize(query);
  const tokens = tokenize(normQuery);
  const franchise = normalize(entry.franchise ?? "");

  if (franchise && tokens.some((token) => franchise.includes(token))) {
    score += 10;
    reasons.push("franchise-signal");
  }
  if (entry.continuityLabel && normQuery.includes(normalize(entry.continuityLabel))) {
    score += 8;
    reasons.push("continuity-signal");
  }
  return { score, reasons };
}

function toSuggestion(entry: CatalogEntry, activeLens: MediaLens, score: number, reasons: string[]): CanonicalSuggestion {
  const chosenLens = entry.mediaLenses.includes(activeLens) ? activeLens : (entry.mediaLenses[0] ?? "movies");
  const chosenMediaLabel = lensLabel(chosenLens);
  return {
    canonicalEntity: entry.canonicalEntity,
    selectionValue: entry.selectionValue,
    displayTitle: entry.displayTitle,
    franchise: entry.franchise,
    mediaLens: chosenLens,
    mediaLabel: chosenMediaLabel,
    namespaceLabel: entry.namespaceLabel,
    continuityLabel: entry.continuityLabel,
    metadataLabel: formatMetadataLabel(entry.franchise, entry.continuityLabel, chosenMediaLabel, entry.namespaceLabel, entry.displayTitle),
    universe: entry.universe,
    source: entry.source,
    score,
    qualifiedId: entry.qualifiedId,
    thumbnailUrl: entry.thumbnailUrl,
    aliases: entry.aliases,
    matchReasons: reasons,
  };
}

function dedupeSuggestions(suggestions: CanonicalSuggestion[], activeLens: MediaLens): CanonicalSuggestion[] {
  const byKey = new Map<string, CanonicalSuggestion>();
  for (const suggestion of suggestions) {
    const key = `${normalize(suggestion.selectionValue)}::${suggestion.mediaLens}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      existing.score < suggestion.score ||
      (existing.score === suggestion.score &&
        `${suggestion.displayTitle}|${suggestion.metadataLabel}`.localeCompare(
          `${existing.displayTitle}|${existing.metadataLabel}`
        ) < 0)
    ) {
      byKey.set(key, suggestion);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    // 1. Score
    if (b.score !== a.score) return b.score - a.score;

    // 2. Lens affinity (prioritize active lens matches)
    const aLensMatch = a.mediaLens === activeLens ? 1 : 0;
    const bLensMatch = b.mediaLens === activeLens ? 1 : 0;
    if (bLensMatch !== aLensMatch) return bLensMatch - aLensMatch;

    // 3. Continuity relevance (prefer entries with continuity/timeline over generic ones)
    const aHasContinuity = a.continuityLabel ? 1 : 0;
    const bHasContinuity = b.continuityLabel ? 1 : 0;
    if (bHasContinuity !== aHasContinuity) return bHasContinuity - aHasContinuity;

    // 4. Canonical importance (source priority: topology > continuity > registry > supplemental)
    const sourceOrder = { topology: 4, continuity: 3, registry: 2, supplemental: 1 };
    const aSourceWeight = sourceOrder[a.source] ?? 0;
    const bSourceWeight = sourceOrder[b.source] ?? 0;
    if (bSourceWeight !== aSourceWeight) return bSourceWeight - aSourceWeight;

    // 5. Franchise grounding (prefer defined parent franchise)
    const aHasFranchise = a.franchise ? 1 : 0;
    const bHasFranchise = b.franchise ? 1 : 0;
    if (bHasFranchise !== aHasFranchise) return bHasFranchise - aHasFranchise;

    // 6. Stable alphabetical fallback
    if (a.displayTitle !== b.displayTitle) {
      return a.displayTitle.localeCompare(b.displayTitle);
    }
    return a.selectionValue.localeCompare(b.selectionValue);
  });
}

function buildPolicy(level: AmbiguityLevel, confidence: number): GroundingPolicy {
  if (level === "high") {
    return {
      suggestionVisibility: "expanded",
      tightenNamespace: true,
      narrowRetrieval: true,
      arbitrationThresholdBias: 0.08,
      retrievalBreadth: 3,
    };
  }
  if (level === "medium" || confidence < 0.7) {
    return {
      suggestionVisibility: "soft",
      tightenNamespace: true,
      narrowRetrieval: true,
      arbitrationThresholdBias: 0.04,
      retrievalBreadth: 5,
    };
  }
  return {
    suggestionVisibility: "minimal",
    tightenNamespace: false,
    narrowRetrieval: false,
    arbitrationThresholdBias: 0,
    retrievalBreadth: 8,
  };
}

export function groundCanonicalIntent(input: {
  query: string;
  mediaLens: MediaLens;
  explicitSelection?: string | null;
  temporaryEntities?: TemporaryCanonicalEntity[];
  providerMetadata?: ProviderMetadata;
  allowLooseSemantic?: boolean;
}): CanonicalGroundingResult {
  const originalQuery = input.query.trim();
  const normalizedQuery = normalize(originalQuery);
  const explicitSelection = input.explicitSelection?.trim() ?? "";

  const isDeterministicId = explicitSelection && (
    explicitSelection.startsWith("tmdb::") ||
    explicitSelection.startsWith("rawg::") ||
    explicitSelection.startsWith("igdb::") ||
    explicitSelection.startsWith("comicvine::") ||
    explicitSelection.startsWith("googlebooks::") ||
    explicitSelection.startsWith("jikan::")
  );

  if (isDeterministicId) {
    const tempMatch = input.temporaryEntities?.find(t => t.id === explicitSelection);
    let resolvedMetadata = tempMatch 
      ? {
          provider: tempMatch.source,
          id: tempMatch.id.split("::")[2],
          confidence: 0.99,
          canonicalTitle: tempMatch.title,
          franchiseRoot: tempMatch.metadata?.franchiseRoot,
          releaseYear: tempMatch.metadata?.releaseYear,
          providerType: tempMatch.metadata?.providerType ?? inferProviderTypeFromId(tempMatch.id),
          providerResourceType: tempMatch.metadata?.providerResourceType ?? tempMatch.id.split("::")[1] ?? null,
          publisherLabel: tempMatch.metadata?.publisherLabel ?? null,
        }
      : input.providerMetadata;

    if (!resolvedMetadata) {
      const parts = explicitSelection.split("::");
      const parsedProvider = parts[0];
      const parsedId = parts[2];
      
      resolvedMetadata = {
        provider: parsedProvider,
        id: parsedId,
        confidence: 0.99,
        canonicalTitle: originalQuery || explicitSelection,
        franchiseRoot: null,
        releaseYear: null,
        providerType: inferProviderTypeFromId(explicitSelection),
        providerResourceType: parts[1] ?? null,
      };
      
      debugLog("[DETERMINISTIC_SELF_HEAL] Reconstructed missing providerMetadata from ID:", explicitSelection, resolvedMetadata);
    }

    const confidence = (resolvedMetadata && typeof resolvedMetadata.confidence === "number")
      ? resolvedMetadata.confidence
      : 0.99;

    if (resolvedMetadata?.providerType) {
      debugLog("[TYPED_GROUNDING_LOCK]", {
        query: originalQuery,
        selectionValue: explicitSelection,
        providerType: resolvedMetadata.providerType,
        providerResourceType: resolvedMetadata.providerResourceType ?? null,
      });
    }

    const suggestion = toSuggestion({
      canonicalEntity: tempMatch?.title ?? originalQuery,
      selectionValue: explicitSelection,
      displayTitle: tempMatch?.title ?? originalQuery,
      franchise: resolvedMetadata?.franchiseRoot ?? null,
      mediaLenses: [input.mediaLens],
      mediaLabel: lensLabel(input.mediaLens),
      namespaceLabel: "DETERMINISTIC",
      continuityLabel: resolvedMetadata?.releaseYear ? String(resolvedMetadata.releaseYear) : null,
      continuityType: null,
      metadataLabel: tempMatch?.title ?? originalQuery,
      universe: null,
      qualifiedId: explicitSelection,
      aliases: [tempMatch?.title ?? originalQuery],
      source: "registry",
      thumbnailUrl: null,
    }, input.mediaLens, 140, ["deterministic-id-bypass"]);

    return {
      originalQuery,
      normalizedQuery,
      selectedCanonicalEntity: tempMatch?.title ?? originalQuery,
      selectedSelectionValue: explicitSelection,
      selectedFranchise: resolvedMetadata?.franchiseRoot ?? null,
      ambiguityLevel: "low",
      behavior: "auto_resolve",
      confidence: confidence,
      suggestions: [suggestion],
      telemetry: {
        hotspot: false,
        explicitSelectionUsed: true,
        autoResolved: true,
        overrideRequired: false,
        failedAutoResolution: false,
        namespaceConflict: false,
        suggestionCount: 1,
        lens: input.mediaLens,
        topologyUsed: false,
        candidatePoolSize: 1,
        rejectedCrossLensCandidates: 0,
        exactTitleHit: true,
        preNormalizedScore: 140,
        postNormalizedScore: 140,
        tokenCoverageRatio: 1.0,
      },
      policy: buildPolicy("low", confidence),
      temporaryEntities: input.temporaryEntities,
      providerMetadata: resolvedMetadata
    };
  }

  const allowLoose = input.allowLooseSemantic !== false;
  if (!allowLoose) {
    debugLog("[STRICT_LOCAL_PASS]", {
      query: originalQuery,
      mediaLens: input.mediaLens,
      explicitSelection: explicitSelection || null
    });
  }

  if (!normalizedQuery && !explicitSelection) {
    return {
      originalQuery,
      normalizedQuery,
      selectedCanonicalEntity: null,
      selectedSelectionValue: null,
      selectedFranchise: null,
      ambiguityLevel: "high",
      behavior: "require_selection",
      confidence: 0,
      suggestions: [],
      telemetry: {
        hotspot: false,
        explicitSelectionUsed: false,
        autoResolved: false,
        overrideRequired: false,
        failedAutoResolution: false,
        namespaceConflict: false,
        suggestionCount: 0,
        lens: input.mediaLens,
        topologyUsed: false,
        candidatePoolSize: 0,
        rejectedCrossLensCandidates: 0,
      },
      policy: buildPolicy("high", 0),
      temporaryEntities: input.temporaryEntities,
    };
  }

  // --- Exact Match Bypass Gate ---
  // MUST execute before anti-poison / forbidden prefix checks, and MUST remain strictly lens-fenced.
  ensureExactLookupBuilt();
  const candidateText = explicitSelection || originalQuery;
  const lookupKey1 = normalize(candidateText);
  const lookupKey2 = safeNormalize(candidateText);
  
  const lensExactMap = EXACT_LOOKUP_BY_LENS[input.mediaLens];
  const exactMatchEntry = lensExactMap?.get(lookupKey1) || lensExactMap?.get(lookupKey2);

  if (exactMatchEntry) {
    const suggestion = toSuggestion(exactMatchEntry, input.mediaLens, 140, ["exact-title-bypass"]);
    return {
      originalQuery,
      normalizedQuery,
      selectedCanonicalEntity: exactMatchEntry.canonicalEntity,
      selectedSelectionValue: exactMatchEntry.selectionValue,
      selectedFranchise: exactMatchEntry.franchise,
      ambiguityLevel: "low",
      behavior: "auto_resolve",
      confidence: 0.99,
      suggestions: [suggestion],
      telemetry: {
        hotspot: false,
        explicitSelectionUsed: Boolean(explicitSelection),
        autoResolved: true,
        overrideRequired: false,
        failedAutoResolution: false,
        namespaceConflict: false,
        suggestionCount: 1,
        lens: input.mediaLens,
        topologyUsed: exactMatchEntry.source === "topology",
        candidatePoolSize: 1,
        rejectedCrossLensCandidates: 0,
        exactTitleHit: true,
        preNormalizedScore: 140,
        postNormalizedScore: 140,
        tokenCoverageRatio: 1.0,
      },
      policy: buildPolicy("low", 0.99),
      temporaryEntities: input.temporaryEntities,
    };
  }

  // Check Temporary Ingested Entities Cache
  const temps = input.temporaryEntities || [];
  const matchingTemp = temps.find(t => 
    t.lens === input.mediaLens && 
    (t.id === explicitSelection ||
     (t.id && explicitSelection && t.id.toLowerCase() === explicitSelection.toLowerCase()) ||
     normalize(t.title) === lookupKey1 || 
     safeNormalize(t.title) === lookupKey2 || 
     normalize(t.title) === lookupKey2 || 
     safeNormalize(t.title) === lookupKey1)
  );

  if (matchingTemp) {
    const resolvedProviderMetadata = matchingTemp.metadata?.providerMetadata ?? {
      provider: matchingTemp.source,
      id: matchingTemp.id.split("::")[2],
      confidence: 0.99,
      canonicalTitle: matchingTemp.title,
      franchiseRoot: matchingTemp.metadata?.franchiseRoot ?? null,
      releaseYear: matchingTemp.metadata?.releaseYear ?? null,
      providerType: matchingTemp.metadata?.providerType ?? inferProviderTypeFromId(matchingTemp.id),
      providerResourceType: matchingTemp.metadata?.providerResourceType ?? matchingTemp.id.split("::")[1] ?? null,
      publisherLabel: matchingTemp.metadata?.publisherLabel ?? null,
    };
    if (resolvedProviderMetadata.providerType) {
      debugLog("[TYPED_GROUNDING_LOCK]", {
        query: originalQuery,
        selectionValue: matchingTemp.id,
        providerType: resolvedProviderMetadata.providerType,
        providerResourceType: resolvedProviderMetadata.providerResourceType ?? null,
      });
    }

    const entry: CatalogEntry = {
      canonicalEntity: matchingTemp.title,
      selectionValue: matchingTemp.id,
      displayTitle: matchingTemp.title,
      franchise: null,
      mediaLenses: [matchingTemp.lens],
      mediaLabel: lensLabel(matchingTemp.lens),
      namespaceLabel: matchingTemp.source.toUpperCase(),
      continuityLabel: matchingTemp.metadata?.releaseYear ? String(matchingTemp.metadata.releaseYear) : null,
      continuityType: null,
      metadataLabel: formatMetadataLabel(null, matchingTemp.metadata?.releaseYear ? String(matchingTemp.metadata.releaseYear) : null, lensLabel(matchingTemp.lens), matchingTemp.source.toUpperCase(), matchingTemp.title),
      universe: null,
      qualifiedId: matchingTemp.id,
      aliases: matchingTemp.aliases,
      source: "supplemental",
      thumbnailUrl: matchingTemp.metadata?.poster ?? null
    };

    const suggestion = toSuggestion(entry, input.mediaLens, 140, ["exact-title-bypass", "external-ingested-cache"]);
    return {
      originalQuery,
      normalizedQuery,
      selectedCanonicalEntity: entry.canonicalEntity,
      selectedSelectionValue: entry.selectionValue,
      selectedFranchise: matchingTemp.metadata?.franchiseRoot ?? entry.franchise,
      ambiguityLevel: "low",
      behavior: "auto_resolve",
      confidence: 0.99,
      suggestions: [suggestion],
      telemetry: {
        hotspot: false,
        explicitSelectionUsed: Boolean(explicitSelection),
        autoResolved: true,
        overrideRequired: false,
        failedAutoResolution: false,
        namespaceConflict: false,
        suggestionCount: 1,
        lens: input.mediaLens,
        topologyUsed: false,
        candidatePoolSize: 1,
        rejectedCrossLensCandidates: 0,
        exactTitleHit: true,
        preNormalizedScore: 140,
        postNormalizedScore: 140,
        tokenCoverageRatio: 1.0,
      },
      policy: buildPolicy("low", 0.99),
      temporaryEntities: input.temporaryEntities,
      providerMetadata: resolvedProviderMetadata,
    };
  }

  // --- Strict First-Pass Termination Gate ---
  if (!allowLoose) {
    return {
      originalQuery,
      normalizedQuery,
      selectedCanonicalEntity: null,
      selectedSelectionValue: null,
      selectedFranchise: null,
      ambiguityLevel: "medium",
      behavior: "suggest",
      confidence: 0,
      suggestions: [],
      telemetry: {
        hotspot: false,
        explicitSelectionUsed: false,
        autoResolved: false,
        overrideRequired: false,
        failedAutoResolution: false,
        namespaceConflict: false,
        suggestionCount: 0,
        lens: input.mediaLens,
        topologyUsed: false,
        candidatePoolSize: 0,
        rejectedCrossLensCandidates: 0,
        exactTitleHit: false,
        preNormalizedScore: 0,
        postNormalizedScore: 0,
        tokenCoverageRatio: 0,
        rejectedByForbiddenPrefix: false
      },
      policy: buildPolicy("medium", 0),
      temporaryEntities: input.temporaryEntities,
    };
  }

  const candidateQuery = normalize(explicitSelection || originalQuery);
  const rawCandidates = rawCandidateEntriesForQuery(candidateQuery, input.mediaLens);
  
  let rejectedCrossLensCandidates = 0;
  const candidateEntries = rawCandidates.filter(e => {
    if (e.mediaLenses.includes(input.mediaLens)) return true;
    
    // Lens assertion tracing
    rejectedCrossLensCandidates++;
    return false;
  });

  let ranked = dedupeSuggestions(
    candidateEntries.map((entry) => {
      const lexical = lexicalScore(candidateQuery, entry);
      const lens = lensScore(originalQuery, input.mediaLens, entry);
      const franchise = franchiseScore(originalQuery, entry);
      const score = lexical.score + lens.score + franchise.score + authorityScore(entry);
      return { suggestion: toSuggestion(entry, input.mediaLens, score, [...lexical.reasons, ...lens.reasons, ...franchise.reasons]), lexicalScore: lexical.score };
    })
      .filter((entry) => entry.lexicalScore > 0 && entry.suggestion.score >= 34)
      .map((entry) => entry.suggestion)
      .sort((a, b) => b.score - a.score),
    input.mediaLens
  );
  
  // Enforce strict lens governance
  ranked = ranked.filter((s) => s.mediaLens === input.mediaLens);
  ranked = ranked.slice(0, 8);

  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const topGap = top && second ? top.score - second.score : 0;
  const hotspot = HIGH_AMBIGUITY_TOKENS.has(normalizedQuery) || normalizedQuery.length <= 4;
  const namespaceConflict =
    ranked.length > 1 &&
    new Set(ranked.slice(0, 3).map((item) => `${item.namespaceLabel}:${item.mediaLens}`)).size > 1;

  let ambiguityLevel: AmbiguityLevel = "low";
  if (explicitSelection) {
    ambiguityLevel = "low";
  } else if (
    HIGH_AMBIGUITY_TOKENS.has(normalizedQuery) ||
    (ranked.length >= 3 && topGap <= 8) ||
    (normalizedQuery.split(" ").length === 1 && normalizedQuery.length <= 4 && namespaceConflict)
  ) {
    ambiguityLevel = "high";
  } else if (
    MEDIUM_AMBIGUITY_TOKENS.has(normalizedQuery) ||
    (ranked.length >= 2 && topGap <= 18) ||
    namespaceConflict
  ) {
    ambiguityLevel = "medium";
  }

  const confidence = Number(
    Math.max(
      0,
      Math.min(
        0.99,
        ((top?.score ?? 0) / 140) + (topGap / 100) + (explicitSelection ? 0.15 : 0)
      )
    ).toFixed(2)
  );

  let behavior: GroundingBehavior = "auto_resolve";
  if (!top) {
    behavior = "require_selection";
    ambiguityLevel = "high";
  } else if (explicitSelection) {
    behavior = "auto_resolve";
  } else if (ambiguityLevel === "high") {
    behavior = "require_selection";
  } else if (ambiguityLevel === "medium") {
    behavior = "suggest";
  }

  const selectedCanonicalEntity =
    explicitSelection
      ? top?.canonicalEntity ?? explicitSelection
      : behavior === "require_selection"
        ? null
        : top?.canonicalEntity ?? null;

  let preNormalizedScore = 0;
  let postNormalizedScore = 0;
  let tokenCoverageRatio = 0;

  if (top) {
    const matchedEntry = candidateEntries.find(
      (e) => e.canonicalEntity === top.canonicalEntity && e.selectionValue === top.selectionValue
    );
    if (matchedEntry) {
      const lexical = lexicalScore(candidateQuery, matchedEntry);
      preNormalizedScore = lexical.preNormalizedScore;
      postNormalizedScore = lexical.postNormalizedScore;
      tokenCoverageRatio = lexical.tokenCoverageRatio;
    }
  }

  const words = normalizedQuery.split(" ");
  const rejectedByForbiddenPrefix = words.some(w => FORBIDDEN_PREFIXES.has(w));

  const telemetry: GroundingTelemetry = {
    hotspot,
    explicitSelectionUsed: Boolean(explicitSelection),
    autoResolved: behavior === "auto_resolve" && Boolean(selectedCanonicalEntity),
    overrideRequired: behavior === "require_selection",
    failedAutoResolution: behavior !== "auto_resolve" && ranked.length > 0,
    namespaceConflict,
    suggestionCount: ranked.length,
    lens: input.mediaLens,
    topologyUsed: ranked.some(s => s.source === "topology"),
    candidatePoolSize: candidateEntries.length,
    rejectedCrossLensCandidates,
    exactTitleHit: false,
    preNormalizedScore,
    postNormalizedScore,
    tokenCoverageRatio,
    rejectedByForbiddenPrefix,
  };

  return {
    originalQuery,
    normalizedQuery,
    selectedCanonicalEntity,
    selectedSelectionValue: explicitSelection
      ? top?.selectionValue ?? explicitSelection
      : behavior === "require_selection"
        ? null
        : top?.selectionValue ?? null,
    selectedFranchise: top?.franchise ?? null,
    ambiguityLevel,
    behavior,
    confidence,
    suggestions: ranked,
    telemetry,
    policy: buildPolicy(ambiguityLevel, confidence),
    temporaryEntities: input.temporaryEntities,
  };
}
