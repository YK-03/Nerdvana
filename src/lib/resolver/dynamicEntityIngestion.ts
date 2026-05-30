import type { MediaLens } from "../../app/mediaLens.js";
import { getIGDBToken } from "../../../api/igdbAuth.js";
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
  source: "tmdb" | "jikan" | "igdb" | "comicvine" | "googlebooks";
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

export function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

export function safeNormalize(value: string): string {
  let norm = value.toLowerCase().trim();
  // Strip punctuation
  norm = norm.replace(/[^a-z0-9\s]+/g, " ");
  // Compress multiple spaces
  norm = norm.replace(/\s+/g, " ").trim();
  
  // Article normalization (lookup-only): strip leading articles
  const words = norm.split(" ");
  if (words.length > 1 && ["the", "a", "an"].includes(words[0])) {
    return words.slice(1).join(" ");
  }
  return norm;
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
): Promise<{ entity: TemporaryCanonicalEntity | null; rejectedCount: number }> {
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

        let isExactMatch = false;
        let matchedTitle = title;

        for (const candName of candidateNames) {
          const candNorm1 = normalize(candName);
          const candNorm2 = safeNormalize(candName);

          const candWithYear1 = releaseYear ? normalize(`${candName} ${releaseYear}`) : "";
          const candWithYear2 = releaseYear ? safeNormalize(`${candName} ${releaseYear}`) : "";

          if (
            candNorm1 === queryNorm1 ||
            candNorm2 === queryNorm2 ||
            candNorm1 === queryNorm2 ||
            candNorm2 === queryNorm1 ||
            (Boolean(candWithYear1) && (candWithYear1 === queryNorm1 || candWithYear1 === queryNorm2)) ||
            (Boolean(candWithYear2) && (candWithYear2 === queryNorm1 || candWithYear2 === queryNorm2))
          ) {
            isExactMatch = true;
            matchedTitle = candName;
            break;
          }
        }

        if (!isExactMatch) {
          // Multilingual/alias looser lexical match: check token overlap
          for (const candName of candidateNames) {
            const queryTokens = queryNorm1.split(" ");
            const candTokens = normalize(candName).split(" ");
            const overlap = queryTokens.filter(t => candTokens.includes(t)).length / Math.min(queryTokens.length, candTokens.length);
            if (overlap >= 0.7) {
              isExactMatch = true;
              matchedTitle = candName;
              break;
            }
          }
        }

        if (isExactMatch) {
          const genreIds = r.genre_ids || [];
          const genres = genreIds.map((id: number) => 
            lens === "movies" ? TMDB_MOVIE_GENRES[id] : TMDB_TV_GENRES[id]
          ).filter(Boolean);

          const entity: TemporaryCanonicalEntity = {
            id: `tmdb::${type}::${r.id}`,
            title: matchedTitle,
            normalizedTitle: normalize(matchedTitle),
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
          return { entity, rejectedCount };
        } else {
          rejectedCount++;
        }
      }
    } else if (lens === "anime") {
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8`);
      if (!res.ok) return { entity: null, rejectedCount: 0 };

      const data = await res.json();
      const results = data.data || [];

      for (const r of results) {
        const titles = [r.title_english, r.title, r.title_japanese, ...(r.titles?.map((t: any) => t.title) || [])].filter(Boolean);
        let matchFound = false;
        let matchedTitle = r.title_english ?? r.title;

        for (const t of titles) {
          const candNorm1 = normalize(t);
          const candNorm2 = safeNormalize(t);
          if (
            candNorm1 === queryNorm1 ||
            candNorm2 === queryNorm2 ||
            candNorm1 === queryNorm2 ||
            candNorm2 === queryNorm1
          ) {
            matchFound = true;
            matchedTitle = t;
            break;
          }
        }

        if (matchFound) {
          const releaseYear = r.aired?.prop?.from?.year || undefined;
          const genres = (r.genres || []).map((g: any) => g.name).filter(Boolean);

          const entity: TemporaryCanonicalEntity = {
            id: `jikan::anime::${r.mal_id}`,
            title: matchedTitle,
            normalizedTitle: normalize(matchedTitle),
            aliases: titles,
            lens,
            source: "jikan",
            authority: "external_ingested",
            confidence: 0.99,
            metadata: {
              releaseYear,
              genres,
              overview: r.synopsis,
              poster: r.images?.jpg?.image_url || undefined
            }
          };
          return { entity, rejectedCount };
        } else {
          rejectedCount++;
        }
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
          body: `search "${query}"; fields id, name, cover.url, first_release_date, rating, genres.name, involved_companies.company.name; limit 8;`,
        });

        if (!res.ok) return { entity: null, rejectedCount: 0 };
        const data = await res.json();
        const results = Array.isArray(data) ? data : [];

        for (const r of results) {
          const title = r.name;
          if (!title) continue;

          const candNorm1 = normalize(title);
          const candNorm2 = safeNormalize(title);

          let isExactMatch =
            candNorm1 === queryNorm1 ||
            candNorm2 === queryNorm2 ||
            candNorm1 === queryNorm2 ||
            candNorm2 === queryNorm1;

          if (!isExactMatch) {
            const queryTokens = queryNorm1.split(" ");
            const candTokens = candNorm1.split(" ");
            const overlap = queryTokens.filter(t => candTokens.includes(t)).length / Math.min(queryTokens.length, candTokens.length);
            if (overlap >= 0.7) {
              isExactMatch = true;
            }
          }

          if (isExactMatch) {
            const releaseYear = r.first_release_date ? new Date(r.first_release_date * 1000).getFullYear() : undefined;
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
                franchiseRoot
              }
            };
            return { entity, rejectedCount };
          } else {
            rejectedCount++;
          }
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
              const queryTokens = queryNorm1.split(" ");
              const titleTokens = normalizedTitle.split(" ");
              const overlap = queryTokens.length > 0 && titleTokens.length > 0
                ? queryTokens.filter((t) => titleTokens.includes(t)).length / Math.min(queryTokens.length, titleTokens.length)
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
            .sort((a: any, b: any) => b.score - a.score);

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

          for (const ranked of rankedResults) {
            const r = ranked.raw;
            const title = r.name;
            if (!title) continue;
            const candNorm1 = ranked.normalizedTitle;
            const isExactMatch = ranked.titleExact || ranked.overlap >= 0.9;

            if (isExactMatch) {
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
                id: `comicvine::${ranked.resourceType}::${r.id}`,
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
              console.log("[TYPED_PROVIDER_ACQUIRED]", {
                query,
                lens,
                id: providerMetadata.id,
                providerType: providerMetadata.providerType,
                providerResourceType: providerMetadata.providerResourceType,
                title,
              });
              console.log("[TYPED_INGESTION_RESULT]", {
                query,
                lens,
                matchedTitle: title,
                providerType: ranked.providerType,
                providerResourceType: ranked.resourceType,
                providerId: entity.id,
              });
              return { entity, rejectedCount };
            } else {
              rejectedCount++;
            }
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
