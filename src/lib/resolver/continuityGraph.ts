import { classifyComicsQueryType, normalizeComicVineResourceType } from "./providerMetadata.js";

export type ContinuityNode = {
  providerId: string;
  providerType: string;
  canonicalTitle: string;
  publisher?: string;
  universe?: string;
  continuity?: string;
  franchiseRoot?: string;
};

export type ContinuityEdge =
  | "same_universe"
  | "same_event"
  | "same_arc"
  | "same_character"
  | "same_team"
  | "same_publisher"
  | "alternate_continuity"
  | "multiverse_variant"
  | "adaptation";

export interface ContinuityEdgeDetails {
  from: string;
  to: string;
  type: ContinuityEdge;
  strength: number;
  source: "provider" | "inferred";
}

export class ContinuityGraph {
  private nodes: Map<string, ContinuityNode> = new Map();
  private edges: Map<string, ContinuityEdgeDetails[]> = new Map();

  constructor() {
    console.log("[CONTINUITY_GRAPH_NODE] Continuity Graph initialized.");
  }

  public addNode(node: ContinuityNode) {
    if (!this.nodes.has(node.providerId)) {
      this.nodes.set(node.providerId, node);
      console.log(`[CONTINUITY_GRAPH_NODE] Node added: "${node.canonicalTitle}" (${node.providerType})`);
    }
  }

  public addEdge(fromId: string, toId: string, type: ContinuityEdge, strength: number = 1.0, source: "provider" | "inferred" = "provider") {
    // Semantic systems are read-only: check source
    if (source !== "provider" && source !== "inferred") {
      console.warn(`[SEMANTIC_ENRICHMENT_ONLY] Rejected raw edge generation from unknown source: ${source}`);
      return;
    }

    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (!fromNode || !toNode) return;

    if (!this.edges.has(fromId)) {
      this.edges.set(fromId, []);
    }
    const currentEdges = this.edges.get(fromId)!;
    const exists = currentEdges.some(e => e.to === toId && e.type === type);
    if (!exists) {
      currentEdges.push({ from: fromId, to: toId, type, strength, source });
      console.log(`[CONTINUITY_EDGE_CREATED] Edge created: "${fromNode.canonicalTitle}" --[${type}]--> "${toNode.canonicalTitle}" (strength: ${strength}, source: ${source})`);
    }
  }

  public getNode(providerId: string): ContinuityNode | undefined {
    return this.nodes.get(providerId);
  }

  public getNeighbors(providerId: string, allowedEdges?: Set<ContinuityEdge>): { node: ContinuityNode; edge: ContinuityEdgeDetails }[] {
    const nodeEdges = this.edges.get(providerId) || [];
    const result: { node: ContinuityNode; edge: ContinuityEdgeDetails }[] = [];

    for (const edge of nodeEdges) {
      if (allowedEdges && !allowedEdges.has(edge.type)) continue;
      const target = this.nodes.get(edge.to);
      if (target) {
        result.push({ node: target, edge });
      }
    }

    // Rank neighbors:
    // 1. Provider-native edges outrank inferred edges
    // 2. Stronger edge strength outranks weaker
    return result.sort((a, b) => {
      if (a.edge.source !== b.edge.source) {
        return a.edge.source === "provider" ? -1 : 1;
      }
      return b.edge.strength - a.edge.strength;
    });
  }

  public clear() {
    this.nodes.clear();
    this.edges.clear();
  }
}

export const continuityGraphInstance = new ContinuityGraph();

/**
 * Calculates the multiverse boundary resistance (0.0 to 1.0) defining the graded cosmological distance.
 */
export function getMultiverseBoundaryStrength(from: ContinuityNode, to: ContinuityNode): number {
  const mainContinuities = new Set(["earth-616", "prime dc", "mainline continuity", "prime", "main continuity"]);
  const fromContinuity = (from.continuity || from.universe || "").toLowerCase();
  const toContinuity = (to.continuity || to.universe || "").toLowerCase();

  const isFromMain = mainContinuities.has(fromContinuity) || fromContinuity.includes("616") || fromContinuity.includes("prime");
  const isToMain = mainContinuities.has(toContinuity) || toContinuity.includes("616") || toContinuity.includes("prime");

  if (isFromMain === isToMain) return 0.0; // Same category, no boundary resistance

  // Parody boundary has supreme resistance
  if (fromContinuity.includes("parody") || toContinuity.includes("parody") || fromContinuity.includes("spoof") || toContinuity.includes("spoof")) {
    return 0.95;
  }

  // Elseworld / alternate timeline has medium-high resistance
  if (fromContinuity.includes("elseworld") || toContinuity.includes("elseworld") || fromContinuity.includes("ultimate") || toContinuity.includes("ultimate")) {
    return 0.70;
  }

  return 0.40; // Default boundary resistance
}

/**
 * Validates a continuity traversal jump with cooldown protection, cap depth, and cost accumulation.
 */
export function isValidContinuityTraversal(
  from: ContinuityNode,
  to: ContinuityNode,
  edgeDetails: ContinuityEdgeDetails,
  visitedProviderIds: Set<string> = new Set(),
  currentDepth: number = 0,
  currentCost: number = 0
): { valid: boolean; cost: number; reason?: string } {
  const MAX_CONTINUITY_DEPTH = 2;

  // 1. Loop and circular cooldown protection
  if (visitedProviderIds.has(to.providerId)) {
    console.log(`[CONTINUITY_TRAVERSAL_BLOCKED] Traversal circular loop prevented for "${to.canonicalTitle}"`);
    return { valid: false, cost: currentCost, reason: "circular_loop_prevented" };
  }

  // 2. Traversal depth limit check
  if (currentDepth >= MAX_CONTINUITY_DEPTH) {
    console.log(`[CONTINUITY_TRAVERSAL_BLOCKED] Traversal depth limit exceeded (max: ${MAX_CONTINUITY_DEPTH})`);
    return { valid: false, cost: currentCost, reason: "depth_limit_exceeded" };
  }

  // 3. Quarantined adaptation edges must NEVER participate in ranking/canon transitions
  if (edgeDetails.type === "adaptation") {
    console.log(`[CONTINUITY_TRAVERSAL_BLOCKED] Adaptation edge quarantined to informational only: "${from.canonicalTitle}" -> "${to.canonicalTitle}"`);
    return { valid: false, cost: currentCost, reason: "adaptation_quarantined" };
  }

  // 4. Publisher boundary check
  if (from.publisher && to.publisher && from.publisher.toLowerCase() !== to.publisher.toLowerCase()) {
    if (edgeDetails.type !== "adaptation" && edgeDetails.type !== "multiverse_variant") {
      console.log(`[CONTINUITY_TRAVERSAL_BLOCKED] Traversal publisher mismatch rejected: ${from.publisher} -> ${to.publisher}`);
      return { valid: false, cost: currentCost, reason: "publisher_mismatch" };
    }
  }

  // 5. Type-safe graph transitions
  if (from.providerType === "event") {
    const allowedEventEdges = new Set(["same_event", "same_universe", "same_arc"]);
    if (!allowedEventEdges.has(edgeDetails.type)) {
      console.log(`[CONTINUITY_TRAVERSAL_BLOCKED] Unallowed event transition: ${edgeDetails.type}`);
      return { valid: false, cost: currentCost, reason: `unallowed_event_transition:${edgeDetails.type}` };
    }
  }

  if (from.providerType === "character") {
    const allowedCharEdges = new Set(["same_team", "same_arc", "same_universe", "same_character", "multiverse_variant", "adaptation"]);
    if (!allowedCharEdges.has(edgeDetails.type)) {
      console.log(`[CONTINUITY_TRAVERSAL_BLOCKED] Unallowed character transition: ${edgeDetails.type}`);
      return { valid: false, cost: currentCost, reason: `unallowed_character_transition:${edgeDetails.type}` };
    }
  }

  // 6. Multiverse boundary resistance cost calculation
  const boundaryStrength = getMultiverseBoundaryStrength(from, to);
  let traversalCost = 10; // Base traversal cost
  if (boundaryStrength > 0.0) {
    traversalCost += Math.round(boundaryStrength * 100);
    console.log(`[MULTIVERSE_BOUNDARY_BLOCKED] Graded multiverse boundary resistance applied: ${boundaryStrength} (additional cost: ${Math.round(boundaryStrength * 100)})`);
  }

  const finalCost = currentCost + traversalCost;

  console.log(`[CONTINUITY_TRAVERSAL_ALLOWED] Traversal allowed from "${from.canonicalTitle}" to "${to.canonicalTitle}" via edge "${edgeDetails.type}" (cost accumulated: ${finalCost})`);
  return { valid: true, cost: finalCost };
}

/**
 * Validates related entity expansion integrity.
 */
export function validateContinuityExpansion(
  fromNode: ContinuityNode,
  candidateNode: ContinuityNode,
  edgeDetails: ContinuityEdgeDetails,
  visited: Set<string> = new Set()
): boolean {
  console.log(`[CONTINUITY_INTEGRITY_VALIDATED] Validating continuity expansion: "${fromNode.canonicalTitle}" -> "${candidateNode.canonicalTitle}"`);
  const check = isValidContinuityTraversal(fromNode, candidateNode, edgeDetails, visited);
  return check.valid;
}

/**
 * Hydrates active node continuity neighborhoods directly from ComicVine API results (LAZY).
 */
export function hydrateContinuityGraphFromComicVine(
  mainId: string,
  rawData: any,
  graph: ContinuityGraph = continuityGraphInstance
) {
  if (!rawData) return;
  const parts = mainId.split("::");
  const mainType = parts[1];
  const mainNodeId = mainId;

  const mainNode: ContinuityNode = {
    providerId: mainNodeId,
    providerType: mainType,
    canonicalTitle: rawData.name ?? "Unknown",
    publisher: rawData.publisher?.name,
    continuity: rawData.start_year ? String(rawData.start_year) : undefined,
    franchiseRoot: rawData.name ? rawData.name.split(/[:\- ]/)[0].toLowerCase() : undefined,
  };
  graph.addNode(mainNode);

  // 1. Publisher Relationship
  if (rawData.publisher) {
    const pubId = `comicvine::publisher::${rawData.publisher.id || 'unknown'}`;
    const pubNode: ContinuityNode = {
      providerId: pubId,
      providerType: "publisher",
      canonicalTitle: rawData.publisher.name,
      publisher: rawData.publisher.name,
    };
    graph.addNode(pubNode);
    graph.addEdge(mainNodeId, pubId, "same_publisher", 1.0, "provider");
    console.log(`[GRAPH_RELATIONSHIP_EXPANDED] Publisher relationship expanded for "${mainNode.canonicalTitle}": same_publisher -> "${pubNode.canonicalTitle}"`);
  }

  // 2. Teams Relationships
  const teams = rawData.teams || [];
  for (const t of teams) {
    const teamId = `comicvine::team::${t.id}`;
    const teamNode: ContinuityNode = {
      providerId: teamId,
      providerType: "team",
      canonicalTitle: t.name,
      publisher: mainNode.publisher,
    };
    graph.addNode(teamNode);
    graph.addEdge(mainNodeId, teamId, "same_team", 1.0, "provider");
    console.log(`[GRAPH_RELATIONSHIP_EXPANDED] Team relationship expanded for "${mainNode.canonicalTitle}": same_team -> "${teamNode.canonicalTitle}"`);
  }

  // 3. Concepts (Universe/Events) Relationships
  const concepts = rawData.concepts || [];
  for (const c of concepts) {
    const conceptId = `comicvine::concept::${c.id}`;
    const isUniverse = c.name?.toLowerCase().includes("universe") || c.name?.toLowerCase().includes("earth");
    const edgeType = isUniverse ? "same_universe" : "same_arc";
    const conceptNode: ContinuityNode = {
      providerId: conceptId,
      providerType: isUniverse ? "universe" : "concept",
      canonicalTitle: c.name,
      publisher: mainNode.publisher,
    };
    graph.addNode(conceptNode);
    graph.addEdge(mainNodeId, conceptId, edgeType, 1.0, "provider");
    console.log(`[GRAPH_RELATIONSHIP_EXPANDED] Concept relationship expanded for "${mainNode.canonicalTitle}": ${edgeType} -> "${conceptNode.canonicalTitle}"`);
  }

  // 4. Character Credits
  const characters = rawData.character_credits || [];
  for (const char of characters) {
    const charId = `comicvine::character::${char.id}`;
    const charNode: ContinuityNode = {
      providerId: charId,
      providerType: "character",
      canonicalTitle: char.name,
      publisher: mainNode.publisher,
    };
    graph.addNode(charNode);
    graph.addEdge(mainNodeId, charId, "same_character", 1.0, "provider");
  }

  // 5. Volume Credits
  const volumes = rawData.volume_credits || [];
  for (const vol of volumes) {
    const volId = `comicvine::volume::${vol.id}`;
    const volNode: ContinuityNode = {
      providerId: volId,
      providerType: "volume",
      canonicalTitle: vol.name,
      publisher: mainNode.publisher,
    };
    graph.addNode(volNode);
    graph.addEdge(mainNodeId, volId, "alternate_continuity", 0.8, "provider");
  }
}

/**
 * Dynamically constructs related follow-up suggestion queries by querying the active node's neighbors in the ContinuityGraph.
 */
export function buildContinuityFollowups(providerId: string, canonicalTitle: string): string[] {
  const neighbors = continuityGraphInstance.getNeighbors(providerId);
  const followups: string[] = [];

  if (neighbors.length > 0) {
    // Take up to 3 neighbors
    for (const neighbor of neighbors.slice(0, 3)) {
      const edgeType = neighbor.edge.type;
      const title = neighbor.node.canonicalTitle;

      if (edgeType === "same_team") {
        followups.push(`What is the role of "${canonicalTitle}" in the "${title}" team?`);
      } else if (edgeType === "same_publisher") {
        followups.push(`What are other major canonical works published by "${title}"?`);
      } else if (edgeType === "same_universe") {
        followups.push(`How does "${title}" shape the active universe of "${canonicalTitle}"?`);
      } else {
        followups.push(`Can you explain the canonical connection between "${canonicalTitle}" and "${title}"?`);
      }
    }
  }

  // Fallback if neighbors are less than 3
  if (followups.length < 3) {
    followups.push(`Can you explain the key events behind "${canonicalTitle}"?`);
  }
  if (followups.length < 3) {
    followups.push(`What are the strongest fan theories related to "${canonicalTitle}"?`);
  }
  if (followups.length < 3) {
    followups.push(`Which sources are most reliable for "${canonicalTitle}" canon details?`);
  }

  return followups.slice(0, 3);
}
