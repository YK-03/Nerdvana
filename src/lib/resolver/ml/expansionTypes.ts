import { ResolvedTopology } from "../topology/topologyTypes.js";

/**
 * expansionTypes.ts
 * 
 * Types for Phase 5 Hybrid Semantic Infrastructure.
 */

export interface SemanticSuggestion {
  targetId: string; // The topology ID suggested
  relationshipType: "alias" | "franchise_member" | "crossover" | "related_identity";
  score: number; // 0.0 - 1.0
  reason: string;
}

export interface HybridResolutionResult {
  authoritative: ResolvedTopology | null;
  suggestions: SemanticSuggestion[];
  expansionConfidence: number;
}

/**
 * Interface for future embedding-based expansion engines.
 */
export interface ExpansionProvider {
  getSuggestions(query: string, context?: string): Promise<SemanticSuggestion[]>;
}
