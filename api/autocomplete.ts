
import { getIGDBToken } from "./igdbAuth.js";
import {
  classifyComicsQueryType,
  comicProviderTypeLabel,
  normalizeComicVineResourceType,
  type ProviderMetadata,
} from "../src/lib/resolver/providerMetadata.js";

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

function getClusterKey(name: string): string {
  const safeName = typeof name === 'string' ? name : "";
  const base = safeName.split(/[:\-\(]/)[0].trim().toLowerCase();
  return base.replace(/[^a-z0-9]+/g, "");
}

function isPublisherAligned(candidatePublisher: string | undefined, expectedPublisher: string): boolean {
  if (!candidatePublisher) return false;
  const candPubNorm = candidatePublisher.toLowerCase().replace(/[^a-z]+/g, "");
  const expPubNorm = expectedPublisher.toLowerCase().replace(/[^a-z]+/g, "");
  return candPubNorm.includes(expPubNorm) || expPubNorm.includes(candPubNorm);
}

async function fetchAutocomplete(query: string, lens: string, keys: any): Promise<any[]> {
  try {
    if (lens === "movies" || lens === "tv") {
      if (!keys.tmdb) return [];
      const endpoint = lens === "movies" ? "movie" : "tv";
      const res = await fetch(`https://api.themoviedb.org/3/search/${endpoint}?query=${encodeURIComponent(query)}&api_key=${keys.tmdb}`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).slice(0, 5).map((r: any) => ({
        id: r.id,
        name: r.title ?? r.name ?? r.original_title ?? r.original_name,
        year: (r.release_date || r.first_air_date || "").slice(0, 4) || null,
        genre: null, // TMDB requires extra lookup for genre IDs, so fallback to Movie/TV Series
        source: "tmdb"
      }));
    }
    if (lens === "anime") {
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).map((r: any) => ({
        id: r.mal_id,
        name: r.title_english ?? r.title,
        year: r.aired?.prop?.from?.year,
        genre: r.genres?.[0]?.name ?? null,
        source: "jikan"
      }));
    }
    if (lens === "games") {
      const yearRegex = /\b(19\d\d|20\d\d)\b/;
      const yearMatch = query.match(yearRegex);
      const queryYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const cleanQuery = query.replace(yearRegex, "").replace(/\s+/g, " ").trim();
      const normQuery = cleanQuery.toLowerCase().replace(/[^a-z0-9]/g, "");
      const queryCompletenessWeight = Math.min(1.0, normQuery.length / 8);

      const POPULAR_GAMES = [
        "Red Dead Redemption 2", "Elden Ring", "Silent Hill 2", "Bloodborne",
        "Cyberpunk 2077", "Metal Gear Solid", "The Witcher 3: Wild Hunt", "God of War",
        "The Last of Us", "Halo", "Doom", "Sonic the Hedgehog", "The Legend of Zelda",
        "Grand Theft Auto V", "Minecraft", "Skyrim", "BioShock", "Mass Effect",
        "Portal 2", "Dark Souls", "Resident Evil 4", "Final Fantasy VII",
        "Super Mario Odyssey", "Hades", "Fallout 4"
      ];

      let rawCandidates: any[] = [];

      // 1. IGDB Retrieval
      if (keys.igdbId && keys.igdbSecret) {
        try {
          const igdbToken = await getIGDBToken(keys.igdbId, keys.igdbSecret);
          if (igdbToken) {
            const abortController = new AbortController();
            const fetchPromise = fetch("https://api.igdb.com/v4/games", {
              method: "POST",
              headers: {
                "Client-ID": keys.igdbId,
                Authorization: `Bearer ${igdbToken}`,
                "Content-Type": "text/plain",
              },
              body: `search "${cleanQuery}"; fields name, cover.url, first_release_date, rating, genres.name, platforms.name, involved_companies.company.name, version_parent, parent_game; limit 10;`,
              signal: abortController.signal
            }).then(res => {
              if (!res.ok) throw new Error("IGDB HTTP error " + res.status);
              return res.json();
            });

            let data: any;
            try {
              data = await Promise.race([
                fetchPromise,
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
              ]);
            } finally {
              abortController.abort(); // Clear any pending fetch
            }

            if (data && Array.isArray(data) && data.length > 0) {
              rawCandidates = data.map((r: any) => ({
                id: r.id,
                name: r.name,
                year: r.first_release_date ? new Date(r.first_release_date * 1000).getFullYear() : null,
                genre: r.genres?.[0]?.name ?? null,
                platforms: r.platforms?.map((p: any) => p.name) ?? [],
                coverArt: r.cover?.url ? `https:${r.cover.url.replace("t_thumb", "t_cover_big")}` : null,
                publisher: r.involved_companies?.[0]?.company?.name || null,
                popularity: r.rating ?? 0,
                source: "igdb",
                isEdition: !!(r.version_parent || r.parent_game),
                queryYear,
                cleanQuery
              }));
              if (process.env.DEBUG_AUTOCOMPLETE === "true") {
                console.log("[IGDB AUTOCOMPLETE] Base Candidates Retrieved:", rawCandidates.length);
              }
            }
          }
        } catch (err: any) {
          const msg = err?.message || "";
          const isTransient = err?.name === "AbortError" || msg.includes("ECONNRESET") || msg.includes("fetch failed") || msg.includes("Timeout");
          if (!isTransient) {
            console.error("[IGDB AUTOCOMPLETE] Fetch Failed, falling back to local registry:", err.message);
          } else if (process.env.DEBUG_AUTOCOMPLETE === "true") {
            console.log("[IGDB AUTOCOMPLETE] Transient fetch interruption:", err.message);
          }
        }
      }

      // 2. Local Fallback Registry
      if (rawCandidates.length === 0) {
        if (process.env.DEBUG_AUTOCOMPLETE === "true") {
          console.log("[IGDB AUTOCOMPLETE] Using local fallback for Games");
        }
        rawCandidates = POPULAR_GAMES.filter(g => g.toLowerCase().includes(normQuery))
          .slice(0, 5)
          .map((g) => ({
            id: `local_${g.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
            name: g,
            year: null,
            genre: "Game",
            platforms: [],
            coverArt: null,
            popularity: 80,
            source: "local",
            isEdition: false,
            queryYear,
            cleanQuery
          }));
      }

      // 3. Normalization & Ranking Engine (Survivorship Scoring)
      const queryLen = normQuery.length;
      let MIN_RELEVANCE_THRESHOLD = 0.40;
      if (queryLen <= 3) MIN_RELEVANCE_THRESHOLD = 0.20;
      else if (queryLen <= 6) MIN_RELEVANCE_THRESHOLD = 0.30;
      else MIN_RELEVANCE_THRESHOLD = 0.40;

      const scoredCandidates = rawCandidates.map(c => {
        let score = 0;
        const normCandidate = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const exactMatch = normQuery === normCandidate;
        
        const editionKeywords = ["special edition", "remastered", "remaster", "definitive edition", "goty", "game of the year", "director's cut", "complete edition", "hd collection", "enhanced edition", "enhanced", "royal", "ultimate edition", "ultimate", "deluxe edition", "deluxe"];
        const queryEditions = editionKeywords.filter(k => query.toLowerCase().includes(k));
        const candidateEditions = editionKeywords.filter(k => c.name.toLowerCase().includes(k));
        
        const hasDivergentEdition = candidateEditions.length > 0 && queryEditions.length === 0;
        
        // Prefix Continuity Dominance
        const prefixAligns = normCandidate.startsWith(normQuery);

        if (exactMatch) {
          score += 0.50;
        } else if (prefixAligns) {
          score += 0.45; // Massive prefix continuity boosting
        } else {
          const queryTokens = cleanQuery.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0);
          const candidateTokens = c.name.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0);
          const overlappingTokens = queryTokens.filter((t: string) => candidateTokens.includes(t));
          const tokenOverlapRatio = queryTokens.length > 0 ? overlappingTokens.length / Math.max(queryTokens.length, candidateTokens.length) : 0;
          score += tokenOverlapRatio * 0.20;
        }

        if (!hasDivergentEdition && !c.isEdition) {
          score += 0.15;
        } else if (hasDivergentEdition) {
          score -= 0.10;
        } else if (queryEditions.some(eq => candidateEditions.includes(eq))) {
          score += 0.15;
        }

        if (queryYear && c.year) {
          if (c.year === queryYear) score += 0.15;
          else if (Math.abs(c.year - queryYear) <= 1) score -= 0.05;
          else score -= 0.20;
        }

        score += (c.popularity / 100) * 0.10; 
        if (c.source === "igdb") score += 0.10;
        
        score = score * queryCompletenessWeight;

        if (c.source === "local") score = Math.min(score, 0.75);
        if (exactMatch && queryYear === c.year && queryYear !== null) {
          score = Math.min(0.98, score + 0.20);
        } else if (exactMatch) {
          score = Math.max(0.90, Math.min(0.94, score + 0.10));
        } else {
           score = Math.min(score, 0.89);
        }

        // Candidate Tier Classification
        let classification: "STRONG" | "VALID_PREFIX" | "WEAK" | "REJECTED" = "REJECTED";
        if (score >= 0.70) {
          classification = "STRONG";
        } else if (prefixAligns && score >= MIN_RELEVANCE_THRESHOLD * 0.8) {
          classification = "VALID_PREFIX"; // Prefix overrides tight suppression
        } else if (score >= MIN_RELEVANCE_THRESHOLD) {
          classification = "WEAK";
        } else {
          classification = "REJECTED";
        }

        return { 
          ...c, 
          score: Math.round(score * 100) / 100, 
          franchiseRoot: typeof c.name === 'string' ? c.name.split(/[:\- ]/)[0].toLowerCase() : "",
          classification
        };
      });

      // Franchise Cohesion Grouping
      const grouped = new Map<string, any[]>();
      for (const c of scoredCandidates) {
        if (!grouped.has(c.franchiseRoot)) grouped.set(c.franchiseRoot, []);
        grouped.get(c.franchiseRoot)!.push(c);
      }

      const flatGrouped: any[] = [];
      const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
        const maxA = Math.max(...a[1].map(x => x.score));
        const maxB = Math.max(...b[1].map(x => x.score));
        return maxB - maxA;
      });

      for (const [_, groupItems] of sortedGroups) {
        groupItems.sort((a, b) => b.score - a.score);
        flatGrouped.push(...groupItems);
      }

      // 4. Suppression Gate (Quality Gating)
      const finalSurvivors: any[] = [];
      const rejections: any[] = [];

      for (const c of flatGrouped) {
        if (c.classification === "REJECTED") {
           rejections.push({ title: c.name, score: c.score, classification: c.classification, reason: `Below dynamic threshold (${MIN_RELEVANCE_THRESHOLD})` });
        } else {
           finalSurvivors.push(c);
        }
      }

      if (rejections.length > 0 && process.env.DEBUG_AUTOCOMPLETE === "true") {
         console.log("[AUTOCOMPLETE REJECTION]", { query, threshold: MIN_RELEVANCE_THRESHOLD, rejections });
      }

      const topSurvivors = finalSurvivors.slice(0, 5);

      if (process.env.DEBUG_AUTOCOMPLETE === "true") {
        console.log("[AUTOCOMPLETE SURVIVORS]", { 
          query, 
          threshold: MIN_RELEVANCE_THRESHOLD, 
          survivors: topSurvivors.map(s => ({ title: s.name, score: s.score, class: s.classification }))
        });
      }

      return topSurvivors;
    }
    if (lens === "comics") {
      const classifiedType = classifyComicsQueryType(query);
      if (classifiedType && process.env.DEBUG_AUTOCOMPLETE === "true") {
        console.log("[TYPED_ENTITY_CLASSIFIED]", { query, lens, providerType: classifiedType });
      }
      if (keys.comicVine) {
         const res = await fetch(`https://comicvine.gamespot.com/api/search/?api_key=${keys.comicVine}&query=${encodeURIComponent(query)}&resources=character,volume,issue,story_arc,team,publisher&field_list=id,name,start_year,publisher,resource_type,issue_number&format=json&limit=12`, { headers: { "User-Agent": "Nerdvana/1.0" }, signal: AbortSignal.timeout(2500) });
         if (res.ok) {
            const data = await res.json();
            const rawResults = data.results || [];
            
            const candidates = rawResults
              .map((r: any) => {
                const rawProviderType = normalizeComicVineResourceType(r.resource_type, r.name);
                const normalizedName = String(r.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
                const normalizedQuery = String(query ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
                const resourceType = String(r.resource_type ?? "volume").toLowerCase();
                const providerType =
                  classifiedType &&
                  (classifiedType === "event" || classifiedType === "story_arc") &&
                  normalizedName === normalizedQuery &&
                  ["volume", "issue", "story_arc"].includes(resourceType)
                    ? classifiedType
                    : rawProviderType;

                const exactBoost = normalizedName === normalizedQuery ? 200 : 0;
                const typeBoost = classifiedType && providerType === classifiedType ? 50 : 0;
                const typePenalty = classifiedType && providerType !== classifiedType ? -150 : 0;

                // 1. Franchise Authority Scoring & Tiers
                const safeNameForSplit = typeof r.name === 'string' ? r.name : "";
                const franchiseRoot = safeNameForSplit.split(/[:\- ]/)[0].toLowerCase();
                const baseTitle = safeNameForSplit.split(/[:\-\(]/)[0].trim().toLowerCase();
                
                let expectedPublisher: string | null = null;
                const queryNorm = query.toLowerCase().replace(/[^a-z0-9]+/g, "");
                const baseTitleNorm = baseTitle.replace(/[^a-z0-9]+/g, "");
                const franchiseRootNorm = franchiseRoot.replace(/[^a-z0-9]+/g, "");

                for (const [key, pub] of Object.entries(CANONICAL_PUBLISHERS)) {
                  const keyNorm = key.replace(/[^a-z0-9]+/g, "");
                  if (keyNorm === queryNorm || keyNorm === baseTitleNorm || keyNorm === franchiseRootNorm) {
                    expectedPublisher = pub;
                    break;
                  }
                }

                const nameLower = safeNameForSplit.toLowerCase();
                const isExactName = nameLower.replace(/[^a-z0-9]+/g, "") === query.toLowerCase().replace(/[^a-z0-9]+/g, "");
                const isParody = nameLower.includes("parody") || nameLower.includes("spoof") || nameLower.includes("tribute") || nameLower.includes("parody variant");
                const isAltUniverse = nameLower.includes("earth-") || nameLower.includes("variant") || nameLower.includes("alternative") || nameLower.includes("lego") || nameLower.includes("parody");
                const isAdjacentContinuity = nameLower.includes("beyond") || nameLower.includes("ultimate") || nameLower.includes("amazing") || nameLower.includes("arkham");
                const isLowAuthority = /\b(vol|vol\.|volume|tpb|cover|untitled|omnibus|compendium|edition|absolute|trade paperback)\b/i.test(nameLower) || /#\d+/.test(nameLower) || /\bbook \d+\b/i.test(nameLower);

                const typeMatches = !classifiedType || providerType === classifiedType;

                let publisherStatus: "boost" | "penalty" | "neutral" = "neutral";
                if (expectedPublisher) {
                  if (r.publisher?.name && isPublisherAligned(r.publisher.name, expectedPublisher)) {
                    publisherStatus = "boost";
                  } else if (r.publisher?.name) {
                    publisherStatus = "penalty";
                  }
                }

                // Universe Dominance Check
                let universeBoost = 0;
                if (nameLower.includes("earth-616") || nameLower.includes("prime") || nameLower.includes("main continuity")) {
                  universeBoost = 60;
                }

                let tier = 4;
                let tierReason = "";
                let tierScoreEffect = -60;

                if (publisherStatus === "penalty" || isParody || typePenalty < 0 || isLowAuthority) {
                  tier = 4;
                  tierReason = publisherStatus === "penalty" ? "Alternate publisher duplicate" : (isParody ? "Parody / spoof variant" : (isLowAuthority ? "Low-authority generic title" : "Cross-type mismatch"));
                  tierScoreEffect = -100;
                } else if (isAltUniverse) {
                  tier = 3;
                  tierReason = "Legitimate alternate universe";
                  tierScoreEffect = 30;
                } else if (isAdjacentContinuity) {
                  tier = 2;
                  tierReason = "Canonical adjacent continuity";
                  tierScoreEffect = 80;
                } else if (isExactName && typeMatches && (publisherStatus === "boost" || publisherStatus === "neutral")) {
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

                const franchiseAuthorityScore = exactBoost + typeBoost + typePenalty + tierScoreEffect + universeBoost;

                if (process.env.DEBUG_AUTOCOMPLETE === "true") {
                  console.log(`[RANKING_TIER_ASSIGNED] Candidate: "${r.name}" | Assigned Tier: ${tier} | Reason: "${tierReason}"`);
                  console.log(`[PUBLISHER_CONTINUITY] Candidate: "${r.name}" | Publisher: "${r.publisher?.name || 'Unknown'}" | Match Status: ${publisherStatus}`);
                  if (universeBoost > 0) {
                    console.log(`[UNIVERSE_DOMINANCE] Candidate: "${r.name}" | Universe: "Mainstream" | Dominance Boost: +${universeBoost}`);
                  }
                  if (typePenalty < 0) {
                    console.log(`[CROSS_TYPE_PENALTY] Candidate: "${r.name}" | Conflict: Query Intent ${classifiedType} vs Candidate Type ${providerType} | Penalty: -60`);
                  }
                  console.log(`[FRANCHISE_AUTHORITY_SCORE] Candidate: "${r.name}" | Total Authority Score: ${franchiseAuthorityScore}`);
                }

                return {
                  id: r.id,
                  name: r.name,
                  year: r.start_year,
                  genre: null,
                  source: "comicvine",
                  publisher: r.publisher?.name,
                  resource_type: r.resource_type,
                  providerType,
                  issueNumber: r.issue_number,
                  tier,
                  score: franchiseAuthorityScore,
                };
              });

            // 2. Duplicate Cluster Consolidation
            const clusters = new Map<string, typeof candidates>();
            for (const cand of candidates) {
              const clusterKey = getClusterKey(cand.name);
              if (!clusters.has(clusterKey)) {
                clusters.set(clusterKey, []);
              }
              clusters.get(clusterKey)!.push(cand);
            }

            const consolidated: typeof candidates = [];
            for (const [key, clusterItems] of clusters.entries()) {
              clusterItems.sort((a, b) => b.score - a.score);
              const leader = clusterItems[0];
              const suppressed = clusterItems.slice(1).map(x => x.name);
              
              if (process.env.DEBUG_AUTOCOMPLETE === "true") {
                console.log(`[DUPLICATE_CLUSTER] Cluster Root: "${key}" | Members: [${clusterItems.map(x => `"${x.name}"`).join(", ")}]`);
                if (suppressed.length > 0) {
                  console.log(`[CANONICAL_OWNER_SELECTED] Selected Leader: "${leader.name}" | Suppressed: [${suppressed.join(", ")}]`);
                }
              }
              
              consolidated.push(leader);
            }

            return consolidated
              .sort((a: any, b: any) => b.score - a.score)
              .slice(0, 5);
         }
      }
    }
  } catch (err: any) {
    const msg = err?.message || "";
    const isTransient = err?.name === "AbortError" || msg.includes("ECONNRESET") || msg.includes("fetch failed") || msg.includes("Timeout");
    if (!isTransient) {
      console.error("[Nerdvana Autocomplete] Error:", err);
    } else if (process.env.DEBUG_AUTOCOMPLETE === "true") {
      console.log("[Nerdvana Autocomplete] Transient fetch interruption:", err.message);
    }
  }
  return [];
}

export default async function handler(req: any, res?: any) {
  try {
    let q = "";
    let lens = "movies";

    if (req.url) {
      const url = new URL(req.url, "http://localhost");
      q = url.searchParams.get("q") || "";
      lens = url.searchParams.get("lens") || "movies";
    } else if (req.query) {
      q = req.query.q || "";
      lens = req.query.lens || "movies";
    }

    if (!q || q.length < 2) {
      if (res) return res.status(200).json([]);
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const env = (globalThis as any).process?.env ?? {};
    const keys = {
      tmdb: (env.TMDB_API_KEY || env.VITE_TMDB_API_KEY)?.trim() || undefined,
      igdbId: (env.IGDB_CLIENT_ID || env.VITE_IGDB_CLIENT_ID)?.trim() || undefined,
      igdbSecret: (env.IGDB_CLIENT_SECRET || env.VITE_IGDB_CLIENT_SECRET)?.trim() || undefined,
      comicVine: (env.COMICVINE_API_KEY || env.VITE_COMICVINE_API_KEY)?.trim() || undefined,
    };

    const results = await fetchAutocomplete(q, lens, keys);

    const mapped = results.filter(r => r.name).map((r, i) => {
      const sourceName = r.source === "tmdb" ? "TMDB" : r.source === "jikan" ? "Jikan" : r.source === "igdb" ? "IGDB" : r.source === "local" ? "Local" : "ComicVine";
      
      const mediaTypeLabel =
        lens === "movies" ? "Movie" :
        lens === "tv" ? "TV Series" :
        lens === "anime" ? "Anime" :
        lens === "games" ? "Game" :
        comicProviderTypeLabel(r.providerType);

      // Formulate editorial genre or media type label
      let genreLabel = r.genre ?? null;
      if (genreLabel) {
        if (lens === "anime" && !genreLabel.toLowerCase().includes("anime")) {
          genreLabel = `${genreLabel} Anime`;
        } else if (lens === "games") {
          if (genreLabel.toLowerCase() === "rpg") {
            genreLabel = "RPG Game";
          } else if (!genreLabel.toLowerCase().includes("game")) {
            genreLabel = `${genreLabel} Game`;
          }
        }
      }

      const primaryDetail = genreLabel || mediaTypeLabel;
      const parts = [primaryDetail];
      if (r.year) {
        parts.push(String(r.year));
      }
      if (lens === "games" && r.platforms && r.platforms.length > 0) {
        parts.push(r.platforms.slice(0, 3).join(", "));
      }
      if (lens === "comics" && r.publisher) {
        parts.push(r.publisher);
      }
      
      const metadataLabel = parts.join(" · ");

      // Dynamic Confidence Scoring for Games is now handled upstream via survivorship scoring
      let calculatedConfidence = lens === "games" ? r.score : 0.90;
      const safeRName = typeof r.name === 'string' ? r.name : "";
      const franchiseRoot = r.franchiseRoot || safeRName.split(/[:\- ]/)[0].toLowerCase();

      let selectionValue = r.name;
      let providerMetadata: ProviderMetadata | undefined = undefined;

      if (lens === "games") {
        selectionValue = `igdb::game::${r.id}`;
        providerMetadata = {
          provider: "igdb",
          id: String(r.id),
          confidence: calculatedConfidence,
          canonicalTitle: r.name,
          franchiseRoot: franchiseRoot,
          releaseYear: r.year,
          popularity: r.popularity
        };
      } else if (lens === "movies" || lens === "tv") {
        const type = lens === "movies" ? "movie" : "tv";
        selectionValue = `tmdb::${type}::${r.id}`;
        providerMetadata = {
          provider: "tmdb",
          id: String(r.id),
          confidence: 0.99,
          canonicalTitle: r.name,
          franchiseRoot: franchiseRoot,
          releaseYear: r.year ? parseInt(r.year) : null
        };
      } else if (lens === "anime") {
        selectionValue = `jikan::anime::${r.id}`;
        providerMetadata = {
          provider: "jikan",
          id: String(r.id),
          confidence: 0.99,
          canonicalTitle: r.name,
          franchiseRoot: franchiseRoot,
          releaseYear: r.year ? parseInt(r.year) : null
        };
      } else if (lens === "comics") {
        const resourceType = String(r.resource_type ?? "volume").toLowerCase();
        const normalizedName = String(r.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        const normalizedQuery = String(q ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        const rawProviderType = normalizeComicVineResourceType(r.resource_type, r.name);
        const classifiedType = classifyComicsQueryType(q);
        const providerType =
          classifiedType &&
          (classifiedType === "event" || classifiedType === "story_arc") &&
          normalizedName === normalizedQuery &&
          ["volume", "issue", "story_arc"].includes(resourceType)
            ? classifiedType
            : rawProviderType;
        selectionValue = `comicvine::${resourceType}::${r.id}`;
        providerMetadata = {
          provider: "comicvine",
          id: String(r.id),
          confidence: 0.99,
          canonicalTitle: r.name,
          franchiseRoot: franchiseRoot,
          releaseYear: r.year ? parseInt(r.year) : null,
          providerType,
          providerResourceType: resourceType,
          publisherLabel: r.publisher ?? null,
        };
        if (process.env.DEBUG_AUTOCOMPLETE === "true") {
          console.log("[TYPED_PROVIDER_ACQUIRED]", {
            query: q,
            lens,
            id: providerMetadata.id,
            providerType,
            providerResourceType: resourceType,
            title: r.name,
          });
        }
      }

      const suggestion = {
        canonicalEntity: r.name,
        selectionValue,
        displayTitle: r.name,
        franchise: null,
        mediaLens: lens,
        mediaLabel: lens === "movies" ? "Film" : lens === "tv" ? "TV" : lens === "anime" ? "Anime" : lens === "games" ? "Games" : "Comics",
        namespaceLabel: sourceName, // Keep sourceName internally for diagnostics
        continuityLabel: r.year ? String(r.year) : null,
        metadataLabel: metadataLabel, // Expose only clean editorial metadata label
        universe: null,
        source: "api_autocomplete",
        score: lens === "games" ? Math.round(calculatedConfidence * 100) : (lens === "comics" ? r.score : (30 - i)),
        qualifiedId: null,
        thumbnailUrl: lens === "games" ? r.coverArt : null,
        aliases: [],
        matchReasons: ["api-fetch"],
        providerMetadata,
        providerType: providerMetadata?.providerType ?? null,
      };

      if (lens === "comics" && process.env.DEBUG_AUTOCOMPLETE === "true") {
        console.log("[AUTOCOMPLETE_COMICS_RESULT]", {
          title: suggestion.displayTitle,
          selectionValue: suggestion.selectionValue,
          providerType: suggestion.providerType,
          providerMetadata: suggestion.providerMetadata,
        });
      }

      return suggestion;
    });

    if (lens === "games" || lens === "comics") {
      mapped.sort((a, b) => b.score - a.score);
    }

    if (process.env.DEBUG_AUTOCOMPLETE === "true") {
      mapped.forEach(suggestion => {
        console.log("[AUTOCOMPLETE_RAW_SUGGESTION]", suggestion);
      });
    }

    if (res) return res.status(200).json(mapped);
    return new Response(JSON.stringify(mapped), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    if (res) return res.status(200).json([]);
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }
}
