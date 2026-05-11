import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { VisualContext } from "../pages/AskPage";

interface VisualData {
  poster: string | null;
  backdrop: string | null;
  title: string;
  year: string;
  rating: string;
  genres: string[];
  overview: string;
  extraLabel?: string;
  gameVisuals?: {
  title: string;
  image: string | null;
  year: number | null;
  rating: number | null;
  genres: string[];
  studio: string | null;
};
}

interface VisualPanelProps {
  context: VisualContext;
}

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY ?? "";

const TYPE_BADGE: Record<string, string> = {
  movie: "FILM",
  tv: "SERIES",
  anime: "ANIME",
  game: "GAME",
  character: "CHARACTER",
  comic: "COMIC",
};

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
    item = data?.results?.find((r: any) => r.media_type === type);
  }

  if (!item) return null;

  return {
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
    title: item.title ?? item.name ?? entity,
    year: (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
    rating: item.vote_average ? String(item.vote_average.toFixed(1)) : "—",
    genres: [],
    overview: item.overview ?? "",
  };
}

function titleMatches(returned: string, searched: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const a = normalize(returned);
  const b = normalize(searched);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(/\s+/);
  const wordsB = new Set(b.split(/\s+/));
  const shared = wordsA.filter((w) => w.length > 2 && wordsB.has(w));
  return shared.length >= 2;
}

async function fetchJikan(entity: string): Promise<VisualData | null> {
  await new Promise((r) => setTimeout(r, 400));
  const res = await fetch(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(entity)}&limit=5`
  );
  if (!res.ok) return null;
  const data = await res.json();

  // Only use a result whose title actually matches the searched entity
  const item = (data?.data ?? []).find((entry: any) => {
    const titleEn = String(entry.title_english ?? "");
    const titleJa = String(entry.title ?? "");
    return titleMatches(titleEn, entity) || titleMatches(titleJa, entity);
  });

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
  // RAWG works for basic searches without a key (rate limited)
  const res = await fetch(
    `https://api.rawg.io/api/games?search=${encodeURIComponent(entity)}&page_size=1`
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
    rating: item.rating ? String((item.rating as number).toFixed(1)) : "—",
    genres: (item.genres ?? []).map((g: any) => g.name).slice(0, 3),
    overview: "",
    extraLabel: item.platforms?.[0]?.platform?.name
      ? `Platform: ${item.platforms[0].platform.name}`
      : undefined,
  };
}

async function fetchComic(entity: string): Promise<VisualData | null> {
  // Fallback: use TMDB multi for comics with adaptations
  const res = await fetch(
    `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(entity)}&api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const item = data?.results?.[0];
  if (!item) return null;

  return {
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
    title: item.title ?? item.name ?? entity,
    year: (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
    rating: item.vote_average ? String(item.vote_average.toFixed(1)) : "—",
    genres: [],
    overview: item.overview ?? "",
  };
}

export default function VisualPanel({ context }: VisualPanelProps) {
  const [visual, setVisual] = useState<VisualData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!context?.entity || context.entityType === "unknown") return;

    let cancelled = false;
    setLoading(true);
    setVisual(null);

    const run = async () => {
      let result: VisualData | null = null;

      if (context.entityType === "movie") {
        result = await fetchTMDB(context.entity, "movie");
      } else if (context.entityType === "tv") {
        result = await fetchTMDB(context.entity, "tv");
      } else if (context.entityType === "anime") {
        result = await fetchJikan(context.entity);
        if (!result) result = await fetchTMDB(context.entity, "tv");
      } else if (context.entityType === "game") {
  if (context.gameVisuals) {
    result = {
      poster: context.gameVisuals.image,
      backdrop: context.gameVisuals.image,
      title: context.gameVisuals.title,
      year: context.gameVisuals.year
        ? String(context.gameVisuals.year)
        : "",
      rating: context.gameVisuals.rating
        ? String(context.gameVisuals.rating)
        : "—",
      genres: context.gameVisuals.genres ?? [],
      overview: "",
      extraLabel: context.gameVisuals.studio
        ? `Studio: ${context.gameVisuals.studio}`
        : undefined,
    };
  }
} 
else if (context.entityType === "character") {
        result = await fetchJikan(context.entity);
        if (!result) result = await fetchTMDB(context.entity, "tv");
        if (!result) result = await fetchTMDB(context.entity, "movie");
      } else if ((context.entityType as string) === "comic") {
        result = await fetchComic(context.entity);
      }

      if (!cancelled) {
        setVisual(result);
        setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [context.entity, context.entityType]);

  if (!context || context.entityType === "unknown") return null;

  const badge = TYPE_BADGE[context.entityType] ?? context.entityType.toUpperCase();

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
        {/* Loading skeleton */}
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
            {/* Hero image */}
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
                  style={{ opacity: 0.08, fontFamily: '"Special Elite", monospace', fontSize: "0.65rem", letterSpacing: "0.2em" }}
                >
                  NO IMAGE
                </div>
              )}

              {/* Bottom gradient fade into surface */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to top, var(--nerdvana-surface) 0%, transparent 55%)",
                }}
              />

              {/* Type badge — top left */}
              <div className="absolute top-3 left-3">
                <span
                  className="px-2 py-[3px] text-[0.52rem] uppercase tracking-[0.18em]"
                  style={{
                    fontFamily: '"Courier New", monospace',
                    backgroundColor: "var(--nerdvana-accent)",
                    color: "var(--nerdvana-surface)",
                    letterSpacing: "0.15em",
                  }}
                >
                  {badge}
                </span>
              </div>

              {/* Rating badge — top right */}
              {visual.rating !== "—" && (
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
                    ★ {visual.rating}
                  </span>
                </div>
              )}
            </div>

            {/* Info block */}
            <div className="px-4 pt-0 pb-4 space-y-2">
              {/* Title */}
              <h3
                className="text-[0.9rem] leading-snug font-semibold"
                style={{ fontFamily: '"Special Elite", monospace' }}
              >
                {visual.title}
              </h3>

              {/* Year + extra */}
              <div
                className="flex flex-wrap gap-x-3 text-[0.6rem] uppercase tracking-[0.1em]"
                style={{ fontFamily: '"Courier New", monospace', opacity: 0.55 }}
              >
                {visual.year && <span>{visual.year}</span>}
                {visual.extraLabel && <span>{visual.extraLabel}</span>}
              </div>

              {/* Genres */}
              {visual.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {visual.genres.map((g) => (
                    <span
                      key={g}
                      className="text-[0.52rem] uppercase tracking-[0.08em] px-2 py-0.5 border"
                      style={{
                        borderColor: "var(--nerdvana-border)",
                        fontFamily: '"Courier New", monospace',
                        opacity: 0.65,
                      }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Divider */}
              {visual.overview && (
                <div
                  className="border-t pt-2"
                  style={{ borderColor: "var(--nerdvana-border)", opacity: 0.25 }}
                />
              )}

              {/* Overview */}
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
