import { getTopologyEngine } from "../inheritanceEngine.js";

/**
 * DC Topology Module
 */

// Base Identities
getTopologyEngine().register({
  id: "DC::Batman (DC Comics)",
  canonicalEntity: "Batman",
  parentFranchise: "Batman",
  universe: "DC Universe",
  traits: {
    aliases: ["Batman", "Bruce Wayne", "Dark Knight"],
    mediaDomains: ["comics", "movies", "games"],
  }
});

getTopologyEngine().register({
  id: "DC::Superman",
  parentFranchise: "Superman",
  universe: "DC Universe",
  traits: {
    aliases: ["Superman", "Clark Kent", "Man of Steel", "Alien superhero reporter"],
    mediaDomains: ["comics", "movies", "tv"],
  }
});

getTopologyEngine().register({
  id: "DC::Flash",
  parentFranchise: "The Flash",
  universe: "DC Universe",
  traits: {
    aliases: ["The Flash", "Barry Allen", "Scarlet Speedster"],
    mediaDomains: ["comics", "movies", "tv"],
  }
});

getTopologyEngine().register({
  id: "DC::Joker",
  baseId: "DC::Batman (DC Comics)", // Joker belongs to Batman franchise
  canonicalEntity: "Joker",
  parentFranchise: "Batman",
  traits: {
    aliases: ["Joker", "Clown Prince of Crime"],
    mediaDomains: ["comics", "movies"],
  }
});

// Continuities
getTopologyEngine().register({
  id: "DC::Batman::Arkham",
  baseId: "DC::Batman (DC Comics)",
  continuity: "Arkham Games",
  continuityType: "variant",
  traits: {
    mediaDomains: ["games"],
    visualAnchors: ["arkham asylum", "rocksteady"],
  }
});

getTopologyEngine().register({
  id: "DC::Batman::Arkham Knight",
  baseId: "DC::Batman::Arkham",
  parentFranchise: "Batman",
  continuity: "Arkham Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Arkham Knight", "Batman: Arkham Knight", "Batman Arkham Knight"],
    visualAnchors: ["gotham", "batmobile", "scarecrow"],
  }
});

getTopologyEngine().register({
  id: "DC::Batman::Batman Arkham City",
  baseId: "DC::Batman::Arkham",
  parentFranchise: "Batman",
  continuity: "Arkham Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Batman Arkham City", "Arkham City", "Batman: Arkham City"],
    visualAnchors: ["hugo strange", "catwoman"],
  }
});

getTopologyEngine().register({
  id: "DC::Batman::Batman Arkham Origins",
  baseId: "DC::Batman::Arkham",
  parentFranchise: "Batman",
  continuity: "Arkham Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Batman Arkham Origins", "Arkham Origins", "Batman: Arkham Origins"],
    visualAnchors: ["deathstroke", "black mask", "young batman"],
  }
});

getTopologyEngine().register({
  id: "DC::Batman::Reeves",
  baseId: "DC::Batman (DC Comics)",
  continuity: "Reeves Reboot",
  continuityType: "reboot",
  traits: {
    mediaDomains: ["movies"],
    aliases: ["Robert Pattinson Batman", "Vengeance"],
  }
});

getTopologyEngine().register({
  id: "DC::Batman::Beyond",
  baseId: "DC::Batman (DC Comics)",
  continuity: "Beyond Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["tv", "comics", "anime"],
    aliases: ["Batman Beyond", "Terry McGinnis", "Neo-Gotham Batman"],
    visualAnchors: ["red suit", "beyond", "neo gotham"],
  }
});

getTopologyEngine().register({
  id: "DC::Flash::Arrowverse",
  baseId: "DC::Flash",
  continuity: "CW Timeline",
  continuityType: "adaptation",
  traits: {
    mediaDomains: ["tv"],
    aliases: ["Grant Gustin Flash"],
  }
});

// Batman Comics Prime
getTopologyEngine().register({
  id: "DC::Batman::Comics",
  baseId: "DC::Batman (DC Comics)",
  continuity: "Prime Comic",
  continuityType: "prime",
  traits: {
    mediaDomains: ["comics"],
    aliases: ["Prime Batman", "Comics Batman"],
  }
});

// Flashpoint Batman
getTopologyEngine().register({
  id: "DC::Batman::Flashpoint",
  baseId: "DC::Batman (DC Comics)",
  parentFranchise: "Batman",
  universe: "DC Multiverse",
  continuity: "Flashpoint Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["comics", "movies"],
    aliases: ["Flashpoint Batman", "Thomas Wayne", "Thomas Wayne Batman"],
    visualAnchors: ["red eyes", "dual holsters", "thomas wayne"],
  }
});

// DCEU Batman
getTopologyEngine().register({
  id: "DC::Batman::DCEU",
  baseId: "DC::Batman (DC Comics)",
  parentFranchise: "Batman",
  universe: "DCEU",
  continuity: "DCEU Timeline",
  continuityType: "adaptation",
  traits: {
    mediaDomains: ["movies"],
    aliases: ["DCEU Batman", "Ben Affleck Batman", "Batfleck"],
  }
});

// Animated Batman
getTopologyEngine().register({
  id: "DC::Batman::Animated",
  baseId: "DC::Batman (DC Comics)",
  parentFranchise: "Batman",
  universe: "DC Animated Universe",
  continuity: "DCAU Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["tv", "movies"],
    aliases: ["Animated Batman", "Kevin Conroy Batman", "DCAU Batman"],
  }
});

// Joker Comics Prime
getTopologyEngine().register({
  id: "DC::Joker::Comics",
  baseId: "DC::Joker",
  parentFranchise: "Batman",
  universe: "DC Universe",
  continuity: "Prime Comic",
  continuityType: "prime",
  traits: {
    mediaDomains: ["comics"],
    aliases: ["Prime Joker", "Comics Joker"],
  }
});

// Joker 2019 (Joaquin Phoenix)
getTopologyEngine().register({
  id: "DC::Joker::2019",
  baseId: "DC::Joker",
  canonicalEntity: "Joker (2019)",
  parentFranchise: "Joker", // Decoupled from Batman parent franchise to prevent retrieval drift
  universe: "Joker-verse",
  continuity: "Joker 2019 Movie Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["movies"],
    aliases: ["Joker (2019)", "Joaquin Phoenix Joker", "Arthur Fleck"],
  }
});

