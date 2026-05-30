/**
 * Benchmark Type Definitions for Nerdvana Resolver
 */

export type FailureCategory =
  | "canonical_mismatch"
  | "franchise_drift"
  | "lens_mismatch"
  | "entity_type_mismatch"
  | "ambiguity_collapse"
  | "cross_universe_bleed"
  | "low_confidence_resolution"
  | "unknown_entity";

export interface BenchmarkCase {
  id: string;
  query: string;
  lens: string; // Mandatory for v1 to ensure deterministic grounding
  expected: {
    canonicalEntity: string;
    franchise?: string | null;
    continuity?: string | null;
    mediaLens: string;
    entityType: string;
  };
  knownFailureModes?: FailureCategory[];
  benchmarkTags?: string[];
  pressureCase?: boolean;
  pixelFixtureId?: string;
  expectedGrounding?: {
    ambiguityLevel: "low" | "medium" | "high";
    behavior: "auto_resolve" | "suggest" | "require_selection";
    selectedCanonicalEntity?: string | null;
  };
  notes?: string;
}

export interface DualEvaluationResult extends EvaluationResult {
  legacy: EvaluationResult;
  normalized: EvaluationResult;
}

export interface EvaluationResult {
  canonicalCorrect: boolean;
  franchiseCorrect: boolean;
  lensCorrect: boolean;
  entityTypeCorrect: boolean;
  continuityCorrect: boolean;
}

export interface BenchmarkResult {
  caseId: string;
  query: string;
  lens: string;
  actual: {
    canonicalEntity: string;
    franchise: string | null;
    universe: string | null;
    continuity: string | null;
    mediaLens: string;
    entityType: string;
    confidence: number;
    groundingConfidence: {
      authoritative: number;
      inferred: number;
      embeddingRecall: number;
      topology: number;
      lens: number;
      continuity: number;
    };
    telemetry: {
      groundingType: string;
      expansionUsed: boolean;
      expansionAccepted: boolean;
      expansionType: string | null;
      continuityType: string;
      isAmbiguous: boolean;
      isSelfReferential: boolean;
      inheritanceDepth: number;
      qualifiedId: string | null;
      canonicalGrounding?: {
        ambiguityLevel: string;
        behavior: string;
        confidence: number;
        suggestionCount: number;
        namespaceConflict: boolean;
        explicitSelectionUsed: boolean;
      };
      candidateHistory: {
        stage: string;
        candidate: string;
        accepted: boolean;
        reason: string;
      }[];
    };
  };
  evaluation: EvaluationResult;
  passed: boolean;
  failures: FailureCategory[];
  confidence: number;
}

export interface AggregateStats {
  total: number;
  passed: number;
  canonicalAccuracy: number;
  franchiseAccuracy: number;
  lensAccuracy: number;
  entityTypeAccuracy: number;
  failureDistribution: Record<FailureCategory, number>;
  topologyStats: {
    continuityAccuracy: number;
    variantsDetected: number;
    crossoversDetected: number;
    inheritanceHits: number;
    qualifiedHits: number;
    totalInheritanceDepth: number;
    expansionHits: number;
    expansionRejections: number;
    topologyInvalidNeighborsProposed: number;
    topologyInvalidNeighborsRejected: number;
  };
  groundingTypeDistribution: Record<string, number>;
  averageConfidence: number;
  averageGroundingConfidence: {
    authoritative: number;
    inferred: number;
    embeddingRecall: number;
    topology: number;
    lens: number;
    continuity: number;
  };
  falseConfidenceCount: number;
  selfReferentialCount: number;
  entropyStats: {
    averageEntropy: number;
    maxEntropy: number;
    entropyHotspots: string[];
    entropyPressureCases: number;
    entropyResilientResolutions: number;
  };
  crossModalStats: {
    proposed: number;
    rejected: number;
    safeDecisions: number;
    unsafeAcceptances: number;
    continuityBreaches: number;
    collisions: { query: string; candidate: string; reason: string }[];
  };
  resolutionCourageStats: {
    difficultMultimodalCases: number;
    courageousAttempts: number;
    acceptedUnderUncertainty: number;
  };
  normalizationStats: {
    legacyPassRate: number;
    normalizedPassRate: number;
    legacyPassed: number;
    normalizedPassed: number;
    evaluationNoiseReduced: number;
  };
  groundingMetrics: {
    intentGroundingSuccessRate: number;
    ambiguityResolutionEfficiency: number;
    namespacePurityScore: number;
    canonicalSelectionStability: number;
    evaluatedCases: number;
    matchedCases: number;
    stableCases: number;
    conflictFreeCases: number;
    autoBehaviorHits: number;
    guidedBehaviorHits: number;
  };
  pressureCaseCount: number;
  failureHotspots: Record<string, number>;
  dangerousNeighbors: { candidate: string; reason: string; entropy: string }[];
}
