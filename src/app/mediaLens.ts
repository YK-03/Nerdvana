export type MediaLens = "movies" | "tv" | "anime" | "games" | "comics";

export type Universe = "Movies" | "TV" | "Anime" | "Games" | "Comics";

export const DEFAULT_MEDIA_LENS: MediaLens = "movies";
export const MEDIA_LENS_STORAGE_KEY = "nerdvana-media-lens";

const LENS_TO_UNIVERSE: Record<MediaLens, Universe> = {
  movies: "Movies",
  tv: "TV",
  anime: "Anime",
  games: "Games",
  comics: "Comics",
};

const UNIVERSE_TO_LENS: Record<Universe, MediaLens> = {
  Movies: "movies",
  TV: "tv",
  Anime: "anime",
  Games: "games",
  Comics: "comics",
};

export function normalizeMediaLens(value: unknown): MediaLens {
  if (typeof value !== "string") return DEFAULT_MEDIA_LENS;

  const normalized = value.trim().toLowerCase();
  if (normalized === "movies" || normalized === "movie") return "movies";
  if (normalized === "tv" || normalized === "television") return "tv";
  if (normalized === "anime" || normalized === "manga") return "anime";
  if (normalized === "games" || normalized === "game") return "games";
  if (normalized === "comics" || normalized === "comic") return "comics";
  return DEFAULT_MEDIA_LENS;
}

export function mediaLensToUniverse(lens: MediaLens): Universe {
  return LENS_TO_UNIVERSE[lens];
}

export function universeToMediaLens(universe: Universe): MediaLens {
  return UNIVERSE_TO_LENS[universe];
}

export function readMediaLensFromSearch(search: string, fallback?: unknown): MediaLens {
  const params = new URLSearchParams(search);
  const fromQuery = params.get("lens");
  return normalizeMediaLens(fromQuery ?? fallback);
}

export function readStoredMediaLens(): MediaLens {
  if (typeof window === "undefined") return DEFAULT_MEDIA_LENS;
  return normalizeMediaLens(window.localStorage.getItem(MEDIA_LENS_STORAGE_KEY));
}

export function persistMediaLens(lens: MediaLens) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MEDIA_LENS_STORAGE_KEY, lens);
}

export function buildAskUrl(
  query: string,
  options?: {
    item?: string | null;
    lens?: MediaLens;
  }
) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("lens", options?.lens ?? DEFAULT_MEDIA_LENS);
  if (options?.item) {
    params.set("item", options.item);
  }
  return `/ask?${params.toString()}`;
}
