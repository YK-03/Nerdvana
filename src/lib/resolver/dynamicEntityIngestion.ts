import type { MediaLens } from "../../app/mediaLens.js";
import { getIGDBToken } from "../../server/igdbAuth.js";
import {
  classifyComicsQueryType,
  normalizeComicVineResourceType,
  type ComicProviderType,
  type ProviderMetadata,
} from "./providerMetadata.js";

export type TemporaryCanonicalEntity = {
  id: string;
  title: string;
  normalizedTitle: string;
  aliases: string[];
  lens: MediaLens;
  source: "tmdb" | "jikan" | "igdb" | "comicvine" | "googlebooks" | "anilist";
  authority: "external_ingested";
  confidence: number;
  metadata: {
    releaseYear?: number;
    genres?: string[];
    overview?: string;
    poster?: string;
    franchiseRoot?: string;
    providerType?: ComicProviderType;
    providerResourceType?: string;
    providerMetadata?: ProviderMetadata;
    publisherLabel?: string;
  };
};

type DynamicEntityResult = {
  entity: TemporaryCanonicalEntity | null;
  rejectedCount: number;
  ambiguousEntities?: TemporaryCanonicalEntity[];
};

export function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeNormalize(value: string): string {
  let norm = value.normalize("NFKC").toLowerCase().trim();
  // Strip punctuation while preserving letters, numbers, and combining marks in any script
  norm = norm.replace(/[^\p{L}\p{N}\p{M}\s]+/gu, " ");
  // Compress multiple spaces
  norm = norm.replace(/\s+/g, " ").trim();
  
  // Article normalization (lookup-only): strip leading articles
  const words = norm.split(" ");
  if (words.length > 1 && ["the", "a", "an"].includes(words[0])) {
    return words.slice(1).join(" ");
  }
  return norm;
}

const ROMAN_TO_ARABIC: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
};

export function normalizeNumerals(text: string): string {
  return text
    .split(" ")
    .map((token) => ROMAN_TO_ARABIC[token] ?? token)
    .join(" ");
}

export function titleMatchScore(queryNorm: string, safeQueryNorm: string, candidateTitle: string): number {
  const candidateNorm = normalize(candidateTitle);
  const safeCandidateNorm = safeNormalize(candidateTitle);

  const queryNum = normalizeNumerals(queryNorm);
  const safeQueryNum = normalizeNumerals(safeQueryNorm);
  const candNum = normalizeNumerals(candidateNorm);
  const safeCandNum = normalizeNumerals(safeCandidateNorm);

  if (
    candidateNorm === queryNorm ||
    safeCandidateNorm === safeQueryNorm ||
    candidateNorm === safeQueryNorm ||
    safeCandidateNorm === queryNorm ||
    candNum === queryNum ||
    safeCandNum === safeQueryNum ||
    candNum === safeQueryNum ||
    safeCandNum === queryNum
  ) {
    return 100;
  }

  // A provider title that begins with the query is a useful partial match,
  // but it must rank below an exact title. This avoids accepting a later
  // edition when the base title is present in the same response.
  if (
    (queryNorm.length >= 4 && candidateNorm.startsWith(queryNorm)) ||
    (queryNum.length >= 4 && candNum.startsWith(queryNum))
  ) {
    return 80;
  }

  const queryTokens = queryNorm.split(" ").filter(Boolean);
  const candidateTokens = candidateNorm.split(" ").filter(Boolean);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  const queryNumTokens = queryNum.split(" ").filter(Boolean);
  const candNumTokens = candNum.split(" ").filter(Boolean);

  const querySet = new Set(queryNumTokens);
  const candidateSet = new Set(candNumTokens);
  let sharedTokens = 0;
  for (const token of candidateSet) {
    if (querySet.has(token)) sharedTokens++;
  }

  // Symmetrical overlap avoids awarding short candidates a high score when a long
  // query merely contains their single common word.
  const maxTokens = Math.max(querySet.size, candidateSet.size);
  const symmetricCoverage = maxTokens > 0 ? sharedTokens / maxTokens : 0;
  return symmetricCoverage >= 0.7 ? 60 : 0;
}

const TMDB_MOVIE_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
};

const TMDB_TV_GENRES: Record<number, string> = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10762: "Kids", 9648: "Mystery", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk",
  10768: "War & Politics", 37: "Western"
};

export async function fetchDynamicEntity(
  query: string,
  lens: MediaLens,
  keys: { tmdb?: string; rawg?: string; igdbId?: string; igdbSecret?: string; comicVine?: string }
): Promise<DynamicEntityResult> {
  const queryNorm1 = normalize(query);
  const queryNorm2 = safeNormalize(query);
  let rejectedCount = 0;

  if (!queryNorm1) return { entity: null, rejectedCount: 0 };

  try {
    if (lens === "movies" || lens === "tv") {
      if (!keys.tmdb) {
        console.warn("[Nerdvana Ingestion] TMDB key missing.");
        return { entity: null, rejectedCount: 0 };
      }
      const type = lens === "movies" ? "movie" : "tv";
      const res = await fetch(
        `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(query)}&api_key=${keys.tmdb}`
      );
      if (!res.ok) return { entity: null, rejectedCount: 0 };

      const data = await res.json();
      const results = data.results || [];
      const matches: Array<{ entity: TemporaryCanonicalEntity; score: number; popularity: number }> = [];

      for (const r of results) {
        const title = r.title ?? r.name ?? r.original_title ?? r.original_name;
        if (!title) continue;

        const yearVal = r.release_date || r.first_air_date || "";
        const releaseYear = yearVal.slice(0, 4) ? parseInt(yearVal.slice(0, 4)) : undefined;

        const candidateNames = [
          r.title,
          r.name,
          r.original_title,
          r.original_name,
        ].filter(Boolean) as string[];

        const titleScores = candidateNames.map((candName) => {
          const candWithYear1 = releaseYear ? normalize(`${candName} ${releaseYear}`) : "";
          const candWithYear2 = releaseYear ? safeNormalize(`${candName} ${releaseYear}`) : "";
          const isYearExact = releaseYear ? (
            queryNorm1 === candWithYear1 || queryNorm1 === candWithYear2 ||
            queryNorm2 === candWithYear1 || queryNorm2 === candWithYear2
          ) : false;
          const baseScore = titleMatchScore(queryNorm1, queryNorm2, candName);
          const score = isYearExact ? 100 : baseScore;
          return { candName, score };
        });
        const bestTitle = titleScores.sort((a, b) => b.score - a.score)[0];

        if (bestTitle && bestTitle.score > 0) {
          const genreIds = r.genre_ids || [];
          const genres = genreIds.map((id: number) => 
            lens === "movies" ? TMDB_MOVIE_GENRES[id] : TMDB_TV_GENRES[id]
          ).filter(Boolean);

          const entity: TemporaryCanonicalEntity = {
            id: `tmdb::${type}::${r.id}`,
            title: bestTitle.candName,
            normalizedTitle: normalize(bestTitle.candName),
            aliases: [...candidateNames, r.title, r.name, r.original_title, r.original_name].filter(Boolean),
            lens,
            source: "tmdb",
            authority: "external_ingested",
            confidence: 0.99,
            metadata: {
              releaseYear,
              genres,
              overview: r.overview,
              poster: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : undefined
            }
          };
          matches.push({ entity, score: bestTitle.score, popularity: Number(r.popularity) || 0 });
        } else {
          rejectedCount++;
        }
      }

      matches.sort((a, b) => b.score - a.score || b.popularity - a.popularity);
      if (matches[0]) {
        const top = matches[0];
        const tiedTop = matches.filter((candidate) => candidate.score === top.score);
        const distinctEntities = tiedTop.filter((c, idx, arr) => arr.findIndex((o) => o.entity.id === c.entity.id) === idx);
        if (distinctEntities.length > 1) {
          if (top.score < 100) {
            return {
              entity: null,
              rejectedCount,
              ambiguousEntities: distinctEntities.slice(0, 5).map((candidate) => candidate.entity),
            };
          }
          const distinctYears = new Set(distinctEntities.map((c) => c.entity.metadata.releaseYear ?? null));
          if (distinctYears.size > 1) {
            return {
              entity: null,
              rejectedCount,
              ambiguousEntities: distinctEntities.slice(0, 5).map((candidate) => candidate.entity),
            };
          }
        }
        return { entity: top.entity, rejectedCount };
      }
    } else if (lens === "anime") {
      let results: any[] = [];
      let isAniListFallback = false;

      try {
        const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const data = await res.json();
          results = data.data || [];
        }
      } catch (err) {
        console.warn("[Nerdvana Ingestion] Jikan fetch failed, attempting AniList fallback:", err);
      }

      // AniList fallback if Jikan failed or returned no results
      if (results.length === 0) {
        try {
          const anilistQuery = `
            query ($search: String) {
              Page (page: 1, perPage: 8) {
                media (search: $search, type: ANIME) {
                  id
                  title {
                    romaji
                    english
                    native
                  }
                  synonyms
                  meanScore
                  startDate {
                    year
                  }
                  genres
                  description
                  coverImage {
                    large
                  }
                }
              }
            }
          `;
          const alRes = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            signal: AbortSignal.timeout(10_000),
            body: JSON.stringify({
              query: anilistQuery,
              variables: { search: query },
            }),
          });
          if (alRes.ok) {
            const alData = await alRes.json();
            const alList = alData?.data?.Page?.media || [];
            if (alList.length > 0) {
              results = alList;
              isAniListFallback = true;
            }
          }
        } catch (alErr) {
          console.warn("[Nerdvana Ingestion] AniList fallback failed:", alErr);
        }
      }

      if (results.length === 0) return { entity: null, rejectedCount: 0 };

      const matches: Array<{ entity: TemporaryCanonicalEntity; score: number; popularity: number }> = [];

      for (const r of results) {
        const candidateNames = isAniListFallback
          ? [r.title?.english, r.title?.romaji, r.title?.native, ...(r.synonyms || [])].filter(Boolean) as string[]
          : [
              r.title_english,
              r.title,
              r.title_japanese,
              ...(r.titles?.map((t: any) => t.title) || []),
            ].filter(Boolean) as string[];

        if (candidateNames.length === 0) continue;

        const releaseYear = isAniListFallback
          ? r.startDate?.year || undefined
          : r.aired?.prop?.from?.year || undefined;

        const titleScores = candidateNames.map((candName) => {
          const candWithYear1 = releaseYear ? normalize(`${candName} ${releaseYear}`) : "";
          const candWithYear2 = releaseYear ? safeNormalize(`${candName} ${releaseYear}`) : "";
          const isYearExact = releaseYear ? (
            queryNorm1 === candWithYear1 || queryNorm1 === candWithYear2 ||
            queryNorm2 === candWithYear1 || queryNorm2 === candWithYear2
          ) : false;
          const baseScore = titleMatchScore(queryNorm1, queryNorm2, candName);
          const score = isYearExact ? 100 : baseScore;
          return { candName, score };
        });
        const bestTitle = titleScores.sort((a, b) => b.score - a.score)[0];

        if (bestTitle && bestTitle.score > 0) {
          const genres = isAniListFallback
            ? (r.genres || []).filter(Boolean)
            : (r.genres || []).map((g: any) => g.name).filter(Boolean);

          const providerSource = isAniListFallback ? "anilist" : "jikan";
          const rawId = isAniListFallback ? String(r.id) : String(r.mal_id);
          const entityId = `${providerSource}::anime::${rawId}`;
          const poster = isAniListFallback
            ? r.coverImage?.large || undefined
            : r.images?.jpg?.image_url || undefined;
          const overview = isAniListFallback ? r.description : r.synopsis;

          const entity: TemporaryCanonicalEntity = {
            id: entityId,
            title: bestTitle.candName,
            normalizedTitle: normalize(bestTitle.candName),
            aliases: candidateNames,
            lens,
            source: providerSource,
            authority: "external_ingested",
            confidence: 0.99,
            metadata: {
              releaseYear,
              genres,
              overview,
              poster,
              providerType: "anime",
              providerResourceType: "anime",
              providerMetadata: {
                provider: providerSource,
                id: rawId,
                confidence: 0.99,
                canonicalTitle: bestTitle.candName,
                releaseYear,
                providerType: "anime",
                providerResourceType: "anime",
              },
            },
          };
          matches.push({
            entity,
            score: bestTitle.score,
            popularity: isAniListFallback
              ? Number(r.meanScore ? r.meanScore * 1000 : 0)
              : Number(r.members) || Number(r.score ? r.score * 10000 : 0),
          });
        } else {
          rejectedCount++;
        }
      }

      matches.sort((a, b) => b.score - a.score || b.popularity - a.popularity);
      if (matches[0]) {
        const top = matches[0];
        const tiedTop = matches.filter((candidate) => candidate.score === top.score);
        const distinctEntities = tiedTop.filter((c, idx, arr) => arr.findIndex((o) => o.entity.id === c.entity.id) === idx);
        if (distinctEntities.length > 1) {
          if (top.score < 100) {
            return {
              entity: null,
              rejectedCount,
              ambiguousEntities: distinctEntities.slice(0, 5).map((candidate) => candidate.entity),
            };
          }
          const distinctYears = new Set(distinctEntities.map((c) => c.entity.metadata.releaseYear).filter(Boolean));
          if (distinctYears.size > 1) {
            return {
              entity: null,
              rejectedCount,
              ambiguousEntities: distinctEntities.slice(0, 5).map((candidate) => candidate.entity),
            };
          }
        }
        return { entity: top.entity, rejectedCount };
      }
    } else if (lens === "games") {
      if (!keys.igdbId || !keys.igdbSecret) {
        console.warn("[Nerdvana Ingestion] IGDB keys missing.");
        return { entity: null, rejectedCount: 0 };
      }
      try {
        const igdbToken = await getIGDBToken(keys.igdbId, keys.igdbSecret);
        if (!igdbToken) return { entity: null, rejectedCount: 0 };

        const res = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: {
            "Client-ID": keys.igdbId,
            Authorization: `Bearer ${igdbToken}`,
            "Content-Type": "text/plain",
          },
          signal: AbortSignal.timeout(10_000),
          body: `search "${query}"; fields id, name, cover.url, first_release_date, rating, genres.name, involved_companies.company.name; limit 8;`,
        });

        if (!res.ok) return { entity: null, rejectedCount: 0 };
        const data = await res.json();
        const results = Array.isArray(data) ? data : [];
        const matches: Array<{ entity: TemporaryCanonicalEntity; score: number; popularity: number }> = [];

        for (const r of results) {
          const title = r.name;
          if (!title) continue;

          const candNorm1 = normalize(title);
          const releaseYear = r.first_release_date ? new Date(r.first_release_date * 1000).getFullYear() : undefined;
          const candWithYear1 = releaseYear ? normalize(`${title} ${releaseYear}`) : "";
          const candWithYear2 = releaseYear ? safeNormalize(`${title} ${releaseYear}`) : "";
          const isYearExact = releaseYear ? (
            queryNorm1 === candWithYear1 || queryNorm1 === candWithYear2 ||
            queryNorm2 === candWithYear1 || queryNorm2 === candWithYear2
          ) : false;
          const baseScore = titleMatchScore(queryNorm1, queryNorm2, title);
          const score = isYearExact ? 100 : baseScore;

          if (score > 0) {

            const genres = r.genres?.map((g: any) => g.name) || [];
            
            // Early franchiseRoot extraction during Dynamic Ingestion (first word/splitting logic)
            const franchiseRoot = title.split(/[:\- ]/)[0].toLowerCase();

            const entity: TemporaryCanonicalEntity = {
              id: `igdb::game::${r.id}`,
              title,
              normalizedTitle: candNorm1,
              aliases: [title],
              lens,
              source: "igdb",
              authority: "external_ingested",
              confidence: 0.99,
              metadata: {
                releaseYear,
                genres,
                overview: undefined,
                poster: r.cover?.url ? `https:${r.cover.url.replace("t_thumb", "t_cover_big")}` : undefined,
                franchiseRoot,
                providerType: "game",
                providerResourceType: "game",
                providerMetadata: {
                  provider: "igdb",
                  id: String(r.id),
                  confidence: 0.99,
                  canonicalTitle: title,
                  releaseYear,
                  providerType: "game",
                  providerResourceType: "game",
                },
              }
            };
            matches.push({ entity, score, popularity: Number(r.rating) || 0 });
          } else {
            rejectedCount++;
          }
        }

        matches.sort((a, b) => b.score - a.score || b.popularity - a.popularity);
        if (matches[0]) {
          const top = matches[0];
          const tiedTop = matches.filter((candidate) => candidate.score === top.score);
          const distinctEntities = tiedTop.filter((c, idx, arr) => arr.findIndex((o) => o.entity.id === c.entity.id) === idx);
          if (distinctEntities.length > 1) {
            if (top.score < 100) {
              return {
                entity: null,
                rejectedCount,
                ambiguousEntities: distinctEntities.slice(0, 5).map((candidate) => candidate.entity),
              };
            }
            const distinctYears = new Set(distinctEntities.map((c) => c.entity.metadata.releaseYear ?? null));
            if (distinctYears.size > 1) {
              return {
                entity: null,
                rejectedCount,
                ambiguousEntities: distinctEntities.slice(0, 5).map((candidate) => candidate.entity),
              };
            }
          }
          return { entity: top.entity, rejectedCount };
        }
      } catch (err) {
        console.error("[Nerdvana Ingestion] IGDB fetch failed:", err);
      }
    } else if (lens === "comics") {
      const classifiedType = classifyComicsQueryType(query);
      if (classifiedType) {
        console.log("[TYPED_ENTITY_CLASSIFIED]", { query, lens, providerType: classifiedType });
      }
      if (keys.comicVine) {
        const res = await fetch(
          `https://comicvine.gamespot.com/api/search/?api_key=${keys.comicVine}&query=${encodeURIComponent(query)}&resources=character,volume,issue,story_arc,team,publisher&field_list=id,name,start_year,publisher,description,deck,image,resource_type,issue_number&format=json&limit=12`,
          { headers: { "User-Agent": "Nerdvana/1.0" } }
        );
        if (res.ok) {
          const data = await res.json();
          const results = data.results || [];

          const rankedResults = results
            .map((r: any) => {
              const title = r.name;
              const normalizedTitle = normalize(title ?? "");
              const safeTitle = safeNormalize(title ?? "");
              const resourceType = String(r.resource_type ?? "volume").toLowerCase();
              const rawProviderType = normalizeComicVineResourceType(r.resource_type, title);
              const titleExact =
                normalizedTitle === queryNorm1 ||
                safeTitle === queryNorm2 ||
                normalizedTitle === queryNorm2 ||
                safeTitle === queryNorm1;
              const providerType =
                classifiedType &&
                (classifiedType === "event" || classifiedType === "story_arc") &&
                titleExact &&
                ["volume", "issue", "story_arc"].includes(resourceType)
                  ? classifiedType
                  : rawProviderType;
              const queryTokens = queryNorm1.split(" ").filter(Boolean);
              const titleTokens = normalizedTitle.split(" ").filter(Boolean);
              const overlap = queryTokens.length > 0 && titleTokens.length > 0
                ? queryTokens.filter((t) => titleTokens.includes(t)).length / Math.max(queryTokens.length, titleTokens.length)
                : 0;
              const typeBoost = classifiedType && providerType === classifiedType ? 25 : 0;
              const typePenalty = classifiedType && providerType !== classifiedType ? -60 : 0;
              const exactBoost = titleExact ? 100 : 0;
              const overlapBoost = overlap >= 0.75 ? Math.round(overlap * 40) : 0;
              return {
                raw: r,
                title,
                normalizedTitle,
                providerType,
                resourceType,
                titleExact,
                overlap,
                score: exactBoost + typeBoost + typePenalty + overlapBoost,
              };
            })
            .sort((a: any, b: any) =>
              b.score - a.score ||
              (b.titleExact ? 1 : 0) - (a.titleExact ? 1 : 0) ||
              b.overlap - a.overlap ||
              String(a.raw.id).localeCompare(String(b.raw.id))
            );

          if (rankedResults.length > 1) {
            const providerTypes = Array.from(new Set(rankedResults.slice(0, 4).map((r: any) => r.providerType)));
            if (providerTypes.length > 1) {
              console.warn("[TYPED_AMBIGUITY_DETECTED]", {
                query,
                lens,
                classifiedType: classifiedType ?? null,
                providerTypes,
              });
            }
          }

          const candidateEntities: Array<{ entity: TemporaryCanonicalEntity; ranked: typeof rankedResults[number] }> = [];
          const seenIds = new Set<string>();

          for (const ranked of rankedResults) {
            const r = ranked.raw;
            const title = r.name;
            if (!title) continue;
            const candNorm1 = ranked.normalizedTitle;
            const isPlausibleMatch = ranked.titleExact || (ranked.overlap >= 0.75 && ranked.score > 0);

            if (isPlausibleMatch) {
              const entityId = `comicvine::${ranked.resourceType}::${r.id}`;
              if (seenIds.has(entityId)) continue;
              seenIds.add(entityId);

              const releaseYear = r.start_year ? parseInt(r.start_year) : undefined;
              const genres = r.publisher?.name ? [r.publisher.name] : [];
              const providerMetadata: ProviderMetadata = {
                provider: "comicvine",
                id: String(r.id),
                confidence: 0.99,
                canonicalTitle: title,
                franchiseRoot: title.split(/[:\- ]/)[0].toLowerCase(),
                releaseYear,
                providerType: ranked.providerType,
                providerResourceType: ranked.resourceType,
                publisherLabel: r.publisher?.name ?? null,
              };

              const entity: TemporaryCanonicalEntity = {
                id: entityId,
                title,
                normalizedTitle: candNorm1,
                aliases: [title],
                lens,
                source: "comicvine",
                authority: "external_ingested",
                confidence: 0.99,
                metadata: {
                  releaseYear,
                  genres,
                  overview: r.description,
                  poster: r.image?.super_url ?? r.image?.medium_url ?? undefined,
                  franchiseRoot: title.split(/[:\- ]/)[0].toLowerCase(),
                  providerType: ranked.providerType,
                  providerResourceType: ranked.resourceType,
                  providerMetadata,
                  publisherLabel: r.publisher?.name ?? null,
                }
              };
              candidateEntities.push({ entity, ranked });
            } else {
              rejectedCount++;
            }
          }

          if (candidateEntities.length > 0) {
            const top = candidateEntities[0];
            const tiedTop = candidateEntities.filter((c) => c.ranked.score === top.ranked.score);
            const distinctEntities = tiedTop.filter(
              (c, idx, arr) => arr.findIndex((o) => o.entity.id === c.entity.id) === idx
            );

            if (distinctEntities.length > 1) {
              if (top.ranked.score < 100) {
                return {
                  entity: null,
                  rejectedCount,
                  ambiguousEntities: distinctEntities.slice(0, 5).map(({ entity }) => entity),
                };
              }
              const distinctTypes = new Set(distinctEntities.map(({ ranked }) => ranked.providerType));
              const distinctYears = new Set(
                distinctEntities.map(({ entity }) => entity.metadata.releaseYear).filter(Boolean)
              );
              if ((!classifiedType && distinctTypes.size > 1) || distinctYears.size > 1) {
                console.warn("[TYPED_AMBIGUITY_DETECTED]", {
                  query,
                  lens,
                  classifiedType: classifiedType ?? null,
                  providerTypes: Array.from(distinctTypes),
                });
                return {
                  entity: null,
                  rejectedCount,
                  ambiguousEntities: distinctEntities.slice(0, 5).map(({ entity }) => entity),
                };
              }
            }

            const { entity, ranked } = top;
            console.log("[TYPED_PROVIDER_ACQUIRED]", {
              query,
              lens,
              id: ranked.raw.id,
              providerType: ranked.providerType,
              providerResourceType: ranked.resourceType,
              title: entity.title,
            });
            console.log("[TYPED_INGESTION_RESULT]", {
              query,
              lens,
              matchedTitle: entity.title,
              providerType: ranked.providerType,
              providerResourceType: ranked.resourceType,
              providerId: entity.id,
            });
            return { entity, rejectedCount };
          }
        }
      }

      // Google Books fallback for comics if ComicVine key is missing or failed
      const gbRes = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query + " comics")}&maxResults=8`
      );
      if (gbRes.ok) {
        const gbData = await gbRes.json();
        const items = gbData.items || [];

        for (const item of items) {
          const title = item.volumeInfo?.title;
          if (!title) continue;

          const candNorm1 = normalize(title);
          const candNorm2 = safeNormalize(title);

          const isExactMatch =
            candNorm1 === queryNorm1 ||
            candNorm2 === queryNorm2 ||
            candNorm1 === queryNorm2 ||
            candNorm2 === queryNorm1;

          if (isExactMatch) {
            const dateStr = item.volumeInfo.publishedDate || "";
            const releaseYear = dateStr.slice(0, 4) ? parseInt(dateStr.slice(0, 4)) : undefined;
            const genres = item.volumeInfo.categories || [];

            const entity: TemporaryCanonicalEntity = {
              id: `googlebooks::volume::${item.id}`,
              title,
              normalizedTitle: candNorm1,
              aliases: [title],
              lens,
              source: "googlebooks",
              authority: "external_ingested",
              confidence: 0.99,
              metadata: {
                releaseYear,
                genres,
                overview: item.volumeInfo.description,
                poster: item.volumeInfo.imageLinks?.thumbnail || undefined,
                providerType: "volume",
                providerResourceType: "volume",
                providerMetadata: {
                  provider: "googlebooks",
                  id: item.id,
                  confidence: 0.99,
                  canonicalTitle: title,
                  releaseYear,
                  providerType: "volume",
                  providerResourceType: "volume",
                }
              }
            };
            console.log("[TYPED_INGESTION_RESULT]", {
              query,
              lens,
              matchedTitle: title,
              providerType: "volume",
              providerResourceType: "volume",
              providerId: entity.id,
            });
            return { entity, rejectedCount };
          } else {
            rejectedCount++;
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Nerdvana Ingestion] Error fetching from providers for lens ${lens}:`, err);
  }

  return { entity: null, rejectedCount };
}
