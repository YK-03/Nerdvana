import { EmbeddingProvider, SemanticCandidate } from "./embeddingProvider.js";

/**
 * mockEmbeddingProvider.ts
 * 
 * Simulates a vector database by providing hardcoded semantic similarities.
 * Used exclusively for validating architecture governance without API costs.
 */

const MOCK_VECTOR_SPACE: Record<string, SemanticCandidate[]> = {
  "caped crusader": [{ id: "Batman", score: 0.95 }, { id: "Superman", score: 0.4 }],
  "green goliath": [{ id: "Hulk", score: 0.96 }, { id: "Green Lantern", score: 0.5 }],
  "wall maria protagonist": [{ id: "Eren Yeager", score: 0.92 }, { id: "Mikasa Ackerman", score: 0.85 }],
  "saiyan prince": [{ id: "Vegeta", score: 0.98 }, { id: "Goku", score: 0.6 }],
  "the last spartan": [{ id: "Master Chief", score: 0.89 }, { id: "Kratos", score: 0.82 }],
  "friendly neighborhood hero": [{ id: "Spider-Man", score: 0.94 }],
  // Adversarial / Semantic Collision cases
  "arkham bat": [{ id: "Batman (Arkham)", score: 0.91 }, { id: "Batman", score: 0.85 }],
  "web slinger": [{ id: "Spider-Man", score: 0.90 }, { id: "Venom", score: 0.6 }],
  // Intentional bad semantic neighbor to test governance rejection
  "mcu bat": [{ id: "Batman", score: 0.88 }], // Will be rejected by MCU namespace validation
};

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly mode = "deterministic_mock";
  readonly modality = "text";

  async findNeighbors(query: string, limit: number = 3): Promise<SemanticCandidate[]> {
    const norm = query.toLowerCase().trim();
    
    // Exact fuzzy mock match
    if (MOCK_VECTOR_SPACE[norm]) {
      return MOCK_VECTOR_SPACE[norm].map(c => ({ ...c, modality: "text" as const })).slice(0, limit);
    }

    // Partial match simulation
    for (const key of Object.keys(MOCK_VECTOR_SPACE)) {
      if (norm.includes(key) || key.includes(norm)) {
         return MOCK_VECTOR_SPACE[key].map(c => ({ ...c, modality: "text" as const })).slice(0, limit);
      }
    }

    return [];
  }
}

export const EMBEDDING_PROVIDER = new MockEmbeddingProvider();
