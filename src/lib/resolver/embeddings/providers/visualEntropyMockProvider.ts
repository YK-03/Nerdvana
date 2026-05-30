import { EmbeddingProvider, SemanticCandidate, ProviderMode } from "../embeddingProvider.js";
import { Modality, VisualEntropySource } from "../../provenanceTypes.js";

/**
 * visualEntropyMockProvider.ts
 * 
 * Simulates visual latent space archetypal convergence.
 * Specifically designed to stress-test visual governance by proposing
 * visually plausible but canonically invalid or continuity-unsafe candidates.
 */

const VISUAL_ENTROPY_MAP: Record<string, (Omit<SemanticCandidate, "modality"> & { entropySource: VisualEntropySource })[]> = {
  "dark armored vigilante": [
    { id: "DC::Batman (DC Comics)", score: 0.94, entropySource: "shared_silhouette" },
    { id: "Marvel::Moon-Knight", score: 0.92, entropySource: "shared_silhouette" }, // Silhouette convergence
    { id: "DC::Batman::Beyond", score: 0.88, entropySource: "costume_similarity" }
  ],
  "masked billionaire hero": [
    { id: "Marvel::Iron-Man", score: 0.95, entropySource: "archetypal_overlap" },
    { id: "DC::Batman (DC Comics)", score: 0.91, entropySource: "archetypal_overlap" }
  ],
  "silver-haired anime swordsman": [
    { id: "Anime::DevilMayCry::Dante", score: 0.93, entropySource: "animation_style_convergence" },
    { id: "Anime::Sephiroth", score: 0.91, entropySource: "weapon_motif_overlap" }
  ],
  "glowing-eyed antihero": [
    { id: "Marvel::Spider-Man::MCU", score: 0.82, entropySource: "pose_similarity" }, // Incorrect visual match
    { id: "DC::Batman (DC Comics)", score: 0.81, entropySource: "cinematic_framing" }
  ],
  "masked antihero with trauma": [
    { id: "DC::Batman (DC Comics)", score: 0.94, entropySource: "archetypal_overlap" },
    { id: "Marvel::Punisher", score: 0.89, entropySource: "archetypal_overlap" }
  ]
};

export class VisualEntropyMockProvider implements EmbeddingProvider {
  readonly mode: ProviderMode = "visual_entropy_mock";
  readonly modality: Modality = "image";

  async findNeighbors(query: string, limit: number = 3): Promise<SemanticCandidate[]> {
    const norm = query.toLowerCase().trim();
    
    if (VISUAL_ENTROPY_MAP[norm]) {
      return VISUAL_ENTROPY_MAP[norm].map(c => ({
        ...c,
        modality: "image"
      })).slice(0, limit);
    }

    return [];
  }
}
