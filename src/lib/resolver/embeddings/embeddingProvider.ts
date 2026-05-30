import { Modality } from "../provenanceTypes.js";

/**
 * embeddingProvider.ts
 * 
 * Defines the interface for semantic embedding providers with modality awareness.
 */

export type ProviderMode =
  | "deterministic_mock"
  | "high_entropy_mock"
  | "visual_entropy_mock"
  | "clip_sandbox_mock"
  | "clip_sandbox"
  | "real_provider";

export interface SemanticCandidate {
  id: string; // The candidate string or qualified ID
  score: number; // Similarity score (0.0 to 1.0)
  modality: Modality;
  entropySource?: string;
}

export interface EmbeddingProvider {
  /**
   * Retrieves semantically similar candidates based on the query or visual features.
   */
  findNeighbors(query: string, limit?: number): Promise<SemanticCandidate[]>;
  
  /**
   * The mode the provider is currently operating in.
   */
  readonly mode: ProviderMode;

  /**
   * The primary modality of this provider.
   */
  readonly modality: Modality;
}
