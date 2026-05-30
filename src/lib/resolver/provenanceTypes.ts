/**
 * provenanceTypes.ts
 * 
 * Formalized types for Phase 7.5: Multimodal Semantic Governance.
 * Tracks modality-specific entropy and cross-modal deterministic safety.
 */

export type Modality =
  | "text"
  | "image"
  | "multimodal";

export type CandidateSource =
  | "deterministic"
  | "heuristic"
  | "semantic_expansion"
  | "embedding_neighbor"
  | "cross_modal_arbitration";

export type GovernanceFailure =
  | "namespace_bleed"
  | "continuity_conflict"
  | "media_domain_violation"
  | "cross_franchise_collision"
  | "variant_misalignment"
  | "semantic_false_neighbor"
  | "alias_topology_conflict"
  | "depth_limit_exceeded"
  | "visual_archetype_collision"
  | "silhouette_ambiguity";

export type EntropySource =
  | "cross_franchise_similarity"
  | "shared_archetype"
  | "continuity_overlap"
  | "alias_collapse"
  | "latent_space_coincidence"
  | "genre_similarity"
  | "adaptation_confusion"
  | "none";

export type VisualEntropySource =
  | "shared_silhouette"
  | "costume_similarity"
  | "archetypal_overlap"
  | "cinematic_framing"
  | "color_palette_convergence"
  | "weapon_motif_overlap"
  | "pose_similarity"
  | "species_visual_overlap"
  | "armor_similarity"
  | "animation_style_convergence"
  | "none";

export interface CandidateHistoryEntry {
  stage: CandidateSource;
  modality: Modality;
  candidate: string;
  source?: string;
  similarityScore?: number;
  entropySource?: EntropySource | VisualEntropySource;
  governanceFailureType?: GovernanceFailure;
  accepted: boolean;
  reason: string;
  namespace?: string;
  continuity?: string;
}

export interface MultimodalArbitrationTelemetry {
  arbitrationAttempted: boolean;
  difficultCase: boolean;
  acceptedUnderUncertainty: boolean;
  resolutionCourage: number;
  arbitrationScore?: number;
  namespaceConfidence?: number;
}

export interface ProvenanceTelemetry {
  candidateHistory: CandidateHistoryEntry[];
  embeddingEntropyScore?: number;
  visualEntropyScore?: number;
  multimodalArbitration?: MultimodalArbitrationTelemetry;
}
