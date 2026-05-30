/**
 * candidateUniverseGraph.ts
 *
 * Implements a shallow Candidate Universe Graph for franchise/lens grouping.
 */

import type { MediaLens } from "../app/mediaLens.js";
import type { CanonicalGroundingResult } from "../lib/resolver/canonicalGrounding.js";

export interface CandidateUniverseNode {
  id: string;
  title: string;
  lens: MediaLens;
  franchise: string | null;
  universe: string | null;
  confidence: number;
  source: "topology" | "registry" | "api" | "ingested";
  children: CandidateUniverseNode[];
}

export interface CandidateUniverseGraph {
  root: string;
  nodes: CandidateUniverseNode[];
  franchiseGroups: Record<string, CandidateUniverseNode[]>;
  lensGroups: Record<MediaLens, CandidateUniverseNode[]>;
  totalCandidates: number;
}

export function buildCandidateGraph(
  query: string,
  lens: MediaLens,
  groundingResult: CanonicalGroundingResult | null
): CandidateUniverseGraph {
  const suggestions = groundingResult?.suggestions ?? [];
  const nodes: CandidateUniverseNode[] = [];
  const franchiseGroups: Record<string, CandidateUniverseNode[]> = {};
  const lensGroups: Record<MediaLens, CandidateUniverseNode[]> = {
    movies: [],
    tv: [],
    anime: [],
    games: [],
    comics: []
  };

  for (const suggestion of suggestions) {
    // Map suggestion source to expected node source
    let source: "topology" | "registry" | "api" | "ingested" = "api";
    if (suggestion.source === "topology") {
      source = "topology";
    } else if (suggestion.source === "registry") {
      source = "registry";
    } else if (suggestion.source === "supplemental") {
      source = "ingested";
    }

    const node: CandidateUniverseNode = {
      id: suggestion.selectionValue ?? suggestion.canonicalEntity,
      title: suggestion.displayTitle ?? suggestion.canonicalEntity,
      lens: suggestion.mediaLens,
      franchise: suggestion.franchise,
      universe: suggestion.universe,
      confidence: suggestion.score / 100, // Normalize score to 0.0-1.0
      source,
      children: [] // Shallow - no children for Phase 13
    };

    nodes.push(node);

    // Group by Franchise
    const franchiseName = suggestion.franchise ?? "Independent";
    if (!franchiseGroups[franchiseName]) {
      franchiseGroups[franchiseName] = [];
    }
    franchiseGroups[franchiseName].push(node);

    // Group by Lens
    const activeLens = suggestion.mediaLens;
    if (lensGroups[activeLens]) {
      lensGroups[activeLens].push(node);
    }
  }

  return {
    root: query,
    nodes,
    franchiseGroups,
    lensGroups,
    totalCandidates: nodes.length
  };
}
