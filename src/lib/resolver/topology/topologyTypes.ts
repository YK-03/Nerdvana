/**
 * topologyTypes.ts
 * 
 * Scalable semantic topology types for Phase 4.
 */

export type ContinuityType = 
  | "prime"
  | "reboot"
  | "adaptation"
  | "crossover"
  | "variant"
  | "legacy";

export type AliasOrigin =
  | "direct"
  | "inherited"
  | "franchise"
  | "semantic";

export interface AliasDescriptor {
  value: string;
  origin: AliasOrigin;
}

export interface BaseIdentity {
  name: string;
  aliases?: string[];
  description?: string;
  mediaDomains?: string[];
}

export interface SemanticTopologyNode {
  id: string; // Qualified name: e.g. "Marvel::Spider-Man::MCU"
  baseId?: string; // Reference to another node or base identity
  parentFranchise?: string;
  universe?: string;
  continuity?: string;
  continuityType?: ContinuityType;
  canonicalEntity?: string; // Optional canonical entity name override (e.g. "Joker" instead of last ID part)
  
  // Specific traits (can override inherited ones)
  traits?: {
    mediaDomains?: string[];
    aliases?: string[];
    visualAnchors?: string[];
    crossoverAffiliations?: string[];
  };
}

export interface ResolvedTopology {
  id: string;
  canonicalEntity: string;
  parentFranchise: string;
  universe: string | null;
  continuity: string | null;
  continuityType: ContinuityType;
  mediaDomains: string[];
  aliases: string[];
  directAliases: string[];
  inheritedAliases: string[];
  aliasProvenance: AliasDescriptor[];
  visualAnchors: string[];
  crossoverAffiliations: string[];
  inheritanceDepth: number;
}
