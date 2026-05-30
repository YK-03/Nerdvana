import { ResolvedTopology } from "../topology/topologyTypes.js";
import { SemanticCandidate } from "./embeddingProvider.js";
import { GovernanceFailure } from "../provenanceTypes.js";
import {
  NamespacePrebindResult,
  candidateNamespaceMatchesPrebind,
} from "../multimodal/namespacePrebinding.js";

/**
 * embeddingGovernance.ts
 * 
 * The strict deterministic gatekeeper for embedding candidates.
 * Updated for Phase 7 with explicit failure taxonomy and depth enforcement.
 */

export interface GovernanceResult {
  accepted: boolean;
  reason: string;
  failureType?: GovernanceFailure;
}

export function validateEmbeddingCandidate(
  candidate: SemanticCandidate,
  topologyNode: ResolvedTopology,
  mediaLens: string,
  query: string,
  depth: number = 0,
  entropyScore: number = 0,
  prebind?: NamespacePrebindResult
): GovernanceResult {
  const modality = candidate.modality;
  const nodeNamespace = topologyNode.id.split("::")[0]?.toLowerCase() ?? "";

  // Rule 0: Influence Depth Limit (Phase 7)
  if (depth >= 1) {
    return {
      accepted: false,
      reason: "Influence Depth Limit Exceeded (maxEmbeddingInfluenceDepth = 1)",
      failureType: "depth_limit_exceeded"
    };
  }

  // Phase 7.5 / 8A: Modality-Specific Adaptive Threshold (scaled by prebind)
  let baseThreshold = modality === "image" ? 0.90 : 0.85;
  if (prebind?.thresholdScale) {
    baseThreshold *= prebind.thresholdScale;
  }
  const adaptiveThreshold = entropyScore > 0.5 ? baseThreshold + 0.10 : entropyScore > 0.2 ? baseThreshold + 0.05 : baseThreshold;
  
  if (candidate.score < adaptiveThreshold) {
    return {
      accepted: false,
      reason: `${modality.toUpperCase()} Entropy Pressure: Candidate similarity (${candidate.score}) below adaptive threshold (${adaptiveThreshold.toFixed(2)}) for entropy ${entropyScore.toFixed(2)}`,
      failureType: modality === "image" ? "visual_archetype_collision" : "semantic_false_neighbor"
    };
  }

  // Phase 7.5: Visual Silhouette & Archetype Rules
  if (modality === "image") {
    // 1. Silhouette Ambiguity Penalty
    if (candidate.entropySource === "shared_silhouette" && candidate.score < 0.95) {
      const silhouetteMin =
        prebind &&
        prebind.namespaceConfidence >= 0.85 &&
        candidateNamespaceMatchesPrebind(nodeNamespace, prebind)
          ? 0.9
          : 0.95;
      if (candidate.score < silhouetteMin) {
        return {
          accepted: false,
          reason: `Visual Governance: Silhouette ambiguity (requires ${silhouetteMin}+ for shared silhouettes)`,
          failureType: "silhouette_ambiguity",
        };
      }
    }

    // 2. Cross-Franchise Visual Collision
    if (candidate.entropySource === "archetypal_overlap" && topologyNode.parentFranchise === "Unknown") {
       return {
         accepted: false,
         reason: "Visual Governance: Rejection of ungrounded archetypal visual hit",
         failureType: "visual_archetype_collision"
       };
    }
  }

  // Rule 1: Media Domain Enforcement
  if (topologyNode.mediaDomains.length > 0 && !topologyNode.mediaDomains.includes(mediaLens)) {
    return {
      accepted: false,
      reason: `Media Domain Mismatch: "${topologyNode.id}" is invalid for lens "${mediaLens}"`,
      failureType: "media_domain_violation"
    };
  }

  // Rule 2: Strict Namespace Anchoring (Phase 8A prebind-first)
  const normQuery = query.toLowerCase();

  if (prebind?.franchiseNamespace && prebind.namespaceConfidence >= 0.8) {
    if (!candidateNamespaceMatchesPrebind(nodeNamespace, prebind)) {
      return {
        accepted: false,
        reason: `Namespace Violation (prebind): anchored to "${prebind.franchiseNamespace}", candidate is "${nodeNamespace}"`,
        failureType: "namespace_bleed",
      };
    }
  } else {
    const MARVEL_SIGNALS = ["marvel", "mcu", "avengers", "spiderman", "ironman"];
    const DC_SIGNALS = ["dc", "arkham", "batman", "superman", "justice league", "gotham"];
    const ANIME_SIGNALS = ["anime", "manga", "otaku", "japan"];

    if (MARVEL_SIGNALS.some((s) => normQuery.includes(s))) {
      if (nodeNamespace && nodeNamespace !== "marvel") {
        return {
          accepted: false,
          reason: `Namespace Violation: Query anchoring to Marvel, but candidate is from "${nodeNamespace}"`,
          failureType: "namespace_bleed",
        };
      }
    }

    if (DC_SIGNALS.some((s) => normQuery.includes(s))) {
      if (nodeNamespace && nodeNamespace !== "dc" && nodeNamespace !== "gaming") {
        return {
          accepted: false,
          reason: `Namespace Violation: Query anchoring to DC, but candidate is from "${nodeNamespace}"`,
          failureType: "namespace_bleed",
        };
      }
    }

    if (ANIME_SIGNALS.some((s) => normQuery.includes(s))) {
      if (nodeNamespace && nodeNamespace !== "anime") {
        return {
          accepted: false,
          reason: `Namespace Violation: Query anchoring to Anime, but candidate is from "${nodeNamespace}"`,
          failureType: "namespace_bleed",
        };
      }
    }
  }

  // Rule 3: Continuity Compatibility
  if (normQuery.includes("prime") && topologyNode.continuityType === "variant") {
    return {
      accepted: false,
      reason: `Continuity Mismatch: Query requested prime, candidate is variant`,
      failureType: "continuity_conflict"
    };
  }

  // Rule 4: Cross-Franchise Collision
  if (topologyNode.parentFranchise) {
     const franchiseLower = topologyNode.parentFranchise.toLowerCase();
     // If query contains a DIFFERENT known franchise, reject
     // (More advanced hardening: check if the neighbor's franchise is mentioned in the query)
     if (normQuery.includes("batman") && franchiseLower !== "batman") {
        return {
           accepted: false,
           reason: `Cross-Franchise Collision: Neighbor franchise "${topologyNode.parentFranchise}" conflicts with query intent`,
           failureType: "cross_franchise_collision"
        };
     }
  }

  // If all deterministic rules pass
  return {
    accepted: true,
    reason: `Passed hardened governance (Score: ${candidate.score})`,
  };
}
