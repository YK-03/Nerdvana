import { normalizeMediaLens } from "../src/app/mediaLens.js";

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

type GameVisualData = {
  title: string;
  image: string | null;
  year: number | null;
  rating: number | null;
  genres: string[];
  studio: string | null;
};

let cachedIGDBToken: string | null = null;
let igdbTokenExpiry = 0;

function jsonResponse(payload: unknown, status: number, res?: any) {
  if (res && typeof res.status === "function") {
    return res.status(status).json(payload);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(req: any): Promise<any> {
  if (req && typeof req.json === "function") {
    return req.json();
  }

  if (req?.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req?.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

function scoreGameCandidate(name: string, searchTerm: string) {
  const normalizedName = name.trim().toLowerCase();
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchWords = normalizedSearch.split(/\s+/).filter(Boolean);

  let score = 0;
  if (normalizedName === normalizedSearch) score += 8;
  if (normalizedName.startsWith(normalizedSearch)) score += 5;
  if (normalizedName.includes(normalizedSearch)) score += 3;
  score += searchWords.filter((word) => normalizedName.includes(word)).length;

  if (
    !/\b(skin|skins|pack|bundle|dlc|costume|season pass|add-?on|addon|movie skin)\b/i.test(
      name,
    )
  ) {
    score += 4;
  } else {
    score -= 8;
  }

  if (!/ - /.test(name)) score += 2;

  return score;
}

function titleMatches(returned: string, searched: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
  const a = normalize(returned);
  const b = normalize(searched);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(/\s+/);
  const wordsB = new Set(b.split(/\s+/));
  const shared = wordsA.filter((word) => word.length > 2 && wordsB.has(word));
  return shared.length >= 2;
}

async function fetchComicFromGoogleBooks(
  entity: string,
): Promise<VisualData | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`intitle:${entity} subject:comics`)}&maxResults=3`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) return null;

    const best = items[0];
    const info = best.volumeInfo ?? {};

    return {
      poster:
        info.imageLinks?.thumbnail?.replace("http://", "https://") || null,
      backdrop:
        info.imageLinks?.thumbnail?.replace("http://", "https://") || null,
      title: info.title || entity,
      year: (info.publishedDate || "").slice(0, 4),
      rating: "—",
      genres: [],
      overview: (info.description || "").replace(/<[^>]*>/g, ""),
    };
  } catch {
    return null;
  }
}

async function fetchComicVisuals(
  entity: string,
  env: Record<string, string | undefined>,
): Promise<VisualData | null> {
  const apiKey = env.COMICVINE_API_KEY;

  if (apiKey) {
    try {
      const url = `https://comicvine.gamespot.com/api/search/?api_key=${apiKey}&query=${encodeURIComponent(entity + " comics")}&resources=volume,character&field_list=name,image,description,start_year,publisher,deck&format=json&limit=5`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Nerdvana/1.0" },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status_code === 1 && Array.isArray(data.results)) {
          const results = data.results;
          const scored = results
            .map((r: any) => {
              const name = String(r.name ?? "")
                .toLowerCase()
                .trim();
              const search = entity.toLowerCase().trim();
              let score = 0;
              if (name === search) score += 10;
              else if (name.startsWith(search)) score += 6;
              else if (name.includes(search)) score += 3;
              else if (titleMatches(r.name, entity)) score += 1;
              // Prefer results with images
              if (r.image?.super_url) score += 2;
              // Prefer known major publishers
              const publisher = String(r.publisher?.name ?? "").toLowerCase();
              if (publisher.includes("marvel") || publisher.includes("dc"))
                score += 3;
              // Penalize very old results unless query implies vintage
              if (r.start_year && parseInt(r.start_year) < 1960) score -= 2;
              return { r, score };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score);

          const best = scored[0]?.r ?? null;

          if (best) {
            return {
              poster: best.image?.super_url || best.image?.medium_url || null,
              backdrop: best.image?.super_url || best.image?.medium_url || null,
              title: best.name,
              year: String(best.start_year || ""),
              rating: "—",
              genres: [],
              overview: (best.deck || best.description || "").replace(
                /<[^>]*>/g,
                "",
              ),
              extraLabel: best.publisher?.name || null,
            };
          }
        }
      }
    } catch (err) {
      console.error("[Nerdvana Visual] ComicVine fetch error:", err);
    }
  }

  console.log(
    `[Nerdvana Visual] ComicVine miss → Google Books fallback for: ${entity}`,
  );
  return await fetchComicFromGoogleBooks(entity);
}

async function getIGDBToken(
  env: Record<string, string | undefined>,
): Promise<string | null> {
  try {
    if (cachedIGDBToken && Date.now() < igdbTokenExpiry) {
      return cachedIGDBToken;
    }

    const response = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${env.IGDB_CLIENT_ID}&client_secret=${env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" },
    );

    if (!response.ok) return null;

    const data = await response.json();
    cachedIGDBToken = data.access_token;
    igdbTokenExpiry = Date.now() + data.expires_in * 1000;
    return cachedIGDBToken;
  } catch {
    return null;
  }
}

async function fetchGameVisuals(
  gameName: string,
  env: Record<string, string | undefined>,
): Promise<GameVisualData | null> {
  try {
    const token = await getIGDBToken(env);
    if (!token) return null;

    const response = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": env.IGDB_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: `
          search "${gameName}";
          fields
            name,
            cover.url,
            first_release_date,
            rating,
            genres.name,
            involved_companies.company.name;
          limit 5;
        `,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const rows = Array.isArray(data) ? data : [];
    const game =
      rows
        .filter((entry: any) => entry?.name)
        .sort((a: any, b: any) => {
          const aScore =
            scoreGameCandidate(String(a?.name ?? ""), gameName) +
            (a?.cover?.url ? 2 : 0);
          const bScore =
            scoreGameCandidate(String(b?.name ?? ""), gameName) +
            (b?.cover?.url ? 2 : 0);
          return bScore - aScore;
        })[0] ?? null;

    if (!game) return null;

    return {
      title: game?.name || gameName,
      image: game?.cover?.url
        ? `https:${String(game.cover.url).replace("t_thumb", "t_cover_big")}`
        : null,
      year: game?.first_release_date
        ? new Date(game.first_release_date * 1000).getFullYear()
        : null,
      rating: game?.rating ? Math.round(game.rating) : null,
      genres: game?.genres?.map((genre: any) => genre.name) || [],
      studio: game?.involved_companies?.[0]?.company?.name || null,
    };
  } catch {
    return null;
  }
}

export default async function handler(req: any, res?: any) {
  const method = String(req?.method ?? "POST").toUpperCase();
  if (method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405, res);
  }

  const body = await readBody(req);
  const mediaLens = normalizeMediaLens(body?.mediaLens);
  const entity = String(body?.entity ?? "").trim();

  if (!entity) {
    return jsonResponse({ error: "Entity is required" }, 400, res);
  }

  const env =
    (
      globalThis as {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {};

  if (mediaLens === "games") {
    const gameVisuals = await fetchGameVisuals(entity, env);
    return jsonResponse({ gameVisuals }, 200, res);
  }

  if (mediaLens === "comics") {
    const comicVisuals = await fetchComicVisuals(entity, env);
    return jsonResponse(comicVisuals, 200, res);
  }

  return jsonResponse({ gameVisuals: null }, 200, res);
}
