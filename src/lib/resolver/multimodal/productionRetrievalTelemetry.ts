/**
 * productionRetrievalTelemetry.ts
 * Phase 8B: Observability for production-path multimodal arbitration.
 */

export interface ProductionRetrievalTelemetry {
  multimodalArbitrationEnabled: boolean;
  namespacePrebind: string | null;
  namespaceConfidence: number;
  groundingAmbiguityLevel: string | null;
  groundingTightening: number;
  arbitrationInfluence: number;
  visualAmbiguitySuppressed: number;
  unsafeNearMisses: string[];
  entropyHotspots: string[];
  arbitrationAccepts: number;
  arbitrationRejects: number;
  candidateHistoryDepth: number;
}

export function createEmptyProductionTelemetry(
  enabled: boolean
): ProductionRetrievalTelemetry {
  return {
    multimodalArbitrationEnabled: enabled,
    namespacePrebind: null,
    namespaceConfidence: 0,
    groundingAmbiguityLevel: null,
    groundingTightening: 0,
    arbitrationInfluence: 0,
    visualAmbiguitySuppressed: 0,
    unsafeNearMisses: [],
    entropyHotspots: [],
    arbitrationAccepts: 0,
    arbitrationRejects: 0,
    candidateHistoryDepth: 0,
  };
}
