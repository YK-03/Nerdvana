import { EmbeddingProvider, SemanticCandidate, ProviderMode } from "./embeddingProvider.js";
import { MockEmbeddingProvider } from "./mockEmbeddingProvider.js";
import { HighEntropyMockProvider } from "./providers/highEntropyMockProvider.js";
import { VisualEntropyMockProvider } from "./providers/visualEntropyMockProvider.js";
import {
  ClipSandboxMockProvider,
  ClipSandboxProvider,
  findNeighborsFromPixelBytes,
  getPixelBytesForQuery,
} from "./providers/clipSandboxProvider.js";
import { OpenAIEmbeddingProvider } from "./providers/openaiProvider.js";
import { validateEmbeddingCandidate } from "./embeddingGovernance.js";
import { findModularTopology } from "../topology/registry.js";
import { ResolvedTopology } from "../topology/topologyTypes.js";
import { CandidateHistoryEntry, Modality } from "../provenanceTypes.js";
import { prebindFromQuery } from "../multimodal/namespacePrebinding.js";
import {
  getArbitrationEngine,
  ArbitrationCandidate,
} from "../multimodal/crossModalArbitrationEngine.js";
import type { ArbitrationResult } from "../multimodal/crossModalArbitrationEngine.js";

/**
 * semanticNeighborhoodEngine.ts
 * Phase 8A: Collect-all-then-arbitrate multimodal discovery.
 */

export interface NeighborhoodResult {
  acceptedNode: ResolvedTopology | null;
  history: CandidateHistoryEntry[];
  entropyScore: number;
  visualEntropyScore: number;
  arbitration?: ArbitrationResult;
}

export class SemanticNeighborhoodEngine {
  private providers: EmbeddingProvider[];

  constructor() {
    this.providers = [
      new OpenAIEmbeddingProvider(),
      new HighEntropyMockProvider(),
      new ClipSandboxMockProvider(),
      new ClipSandboxProvider(),
      new VisualEntropyMockProvider(),
      new MockEmbeddingProvider(),
    ];
  }

  async discover(
    query: string,
    mediaLens: string,
    depth: number = 0,
    franchiseHint?: string
  ): Promise<NeighborhoodResult> {
    const history: CandidateHistoryEntry[] = [];
    const prebind = prebindFromQuery(query, mediaLens, franchiseHint);
    const arbitrationCandidates: ArbitrationCandidate[] = [];

    const activeModalities: Modality[] = ["text", "image"];
    let totalEntropy = 0;
    let visualEntropy = 0;
    let modalityCount = 0;

    for (const modality of activeModalities) {
      const providers = this.selectProviders(modality);
      let rawCandidates: SemanticCandidate[] = [];
      let provider: EmbeddingProvider | undefined;

      for (const p of providers) {
        const found = await p.findNeighbors(query, 5);
        if (found.length > 0) {
          rawCandidates = found;
          provider = p;
          break;
        }
      }

      if (
        modality === "image" &&
        typeof process !== "undefined" &&
        process.env?.NERDVANA_CLIP_PIXELS === "1"
      ) {
        const pixelBytes = getPixelBytesForQuery(query);
        if (pixelBytes) {
          let pixelNeighbors: SemanticCandidate[] = [];
          try {
            pixelNeighbors = await findNeighborsFromPixelBytes(pixelBytes, 5);
          } catch {
            pixelNeighbors = [];
          }
          if (pixelNeighbors.length > 0) {
            const merged = new Map<string, SemanticCandidate>();
            for (const c of [...rawCandidates, ...pixelNeighbors]) {
              const prev = merged.get(c.id);
              if (!prev || c.score > prev.score) merged.set(c.id, c);
            }
            rawCandidates = Array.from(merged.values()).sort((a, b) => b.score - a.score);
            provider = provider ?? this.providers.find((p) => p.mode === "clip_sandbox");
          }
        }
      }

      if (rawCandidates.length === 0 || !provider) continue;

      const modalityEntropy = this.calculateEntropy(rawCandidates);
      totalEntropy += modalityEntropy;
      modalityCount++;
      if (modality === "image") visualEntropy = modalityEntropy;

      for (const candidate of rawCandidates) {
        const topologyNode = findModularTopology(candidate.id, mediaLens, true);

        if (!topologyNode) {
          history.push({
            stage: "embedding_neighbor",
            modality: candidate.modality,
            source: provider.mode,
            candidate: candidate.id,
            similarityScore: candidate.score,
            entropySource: (candidate.entropySource as any) ?? "none",
            accepted: false,
            reason: "Candidate not found in deterministic topology registry",
            governanceFailureType: "semantic_false_neighbor",
          });
          continue;
        }

        const govResult = validateEmbeddingCandidate(
          candidate,
          topologyNode,
          mediaLens,
          query,
          depth,
          modalityEntropy,
          prebind
        );

        history.push({
          stage: "embedding_neighbor",
          modality: candidate.modality,
          source: provider.mode,
          candidate: candidate.id,
          similarityScore: candidate.score,
          entropySource: (candidate.entropySource as any) ?? "none",
          accepted: govResult.accepted,
          reason: govResult.reason,
          governanceFailureType: govResult.failureType,
          namespace: topologyNode.id.split("::")[0],
          continuity: topologyNode.continuity ?? undefined,
        });

        arbitrationCandidates.push({
          topologyNode,
          modality: candidate.modality,
          similarityScore: candidate.score,
          providerMode: provider.mode,
          entropySource: candidate.entropySource,
          governancePassed: govResult.accepted,
          governanceReason: govResult.reason,
          governanceFailureType: govResult.failureType,
        });
      }
    }

    const entropyScore =
      modalityCount > 0 ? totalEntropy / modalityCount : 0;

    const arbitration = getArbitrationEngine().arbitrate(
      arbitrationCandidates,
      prebind,
      query,
      mediaLens,
      entropyScore
    );

    history.push(...arbitration.history);

    return {
      acceptedNode: arbitration.accepted,
      history,
      entropyScore,
      visualEntropyScore: visualEntropy,
      arbitration,
    };
  }

  private selectProviders(modality: Modality): EmbeddingProvider[] {
    if (modality === "image") {
      const chain: EmbeddingProvider[] = [];
      const useClip =
        typeof process !== "undefined" &&
        process.env?.NERDVANA_CLIP_SANDBOX === "1";
      if (useClip) {
        const clip = this.providers.find((p) => p.mode === "clip_sandbox");
        if (clip) chain.push(clip);
      }
      const clipMock = this.providers.find((p) => p.mode === "clip_sandbox_mock");
      const visualMock = this.providers.find((p) => p.mode === "visual_entropy_mock");
      if (clipMock) chain.push(clipMock);
      if (visualMock) chain.push(visualMock);
      return chain;
    }

    let textProvider = this.providers.find(
      (p) => p.mode === "real_provider" && (p as { apiKey?: string }).apiKey
    );
    if (!textProvider) {
      textProvider = this.providers.find((p) => p.mode === "high_entropy_mock");
    }
    return textProvider ? [textProvider] : [];
  }

  private calculateEntropy(candidates: SemanticCandidate[]): number {
    if (candidates.length <= 1) return 0;

    const scores = candidates.map((c) => c.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;

    return Math.min(1.0, variance * 10);
  }
}

let neighborhoodEngine: SemanticNeighborhoodEngine | null = null;
export function getNeighborhoodEngine(): SemanticNeighborhoodEngine {
  if (!neighborhoodEngine) {
    neighborhoodEngine = new SemanticNeighborhoodEngine();
  }
  return neighborhoodEngine;
}
