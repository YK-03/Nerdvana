import { EmbeddingProvider, SemanticCandidate, ProviderMode } from "../embeddingProvider.js";
import { Modality, EntropySource } from "../../provenanceTypes.js";

/**
 * highEntropyMockProvider.ts
 * 
 * Simulates high-entropy latent space noise.
 * Specifically designed to stress-test deterministic governance by proposing
 * semantically plausible but topology-invalid candidates.
 */

const ENTROPY_MAP: Record<string, (Omit<SemanticCandidate, 'modality'> & { entropySource: EntropySource })[]> = {
  "mcu bat": [
    { id: "DC::Batman (DC Comics)", score: 0.89, entropySource: "cross_franchise_similarity" }, // Should be rejected by namespace
    { id: "Marvel::Iron-Man", score: 0.45, entropySource: "shared_archetype" }
  ],
  "arkham bat": [
    { id: "DC::Batman::Arkham", score: 0.96, entropySource: "none" },
    { id: "Marvel::Spider-Man::Marvel Comics", score: 0.42, entropySource: "shared_archetype" }
  ],
  "arkham rich vigilante": [
    { id: "DC::Batman::Arkham", score: 0.96, entropySource: "none" },
    { id: "DC::Batman (DC Comics)", score: 0.88, entropySource: "shared_archetype" },
  ],
  "rich vigilante": [
    { id: "DC::Batman (DC Comics)", score: 0.92, entropySource: "shared_archetype" },
    { id: "Marvel::Iron-Man", score: 0.88, entropySource: "shared_archetype" },
    { id: "DC::Green-Arrow", score: 0.85, entropySource: "shared_archetype" }
  ],
  "alien superhero reporter": [
    { id: "DC::Superman", score: 0.95, entropySource: "shared_archetype" }
  ],
  "multiverse speedster": [
    { id: "DC::Flash", score: 0.91, entropySource: "continuity_overlap" },
    { id: "Marvel::Spider-Man::MCU", score: 0.78, entropySource: "continuity_overlap" }
  ],
  "anime genius strategist": [
    { id: "Anime::CodeGeass::Lelouch", score: 0.94, entropySource: "shared_archetype" },
    { id: "Anime::DeathNote::Light", score: 0.93, entropySource: "shared_archetype" }
  ],
  "masked antihero with trauma": [
    { id: "DC::Batman (DC Comics)", score: 0.94, entropySource: "archetypal_overlap" },
    { id: "Marvel::Punisher", score: 0.89, entropySource: "archetypal_overlap" }
  ]
};

export class HighEntropyMockProvider implements EmbeddingProvider {
  readonly mode: ProviderMode = "high_entropy_mock";
  readonly modality: Modality = "text";

  async findNeighbors(query: string, limit: number = 3): Promise<SemanticCandidate[]> {
    const norm = query.toLowerCase().trim();
    
    if (ENTROPY_MAP[norm]) {
      return ENTROPY_MAP[norm].map(c => ({
        ...c,
        modality: "text" as Modality
      })).slice(0, limit);
    }

    return [];
  }
}
