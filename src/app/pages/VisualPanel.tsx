import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { inferMediaTypeFromEntityType, type VisualContext } from "../visualContext";

interface VisualData {
  poster: string | null;
  backdrop: string | null;
  title: string;
  year: string;
  rating: string;
  genres: string[];
  overview: string;
  extraLabel?: string;
}

interface VisualPanelProps {
  context: VisualContext;
}

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY ?? "";
const RAWG_API_KEY = import.meta.env.VITE_RAWG_API_KEY ?? "";
const NO_RATING = "-";
const visualDataCache = new Map<string, Promise<VisualData | null>>();

function getOrCreateVisualCache(
  key: string,
  loader: () => Promise<VisualData | null>,
) {
  const cached = visualDataCache.get(key);
  if (cached) return cached;

  const promise = loader().catch(() => null);
  visualDataCache.set(key, promise);
  return promise;
}



async function fetchTMDB(entity: string, type: "movie" | "tv"): Promise<VisualData | null> {
  const endpoint = type === "movie" ? "movie" : "tv";
  let res = await fetch(
    `https://api.themoviedb.org/3/search/${endpoint}?query=${encodeURIComponent(entity)}&api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) return null;

  let data = await res.json();
  let item = data?.results?.[0];

  if (!item) {
    res = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(entity)}&api_key=${TMDB_API_KEY}`
    );
    if (!res.ok) return null;
    data = await res.json();
    item = data?.results?.find((row: any) => row.media_type === type);
  }

  if (!item) return null;

  return {
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
    title: item.title ?? item.name ?? entity,
    year: (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
    rating: item.vote_average ? String(item.vote_average.toFixed(1)) : NO_RATING,
    genres: [],
    overview: item.overview ?? "",
  };
}

function titleMatches(returned: string, searched: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const a = normalize(returned);
  const b = normalize(searched);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(/\s+/);
  const wordsB = new Set(b.split(/\s+/));
  const shared = wordsA.filter((word) => word.length > 2 && wordsB.has(word));
  return shared.length >= 2;
}

async function fetchJikan(entity: string, mediaType?: string): Promise<VisualData | null> {
  await new Promise((r) => setTimeout(r, 400));

  // Step 1: Try character endpoint with strict matching
  const charRes = await fetch(
    `https://api.jikan.moe/v4/characters?q=${encodeURIComponent(entity)}&limit=8`
  );
  if (charRes.ok) {
    const charData = await charRes.json();
    const chars = charData?.data ?? [];

    // Strict match first: exact or startsWith
    const search = entity.toLowerCase().trim();
    const charMatch = chars.find((c: any) => {
      const name = String(c.name ?? "").toLowerCase().trim();
      const nameKanji = String(c.name_kanji ?? "").toLowerCase().trim();
      return (
        name === search ||
        name.startsWith(search) ||
        nameKanji === search ||
        titleMatches(String(c.name ?? ""), entity)
      );
    });

    if (charMatch) {
      // Prefer the associated anime's poster over character thumbnail
      const associatedAnime = charMatch.anime?.[0]?.anime;
      let poster = charMatch.images?.jpg?.image_url ?? null;

      // Fetch the anime poster if we have a mal_id
      if (associatedAnime?.mal_id) {
        try {
          const animeRes = await fetch(
            `https://api.jikan.moe/v4/anime/${associatedAnime.mal_id}`
          );
          if (animeRes.ok) {
            const animeData = await animeRes.json();
            poster =
              animeData.data?.images?.jpg?.large_image_url ??
              animeData.data?.images?.jpg?.image_url ??
              poster;
          }
        } catch {
          // keep character thumbnail as fallback
        }
      }

      return {
        poster,
        backdrop: null,
        title: charMatch.name ?? entity,
        year: "",
        rating: "—",
        genres: [],
        overview: (charMatch.about ?? "").replace(/\n+/g, " ").slice(0, 300),
        extraLabel: associatedAnime?.title ? `From: ${associatedAnime.title}` : undefined,
      };
    }
  }

  // Step 2: Manga search if lens is manga
  if (mediaType === "manga") {
    const mangaRes = await fetch(
      `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(entity)}&limit=5`
    );
    if (mangaRes.ok) {
      const mangaData = await mangaRes.json();
      const scored = (mangaData?.data ?? [])
        .map((entry: any) => {
          const titleEn = String(entry.title_english ?? "");
          const titleJa = String(entry.title ?? "");
          const search = entity.toLowerCase().trim();
          let score = 0;
          if (titleEn.toLowerCase() === search || titleJa.toLowerCase() === search) score += 10;
          else if (titleEn.toLowerCase().startsWith(search) || titleJa.toLowerCase().startsWith(search)) score += 6;
          else if (titleMatches(titleEn, entity) || titleMatches(titleJa, entity)) score += 3;
          if (entry.score) score += 1;
          return { entry, score };
        })
        .filter(({ score }: any) => score > 0)
        .sort((a: any, b: any) => b.score - a.score);

      const item = scored[0]?.entry;
      if (item) {
        return {
          poster: item.images?.jpg?.large_image_url ?? item.images?.jpg?.image_url ?? null,
          backdrop: null,
          title: item.title_english ?? item.title ?? entity,
          year: String(item.published?.prop?.from?.year ?? ""),
          rating: item.score ? String(item.score.toFixed(1)) : "—",
          genres: (item.genres ?? []).map((g: any) => g.name).slice(0, 3),
          overview: item.synopsis?.replace(/\[Written by MAL Rewrite\]/g, "").trim() ?? "",
          extraLabel: item.authors?.[0]?.name ? `Author: ${item.authors[0].name}` : undefined,
        };
      }
    }
  }

  // Step 3: Anime search with scoring
  const res = await fetch(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(entity)}&limit=5`
  );
  if (!res.ok) return null;
  const data = await res.json();

  const scored = (data?.data ?? [])
    .map((entry: any) => {
      const titleEn = String(entry.title_english ?? "");
      const titleJa = String(entry.title ?? "");
      const search = entity.toLowerCase().trim();
      let score = 0;
      if (titleEn.toLowerCase() === search || titleJa.toLowerCase() === search) score += 10;
      else if (titleEn.toLowerCase().startsWith(search) || titleJa.toLowerCase().startsWith(search)) score += 6;
      else if (titleMatches(titleEn, entity) || titleMatches(titleJa, entity)) score += 3;
      if (entry.score) score += 1;
      return { entry, score };
    })
    .filter(({ score }: any) => score > 0)
    .sort((a: any, b: any) => b.score - a.score);

  const item = scored[0]?.entry;
  if (!item) return null;

  const studio = item.studios?.[0]?.name ? `Studio: ${item.studios[0].name}` : undefined;
  const episodes = item.episodes ? `Episodes: ${item.episodes}` : undefined;

  return {
    poster: item.images?.jpg?.large_image_url ?? item.images?.jpg?.image_url ?? null,
    backdrop: null,
    title: item.title_english ?? item.title ?? entity,
    year: String(item.aired?.prop?.from?.year ?? ""),
    rating: item.score ? String(item.score.toFixed(1)) : "—",
    genres: (item.genres ?? []).map((g: any) => g.name).slice(0, 3),
    overview: item.synopsis?.replace(/\[Written by MAL Rewrite\]/g, "").trim() ?? "",
    extraLabel: studio ?? episodes,
  };
}

async function fetchRAWG(entity: string): Promise<VisualData | null> {
  if (!RAWG_API_KEY) return null;

  const res = await fetch(
    `https://api.rawg.io/api/games?key=${encodeURIComponent(RAWG_API_KEY)}&search=${encodeURIComponent(entity)}&page_size=1`
  );
  if (!res.ok) return null;

  const data = await res.json();
  const item = data?.results?.[0];
  if (!item) return null;

  return {
    poster: item.background_image ?? null,
    backdrop: item.background_image ?? null,
    title: item.name ?? entity,
    year: (item.released ?? "").slice(0, 4),
    rating: item.rating ? String((item.rating as number).toFixed(1)) : NO_RATING,
    genres: (item.genres ?? []).map((genre: any) => genre.name).slice(0, 3),
    overview: "",
    extraLabel: item.platforms?.[0]?.platform?.name
      ? `Platform: ${item.platforms[0].platform.name}`
      : undefined,
  };
}

async function fetchServerGameVisual(entity: string): Promise<VisualData | null> {
  const response = await fetch("/api/visual-lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      entity,
      mediaLens: "games",
    }),
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const gameVisuals = payload?.gameVisuals;
  if (!gameVisuals) return null;

  return {
    poster: gameVisuals.image ?? null,
    backdrop: gameVisuals.image ?? null,
    title: gameVisuals.title ?? entity,
    year: gameVisuals.year ? String(gameVisuals.year) : "",
    rating: gameVisuals.rating ? String(gameVisuals.rating) : NO_RATING,
    genres: Array.isArray(gameVisuals.genres) ? gameVisuals.genres : [],
    overview: "",
    extraLabel: gameVisuals.studio ? `Studio: ${gameVisuals.studio}` : undefined,
  };
}

async function fetchComic(entity: string): Promise<VisualData | null> {
  const res = await fetch("/api/visual-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity, mediaLens: "comics" })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data ?? null;
}

export default function VisualPanel({ context }: VisualPanelProps) {
  const [visual, setVisual] = useState<VisualData | null>(null);
  const [loading, setLoading] = useState(false);

  const mediaType =
    context.mediaType && context.mediaType !== "unknown"
      ? context.mediaType
      : inferMediaTypeFromEntityType(context.entityType);

  useEffect(() => {
    if (
      !context?.entity ||
      (context.entityType === "unknown" && (!context.mediaType || context.mediaType === "unknown"))
    ) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    const run = async () => {
      let result: VisualData | null = null;

      if (mediaType === "movies") {
        result = await fetchTMDB(context.entity, "movie");
        if (!result && context.entityType === "character") {
          result = await fetchTMDB(context.entity, "tv");
        }
      } else if (mediaType === "tv") {
        result = await fetchTMDB(context.entity, "tv");
        if (!result && context.entityType === "character") {
          result = await fetchTMDB(context.entity, "movie");
        }
      } else if (mediaType === "anime") {
        result = await fetchJikan(context.entity, mediaType);
        if (!result) result = await fetchTMDB(context.entity, "tv");
      } else if (mediaType === "games") {
        if (context.gameVisuals) {
          result = {
            poster: context.gameVisuals.image,
            backdrop: context.gameVisuals.image,
            title: context.gameVisuals.title,
            year: context.gameVisuals.year ? String(context.gameVisuals.year) : "",
            rating: context.gameVisuals.rating ? String(context.gameVisuals.rating) : NO_RATING,
            genres: context.gameVisuals.genres ?? [],
            overview: "",
            extraLabel: context.gameVisuals.studio ? `Studio: ${context.gameVisuals.studio}` : undefined,
          };
        } else {
          result = await fetchServerGameVisual(context.entity);
          if (!result) result = await fetchRAWG(context.entity);
        }
      } else if (mediaType === "comics") {
        result = await fetchComic(context.entity);
      } else if (context.entityType === "character") {
        const lens = context.mediaLens ?? "movies";

        if (lens === "movies") {
          result = await fetchTMDB(context.entity, "movie");
          if (!result) result = await fetchTMDB(context.entity, "tv");
        } else if (lens === "tv") {
          result = await fetchTMDB(context.entity, "tv");
          if (!result) result = await fetchTMDB(context.entity, "movie");
        } else if (lens === "anime") {
          result = await fetchJikan(context.entity, mediaType);
          if (!result) result = await fetchTMDB(context.entity, "tv");
        } else if (lens === "comics") {
          result = await fetchComic(context.entity);
        } else if (lens === "games") {
          result = await fetchServerGameVisual(context.entity);
          if (!result) result = await fetchRAWG(context.entity);
        }

        if (!result) result = await fetchTMDB(context.entity, "movie");
        if (!result) result = await fetchTMDB(context.entity, "tv");
        if (!result) result = await fetchJikan(context.entity, mediaType);
      } else if (context.entityType === "movie") {
        result = await fetchTMDB(context.entity, "movie");
      } else if (context.entityType === "tv") {
        result = await fetchTMDB(context.entity, "tv");
      } else if (context.entityType === "anime") {
        result = await fetchJikan(context.entity, mediaType);
        if (!result) result = await fetchTMDB(context.entity, "tv");
      } else if (context.entityType === "game") {
        result = await fetchServerGameVisual(context.entity);
        if (!result) result = await fetchRAWG(context.entity);
      } else if (context.entityType === "comic") {
        result = await fetchComic(context.entity);
      }

      if (!cancelled) {
        setVisual((previous) => result ?? previous);
        setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [context.entity, context.entityType, context.gameVisuals, context.mediaLens, context.mediaType, context.entityKind]);

  if (
    !context ||
    (!context.entity ||
      (context.entityType === "unknown" && (!context.mediaType || context.mediaType === "unknown")))
  ) {
    return null;
  }


  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={context.entity}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="overflow-hidden border-[2px]"
        style={{
          borderColor: "var(--nerdvana-border)",
          backgroundColor: "var(--nerdvana-surface)",
          color: "var(--nerdvana-text)",
        }}
      >
        {loading && (
          <div className="p-5 space-y-3 animate-pulse">
            <div className="w-full bg-current opacity-10" style={{ height: "240px" }} />
            <div className="h-3 w-3/4 bg-current opacity-10" />
            <div className="h-2 w-1/2 bg-current opacity-10" />
            <div className="h-2 w-2/3 bg-current opacity-10" />
          </div>
        )}

        {!loading && visual && (
          <>
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "2/3", maxHeight: "300px" }}>
              {visual.poster ? (
                <img
                  src={visual.poster}
                  alt={visual.title}
                  className="w-full h-full object-cover object-top"
                />
              ) : visual.backdrop ? (
                <img
                  src={visual.backdrop}
                  alt={visual.title}
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    opacity: 0.08,
                    fontFamily: '"Special Elite", monospace',
                    fontSize: "0.65rem",
                    letterSpacing: "0.2em",
                  }}
                >
                  NO IMAGE
                </div>
              )}

              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to top, var(--nerdvana-surface) 0%, transparent 55%)",
                }}
              />



              {visual.rating !== NO_RATING && mediaType !== "comics" && (
                <div className="absolute top-3 right-3">
                  <span
                    className="px-2 py-[3px] text-[0.58rem] border"
                    style={{
                      fontFamily: '"Courier New", monospace',
                      borderColor: "var(--nerdvana-border)",
                      backgroundColor: "var(--nerdvana-surface)",
                      opacity: 0.9,
                    }}
                  >
                    * {visual.rating}
                  </span>
                </div>
              )}
            </div>

            <div className="px-4 pt-0 pb-4 space-y-2">
              <h3
                className="text-[0.9rem] leading-snug font-semibold"
                style={{ fontFamily: '"Special Elite", monospace' }}
              >
                {visual.title}
              </h3>

              <div
                className="flex flex-wrap gap-x-3 text-[0.6rem] uppercase tracking-[0.1em]"
                style={{ fontFamily: '"Courier New", monospace', opacity: 0.55 }}
              >
                {visual.year && <span>{visual.year}</span>}
                {visual.extraLabel && <span>{visual.extraLabel}</span>}
              </div>

              {visual.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {visual.genres.map((genre) => (
                    <span
                      key={genre}
                      className="text-[0.52rem] uppercase tracking-[0.08em] px-2 py-0.5 border"
                      style={{
                        borderColor: "var(--nerdvana-border)",
                        fontFamily: '"Courier New", monospace',
                        opacity: 0.65,
                      }}
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {visual.overview && (
                <div
                  className="border-t pt-2"
                  style={{ borderColor: "var(--nerdvana-border)", opacity: 0.25 }}
                />
              )}

              {visual.overview && (
                <p
                  className="text-[0.67rem] leading-relaxed line-clamp-4"
                  style={{ fontFamily: '"Times New Roman", serif', opacity: 0.55 }}
                >
                  {visual.overview}
                </p>
              )}
            </div>
          </>
        )}

        {!loading && !visual && (
          <div
            className="p-5 text-[0.6rem] uppercase tracking-[0.14em]"
            style={{ fontFamily: '"Courier New", monospace', opacity: 0.3 }}
          >
            No visual data found
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
