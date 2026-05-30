import { getTopologyEngine } from "../inheritanceEngine.js";

/**
 * Anime Topology Module
 */

getTopologyEngine().register({
  id: "Anime::CodeGeass::Lelouch",
  parentFranchise: "Code Geass",
  universe: "Code Geass Universe",
  traits: {
    aliases: ["Lelouch vi Britannia", "Zero", "Lelouch Lamperouge", "Anime genius strategist"],
    mediaDomains: ["anime", "manga"],
  }
});

getTopologyEngine().register({
  id: "Anime::DeathNote::Light",
  parentFranchise: "Death Note",
  universe: "Death Note Universe",
  traits: {
    aliases: ["Light Yagami", "Kira", "Anime genius strategist"],
    mediaDomains: ["anime", "manga", "movies"],
  }
});

getTopologyEngine().register({
  id: "Anime::AttackOnTitan::Eren",
  parentFranchise: "Attack on Titan",
  universe: "AoT Universe",
  traits: {
    aliases: ["Eren Yeager", "Attack Titan", "Wall Maria protagonist"],
    mediaDomains: ["anime", "manga"],
  }
});

getTopologyEngine().register({
  id: "Anime::DevilMayCry::Dante",
  parentFranchise: "Devil May Cry",
  universe: "DMC Universe",
  traits: {
    aliases: ["Dante", "Son of Sparda", "Silver-haired anime swordsman"],
    mediaDomains: ["games", "anime"],
  }
});

getTopologyEngine().register({
  id: "Anime::Sephiroth",
  parentFranchise: "Final Fantasy",
  universe: "FFVII Universe",
  traits: {
    aliases: ["Sephiroth", "One-Winged Angel"],
    mediaDomains: ["games", "anime", "movies"],
  }
});

// Cyberpunk Edgerunners
getTopologyEngine().register({
  id: "Anime::Cyberpunk::Edgerunners",
  baseId: "Gaming::Cyberpunk::2077",
  parentFranchise: "Cyberpunk",
  universe: "Cyberpunk Universe",
  continuity: "Night City Era",
  continuityType: "adaptation", // anime adaptation/spin-off of game
  traits: {
    mediaDomains: ["anime", "tv"],
    aliases: ["Cyberpunk: Edgerunners", "Edgerunners", "David Martinez"],
  }
});

// Fate timelines
getTopologyEngine().register({
  id: "Anime::Fate::StayNight",
  parentFranchise: "Fate",
  universe: "Fate Universe",
  continuity: "Fate/Stay Night",
  continuityType: "prime",
  traits: {
    mediaDomains: ["anime", "games"],
    aliases: ["Fate/Stay Night", "Stay Night", "Fate Stay Night"],
  }
});

getTopologyEngine().register({
  id: "Anime::Fate::Zero",
  baseId: "Anime::Fate::StayNight",
  parentFranchise: "Fate",
  universe: "Fate Universe",
  continuity: "Fate/Zero",
  continuityType: "variant", // Prequel
  traits: {
    mediaDomains: ["anime"],
    aliases: ["Fate/Zero", "Fate Zero", "Fourth Holy Grail War"],
  }
});

getTopologyEngine().register({
  id: "Anime::Fate::Apocrypha",
  baseId: "Anime::Fate::StayNight",
  parentFranchise: "Fate",
  universe: "Fate Universe",
  continuity: "Fate/Apocrypha",
  continuityType: "variant", // Alternate Timeline
  traits: {
    mediaDomains: ["anime"],
    aliases: ["Fate/Apocrypha", "Fate Apocrypha", "Great Holy Grail War"],
  }
});

// Evangelion rebuilds
getTopologyEngine().register({
  id: "Anime::Evangelion::Original",
  parentFranchise: "Evangelion",
  universe: "Evangelion Universe",
  continuity: "Neon Genesis Evangelion",
  continuityType: "prime",
  traits: {
    mediaDomains: ["anime"],
    aliases: ["Neon Genesis Evangelion", "NGE", "Evangelion", "Shinji Ikari"],
  }
});

getTopologyEngine().register({
  id: "Anime::Evangelion::Rebuild",
  baseId: "Anime::Evangelion::Original",
  parentFranchise: "Evangelion",
  universe: "Evangelion Universe",
  continuity: "Rebuild of Evangelion",
  continuityType: "reboot", // Rebuild tetralogy
  traits: {
    mediaDomains: ["movies", "anime"],
    aliases: ["Rebuild of Evangelion", "Evangelion Rebuilds", "Eva 1.0 2.0 3.0 3.0+1.0"],
  }
});

// Dragon Ball continuities
getTopologyEngine().register({
  id: "Anime::DragonBall::Z",
  parentFranchise: "Dragon Ball",
  universe: "Dragon Ball Universe",
  continuity: "Dragon Ball Z",
  continuityType: "prime",
  traits: {
    mediaDomains: ["anime"],
    aliases: ["Dragon Ball Z", "DBZ", "Goku"],
  }
});

getTopologyEngine().register({
  id: "Anime::DragonBall::GT",
  baseId: "Anime::DragonBall::Z",
  parentFranchise: "Dragon Ball",
  universe: "Dragon Ball Universe",
  continuity: "Dragon Ball GT",
  continuityType: "variant", // non-canon sequel
  traits: {
    mediaDomains: ["anime"],
    aliases: ["Dragon Ball GT", "DBGT", "Super Saiyan 4"],
  }
});

getTopologyEngine().register({
  id: "Anime::DragonBall::Super",
  baseId: "Anime::DragonBall::Z",
  parentFranchise: "Dragon Ball",
  universe: "Dragon Ball Universe",
  continuity: "Dragon Ball Super",
  continuityType: "prime", // canon sequel
  traits: {
    mediaDomains: ["anime"],
    aliases: ["Dragon Ball Super", "DBS", "Super Saiyan Blue"],
  }
});

// The Boys
getTopologyEngine().register({
  id: "Comics::TheBoys::Comics",
  parentFranchise: "The Boys",
  universe: "The Boys Universe",
  continuity: "Comic Canon",
  continuityType: "prime",
  traits: {
    mediaDomains: ["comics"],
    aliases: ["The Boys Comics", "Garth Ennis The Boys"],
  }
});

getTopologyEngine().register({
  id: "TV::TheBoys::TV",
  baseId: "Comics::TheBoys::Comics",
  parentFranchise: "The Boys",
  universe: "The Boys Universe",
  continuity: "TV Canon",
  continuityType: "adaptation",
  traits: {
    mediaDomains: ["tv"],
    aliases: ["The Boys TV Show", "The Boys Amazon Series", "Homelander"],
  }
});

// Invincible
getTopologyEngine().register({
  id: "Comics::Invincible::Comics",
  parentFranchise: "Invincible",
  universe: "Invincible Universe",
  continuity: "Comic Canon",
  continuityType: "prime",
  traits: {
    mediaDomains: ["comics"],
    aliases: ["Invincible Comics", "Mark Grayson", "Omni-Man"],
  }
});

getTopologyEngine().register({
  id: "TV::Invincible::TV",
  baseId: "Comics::Invincible::Comics",
  parentFranchise: "Invincible",
  universe: "Invincible Universe",
  continuity: "TV Canon",
  continuityType: "adaptation",
  traits: {
    mediaDomains: ["tv"],
    aliases: ["Invincible TV Show", "Invincible Animated Series"],
  }
});

// One Piece
getTopologyEngine().register({
  id: "Anime::OnePiece::Anime",
  parentFranchise: "One Piece",
  universe: "One Piece Universe",
  continuity: "Main Anime",
  continuityType: "prime",
  traits: {
    mediaDomains: ["anime"],
    aliases: ["One Piece Anime", "Monkey D. Luffy", "Straw Hat Pirates"],
  }
});

getTopologyEngine().register({
  id: "TV::OnePiece::LiveAction",
  baseId: "Anime::OnePiece::Anime",
  parentFranchise: "One Piece",
  universe: "One Piece Universe",
  continuity: "Netflix Live Action",
  continuityType: "adaptation",
  traits: {
    mediaDomains: ["tv"],
    aliases: ["One Piece Live Action", "Netflix One Piece"],
  }
});

