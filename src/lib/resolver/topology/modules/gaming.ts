import { getTopologyEngine } from "../inheritanceEngine.js";

/**
 * Gaming Topology Module
 */

// Base Identities
getTopologyEngine().register({
  id: "Gaming::Halo::Master Chief (Games)",
  parentFranchise: "Halo",
  universe: "Halo Universe",
  traits: {
    aliases: ["Master Chief", "Chief", "John-117"],
    mediaDomains: ["games", "tv"],
  }
});

getTopologyEngine().register({
  id: "Gaming::GTA::CJ",
  parentFranchise: "Grand Theft Auto",
  universe: "3D Universe",
  traits: {
    aliases: ["CJ", "Carl Johnson"],
    mediaDomains: ["games"],
  }
});

// Continuities
getTopologyEngine().register({
  id: "Gaming::Halo::Core",
  baseId: "Gaming::Halo::Master Chief (Games)",
  continuity: "Game Canon",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Halo::Silver",
  baseId: "Gaming::Halo::Master Chief (Games)",
  continuity: "Silver Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["tv"],
    aliases: ["Pablo Schreiber Chief"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Persona5",
  parentFranchise: "Persona",
  universe: "Shin Megami Tensei",
  continuity: "P5 Timeline",
  continuityType: "prime",
  traits: {
    aliases: ["Persona 5", "P5", "Phantom Thieves"],
    mediaDomains: ["games"],
  }
});

// Halo Timeline Additions
getTopologyEngine().register({
  id: "Gaming::Halo::Halo 3",
  baseId: "Gaming::Halo::Master Chief (Games)",
  parentFranchise: "Halo",
  continuity: "Reclaimer Saga",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Halo 3", "H3"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Halo::Halo Reach",
  baseId: "Gaming::Halo::Master Chief (Games)",
  parentFranchise: "Halo",
  continuity: "Fall of Reach",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Halo: Reach", "Reach", "Halo Reach"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Halo::Halo Infinite",
  baseId: "Gaming::Halo::Master Chief (Games)",
  parentFranchise: "Halo",
  continuity: "Forerunner Continuity",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Halo Infinite", "Infinite"],
  }
});

// Mass Effect
getTopologyEngine().register({
  id: "Gaming::Mass Effect::Mass Effect 2",
  parentFranchise: "Mass Effect",
  universe: "Mass Effect Universe",
  continuity: "Shepard Arc",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Mass Effect 2", "ME2"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Mass Effect::Andromeda",
  parentFranchise: "Mass Effect",
  universe: "Mass Effect Universe",
  continuity: "Andromeda Initiative",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Mass Effect: Andromeda", "Andromeda"],
  }
});

// Elden Ring
getTopologyEngine().register({
  id: "Gaming::Elden Ring::Elden Ring",
  parentFranchise: "Elden Ring",
  universe: "Lands Between",
  continuity: "Main World",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Elden Ring", "ER"],
  }
});

// Red Dead Redemption
getTopologyEngine().register({
  id: "Gaming::Red Dead Redemption::Red Dead Redemption 2",
  parentFranchise: "Red Dead Redemption",
  universe: "RDR Universe",
  continuity: "Van der Linde Era",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Red Dead Redemption 2", "RDR2", "Red Dead 2"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Red Dead Redemption::Red Dead Redemption",
  parentFranchise: "Red Dead Redemption",
  universe: "RDR Universe",
  continuity: "Marston Era",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Red Dead Redemption", "RDR1", "Red Dead"],
  }
});

// GTA
getTopologyEngine().register({
  id: "Gaming::GTA::Grand Theft Auto V",
  parentFranchise: "Grand Theft Auto",
  universe: "HD Universe",
  continuity: "HD Universe",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Grand Theft Auto V", "GTA V", "GTA 5", "Grand Theft Auto 5"],
  }
});

// The Last of Us
getTopologyEngine().register({
  id: "Gaming::The Last of Us::The Last of Us Part I",
  parentFranchise: "The Last of Us",
  universe: "TLOU Universe",
  continuity: "Part I",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["The Last of Us Part I", "TLOU Part 1", "The Last of Us Part 1"],
  }
});

getTopologyEngine().register({
  id: "Gaming::The Last of Us::The Last of Us Part II",
  parentFranchise: "The Last of Us",
  universe: "TLOU Universe",
  continuity: "Part II",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["The Last of Us Part II", "TLOU Part 2", "The Last of Us Part 2"],
  }
});

// God of War
getTopologyEngine().register({
  id: "Gaming::God of War::God of War (2018)",
  parentFranchise: "God of War",
  universe: "Norse Era",
  continuity: "Norse Era",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["God of War (2018)", "God of War 4", "GoW 2018"],
  }
});

getTopologyEngine().register({
  id: "Gaming::God of War::God of War III",
  parentFranchise: "God of War",
  universe: "Greek Era",
  continuity: "Greek Era",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["God of War III", "God of War 3", "GoW 3"],
  }
});

// Final Fantasy
getTopologyEngine().register({
  id: "Gaming::Final Fantasy::Final Fantasy VII Remake",
  parentFranchise: "Final Fantasy",
  universe: "Compilation of FFVII",
  continuity: "Remake Continuity",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Final Fantasy VII Remake", "FF7 Remake", "FFVII Remake"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Final Fantasy::Final Fantasy VII",
  parentFranchise: "Final Fantasy",
  universe: "Compilation of FFVII",
  continuity: "Compilation Timeline",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Final Fantasy VII", "FF7", "FFVII"],
  }
});

// Metal Gear
getTopologyEngine().register({
  id: "Gaming::Metal Gear::Metal Gear Solid",
  parentFranchise: "Metal Gear",
  universe: "Metal Gear Universe",
  continuity: "Solid Snake Saga",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Metal Gear Solid", "MGS"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Metal Gear::Metal Gear Solid 3",
  parentFranchise: "Metal Gear",
  universe: "Metal Gear Universe",
  continuity: "Big Boss Saga",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Metal Gear Solid 3: Snake Eater", "MGS3", "Snake Eater"],
  }
});

// Resident Evil
getTopologyEngine().register({
  id: "Gaming::Resident Evil::Resident Evil 4",
  parentFranchise: "Resident Evil",
  universe: "Resident Evil Universe",
  continuity: "Survival Arc",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Resident Evil 4", "RE4"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Resident Evil::Resident Evil Village",
  parentFranchise: "Resident Evil",
  universe: "Resident Evil Universe",
  continuity: "Winters Saga",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Resident Evil Village", "RE Village", "Resident Evil 8", "RE8"],
  }
});

// The Witcher
getTopologyEngine().register({
  id: "Gaming::The Witcher::The Witcher 3: Wild Hunt",
  parentFranchise: "The Witcher",
  universe: "Witcher Universe",
  continuity: "Geralt Saga",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["The Witcher 3: Wild Hunt", "Witcher 3", "The Witcher 3"],
  }
});

// Cyberpunk
getTopologyEngine().register({
  id: "Gaming::Cyberpunk::Cyberpunk 2077",
  parentFranchise: "Cyberpunk",
  universe: "Cyberpunk Universe",
  continuity: "Night City Era",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Cyberpunk 2077", "Cyberpunk", "CP2077"],
  }
});

// Assassin's Creed
getTopologyEngine().register({
  id: "Gaming::Assassin's Creed::Assassin's Creed II",
  parentFranchise: "Assassin's Creed",
  universe: "Assassin's Creed Universe",
  continuity: "Ezio Trilogy",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Assassin's Creed II", "Assassin's Creed 2", "AC2"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Assassin's Creed::Assassin's Creed Valhalla",
  parentFranchise: "Assassin's Creed",
  universe: "Assassin's Creed Universe",
  continuity: "Layla Hassan Arc",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Assassin's Creed Valhalla", "AC Valhalla", "Valhalla"],
  }
});

// The Witcher
getTopologyEngine().register({
  id: "Gaming::Witcher::Novel",
  parentFranchise: "The Witcher",
  universe: "Witcher Universe",
  continuity: "Novel Timeline",
  continuityType: "prime",
  traits: {
    mediaDomains: ["comics"], // Witcher books are written text/graphic novels
    aliases: ["Witcher Novels", "Witcher Books", "Andrzej Sapkowski Witcher"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Witcher::Game",
  baseId: "Gaming::Witcher::Novel",
  parentFranchise: "The Witcher",
  universe: "Witcher Universe",
  continuity: "Geralt Saga",
  continuityType: "variant", // Game timeline acts as sequel variant of books
  traits: {
    mediaDomains: ["games"],
    aliases: ["Witcher Games", "The Witcher 3: Wild Hunt", "Witcher 3"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Witcher::Netflix",
  baseId: "Gaming::Witcher::Novel",
  parentFranchise: "The Witcher",
  universe: "Witcher Universe",
  continuity: "Netflix Series Timeline",
  continuityType: "adaptation",
  traits: {
    mediaDomains: ["tv"],
    aliases: ["Witcher Netflix", "Netflix Witcher Show", "Henry Cavill Witcher"],
  }
});

// Cyberpunk 2077 Game
getTopologyEngine().register({
  id: "Gaming::Cyberpunk::2077",
  parentFranchise: "Cyberpunk",
  universe: "Cyberpunk Universe",
  continuity: "Night City Era",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Cyberpunk 2077", "Cyberpunk Game"],
  }
});

// Persona 5
getTopologyEngine().register({
  id: "Gaming::Persona::P5",
  parentFranchise: "Persona",
  universe: "Shin Megami Tensei",
  continuity: "P5 Timeline",
  continuityType: "prime",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Persona 5", "P5", "Phantom Thieves"],
  }
});

getTopologyEngine().register({
  id: "Gaming::Persona::P5R",
  baseId: "Gaming::Persona::P5",
  parentFranchise: "Persona",
  universe: "Shin Megami Tensei",
  continuity: "P5 Royal Timeline",
  continuityType: "variant",
  traits: {
    mediaDomains: ["games"],
    aliases: ["Persona 5 Royal", "P5R", "Persona 5 Royal Game"],
  }
});

