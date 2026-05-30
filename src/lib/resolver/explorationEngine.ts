import type { MediaLens } from "../../app/mediaLens.js";
import { getLensTopology } from "./topology/registry.js";
import type { ExplorationRecommendation } from "../../app/store/explorationSession.js";

const MIN_EXPLORATION_CONFIDENCE = 0.65;

export interface ExplorationTrace {
  themesSelected: string[];
  recommendationSource: string;
  rejectedCandidates: number;
  confidence: number;
  lensUsed: MediaLens;
}

export interface ExplorationResult {
  themes: string[];
  recommendations: ExplorationRecommendation[];
  confidence: number;
  trace: ExplorationTrace;
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

export function runExploration(query: string, lens: MediaLens): ExplorationResult {
  const normQuery = normalize(query);
  const topology = getLensTopology()[lens] || [];
  
  let rejectedCandidates = 0;
  const scoredCandidates: Array<{ node: any; score: number; themes: string[] }> = [];

  for (const node of topology) {
    if (!node.mediaDomains.includes(lens)) {
      rejectedCandidates++;
      continue;
    }

    let score = 0;
    const themes: string[] = [];

    // Simple thematic matching against basic metadata
    const searchableMetadata = [
      ...(node.mediaDomains || []),
      ...(node.universe ? [node.universe] : []),
      ...(node.continuity ? [node.continuity] : []),
      ...(node.parentFranchise ? [node.parentFranchise] : [])
    ].map(normalize);

    for (const term of searchableMetadata) {
      if (term && normQuery.includes(term)) {
        score += 0.4;
        themes.push(term);
      }
    }

    // Genre/Theme signals in query
    const explorationSignals = ["dark", "psychological", "scifi", "sci-fi", "freedom", "philosophical", "villain"];
    for (const signal of explorationSignals) {
      if (normQuery.includes(signal)) {
        themes.push(signal);
        score += 0.3; // LLM will curate this further
      }
    }

    if (score > 0) {
      scoredCandidates.push({ node, score, themes });
    } else {
      rejectedCandidates++;
    }
  }

  scoredCandidates.sort((a, b) => b.score - a.score);

  const topCandidates = scoredCandidates.slice(0, 5);
  const confidence = topCandidates.length > 0 ? Math.min(1.0, topCandidates[0].score) : 0;

  if (confidence < MIN_EXPLORATION_CONFIDENCE) {
    return {
      themes: [],
      recommendations: [],
      confidence,
      trace: {
        themesSelected: [],
        recommendationSource: "explorationEngine",
        rejectedCandidates,
        confidence,
        lensUsed: lens
      }
    };
  }

  const recommendations = topCandidates.map(c => ({
    title: c.node.canonicalEntity,
    reason: "", // To be filled by LLM
    themes: Array.from(new Set(c.themes)),
    confidence: c.score,
    lens
  }));

  const allThemes = Array.from(new Set(topCandidates.flatMap(c => c.themes)));

  return {
    themes: allThemes,
    recommendations,
    confidence,
    trace: {
      themesSelected: allThemes,
      recommendationSource: "explorationEngine",
      rejectedCandidates,
      confidence,
      lensUsed: lens
    }
  };
}
