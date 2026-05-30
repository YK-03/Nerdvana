/**
 * franchiseContextRegistry.ts
 *
 * Structured hierarchy for Nerdvana's deterministic semantic grounding.
 * Maps entities to their parent franchises, universes, and media domains.
 */

export interface FranchiseContext {
  entity: string;
  parentFranchise: string;
  universe?: string;
  mediaDomains?: string[]; // e.g. ["comics", "movies", "tv", "games", "anime"]
  aliases?: string[];
  relatedEntities?: string[];
  visualAnchors?: string[];
}

export const FRANCHISE_REGISTRY: FranchiseContext[] = [
  // --- DC Universe ---
  {
    entity: "Joker DC Comics",
    parentFranchise: "Batman",
    universe: "DC Universe",
    mediaDomains: ["comics"],
    aliases: ["joker", "clown prince of crime"],
    visualAnchors: ["batman", "gotham", "dc comics"],
  },
  {
    entity: "Joker (2019)",
    parentFranchise: "Joker",
    universe: "DC Elseworlds",
    mediaDomains: ["movies"],
    aliases: ["arthur fleck", "joker", "joker movie"],
    visualAnchors: ["joaquin phoenix", "red suit"],
  },
  {
    entity: "The Flash TV Series",
    parentFranchise: "The Flash",
    universe: "Arrowverse",
    mediaDomains: ["tv"],
    aliases: ["barry allen", "grant gustin"],
    visualAnchors: ["central city", "star labs"],
  },
  {
    entity: "The Flash",
    parentFranchise: "The Flash",
    universe: "DC Universe",
    mediaDomains: ["movies", "comics"],
    aliases: ["flash"],
  },

  // --- Marvel Universe ---
  {
    entity: "Spider-Man Marvel Comics",
    parentFranchise: "Spider-Man",
    universe: "Marvel 616",
    mediaDomains: ["comics"],
    aliases: ["spiderman", "peter parker"],
  },
  {
    entity: "Marvel's Spider-Man",
    parentFranchise: "Spider-Man",
    universe: "Marvel's Spider-Man Insomniac",
    mediaDomains: ["games"],
    aliases: ["ps5 spider-man"],
    visualAnchors: ["insomniac games", "advanced suit"],
  },
  {
    entity: "Loki",
    parentFranchise: "Marvel Cinematic Universe",
    universe: "MCU",
    mediaDomains: ["tv", "movies"],
    aliases: ["god of mischief"],
  },

  // --- Gaming Franchises ---
  {
    entity: "Halo",
    parentFranchise: "Halo",
    universe: "Halo Universe",
    mediaDomains: ["games"],
    visualAnchors: ["unsc", "spartan", "cortana"],
  },
  {
    entity: "Halo TV Series",
    parentFranchise: "Halo",
    universe: "Silver Timeline",
    mediaDomains: ["tv"],
    visualAnchors: ["master chief", "paramount+"],
  },
  {
    entity: "Master Chief",
    parentFranchise: "Halo",
    universe: "Halo Universe",
    mediaDomains: ["games", "tv"],
    aliases: ["john-117", "chief"],
  },
  {
    entity: "DOOM",
    parentFranchise: "DOOM",
    universe: "Doom Universe",
    mediaDomains: ["games"],
    aliases: ["doomguy", "doom slayer"],
  },
  {
    entity: "Persona 5",
    parentFranchise: "Persona",
    universe: "Shin Megami Tensei",
    mediaDomains: ["games"],
    aliases: ["p5", "phantom thieves"],
  },
  {
    entity: "Carl Johnson",
    parentFranchise: "Grand Theft Auto: San Andreas",
    universe: "HD Universe",
    mediaDomains: ["games"],
    aliases: ["cj"],
  },
  {
    entity: "Sonic the Hedgehog",
    parentFranchise: "Sonic the Hedgehog",
    universe: "Sonic Universe",
    mediaDomains: ["games", "movies", "tv", "anime"],
    aliases: ["blue blur"],
  },

  // --- Anime / Manga ---
  {
    entity: "Eren Yeager",
    parentFranchise: "Attack on Titan",
    universe: "AOT Universe",
    mediaDomains: ["anime", "comics"],
    aliases: ["eren"],
  },
  {
    entity: "Light Yagami",
    parentFranchise: "Death Note",
    universe: "Death Note Universe",
    mediaDomains: ["anime", "comics", "movies"],
    aliases: ["kira"],
  },
  {
    entity: "Johan Liebert",
    parentFranchise: "Monster",
    universe: "Monster Universe",
    mediaDomains: ["anime", "comics"],
    aliases: ["johan"],
  },
  {
    entity: "Satoru Gojo",
    parentFranchise: "Jujutsu Kaisen",
    universe: "JJK Universe",
    mediaDomains: ["anime", "comics"],
    aliases: ["gojo"],
  },

  // --- Independents / Others ---
  {
    entity: "Spawn",
    parentFranchise: "Spawn",
    universe: "Image Universe",
    mediaDomains: ["comics"],
    aliases: ["al simmons"],
  },
  // --- New Core Registrations (Phase 10.6 Survivability) ---
  {
    entity: "The Matrix",
    parentFranchise: "The Matrix",
    universe: "Matrix Universe",
    mediaDomains: ["movies"],
    aliases: ["matrix", "the matrix movie", "the matrix (1999)"],
  },
  {
    entity: "Pulp Fiction",
    parentFranchise: "Pulp Fiction",
    universe: "Tarantino Universe",
    mediaDomains: ["movies"],
    aliases: ["pulp fiction movie"],
  },
  {
    entity: "John Wick",
    parentFranchise: "John Wick",
    universe: "John Wick Universe",
    mediaDomains: ["movies"],
    aliases: ["john wick movie", "baba yaga"],
  },
  {
    entity: "Attack on Titan",
    parentFranchise: "Attack on Titan",
    universe: "AoT Universe",
    mediaDomains: ["anime", "comics"],
    aliases: ["attack on titan anime", "aot", "shingeki no kyojin"],
  },
  {
    entity: "Superman",
    parentFranchise: "Superman",
    universe: "DC Universe",
    mediaDomains: ["comics", "movies", "tv"],
    aliases: ["man of steel", "kal-el", "clark kent"],
  },
  {
    entity: "Death Note",
    parentFranchise: "Death Note",
    universe: "Death Note Universe",
    mediaDomains: ["anime", "comics"],
    aliases: ["death note anime", "kira"],
  },
];

/**
 * Helper to find context in the registry.
 * Prioritizes exact matches, then alias matches.
 */
export function findFranchiseContext(
  entity: string,
  mediaDomain?: string
): FranchiseContext | null {
  const norm = entity.toLowerCase();
  
  // Try exact entity match with domain filter
  let match = FRANCHISE_REGISTRY.find(ctx => 
    ctx.entity.toLowerCase() === norm && 
    (!mediaDomain || ctx.mediaDomains?.includes(mediaDomain))
  );

  if (match) return match;

  // Try alias match
  match = FRANCHISE_REGISTRY.find(ctx => 
    ctx.aliases?.some(a => a.toLowerCase() === norm) &&
    (!mediaDomain || ctx.mediaDomains?.includes(mediaDomain))
  );

  return match || null;
}
