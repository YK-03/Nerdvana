import { getTopologyEngine } from "./inheritanceEngine.js";
import type { ResolvedTopology } from "./topologyTypes.js";
import type { MediaLens } from "../../../app/mediaLens.js";

export type LensTopology = {
  movies: ResolvedTopology[];
  anime: ResolvedTopology[];
  games: ResolvedTopology[];
  comics: ResolvedTopology[];
  tv: ResolvedTopology[];
};

let cachedLensTopology: LensTopology | null = null;

function buildLensTopology(): LensTopology {
  const engine = getTopologyEngine();
  const allNodes = engine.list();
  
  const topology: LensTopology = {
    movies: [],
    anime: [],
    games: [],
    comics: [],
    tv: []
  };

  for (const node of allNodes) {
    for (const domain of node.mediaDomains) {
      if (domain in topology) {
        topology[domain as MediaLens].push(node);
      }
    }
  }

  return topology;
}

export function getLensTopology(): LensTopology {
  if (!cachedLensTopology) {
    cachedLensTopology = buildLensTopology();
  }
  return cachedLensTopology;
}

// Import modules to register them
import "./modules/marvel.js";
import "./modules/dc.js";
import "./modules/gaming.js";
import "./modules/anime.js";

/**
 * findModularTopology
 * 
 * Entry point for qualified namespace-safe topology resolution.
 */
export function findModularTopology(
  query: string, 
  mediaDomain?: string,
  ignoreDomain: boolean = false
): ResolvedTopology | null {
  // Direct Resolution (Phase 7 Optimization)
  if (query.includes("::")) {
    const direct = getTopologyEngine().resolve(query);
    if (direct) {
      if (ignoreDomain || !mediaDomain || direct.mediaDomains.includes(mediaDomain)) {
        return direct;
      }
    }
  }

  const results = getTopologyEngine().search(query, ignoreDomain ? undefined : mediaDomain);
  
  // Deterministic selection:
  // 1. Exact ID match (Namespace match)
  // 2. Exact name match
  // 3. Alias match
  
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  // If multiple results, prioritize exact ID match
  const exactId = results.find(r => r.id.toLowerCase() === query.toLowerCase());
  if (exactId) return exactId;

  // Otherwise prioritize by inheritance depth (prefer specialized variants over bases)
  return results.sort((a, b) => b.inheritanceDepth - a.inheritanceDepth)[0];
}

export function listModularTopologies(mediaDomain?: string): ResolvedTopology[] {
  if (mediaDomain) {
    const topology = getLensTopology();
    return topology[mediaDomain as MediaLens] || [];
  }
  return getTopologyEngine().list();
}
