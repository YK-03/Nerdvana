import { ResolvedTopology } from "../topology/topologyTypes.js";
import { NamespacePrebindResult, candidateNamespaceMatchesPrebind } from "./namespacePrebinding.js";
import {
  CandidateHistoryEntry,
  GovernanceFailure,
  Modality,
} from "../provenanceTypes.js";
import { ProviderMode } from "../embeddings/embeddingProvider.js";

/**
 * crossModalArbitrationEngine.ts
 * Phase 8A: Deterministic judge between text and image evidence.
 * Authority: Topology > Arbitration > Visual Similarity
 */

export interface ArbitrationCandidate {
  topologyNode: ResolvedTopology;
  modality: Modality;
  similarityScore: number;
  providerMode: ProviderMode;
  entropySource?: string;
  governancePassed: boolean;
  governanceReason: string;
  governanceFailureType?: GovernanceFailure;
}

export interface FusionBreakdown {
  topologyScore: number;
  namespaceScore: number;
  textScore: number;
  imageScore: number;
  archetypePenalty: number;
  finalScore: number;
  acceptThreshold: number;
}

export interface ArbitrationResult {
  accepted: ResolvedTopology | null;
  decision: "accept" | "reject_all" | "topology_override";
  arbitrationScore: number;
  fusionBreakdown: FusionBreakdown;
  courageAttempt: boolean;
  difficultCase: boolean;
  acceptedUnderUncertainty: boolean;
  namespaceConfidence: number;
  history: CandidateHistoryEntry[];
}

const DEFAULT_THRESHOLD = 0.68;
const STRONG_PREBIND_THRESHOLD = 0.62;
const WEAK_PREBIND_THRESHOLD = 0.72;

function scoreTopology(node: ResolvedTopology, mediaLens: string): number {
  let score = 0.85;
  if (node.mediaDomains.length > 0 && node.mediaDomains.includes(mediaLens)) {
    score = 0.98;
  } else if (node.mediaDomains.length === 0) {
    score = 0.75;
  } else {
    score = 0.55;
  }
  if (node.inheritanceDepth > 0) score = Math.min(1, score + 0.02);
  return score;
}

function scoreNamespace(
  node: ResolvedTopology,
  prebind: NamespacePrebindResult
): number {
  const ns = node.id.split("::")[0]?.toLowerCase() ?? "";
  if (!prebind.franchiseNamespace || prebind.namespaceConfidence < 0.5) return 0.7;
  if (candidateNamespaceMatchesPrebind(ns, prebind)) {
    return 0.95 * prebind.namespaceConfidence + 0.05;
  }
  if (prebind.blockedNamespaces.includes(ns)) return 0;
  return 0.35;
}

function continuityViolates(
  node: ResolvedTopology,
  prebind: NamespacePrebindResult,
  query: string
): boolean {
  const norm = query.toLowerCase();
  if (norm.includes("prime") && node.continuityType === "variant" && !norm.includes("beyond")) {
    return true;
  }
  if (prebind.continuityAnchor === "prime" && node.continuityType === "variant") {
    const id = node.id.toLowerCase();
    if (id.includes("beyond") || id.includes("arkham")) return true;
  }
  if (prebind.continuityAnchor === "beyond" && !node.id.toLowerCase().includes("beyond")) {
    if (node.id.toLowerCase().includes("batman") && !node.id.toLowerCase().includes("beyond")) {
      return true;
    }
  }
  return false;
}

function computeFusion(
  candidate: ArbitrationCandidate,
  prebind: NamespacePrebindResult,
  mediaLens: string,
  query: string
): FusionBreakdown {
  const topologyScore = scoreTopology(candidate.topologyNode, mediaLens);
  const namespaceScore = scoreNamespace(candidate.topologyNode, prebind);
  const textScore =
    candidate.modality === "text" ? candidate.similarityScore : 0;
  const imageScore =
    candidate.modality === "image" ? Math.min(candidate.similarityScore, 0.94) : 0;

  let archetypePenalty = 0;
  if (
    candidate.entropySource === "archetypal_overlap" &&
    (candidate.topologyNode.parentFranchise === "Unknown" ||
      namespaceScore < 0.6)
  ) {
    archetypePenalty = 0.25;
  }
  if (candidate.entropySource === "shared_silhouette" && namespaceScore < 0.7) {
    archetypePenalty = Math.max(archetypePenalty, 0.15);
  }

  const modalityContribution =
    candidate.modality === "text"
      ? textScore * 0.2
      : imageScore * 0.15;

  const finalScore = Number(
    (
      topologyScore * 0.35 +
      namespaceScore * 0.3 +
      modalityContribution -
      archetypePenalty
    ).toFixed(4)
  );

  const acceptThreshold =
    prebind.namespaceConfidence >= 0.85
      ? STRONG_PREBIND_THRESHOLD
      : prebind.franchiseNamespace && prebind.namespaceConfidence >= 0.5
        ? DEFAULT_THRESHOLD
        : WEAK_PREBIND_THRESHOLD;

  return {
    topologyScore,
    namespaceScore,
    textScore,
    imageScore,
    archetypePenalty,
    finalScore,
    acceptThreshold,
  };
}

function isUnsafeImageAccept(
  candidate: ArbitrationCandidate,
  prebind: NamespacePrebindResult,
  fusion: FusionBreakdown
): boolean {
  if (candidate.modality !== "image") return false;
  const ns = candidate.topologyNode.id.split("::")[0]?.toLowerCase() ?? "";
  if (
    prebind.namespaceConfidence >= 0.8 &&
    prebind.franchiseNamespace &&
    !candidateNamespaceMatchesPrebind(ns, prebind)
  ) {
    return true;
  }
  if (
    candidate.entropySource === "archetypal_overlap" &&
    candidate.topologyNode.parentFranchise === "Unknown"
  ) {
    return true;
  }
  if (fusion.namespaceScore < 0.5 && candidate.similarityScore < 0.95) {
    return true;
  }
  return false;
}

export class CrossModalArbitrationEngine {
  arbitrate(
    candidates: ArbitrationCandidate[],
    prebind: NamespacePrebindResult,
    query: string,
    mediaLens: string,
    entropyScore: number = 0
  ): ArbitrationResult {
    const history: CandidateHistoryEntry[] = [];
    const governed = candidates.filter((c) => c.governancePassed);
    const difficultCase =
      entropyScore > 0.003 ||
      governed.length > 1 ||
      candidates.length > 2 ||
      prebind.namespaceConfidence >= 0.8;
    const courageAttempt =
      candidates.length > 0 &&
      (difficultCase || prebind.franchiseNamespace != null);

    if (governed.length === 0) {
      return {
        accepted: null,
        decision: "reject_all",
        arbitrationScore: 0,
        fusionBreakdown: {
          topologyScore: 0,
          namespaceScore: 0,
          textScore: 0,
          imageScore: 0,
          archetypePenalty: 0,
          finalScore: 0,
          acceptThreshold: DEFAULT_THRESHOLD,
        },
        courageAttempt,
        difficultCase,
        acceptedUnderUncertainty: false,
        namespaceConfidence: prebind.namespaceConfidence,
        history,
      };
    }

    const scored = governed
      .map((c) => {
        const fusion = computeFusion(c, prebind, mediaLens, query);
        return { candidate: c, fusion };
      })
      .filter(({ candidate, fusion }) => {
        if (continuityViolates(candidate.topologyNode, prebind, query)) {
          history.push({
            stage: "embedding_neighbor",
            modality: candidate.modality,
            candidate: candidate.topologyNode.id,
            similarityScore: candidate.similarityScore,
            entropySource: (candidate.entropySource as any) ?? "none",
            accepted: false,
            reason: "Arbitration: continuity conflict rejected",
            governanceFailureType: "continuity_conflict",
            namespace: candidate.topologyNode.id.split("::")[0],
            continuity: candidate.topologyNode.continuity ?? undefined,
          });
          return false;
        }
        if (isUnsafeImageAccept(candidate, prebind, fusion)) {
          history.push({
            stage: "embedding_neighbor",
            modality: candidate.modality,
            candidate: candidate.topologyNode.id,
            similarityScore: candidate.similarityScore,
            entropySource: (candidate.entropySource as any) ?? "none",
            accepted: false,
            reason: "Arbitration: unsafe image-only accept blocked",
            governanceFailureType: "visual_archetype_collision",
            namespace: candidate.topologyNode.id.split("::")[0],
          });
          return false;
        }
        return true;
      })
      .sort((a, b) => b.fusion.finalScore - a.fusion.finalScore);

    if (scored.length === 0) {
      return {
        accepted: null,
        decision: "reject_all",
        arbitrationScore: 0,
        fusionBreakdown: {
          topologyScore: 0,
          namespaceScore: 0,
          textScore: 0,
          imageScore: 0,
          archetypePenalty: 0,
          finalScore: 0,
          acceptThreshold: DEFAULT_THRESHOLD,
        },
        courageAttempt,
        difficultCase,
        acceptedUnderUncertainty: false,
        namespaceConfidence: prebind.namespaceConfidence,
        history,
      };
    }

    const best = scored[0];
    const { candidate, fusion } = best;

    const imageOnly =
      candidate.modality === "image" &&
      !scored.some((s) => s.candidate.modality === "text" && s.fusion.finalScore >= fusion.finalScore - 0.05);
    if (imageOnly && fusion.namespaceScore < 0.75 && fusion.topologyScore < 0.9) {
      history.push({
        stage: "cross_modal_arbitration",
        modality: "multimodal",
        candidate: candidate.topologyNode.id,
        similarityScore: candidate.similarityScore,
        accepted: false,
        reason: "Arbitration: image cannot win without namespace+topology support",
      });
      return {
        accepted: null,
        decision: "reject_all",
        arbitrationScore: fusion.finalScore,
        fusionBreakdown: fusion,
        courageAttempt,
        difficultCase,
        acceptedUnderUncertainty: false,
        namespaceConfidence: prebind.namespaceConfidence,
        history,
      };
    }

    const strongPrebindImage =
      prebind.namespaceConfidence >= 0.85 &&
      candidate.modality === "image" &&
      candidate.similarityScore >= 0.88;

    const meetsThreshold =
      fusion.finalScore >= fusion.acceptThreshold ||
      (strongPrebindImage && fusion.finalScore >= STRONG_PREBIND_THRESHOLD);

    history.push({
      stage: "cross_modal_arbitration",
      modality: "multimodal",
      candidate: candidate.topologyNode.id,
      similarityScore: fusion.finalScore,
      accepted: meetsThreshold,
      reason: meetsThreshold
        ? `Arbitration accept (score=${fusion.finalScore}, threshold=${fusion.acceptThreshold})`
        : `Arbitration reject below threshold (${fusion.finalScore} < ${fusion.acceptThreshold})`,
      namespace: candidate.topologyNode.id.split("::")[0],
      continuity: candidate.topologyNode.continuity ?? undefined,
    });

    if (!meetsThreshold) {
      return {
        accepted: null,
        decision: "reject_all",
        arbitrationScore: fusion.finalScore,
        fusionBreakdown: fusion,
        courageAttempt,
        difficultCase,
        acceptedUnderUncertainty: false,
        namespaceConfidence: prebind.namespaceConfidence,
        history,
      };
    }

    const acceptedUnderUncertainty =
      difficultCase && (entropyScore > 0.3 || fusion.archetypePenalty > 0);

    return {
      accepted: candidate.topologyNode,
      decision: "accept",
      arbitrationScore: fusion.finalScore,
      fusionBreakdown: fusion,
      courageAttempt,
      difficultCase,
      acceptedUnderUncertainty,
      namespaceConfidence: prebind.namespaceConfidence,
      history,
    };
  }
}

let arbitrationEngine: CrossModalArbitrationEngine | null = null;
export function getArbitrationEngine(): CrossModalArbitrationEngine {
  if (!arbitrationEngine) {
    arbitrationEngine = new CrossModalArbitrationEngine();
  }
  return arbitrationEngine;
}
