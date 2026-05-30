/**
 * topologyModel.ts
 * 
 * Defines the richer semantic topology layer for Nerdvana.
 */

export type ContinuityType = 
  | "prime"
  | "reboot"
  | "adaptation"
  | "crossover"
  | "variant"
  | "legacy";

export interface SemanticIdentityTopology {
  canonicalEntity: string;
  franchise: string;
  universe?: string;
  continuity?: string;
  continuityType?: ContinuityType;
  mediaDomains?: string[];
  aliases?: string[];
  variants?: string[];
  relatedEntities?: string[];
  crossoverAffiliations?: string[];
  timelineDescriptors?: string[];
  visualAnchors?: string[];
}

/**
 * Continuity-aware alias definition.
 */
export interface ContextualAlias {
  alias: string;
  canonicalEntity: string;
  priorityFranchise?: string;
  priorityUniverse?: string;
  mediaDomainConstraints?: string[];
}
