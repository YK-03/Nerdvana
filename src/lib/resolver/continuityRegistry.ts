import { SemanticIdentityTopology, ContextualAlias } from "./topologyModel.js";

/**
 * Continuity Registry
 * Models reboot continuities, timeline variants, and media-specific incarnations.
 */

export const TOPOLOGY_REGISTRY: SemanticIdentityTopology[] = [
  // --- Spider-Man Topology ---
  {
    canonicalEntity: "Spider-Man (Marvel Comics)",
    franchise: "Spider-Man",
    universe: "Marvel 616",
    continuity: "Prime Comic",
    continuityType: "prime",
    mediaDomains: ["comics"],
    aliases: ["spiderman", "peter parker", "spidey"],
  },
  {
    canonicalEntity: "Spider-Man (MCU)",
    franchise: "Spider-Man",
    universe: "Marvel Cinematic Universe",
    continuity: "MCU Timeline",
    continuityType: "adaptation",
    mediaDomains: ["movies"],
    aliases: ["tom holland spider-man", "peter parker"],
    crossoverAffiliations: ["Avengers"],
  },
  {
    canonicalEntity: "Spider-Man (Raimi)",
    franchise: "Spider-Man",
    universe: "Raimi-verse",
    continuity: "OG Trilogy",
    continuityType: "legacy",
    mediaDomains: ["movies"],
    aliases: ["tobey maguire spider-man"],
  },

  // --- Batman Topology ---
  {
    canonicalEntity: "Batman (DC Comics)",
    franchise: "Batman",
    universe: "DC Universe",
    continuity: "Prime Comic",
    continuityType: "prime",
    mediaDomains: ["comics"],
    aliases: ["dark knight", "bruce wayne"],
  },
  {
    canonicalEntity: "Batman (Arkham)",
    franchise: "Batman",
    universe: "Arkham-verse",
    continuity: "Arkham Games",
    continuityType: "variant",
    mediaDomains: ["games"],
    aliases: ["arkham batman"],
  },
  {
    canonicalEntity: "The Batman (2022)",
    franchise: "Batman",
    universe: "Reeves-verse",
    continuity: "Reeves Reboot",
    continuityType: "reboot",
    mediaDomains: ["movies"],
    aliases: ["robert pattinson batman", "vengeance"],
  },

  // --- Flash Topology ---
  {
    canonicalEntity: "The Flash (DC Comics)",
    franchise: "The Flash",
    universe: "DC Universe",
    continuity: "Prime Comic",
    continuityType: "prime",
    mediaDomains: ["comics"],
    aliases: ["scarlet speedster", "barry allen"],
  },
  {
    canonicalEntity: "The Flash (CW)",
    franchise: "The Flash",
    universe: "Arrowverse",
    continuity: "CW Timeline",
    continuityType: "adaptation",
    mediaDomains: ["tv"],
    aliases: ["grant gustin flash"],
  },

  // --- Halo Topology ---
  {
    canonicalEntity: "Master Chief (Games)",
    franchise: "Halo",
    universe: "Halo Core Timeline",
    continuity: "Game Canon",
    continuityType: "prime",
    mediaDomains: ["games"],
    aliases: ["chief", "john-117"],
  },
  {
    canonicalEntity: "Master Chief (TV Series)",
    franchise: "Halo",
    universe: "Silver Timeline",
    continuity: "Paramount Adaptation",
    continuityType: "variant",
    mediaDomains: ["tv"],
    aliases: ["pablo schreiber chief"],
  },

  // --- Variant Identities / Crossovers ---
  {
    canonicalEntity: "Venom (Marvel Comics)",
    franchise: "Spider-Man",
    universe: "Marvel 616",
    continuity: "Prime Comic",
    continuityType: "prime",
    mediaDomains: ["comics"],
    crossoverAffiliations: ["Sinister Six"],
  },
  {
    canonicalEntity: "Venom (Sony Movie)",
    franchise: "Venom",
    universe: "Sony Spider-Man Universe",
    continuity: "Sony Movie Timeline",
    continuityType: "adaptation",
    mediaDomains: ["movies"],
    aliases: ["tom hardy venom"],
  },
];

/**
 * Contextual Alias Registry
 * Maps short or generic names to specific topology nodes based on context.
 */
export const CONTEXTUAL_ALIAS_REGISTRY: ContextualAlias[] = [
  {
    alias: "cap",
    canonicalEntity: "Captain America",
    priorityFranchise: "Avengers",
    mediaDomainConstraints: ["movies", "comics"],
  },
  {
    alias: "chief",
    canonicalEntity: "Master Chief (Games)",
    priorityFranchise: "Halo",
    mediaDomainConstraints: ["games"],
  },
  {
    alias: "spidey",
    canonicalEntity: "Spider-Man (Marvel Comics)",
    mediaDomainConstraints: ["comics"],
  },
  {
    alias: "batman",
    canonicalEntity: "Batman (DC Comics)",
    mediaDomainConstraints: ["comics"],
  },
  {
    alias: "batman",
    canonicalEntity: "The Batman (2022)",
    mediaDomainConstraints: ["movies"],
  },
];

export function findTopologyContext(
  entity: string,
  mediaDomain?: string,
  franchiseContext?: string
): SemanticIdentityTopology | null {
  const norm = entity.toLowerCase();

  // 1. Try contextual alias first
  const aliasMatch = CONTEXTUAL_ALIAS_REGISTRY.find(a => 
    a.alias === norm && 
    (!mediaDomain || a.mediaDomainConstraints?.includes(mediaDomain)) &&
    (!franchiseContext || a.priorityFranchise?.toLowerCase() === franchiseContext.toLowerCase())
  );

  const targetEntity = aliasMatch ? aliasMatch.canonicalEntity.toLowerCase() : norm;

  // 2. Exact match in topology
  let match = TOPOLOGY_REGISTRY.find(t => 
    t.canonicalEntity.toLowerCase() === targetEntity &&
    (!mediaDomain || t.mediaDomains?.includes(mediaDomain))
  );

  if (match) return match;

  // 3. Alias match in topology
  match = TOPOLOGY_REGISTRY.find(t => 
    t.aliases?.some(a => a.toLowerCase() === targetEntity) &&
    (!mediaDomain || t.mediaDomains?.includes(mediaDomain))
  );

  return match || null;
}
