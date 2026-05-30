import { getTopologyEngine } from "../inheritanceEngine.js";

/**
 * Marvel Topology Module
 */

// Base Identities
getTopologyEngine().register({
  id: "Marvel::Spider-Man::Marvel Comics",
  canonicalEntity: "Spider-Man",
  parentFranchise: "Spider-Man",
  universe: "Marvel Universe",
  traits: {
    aliases: ["Spider-Man", "Spidey", "Peter Parker"],
    mediaDomains: ["comics", "movies", "games"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Iron-Man",
  canonicalEntity: "Iron Man",
  parentFranchise: "Avengers",
  universe: "Marvel Universe",
  traits: {
    aliases: ["Iron Man", "Tony Stark"],
    mediaDomains: ["comics", "movies", "games"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Captain-America",
  canonicalEntity: "Captain America",
  parentFranchise: "Avengers",
  universe: "Marvel Universe",
  traits: {
    aliases: ["Captain America", "Cap", "Steve Rogers"],
    mediaDomains: ["comics", "movies"],
  }
});

// Continuities (Inherit from Bases)
getTopologyEngine().register({
  id: "Marvel::Spider-Man::MCU",
  baseId: "Marvel::Spider-Man::Marvel Comics",
  continuity: "MCU Timeline",
  continuityType: "adaptation",
  traits: {
    mediaDomains: ["movies"],
    aliases: ["Tom Holland Spider-Man"],
    crossoverAffiliations: ["Avengers"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Spider-Man::616",
  baseId: "Marvel::Spider-Man::Marvel Comics",
  continuity: "Prime Comic",
  continuityType: "prime",
  traits: {
    mediaDomains: ["comics"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Loki",
  parentFranchise: "Marvel Cinematic Universe",
  universe: "MCU",
  continuity: "MCU Timeline",
  continuityType: "adaptation",
  traits: {
    aliases: ["Loki", "God of Mischief"],
    mediaDomains: ["tv", "movies"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Punisher",
  parentFranchise: "Punisher",
  universe: "Marvel Universe",
  traits: {
    aliases: ["Punisher", "Frank Castle"],
    mediaDomains: ["comics", "movies", "tv"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Moon-Knight",
  parentFranchise: "Moon Knight",
  universe: "Marvel Universe",
  traits: {
    aliases: ["Moon Knight", "Marc Spector", "White vigilante"],
    mediaDomains: ["comics", "tv", "movies"],
    visualAnchors: ["white suit", "moon", "egyptian motif"],
  }
});

// Kang
getTopologyEngine().register({
  id: "Marvel::Kang::Comics",
  parentFranchise: "Kang",
  universe: "Marvel Universe",
  traits: {
    aliases: ["Kang the Conqueror", "Kang", "Comics Kang", "Nathaniel Richards"],
    mediaDomains: ["comics"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Kang::MCU",
  baseId: "Marvel::Kang::Comics",
  parentFranchise: "Kang",
  universe: "MCU Timeline",
  continuity: "MCU Timeline",
  continuityType: "adaptation",
  traits: {
    aliases: ["MCU Kang", "Kang the Conqueror (MCU)", "Jonathan Majors Kang"],
    mediaDomains: ["movies", "tv"],
  }
});

// Miles Morales
getTopologyEngine().register({
  id: "Marvel::Miles::Comics",
  parentFranchise: "Spider-Man",
  universe: "Marvel 616",
  traits: {
    aliases: ["Miles Morales", "Spider-Man (Miles Morales)", "Comics Miles"],
    mediaDomains: ["comics"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Miles::Spider-Verse",
  baseId: "Marvel::Miles::Comics",
  parentFranchise: "Spider-Man",
  universe: "Spider-Verse",
  continuity: "Spider-Verse Timeline",
  continuityType: "variant",
  traits: {
    aliases: ["Spider-Verse Miles", "Miles Morales (Spider-Verse)", "Shameik Moore Miles"],
    mediaDomains: ["movies"],
  }
});

// Loki variants (Sylvie and Classic Loki)
getTopologyEngine().register({
  id: "Marvel::Loki::Sylvie",
  baseId: "Marvel::Loki",
  parentFranchise: "Marvel Cinematic Universe",
  universe: "MCU",
  continuity: "MCU Timeline",
  continuityType: "variant",
  traits: {
    aliases: ["Sylvie", "Lady Loki", "Sylvie Laufeydottir"],
    mediaDomains: ["tv"],
  }
});

getTopologyEngine().register({
  id: "Marvel::Loki::Classic",
  baseId: "Marvel::Loki",
  parentFranchise: "Marvel Cinematic Universe",
  universe: "MCU",
  continuity: "MCU Timeline",
  continuityType: "variant",
  traits: {
    aliases: ["Classic Loki", "Richard E. Grant Loki"],
    mediaDomains: ["tv"],
  }
});

