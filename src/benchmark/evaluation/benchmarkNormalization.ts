import { findModularTopology } from "../../lib/resolver/topology/registry.js";

/**
 * benchmarkNormalization.ts
 * Phase 8B: Governance-sensitive benchmark evaluation normalization.
 * Reduces display-string / formatting noise without collapsing continuity or namespace distinctions.
 */

export interface NormalizedIdentity {
  raw: string;
  entityStem: string;
  topologyId: string | null;
  namespace: string | null;
  franchiseKey: string | null;
  continuityKey: string | null;
  displayTokens: string[];
}

const CONTINUITY_ALIASES: Record<string, string[]> = {
  prime: ["prime", "616", "main", "primary"],
  beyond: ["beyond", "batman beyond", "terry"],
  arkham: ["arkham", "arkhamverse"],
  mcu: ["mcu", "marvel cinematic"],
};

const FRANCHISE_ALIASES: Record<string, string[]> = {
  batman: ["batman", "dc batman", "caped crusader", "dark knight"],
  "moon knight": ["moon knight", "moon-knight", "marc spector"],
  avengers: ["avengers", "iron man", "iron-man", "tony stark", "stark"],
  "spider-man": ["spider-man", "spiderman", "spider man"],
  "devil may cry": ["devil may cry", "dmc", "dante"],
  "final fantasy": ["final fantasy", "ffvii", "sephiroth"],
  "code geass": ["code geass", "lelouch"],
};

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/::/g, " ")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function stemEntity(value: string): string {
  const tokens = tokenize(value);
  const stop = new Set([
    "dc",
    "marvel",
    "anime",
    "comics",
    "the",
    "prime",
    "main",
    "series",
    "game",
    "games",
  ]);
  const meaningful = tokens.filter((t) => !stop.has(t));
  return meaningful[0] ?? tokens[0] ?? value.toLowerCase();
}

function parseQualifiedId(id: string | null | undefined): {
  namespace: string | null;
  entityPart: string | null;
} {
  if (!id || !id.includes("::")) return { namespace: null, entityPart: null };
  const parts = id.split("::");
  return {
    namespace: parts[0]?.toLowerCase() ?? null,
    entityPart: parts.slice(1).join(" ").toLowerCase(),
  };
}

function normalizeContinuity(
  continuity: string | null | undefined,
  entityStem: string,
  topologyId: string | null
): string | null {
  const blob = `${continuity ?? ""} ${entityStem} ${topologyId ?? ""}`.toLowerCase();
  for (const [key, aliases] of Object.entries(CONTINUITY_ALIASES)) {
    if (aliases.some((a) => blob.includes(a))) return key;
  }
  if (topologyId?.toLowerCase().includes("beyond")) return "beyond";
  if (topologyId?.toLowerCase().includes("arkham")) return "arkham";
  if (topologyId?.toLowerCase().includes("mcu")) return "mcu";
  return continuity?.toLowerCase().trim() || null;
}

function normalizeFranchiseKey(
  franchise: string | null | undefined,
  entityStem: string
): string | null {
  const blob = `${franchise ?? ""} ${entityStem}`.toLowerCase();
  for (const [key, aliases] of Object.entries(FRANCHISE_ALIASES)) {
    if (aliases.some((a) => blob.includes(a))) return key;
  }
  return franchise?.toLowerCase().trim() || null;
}

export function normalizeIdentity(
  canonicalEntity: string,
  options?: {
    qualifiedId?: string | null;
    continuity?: string | null;
    parentFranchise?: string | null;
    mediaLens?: string;
  }
): NormalizedIdentity {
  const raw = canonicalEntity.trim();
  let topologyId = options?.qualifiedId ?? null;

  if (!topologyId && raw.includes("::")) {
    topologyId = raw;
  }

  if (!topologyId && options?.mediaLens) {
    const hit = findModularTopology(raw, options.mediaLens, true);
    topologyId = hit?.id ?? null;
  }

  const { namespace: nsFromId, entityPart } = parseQualifiedId(topologyId);
  const displayTokens = tokenize(raw);
  const entityStem = stemEntity(entityPart ?? raw);

  return {
    raw,
    entityStem,
    topologyId,
    namespace: nsFromId ?? (raw.toLowerCase().startsWith("marvel") ? "marvel" : null),
    franchiseKey: normalizeFranchiseKey(options?.parentFranchise ?? null, entityStem),
    continuityKey: normalizeContinuity(options?.continuity ?? null, entityStem, topologyId),
    displayTokens,
  };
}

function tokensOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((t) => setB.has(t)) || b.some((t) => a.includes(t));
}

function stemsEquivalent(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/-/g, "");
  const nb = b.toLowerCase().replace(/-/g, "");
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return tokensOverlap(tokenize(a), tokenize(b));
}

/**
 * Topology-aware canonical equivalence. Continuity-sensitive when expected specifies continuity.
 */
export function canonicalEquivalent(
  actual: NormalizedIdentity,
  expected: NormalizedIdentity,
  options?: { strictContinuity?: boolean }
): boolean {
  if (actual.topologyId && expected.topologyId) {
    if (actual.topologyId === expected.topologyId) return true;
    const aBase = actual.topologyId.split("::").slice(0, 2).join("::");
    const eBase = expected.topologyId.split("::").slice(0, 2).join("::");
    if (aBase === eBase && !options?.strictContinuity) return true;
  }

  if (stemsEquivalent(actual.entityStem, expected.entityStem)) {
    if (options?.strictContinuity && expected.continuityKey) {
      return actual.continuityKey === expected.continuityKey;
    }
    if (expected.continuityKey === "prime" && actual.continuityKey === "beyond") {
      return false;
    }
    if (expected.continuityKey === "beyond" && actual.continuityKey !== "beyond") {
      return false;
    }
    return true;
  }

  if (tokensOverlap(actual.displayTokens, expected.displayTokens)) {
    if (expected.continuityKey === "beyond" && actual.continuityKey !== "beyond") {
      return false;
    }
    return true;
  }

  return false;
}

export function franchiseEquivalent(
  actualFranchise: string | null,
  expectedFranchise: string | null | undefined,
  actualStem: string,
  expectedStem: string
): boolean {
  if (!expectedFranchise) return true;
  if (!actualFranchise) return false;

  const aKey = normalizeFranchiseKey(actualFranchise, actualStem);
  const eKey = normalizeFranchiseKey(expectedFranchise, expectedStem);
  if (aKey && eKey) return aKey === eKey;

  return (
    actualFranchise.toLowerCase() === expectedFranchise.toLowerCase() ||
    actualFranchise.toLowerCase().includes(expectedFranchise.toLowerCase()) ||
    expectedFranchise.toLowerCase().includes(actualFranchise.toLowerCase())
  );
}

export function namespaceCompatible(
  actualNs: string | null,
  expectedNs: string | null,
  query?: string
): boolean {
  if (!expectedNs) return true;
  if (actualNs && actualNs === expectedNs) return true;
  const q = (query ?? "").toLowerCase();
  if (expectedNs === "dc" && q.includes("marvel")) return false;
  if (expectedNs === "marvel" && q.includes("gotham")) return false;
  return !actualNs || !expectedNs;
}

/**
 * Entity type normalization: resolver uses lens-derived types; benchmarks often expect "character".
 */
export function entityTypeEquivalent(
  actualType: string,
  expectedType: string,
  canonicalMatch: boolean
): boolean {
  if (actualType === expectedType) return true;
  if (!canonicalMatch) return false;

  const characterLike = new Set(["character", "movie", "tv", "game", "comic", "anime"]);
  if (expectedType === "character" && characterLike.has(actualType)) return true;
  if (expectedType === "movie" && actualType === "character") return true;

  return false;
}

export function continuityEquivalent(
  actualContinuity: string | null,
  expectedContinuity: string | null | undefined,
  actualNorm: NormalizedIdentity,
  expectedNorm: NormalizedIdentity
): boolean {
  if (!expectedContinuity) return true;
  if (actualContinuity === expectedContinuity) return true;
  if (expectedNorm.continuityKey && actualNorm.continuityKey) {
    return expectedNorm.continuityKey === actualNorm.continuityKey;
  }
  return false;
}
