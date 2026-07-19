/**
 * candidateScorer.ts
 *
 * Scoring and ranking engine for resolver candidates.
 */

import type { MediaLens } from "../../app/mediaLens.js";
import { tokenize, cleanAlphanumeric } from "./queryNormalizer.js";
import { classifyComicsQueryType, normalizeComicVineResourceType } from "./providerMetadata.js";

const CANONICAL_PUBLISHERS: Record<string, string> = {
  "batman": "dc comics",
  "superman": "dc comics",
  "joker": "dc comics",
  "flash": "dc comics",
  "flashpoint": "dc comics",
  "crisis": "dc comics",
  "crisis on infinite earths": "dc comics",
  "infinite crisis": "dc comics",
  "final crisis": "dc comics",
  "spider-man": "marvel",
  "spiderman": "marvel",
  "venom": "marvel",
  "civil war": "marvel",
  "secret wars": "marvel",
  "ultimate spider-man": "marvel",
  "amazing spider-man": "marvel",
  "hellboy": "dark horse comics",
  "invincible": "image comics",
  "spawn": "image comics"
};

function isPublisherAligned(candidatePublisher: string | undefined, expectedPublisher: string): boolean {
  if (!candidatePublisher) return false;
  const candPubNorm = candidatePublisher.toLowerCase().replace(/[^a-z]+/g, "");
  const expPubNorm = expectedPublisher.toLowerCase().replace(/[^a-z]+/g, "");
  return candPubNorm.includes(expPubNorm) || expPubNorm.includes(candPubNorm);
}

export type QueryIntent =
  | "franchise"
  | "title"
  | "character"
  | "creator"
  | "event"
  | "location";

export type MediaType = "anime" | "movies" | "tv" | "games" | "comics";

export type CandidateBucket =
  | "franchise"
  | "title"
  | "character"
  | "sideContent";

export interface ResolverCandidate {
  name: string;
  source: string;
  bucket: CandidateBucket;
  imageUrl?: string | null;
  year?: number | null;
  popularity?: number | null;
  publisher?: string | null;
  genres?: string[];
  raw?: unknown;
  posterUrl?: string | null;
  backdropUrl?: string | null;
}

export interface ResolverDebug {
  candidate: string;
  source: string;
  bucket: CandidateBucket;
  score: number;
  boosts: string[];
  penalties: string[];
  eligible?: boolean;
  rejectionReasons?: string[];
  confidenceAdjustment?: number;
}

export type CompatibilityResult = {
  eligible: boolean;
  reasons: string[];
  penalties: string[];
  confidenceAdjustment: number;
};

export interface ScoringContext {
  normalizedQuery: string;
  canonicalEntity: string | null;
  intent: QueryIntent;
  mediaLens: MediaLens;
  retrievalDescriptor?: string;
  visualAnchors?: string[];
  franchiseRoot?: string;
}

export const SOURCE_PRIORITY: Record<MediaType, string[]> = {
  anime: ["jikan"],
  movies: ["tmdb"],
  tv: ["tmdb"],
  games: ["igdb", "rawg"],
  comics: ["comicvine"],
};

export const KNOWN_FRANCHISES = new Set([
  "naruto", "dragon ball", "one piece", "bleach", "death note",
  "attack on titan", "jujutsu kaisen", "demon slayer", "my hero academia",
  "fullmetal alchemist", "hunter x hunter", "one punch man", "code geass",
  "cowboy bebop", "neon genesis evangelion", "spider-man", "batman",
  "superman", "x-men", "the walking dead", "iron man", "wonder woman",
  "halo", "the legend of zelda", "god of war", "elden ring", "dark souls",
  "grand theft auto", "red dead redemption", "the last of us",
  "star wars", "harry potter", "the lord of the rings", "game of thrones",
  "breaking bad", "stranger things", "the witcher",
  "marvel cinematic universe", "dc extended universe",
  "pokemon", "mario", "sonic", "final fantasy", "call of duty",
  "assassins creed", "minecraft", "fortnite", "overwatch",
]);

export const FRANCHISE_ALIASES: Record<string, string[]> = {
  "Dragon Ball": ["dragon ball", "dragonball", "dbz", "dragon ball z", "dragon ball super", "dragon ball gt", "saiyan", "frieza", "namek", "vegeta", "goku", "gohan", "capsule corp", "bulma", "piccolo", "cell"],
  "Attack on Titan": ["attack on titan", "shingeki no kyojin", "shingeki", "aot", "snk", "titan", "survey corps", "colossal", "armored titan", "eldian", "marley", "paradis", "mikasa", "levi", "armin", "reiner", "annie", "wall maria"],
  "Naruto": ["naruto", "shippuden", "boruto", "konoha", "hokage", "shinobi", "rasengan", "sharingan", "akatsuki", "sasuke", "sakura", "kakashi", "hinata", "hidden leaf"],
  "One Piece": ["one piece", "luffy", "straw hat", "grand line", "devil fruit", "marines", "pirate", "zoro", "nami", "sanji", "chopper"],
  "Jujutsu Kaisen": ["jujutsu kaisen", "jjk", "sorcerer", "curse", "gojo", "itadori", "sukuna", "tokyo jujutsu", "yuji"],
  "Demon Slayer": ["demon slayer", "kimetsu no yaiba", "kny", "tanjiro", "nezuko", "hashira", "demon", "corps", "zenitsu", "inosuke"],
  "My Hero Academia": ["my hero academia", "mha", "boku no hero", "bnha", "quirk", "deku", "ua high", "all might", "izuku", "bakugo", "hero"],
  "Hunter x Hunter": ["hunter x hunter", "hxh", "gon", "killua", "chimera ant", "nen", "hisoka", "ging"],
  "Fullmetal Alchemist": ["fullmetal alchemist", "fma", "fmab", "edward elric", "alphonse", "amestris", "philosopher stone", "alchemy", "equivalent exchange"],
  "Death Note": ["death note", "shinigami", "light yagami", "ryuk", "lawliet", "kira", "notebook"],
  "Bleach": ["bleach", "soul reaper", "ichigo", "soul society", "hollow", "zanpakuto", "bankai", "rukia", "aizen"],
  "Monster": ["monster", "johan liebert", "tenma", "naoki urasawa", "kenzo", "nina", "grimmer", "mill"],
  "God of War": ["god of war", "gow", "kratos", "atreus", "olympus", "greek mythology", "norse mythology", "santa monica", "spartan", "baldur", "freya", "mimir", "ragnarok"],
  "Grand Theft Auto: San Andreas": ["san andreas", "grove street", "cj", "carl johnson", "los santos", "las venturas", "san fierro", "ogs", "sweet", "ryder", "big smoke", "gta san andreas"],
  "Grand Theft Auto V": ["grand theft auto v", "gta v", "gta 5", "trevor", "michael", "franklin clinton", "franklin", "los santos", "gta5"],
  "Grand Theft Auto": ["grand theft auto", "gta", "rockstar", "rockstar games", "liberty city", "vice city"],
  "The Last of Us": ["last of us", "tlou", "joel", "ellie", "naughty dog", "clicker", "cordyceps", "tess", "marlene"],
  "The Legend of Zelda": ["legend of zelda", "zelda", "link", "hyrule", "triforce", "ganon", "nintendo", "sheik"],
  "Halo": ["halo", "master chief", "cortana", "spartan", "unsc", "covenant", "343 industries", "bungie", "flood"],
  "The Witcher": ["witcher", "geralt", "rivia", "ciri", "yennefer", "cd projekt", "kaer morhen", "nilfgaard"],
  "Batman": ["batman", "bruce wayne", "gotham", "dc comics", "dark knight", "bane", "alfred", "wayne", "arkham", "bat"],
  "Superman": ["superman", "clark kent", "metropolis", "krypton", "dc comics", "lex luthor", "man of steel", "kryptonian"],
  "Spider-Man": ["spider-man", "spiderman", "peter parker", "web slinger", "marvel", "friendly neighborhood", "oscorp", "aunt may"],
  "Breaking Bad": ["breaking bad", "walter white", "heisenberg", "jesse pinkman", "albuquerque", "meth", "saul", "hank"],
  "Game of Thrones": ["game of thrones", "got", "westeros", "stark", "lannister", "targaryen", "iron throne", "seven kingdoms", "winter is coming"],
  "Stranger Things": ["stranger things", "hawkins", "upside down", "eleven", "demogorgon", "hopper"],
  "The Walking Dead": ["walking dead", "rick grimes", "zombie", "apocalypse", "undead", "negan", "daryl"],
  "Prison Break": ["prison break", "michael scofield", "lincoln burrows", "fox river", "sona", "wentworth"],
  "Star Wars": ["star wars", "jedi", "sith", "force", "lightsaber", "darth vader", "skywalker", "rebellion", "empire", "republic"],
  "Marvel Cinematic Universe": ["mcu", "avengers", "marvel", "iron man", "captain america", "shield", "thanos", "infinity"],
  "Code Geass": ["code geass", "lelouch", "britannian", "geass", "zero", "black knights"],
  "Cowboy Bebop": ["cowboy bebop", "spike spiegel", "bounty hunter", "bebop", "faye valentine", "ein"],
  "Neon Genesis Evangelion": ["evangelion", "nge", "eva", "nerv", "angel", "rei ayanami", "shinji", "unit 01"],
};

export const SIDE_CONTENT_PATTERN =
  /\b(dlc|soundtrack|ost|bundle|pack|ova|special|remaster|remastered|collector.?s?\s*edition|season\s*pass|add[\s-]?on|addon|skin|skins|costume|movie\s*skin|demo|trial|beta|prologue|epilogue|bonus|sampler|anthology|compilation)\b/i;

const VINTAGE_YEAR_THRESHOLD = 1960;

export function getFranchiseAliases(franchise: string | null): string[] {
  if (!franchise) return [];
  const key = Object.keys(FRANCHISE_ALIASES).find(
    k => k.toLowerCase() === franchise.toLowerCase()
  );
  return key ? FRANCHISE_ALIASES[key] : [franchise.toLowerCase()];
}

export function classifyBucket(
  candidateName: string,
  intent: QueryIntent,
  normalizedQuery: string,
): CandidateBucket {
  const name = candidateName.toLowerCase();

  // Side content detection
  if (SIDE_CONTENT_PATTERN.test(name)) {
    return "sideContent";
  }

  // If intent is character and name looks like a character
  if (intent === "character") {
    return "character";
  }

  // Check if this is a franchise
  if (KNOWN_FRANCHISES.has(name) || KNOWN_FRANCHISES.has(normalizedQuery)) {
    return "franchise";
  }

  return "title";
}

export function scoreCandidate(
  candidate: ResolverCandidate,
  ctx: ScoringContext,
): { score: number; boosts: string[]; penalties: string[] } {
  const boosts: string[] = [];
  const penalties: string[] = [];
  let score = 0;

  const candidateName = (candidate.name ?? "").trim().toLowerCase();
  const search = ctx.normalizedQuery.toLowerCase();
  const canonical = ctx.canonicalEntity?.toLowerCase() ?? null;

  // ── Exact match boost
  if (candidateName === search || (canonical && candidateName === canonical.toLowerCase())) {
    score += 100;
    boosts.push("exact_match:+100");
  }
  // ── Starts with boost
  else if (candidateName.startsWith(search) || (canonical && candidateName.startsWith(canonical.toLowerCase()))) {
    score += 50;
    boosts.push("starts_with:+50");
  }

  // ── Semantic Grounding Boosts (Prompt 3)
  if (ctx.visualAnchors) {
    let anchorHits = 0;
    for (const anchor of ctx.visualAnchors) {
      if (candidateName.includes(anchor.toLowerCase())) {
        anchorHits++;
      }
    }
    if (anchorHits > 0) {
      const boost = Math.min(40, anchorHits * 15);
      score += boost;
      boosts.push(`anchor_hits(${anchorHits}):+${boost}`);
    }
  }

  if (ctx.retrievalDescriptor) {
    const descriptorTokens = tokenize(ctx.retrievalDescriptor);
    let descriptorHits = 0;
    for (const token of descriptorTokens) {
      if (candidateName.includes(token)) descriptorHits++;
    }
    if (descriptorHits >= 2) {
      score += 25;
      boosts.push("descriptor_grounding:+25");
    }
  }
  // ── Canonical alias match
  else if (canonical && candidateName.includes(canonical.toLowerCase())) {
    score += 80;
    boosts.push("canonical_alias:+80");
  }
  // ── Semantic / includes match
  else if (candidateName.includes(search)) {
    score += 20;
    boosts.push("semantic_match:+20");
  }
  // ── Word overlap
  else {
    const searchWords = search.split(/\s+/).filter(Boolean);
    const matches = searchWords.filter((w) => candidateName.includes(w));
    if (matches.length > 0) {
      const wordScore = matches.length * 5;
      score += wordScore;
      boosts.push(`word_overlap:+${wordScore}`);
    }
  }

  // ── Franchise boost for mainline entries
  if (candidate.bucket === "franchise") {
    score += 30;
    boosts.push("franchise_bucket:+30");
  }

  // ── Popularity anchoring
  if (candidate.popularity != null && candidate.popularity > 0) {
    let popBoost = 0;
    if (candidate.source === "jikan" || candidate.source === "mal") {
      // MAL score: 0-10 scale
      popBoost = Math.min(15, Math.round(candidate.popularity * 1.5));
    } else if (candidate.source === "tmdb") {
      // TMDB popularity: variable scale, cap at 15
      popBoost = Math.min(15, Math.round(candidate.popularity / 10));
    } else if (candidate.source === "igdb") {
      // IGDB rating: 0-100 scale
      popBoost = Math.min(15, Math.round(candidate.popularity / 7));
    } else {
      popBoost = Math.min(10, Math.round(candidate.popularity));
    }
    if (popBoost > 0) {
      score += popBoost;
      boosts.push(`popularity:+${popBoost}`);
    }
  }

  // ── Publisher prominence (comics)
  if (candidate.publisher) {
    const pub = candidate.publisher.toLowerCase();
    if (pub.includes("marvel") || pub.includes("dc")) {
      score += 10;
      boosts.push("major_publisher:+10");
    }
  }

  // ── Comics Franchise-Aware Deterministic Ranking (Phase 3)
  if (ctx.mediaLens === "comics" || candidate.source === "comicvine") {
    const nameLower = candidateName;
    const queryLower = search;

    const franchiseRoot = candidate.name.split(/[:\- ]/)[0].toLowerCase();
    const baseTitle = candidate.name.split(/[:\-\(]/)[0].trim().toLowerCase();
    
    let expectedPublisher: string | null = null;
    const queryNorm = queryLower.replace(/[^a-z0-9]+/g, "");
    const baseTitleNorm = baseTitle.replace(/[^a-z0-9]+/g, "");
    const franchiseRootNorm = franchiseRoot.replace(/[^a-z0-9]+/g, "");

    for (const [key, pub] of Object.entries(CANONICAL_PUBLISHERS)) {
      const keyNorm = key.replace(/[^a-z0-9]+/g, "");
      if (keyNorm === queryNorm || keyNorm === baseTitleNorm || keyNorm === franchiseRootNorm) {
        expectedPublisher = pub;
        break;
      }
    }

    // 1. Publisher Continuity Boost / Penalty
    let publisherStatus: "boost" | "penalty" | "neutral" = "neutral";
    if (expectedPublisher) {
      if (candidate.publisher && isPublisherAligned(candidate.publisher, expectedPublisher)) {
        score += 80;
        boosts.push("publisher_continuity:+80");
        publisherStatus = "boost";
        console.log(`[PUBLISHER_CONTINUITY] Candidate: "${candidate.name}" | Publisher: "${candidate.publisher}" | Match Status: Boost (+80)`);
      } else if (candidate.publisher) {
        score -= 50;
        penalties.push("publisher_mismatch:-50");
        publisherStatus = "penalty";
        console.log(`[PUBLISHER_CONTINUITY] Candidate: "${candidate.name}" | Publisher: "${candidate.publisher}" | Match Status: Penalty (-50)`);
      }
    }

    // 2. Canonical Universe Weight
    let universeBoost = 0;
    if (nameLower.includes("earth-616") || nameLower.includes("prime") || nameLower.includes("main continuity")) {
      score += 60;
      boosts.push("universe_dominance:+60");
      universeBoost = 60;
      console.log(`[UNIVERSE_DOMINANCE] Candidate: "${candidate.name}" | Universe: "Mainstream" | Dominance Boost: +60`);
    }

    // 3. Franchise Root Reinforcement
    if (ctx.franchiseRoot) {
      const rootNorm = ctx.franchiseRoot.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (nameLower.replace(/[^a-z0-9]+/g, "").includes(rootNorm)) {
        score += 35;
        boosts.push("franchise_root_reinforce:+35");
        console.log(`[FRANCHISE_AUTHORITY_SCORE] Candidate: "${candidate.name}" | Root Reinforcement Boost: +35`);
      }
    }

    // 4. Ranking Tiers Assignment & Boost/Penalty
    const isParody = nameLower.includes("parody") || nameLower.includes("spoof") || nameLower.includes("tribute") || nameLower.includes("parody variant");
    const isAltUniverse = nameLower.includes("earth-") || nameLower.includes("variant") || nameLower.includes("alternative") || nameLower.includes("lego") || nameLower.includes("parody");
    const isAdjacentContinuity = nameLower.includes("beyond") || nameLower.includes("ultimate") || nameLower.includes("amazing") || nameLower.includes("arkham");
    
    // Type checking
    let rawProviderType: string | undefined = undefined;
    if (candidate.raw && typeof candidate.raw === "object") {
      const rawObj = candidate.raw as any;
      if (rawObj.resource_type) {
        rawProviderType = normalizeComicVineResourceType(rawObj.resource_type, candidate.name);
      }
    }
    const providerType = rawProviderType || (candidate.bucket === "character" ? "character" : "volume");
    const classifiedType = classifyComicsQueryType(ctx.normalizedQuery);
    const typeMatches = !classifiedType || providerType === classifiedType;
    const typePenalty = !typeMatches ? -60 : 0;

    let tier = 4;
    let tierReason = "";
    let tierScoreEffect = -60;

    if (publisherStatus === "penalty" || isParody || typePenalty < 0) {
      tier = 4;
      tierReason = publisherStatus === "penalty" ? "Alternate publisher duplicate" : (isParody ? "Parody / spoof variant" : "Cross-type mismatch");
      tierScoreEffect = -60;
    } else if (isAltUniverse) {
      tier = 3;
      tierReason = "Legitimate alternate universe";
      tierScoreEffect = 30;
    } else if (isAdjacentContinuity) {
      tier = 2;
      tierReason = "Canonical adjacent continuity";
      tierScoreEffect = 80;
    } else if ((nameLower.replace(/[^a-z0-9]+/g, "") === queryLower.replace(/[^a-z0-9]+/g, "")) && typeMatches && (publisherStatus === "boost" || publisherStatus === "neutral")) {
      tier = 1;
      tierReason = "Canonical mainstream owner";
      tierScoreEffect = 150;
    } else {
      if (publisherStatus === "boost") {
        tier = 2;
        tierReason = "Aligned publisher adjacent continuity";
        tierScoreEffect = 80;
      } else {
        tier = 3;
        tierReason = "Variant continuity";
        tierScoreEffect = 30;
      }
    }

    score += tierScoreEffect;
    if (tierScoreEffect > 0) {
      boosts.push(`tier_${tier}_boost:+${tierScoreEffect}`);
    } else {
      penalties.push(`tier_${tier}_penalty:${tierScoreEffect}`);
    }

    if (typePenalty < 0) {
      score += typePenalty;
      penalties.push(`cross_type_penalty:${typePenalty}`);
      console.log(`[CROSS_TYPE_PENALTY] Candidate: "${candidate.name}" | Conflict: Query Intent ${classifiedType} vs Candidate Type ${providerType} | Penalty: -60`);
    }

    console.log(`[RANKING_TIER_ASSIGNED] Candidate: "${candidate.name}" | Assigned Tier: ${tier} | Reason: "${tierReason}"`);
    console.log(`[FRANCHISE_AUTHORITY_SCORE] Candidate: "${candidate.name}" | Total Authority Score: ${score}`);
  }

  // ── Artwork present boost
  if (candidate.imageUrl) {
    score += 5;
    boosts.push("artwork_present:+5");
  }

  // ── Media lens alignment & constraints
  const sourceLensMap: Record<string, MediaType[]> = {
    jikan: ["anime"],
    mal: ["anime"],
    tmdb: ["movies", "tv"],
    igdb: ["games"],
    rawg: ["games"],
    comicvine: ["comics"],
  };
  const alignedTypes = sourceLensMap[candidate.source] ?? [];
  
  if (alignedTypes.includes(ctx.mediaLens as MediaType)) {
    score += 100;
    boosts.push("exact_lens_match:+100");
  } else {
    // If somehow a conflicting source makes it here, heavily penalize it
    score -= 80;
    penalties.push(`conflicting_lens_mismatch:${ctx.mediaLens}:-80`);
  }

  // ── PENALTIES ──

  // Character penalty when intent is not character
  if (candidate.bucket === "character" && ctx.intent !== "character") {
    score -= 40;
    penalties.push("character_wrong_intent:-40");
  }

  // Side content penalty
  if (SIDE_CONTENT_PATTERN.test(candidate.name)) {
    score -= 50;
    penalties.push("side_content:-50");
  }

  // Vintage/obscure penalty
  if (
    candidate.year != null &&
    candidate.year < VINTAGE_YEAR_THRESHOLD &&
    !ctx.normalizedQuery.includes("classic") &&
    !ctx.normalizedQuery.includes("vintage") &&
    !ctx.normalizedQuery.includes("original")
  ) {
    score -= 30;
    penalties.push("vintage_obscure:-30");
  }

  // Short / generic name penalty
  if (candidateName.length <= 3 && candidateName !== search) {
    score -= 15;
    penalties.push("generic_name:-15");
  }

  return { score, boosts, penalties };
}

export function computeConfidence(score: number): number {
  if (score >= 120) return 0.95;
  if (score >= 100) return 0.9;
  if (score >= 80) return 0.8;
  if (score >= 50) return 0.65;
  if (score >= 30) return 0.5;
  if (score >= 10) return 0.35;
  return 0.2;
}

export function buildDebugEntry(
  candidate: ResolverCandidate,
  score: number,
  boosts: string[],
  penalties: string[],
  compatibility?: CompatibilityResult,
): ResolverDebug {
  return {
    candidate: candidate.name,
    source: candidate.source,
    bucket: candidate.bucket,
    score,
    boosts,
    penalties,
    eligible: compatibility?.eligible,
    rejectionReasons: compatibility?.reasons,
    confidenceAdjustment: compatibility?.confidenceAdjustment,
  };
}



export function rankCandidates(
  candidates: ResolverCandidate[],
  ctx: ScoringContext,
  compatibilityMap?: Map<string, CompatibilityResult>,
): { ranked: Array<ResolverCandidate & { finalScore: number }>; debug: ResolverDebug[] } {
  const debug: ResolverDebug[] = [];

  const scored = candidates.map((c) => {
    const normalizedCandidate = {
      ...c,
      bucket: classifyBucket(c.name, ctx.intent, ctx.normalizedQuery),
    };
    const compatibility = compatibilityMap?.get(`${normalizedCandidate.source}::${normalizedCandidate.name}`);
    const { score, boosts, penalties } = scoreCandidate(normalizedCandidate, ctx);
    let adjustedScore = score + Math.round((compatibility?.confidenceAdjustment ?? 0) * 100);
    
    let isFranchiseCollision = false;
    if (ctx.franchiseRoot) {
      const normTitle = cleanAlphanumeric(normalizedCandidate.name);
      const normRoot = cleanAlphanumeric(ctx.franchiseRoot);
      if (!normTitle.includes(normRoot)) {
        isFranchiseCollision = true;
      }
    }

    const finalPenalties = [...penalties, ...(compatibility?.penalties ?? [])];
    const finalReasons = [...(compatibility?.reasons ?? [])];
    let eligible = compatibility?.eligible ?? true;

    if (isFranchiseCollision) {
      eligible = false;
      finalReasons.push("Franchise root mismatch");
      adjustedScore = -9999;
    }

    debug.push(buildDebugEntry(
      normalizedCandidate,
      adjustedScore,
      boosts,
      finalPenalties,
      { eligible, reasons: finalReasons, penalties: finalPenalties, confidenceAdjustment: 0 },
    ));
    return { ...normalizedCandidate, finalScore: adjustedScore, eligible };
  });

  // Filter out ineligible candidates completely from ranked list
  const validScored = scored.filter(c => c.eligible);

  // Sort within buckets, then merge with priority:
  // franchise > title > character > sideContent
  const bucketOrder: CandidateBucket[] = ["franchise", "title", "character", "sideContent"];

  const buckets = new Map<CandidateBucket, typeof validScored>();
  for (const b of bucketOrder) {
    buckets.set(b, []);
  }
  for (const item of validScored) {
    const list = buckets.get(item.bucket);
    if (list) list.push(item);
    else buckets.get("title")!.push(item);
  }

  // Sort each bucket by score descending
  for (const list of buckets.values()) {
    list.sort((a, b) => b.finalScore - a.finalScore);
  }

  // For franchise/title intent, keep bucket priority order
  // For character intent, promote character bucket
  const ordered: CandidateBucket[] =
    ctx.intent === "character"
      ? ["character", "franchise", "title", "sideContent"]
      : bucketOrder;

  const ranked: typeof validScored = [];
  for (const b of ordered) {
    ranked.push(...(buckets.get(b) ?? []));
  }

  return { ranked, debug };
}
