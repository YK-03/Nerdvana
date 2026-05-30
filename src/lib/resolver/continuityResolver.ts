import { getTopologyEngine } from "./topology/inheritanceEngine.js";
import { getRelationship } from "./topologyIntelligence.js";
import type { ResolvedTopology } from "./topology/topologyTypes.js";

export interface ContinuityResolution {
  currentNode: ResolvedTopology;
  previousNode: ResolvedTopology | null;
  continuitySource: "inherited" | "pivoted" | "direct";
  inheritedUniverse: string | null;
  relationshipPath?: string;
}

/**
 * Continuity Resolver (Section 5)
 * Handles follow-up queries to inherit active universes or deterministically pivot.
 */
export function resolveContinuity(
  currentQuery: string,
  currentNode: ResolvedTopology,
  previousNodeId?: string | null
): ContinuityResolution {
  const engine = getTopologyEngine();
  const prevNode = previousNodeId ? engine.resolve(previousNodeId) : null;

  if (!prevNode) {
    return {
      currentNode,
      previousNode: null,
      continuitySource: "direct",
      inheritedUniverse: null,
    };
  }

  // Determine if they belong to the same franchise family
  const sameFranchise =
    prevNode.parentFranchise.toLowerCase() === currentNode.parentFranchise.toLowerCase() ||
    (prevNode.baseId && prevNode.baseId === currentNode.baseId) ||
    prevNode.id === currentNode.baseId ||
    currentNode.id === prevNode.baseId;

  if (!sameFranchise) {
    // Entirely separate franchises: resolve directly, do not inherit
    return {
      currentNode,
      previousNode: prevNode,
      continuitySource: "direct",
      inheritedUniverse: null,
    };
  }

  // Scan query for explicit pivot keywords (Section 3)
  const qLower = currentQuery.toLowerCase();
  const PIVOT_TOKENS = [
    "comics",
    "comic version",
    "original",
    "manga",
    "tv show",
    "live action",
    "reboot",
    "movie version",
    "books",
    "novel",
    "netflix",
    "game",
    "show",
    "comics version"
  ];

  const hasPivotToken = PIVOT_TOKENS.some(token => qLower.includes(token));

  // Pivot Rule: Pivot if explicit tokens suggest a transition and we resolved to a different node
  if (hasPivotToken && currentNode.id !== prevNode.id) {
    const rel = getRelationship(currentNode.id, prevNode.id);
    return {
      currentNode,
      previousNode: prevNode,
      continuitySource: "pivoted",
      inheritedUniverse: currentNode.universe,
      relationshipPath: rel
        ? `${currentNode.canonicalEntity} (${currentNode.continuityType}) is a ${rel.type} of ${prevNode.canonicalEntity} (${prevNode.continuityType})`
        : `${currentNode.canonicalEntity} is in a different continuity than ${prevNode.canonicalEntity}`,
    };
  }

  // Preservation Rule: Retain previous continuity when active variant is stable and no explicit pivot token
  if (currentNode.id !== prevNode.id && !hasPivotToken) {
    const preserved = engine.resolve(prevNode.id);
    if (preserved) {
      return {
        currentNode: preserved,
        previousNode: prevNode,
        continuitySource: "inherited",
        inheritedUniverse: preserved.universe,
      };
    }
  }

  // Default: same node, keep continuity
  return {
    currentNode,
    previousNode: prevNode,
    continuitySource: "inherited",
    inheritedUniverse: currentNode.universe,
  };
}
