import { SemanticTopologyNode, ResolvedTopology, ContinuityType, type AliasDescriptor } from "./topologyTypes.js";

/**
 * inheritanceEngine.ts
 * 
 * Handles deterministic semantic inheritance and topology composition.
 */

export class TopologyEngine {
  private registry: Map<string, SemanticTopologyNode> = new Map();

  register(node: SemanticTopologyNode) {
    this.registry.set(node.id, node);
  }

  resolve(id: string): ResolvedTopology | null {
    const node = this.registry.get(id);
    if (!node) return null;

    return this.compose(node);
  }

  /**
   * Composes a resolved identity by traversing the inheritance chain.
   */
  private compose(node: SemanticTopologyNode, depth: number = 0): ResolvedTopology {
    const directAliases = Array.from(new Set(node.traits?.aliases ?? []));
    const directProvenance: AliasDescriptor[] = directAliases.map((value) => ({
      value,
      origin: "direct",
    }));

    // 1. Start with defaults
    let result: ResolvedTopology = {
      id: node.id,
      canonicalEntity: node.canonicalEntity ?? "",
      parentFranchise: node.parentFranchise ?? "Unknown",
      universe: node.universe ?? null,
      continuity: node.continuity ?? null,
      continuityType: node.continuityType ?? "prime",
      mediaDomains: node.traits?.mediaDomains ?? [],
      aliases: directAliases,
      directAliases,
      inheritedAliases: [],
      aliasProvenance: directProvenance,
      visualAnchors: node.traits?.visualAnchors ?? [],
      crossoverAffiliations: node.traits?.crossoverAffiliations ?? [],
      inheritanceDepth: depth,
    };

    // 2. Resolve inheritance if baseId exists
    if (node.baseId && node.baseId !== node.id) {
      const baseNode = this.registry.get(node.baseId);
      if (baseNode) {
        const parentResolved = this.compose(baseNode, depth + 1);
        
        // Inherit but allow overrides
        result.canonicalEntity = node.canonicalEntity ?? parentResolved.canonicalEntity;
        result.parentFranchise = node.parentFranchise ?? parentResolved.parentFranchise;
        result.universe = node.universe ?? parentResolved.universe;
        result.continuity = node.continuity ?? parentResolved.continuity;
        
        // Merge arrays uniquely
        result.mediaDomains = Array.from(new Set([...parentResolved.mediaDomains, ...result.mediaDomains]));
        result.inheritedAliases = Array.from(new Set([
          ...parentResolved.directAliases,
          ...parentResolved.inheritedAliases,
        ]));
        result.aliases = Array.from(new Set([...result.directAliases, ...result.inheritedAliases]));
        result.aliasProvenance = [
          ...result.directAliases.map((value) => ({ value, origin: "direct" as const })),
          ...result.inheritedAliases.map((value) => ({ value, origin: "inherited" as const })),
        ];
        result.visualAnchors = Array.from(new Set([...parentResolved.visualAnchors, ...result.visualAnchors]));
        result.crossoverAffiliations = Array.from(new Set([...parentResolved.crossoverAffiliations, ...result.crossoverAffiliations]));
      }
    }

    // 3. Fallback for canonicalEntity if still empty
    if (!result.canonicalEntity) {
      result.canonicalEntity = node.id.split("::").pop() ?? node.id;
    }

    return result;
  }

  /**
   * Qualified name search (Namespace isolation)
   */
  search(query: string, mediaDomain?: string): ResolvedTopology[] {
    const norm = query.toLowerCase();
    const results: ResolvedTopology[] = [];

    for (const node of this.registry.values()) {
      const resolved = this.compose(node);
      
      const match = 
        resolved.id.toLowerCase().includes(norm) ||
        resolved.canonicalEntity.toLowerCase() === norm ||
        resolved.aliases.some(a => a.toLowerCase() === norm);

      if (match) {
        if (!mediaDomain || resolved.mediaDomains.includes(mediaDomain)) {
          results.push(resolved);
        }
      }
    }

    return results;
  }

  list(mediaDomain?: string): ResolvedTopology[] {
    const results: ResolvedTopology[] = [];

    for (const node of this.registry.values()) {
      const resolved = this.compose(node);
      if (!mediaDomain || resolved.mediaDomains.includes(mediaDomain)) {
        results.push(resolved);
      }
    }

    return results;
  }
}

let topologyEngine: TopologyEngine | null = null;
export function getTopologyEngine(): TopologyEngine {
  if (!topologyEngine) {
    topologyEngine = new TopologyEngine();
  }
  return topologyEngine;
}
