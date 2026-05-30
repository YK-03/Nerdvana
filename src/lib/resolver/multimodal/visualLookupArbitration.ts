import type { ResolverContextPacket } from "../../../app/canonicalResolver.js";
import type { ResolverCandidate } from "../../../app/canonicalResolver.js";
import { prebindFromQuery } from "./namespacePrebinding.js";
import {
  createEmptyProductionTelemetry,
  ProductionRetrievalTelemetry,
} from "./productionRetrievalTelemetry.js";
import type { CandidateHistoryEntry } from "../provenanceTypes.js";

/**
 * visualLookupArbitration.ts
 * Phase 8B: Merge resolver candidateHistory + namespace prebind into visual-lookup scoring.
 * Feature-flagged; does not replace topology authority.
 */

export interface VisualArbitrationContext {
  enabled: boolean;
  prebindNamespace: string | null;
  namespaceConfidence: number;
  groundingTightening: number;
  embeddingAccepted: boolean;
  arbitrationScore: number;
  visualEntropy: number;
  unsafeNeighborIds: string[];
  telemetry: ProductionRetrievalTelemetry;
}

export function isMultimodalArbitrationEnabled(): boolean {
  if (typeof process === "undefined") return false;
  return process.env?.NERDVANA_MULTIMODAL_ARBITRATION === "1";
}

export function buildVisualArbitrationContext(
  packet: ResolverContextPacket
): VisualArbitrationContext {
  const enabled = isMultimodalArbitrationEnabled();
  const telemetry = createEmptyProductionTelemetry(enabled);
  const history: CandidateHistoryEntry[] =
    (packet.telemetry as { candidateHistory?: CandidateHistoryEntry[] }).candidateHistory ?? [];

  telemetry.candidateHistoryDepth = history.length;

  const prebind = prebindFromQuery(
    packet.contextualSearchQuery || packet.canonicalEntity,
    packet.mediaLens,
    packet.parentFranchise ?? undefined
  );
  telemetry.namespacePrebind = prebind.franchiseNamespace;
  telemetry.namespaceConfidence = prebind.namespaceConfidence;

  const mm = (packet.telemetry as {
    multimodalArbitration?: {
      arbitrationScore?: number;
      arbitrationAttempted?: boolean;
    };
    visualEntropyScore?: number;
    embeddingAccepted?: boolean;
    canonicalGrounding?: {
      ambiguityLevel?: string;
      behavior?: string;
    };
  });

  const arbitrationScore = mm.multimodalArbitration?.arbitrationScore ?? 0;
  const visualEntropy = mm.visualEntropyScore ?? 0;
  const embeddingAccepted = Boolean(mm.embeddingAccepted);
  const groundingTightening =
    mm.canonicalGrounding?.ambiguityLevel === "high"
      ? 0.18
      : mm.canonicalGrounding?.ambiguityLevel === "medium"
        ? 0.1
        : 0;
  telemetry.groundingAmbiguityLevel = mm.canonicalGrounding?.ambiguityLevel ?? null;
  telemetry.groundingTightening = groundingTightening;

  const unsafeNeighborIds: string[] = [];
  for (const h of history) {
    if (!h.accepted && h.modality === "image") {
      telemetry.visualAmbiguitySuppressed++;
      if (
        h.governanceFailureType === "visual_archetype_collision" ||
        h.governanceFailureType === "namespace_bleed"
      ) {
        unsafeNeighborIds.push(h.candidate);
        telemetry.unsafeNearMisses.push(`${h.candidate}:${h.governanceFailureType}`);
      }
    }
    if (h.stage === "cross_modal_arbitration" && h.accepted) {
      telemetry.arbitrationAccepts++;
    }
    if (h.stage === "cross_modal_arbitration" && !h.accepted) {
      telemetry.arbitrationRejects++;
    }
  }

  if (visualEntropy > 0.05) {
    telemetry.entropyHotspots.push(packet.canonicalEntity);
  }

  telemetry.arbitrationInfluence = enabled
    ? Math.min(1, arbitrationScore * 0.6 + prebind.namespaceConfidence * 0.4 + groundingTightening)
    : 0;

  return {
    enabled,
    prebindNamespace: prebind.franchiseNamespace,
    namespaceConfidence: prebind.namespaceConfidence,
    groundingTightening,
    embeddingAccepted,
    arbitrationScore,
    visualEntropy,
    unsafeNeighborIds,
    telemetry,
  };
}

/**
 * Adjust retrieval candidate score using governed multimodal context.
 * Image evidence cannot override strong namespace mismatch.
 */
export function applyMultimodalArbitrationToCandidate(
  candidate: ResolverCandidate,
  packet: ResolverContextPacket,
  ctx: VisualArbitrationContext,
  baseScore: number
): { finalScore: number; penalties: string[]; boosts: string[] } {
  const penalties: string[] = [];
  const boosts: string[] = [];

  if (!ctx.enabled) {
    return { finalScore: baseScore, penalties, boosts };
  }

  let score = baseScore;
  const name = candidate.name.toLowerCase();
  const franchise = (packet.parentFranchise ?? "").toLowerCase();

  if (ctx.prebindNamespace === "dc" && name.includes("moon knight")) {
    score *= 0.2;
    penalties.push("multimodal_namespace_block:dc_vs_moon_knight");
  }
  if (ctx.prebindNamespace === "marvel" && name.includes("batman") && !name.includes("batman beyond")) {
    score *= 0.25;
    penalties.push("multimodal_namespace_block:marvel_vs_batman");
  }

  if (ctx.unsafeNeighborIds.some((id) => name.includes(id.split("::").pop()?.toLowerCase() ?? ""))) {
    score *= 0.15;
    penalties.push("multimodal_unsafe_neighbor_proximity");
  }

  if (ctx.groundingTightening > 0 && franchise && !name.includes(franchise.split(" ")[0])) {
    score *= Math.max(0.35, 1 - ctx.groundingTightening);
    penalties.push("canonical_grounding_namespace_tightening");
  }

  if (ctx.embeddingAccepted && franchise && name.includes(franchise.split(" ")[0])) {
    score *= 1 + ctx.arbitrationInfluence * 0.15;
    boosts.push("multimodal_arbitration_anchor");
  }

  if (ctx.namespaceConfidence >= 0.85) {
    boosts.push(`prebind:${ctx.prebindNamespace}`);
  }

  return {
    finalScore: Math.round(score),
    penalties,
    boosts,
  };
}
