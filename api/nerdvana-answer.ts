import { normalizeMediaLens, DEFAULT_MEDIA_LENS, type MediaLens } from '../src/app/mediaLens'
import { normalizeVisualContext } from '../src/app/visualContext'

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type SourceLink = {
  title: string;
  link: string;
};

type GameVisualData = {
  title: string;
  image: string | null;
  year: number | null;
  rating: number | null;
  genres: string[];
  studio: string | null;
};

function scoreGameCandidate(name: string, searchTerm: string) {
  const normalizedName = name.trim().toLowerCase();
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchWords = normalizedSearch.split(/\s+/).filter(Boolean);

  let score = 0;
  if (normalizedName === normalizedSearch) score += 8;
  if (normalizedName.startsWith(normalizedSearch)) score += 5;
  if (normalizedName.includes(normalizedSearch)) score += 3;
  score += searchWords.filter((word) => normalizedName.includes(word)).length;

  if (!/\b(skin|skins|pack|bundle|dlc|costume|season pass|add-?on|addon|movie skin)\b/i.test(name)) {
    score += 4;
  } else {
    score -= 8;
  }

  if (!/ - /.test(name)) score += 2;

  return score;
}

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

function normalizeConversation(input: unknown): ConversationMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter(
      (item): item is { role: unknown; content: unknown } =>
        Boolean(item) && typeof item === "object",
    )
    .map((item) => {
      const role: "user" | "assistant" =
        item.role === "assistant" ? "assistant" : "user";

      const content = String(item.content ?? "").trim();
      return { role, content };
    })
    .filter((item) => item.content.length > 0);
}

function buildPrompt(
  query: string,
  conversation: ConversationMessage[],
  spoilerMode: boolean,
  mediaLens: MediaLens,
  previousEntity?: string,
) {
  let activeTopic = query;

  if (conversation.length > 0) {
    const lastUserMsg = [...conversation]
      .reverse()
      .find((msg) => msg.role === "user");

    if (lastUserMsg) activeTopic = lastUserMsg.content;
  }

  const lensRules: Record<MediaLens, string> = {
    movies:
      "Prioritize cinematic and live-action continuity, film canon, actors, and movie posters. Avoid comic-first interpretations unless the user explicitly asks for comics.",
    tv:
      "Prioritize television continuity, series canon, seasons, episodes, and TV cast context. Avoid defaulting to film continuity unless the user explicitly switches.",
    anime:
      "Prioritize anime canon, the main anime series, core arcs, and official anime visuals. Avoid random specials, side OVAs, or movie detours unless the user asks for them.",
    games:
      "Prioritize game franchises, canonical game entries, platform-specific franchise context, and game visuals. Avoid generic mythology or non-game explanations unless the user explicitly changes context.",
    comics:
      "Prioritize comic canon, comic continuity, runs, issues, and comic artwork. Avoid live-action adaptation bias unless the user explicitly asks about a film or show adaptation.",
  };

  const systemRole = `You are Nerdvana, a nerd-focused AI assistant specializing in pop culture.

ACTIVE DISCUSSION TOPIC: ${activeTopic}
ACTIVE MEDIA LENS: ${mediaLens}

IMPORTANT GUIDELINES:
- Assume follow-ups refer to ACTIVE DISCUSSION TOPIC unless user switches.
- Treat ACTIVE MEDIA LENS as a hard contextual weight across the whole answer. Only override it if the user explicitly changes media context.
- Provide concise answers in EXACTLY 2 paragraphs. Each paragraph 3-4 sentences max. Be thorough but brief.
- Prioritize canon facts but mention theories when relevant.
- Do not greet the user.
- Do not start with phrases like "Sure", "Great question", "Hey", "Hi", or "Hello".
- Start immediately with the answer content.
- You MUST always append the complete <visual_context> JSON block at the very end. Never truncate or skip it.
- MEDIA LENS RULES: ${lensRules[mediaLens]}
- Keep media classification separate from subject classification. A comics character is still entityKind "character" with mediaType "comics"; do not rewrite it into a comic title unless the query is actually about a comic title, run, or issue.
`;

  const spoilerRule = spoilerMode
    ? "Spoilers are allowed."
    : "Spoilers are NOT allowed. Give warning instead of major plot reveals.";

  const conversationContext =
    conversation.length > 0
      ? "\n\nRECENT CONVERSATION:\n" +
        conversation
          .map(
            (msg) =>
              `${msg.role === "user" ? "User" : "Nerdvana"}: ${msg.content}`,
          )
          .join("\n")
      : "";

  const visualInstruction = `

VISUAL CONTEXT (always include at the end of your response):
Return a JSON block in this exact format, wrapped in <visual_context> tags:
<visual_context>
{
  "entity": "<primary subject of this query — use the most well-known official title>",
  "entityType": "<MUST be exactly one of: movie | tv | anime | game | comic | character | unknown. Rules: use 'anime' ONLY for Japanese animated series/films. Use 'movie' for live-action or animated films. Use 'tv' for live-action series. Use 'game' for video games. Use 'comic' for comics/manga. Use 'character' only if the query is specifically about a fictional person, not the franchise. When in doubt between movie and tv, pick 'movie' for film franchises.>",
  "mediaType": "<MUST be exactly one of: movies | tv | anime | games | comics | unknown. This is the dominant canon or media context for the answer and should usually match ACTIVE MEDIA LENS unless the user explicitly changed context.>",
  "entityKind": "<MUST be exactly one of: title | franchise | character | team | issue | run | creator | location | event | unknown. This describes what the subject is independently of mediaType.>",
  "year": <original release year as number or null>,
  "changed": <true if entity differs from "${previousEntity ?? ""}", else false>
}
</visual_context>`;

  return `${systemRole}\nSPOILER POLICY:\n${spoilerRule}${conversationContext}\n\nQUERY: ${query}${visualInstruction}\n\nANSWER:`;
}

async function tryGemini(
  prompt: string,
  apiKey: string,
): Promise<string | null> {
  const models = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-pro-latest",
  ];

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      console.log("[Nerdvana] Trying Gemini model:", model);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
          }),
          signal: controller.signal,
        },
      );

      const rawText = await response.text();
      console.log(`[Nerdvana] ${model} status:`, response.status);

      if (!response.ok) {
        console.warn(`[Nerdvana] ${model} failed → trying next`);
        continue;
      }

      const data = JSON.parse(rawText);
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p?.text || "")
          .join("") || "";

      if (!text) continue;

      console.log("[Nerdvana] Success using Gemini:", model);
      return text;
    } catch (err) {
      console.warn(`[Nerdvana] ${model} crashed → trying next`, err);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function tryGroq(prompt: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    console.log("[Nerdvana] Falling back to Groq");

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500,
          temperature: 0.7,
        }),
        signal: controller.signal,
      },
    );

    const rawText = await response.text();
    console.log("[Nerdvana] Groq status:", response.status);

    if (!response.ok) {
      console.warn("[Nerdvana] Groq failed:", rawText);
      return null;
    }

    const data = JSON.parse(rawText);
    const text = data?.choices?.[0]?.message?.content ?? "";

    if (!text) return null;

    console.log("[Nerdvana] Success using Groq");
    return text;
  } catch (err) {
    console.warn("[Nerdvana] Groq crashed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAnswer(
  prompt: string,
  geminiKey: string,
  groqKey?: string,
): Promise<string> {
  // Try Gemini first
  const geminiResult = await tryGemini(prompt, geminiKey);
  if (geminiResult) return geminiResult;

  // Fall back to Groq if key is available
  if (groqKey) {
    const groqResult = await tryGroq(prompt, groqKey);
    if (groqResult) return groqResult;
  }

  throw new Error(
    "All models failed — Gemini quota exhausted and Groq unavailable",
  );
}

async function fetchSerperSources(
  query: string,
  apiKey: string,
): Promise<SourceLink[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "us",
      hl: "en",
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper failed: ${response.status}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.organic) ? data.organic : [];

  return rows
    .map((row: any) => ({
      title: String(row?.title ?? "").trim(),
      link: String(row?.link ?? "").trim(),
    }))
    .filter((row: SourceLink) => Boolean(row.title && row.link))
    .slice(0, 8);
}

async function fetchWhoogleSources(
  query: string,
  baseUrl: string,
): Promise<SourceLink[]> {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Whoogle failed: ${response.status}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.results) ? data.results : [];

  return rows
    .map((row: any) => ({
      title: String(row?.title ?? "").trim(),
      link: String(row?.url ?? row?.href ?? "").trim(),
    }))
    .filter((row: SourceLink) => Boolean(row.title && row.link))
    .slice(0, 8);
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
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      console.warn("[Nerdvana] Failed to get IGDB token");
      return null;
    }

    const data = await response.json();

    cachedIGDBToken = data.access_token;
    igdbTokenExpiry = Date.now() + data.expires_in * 1000;

    return cachedIGDBToken;
  } catch (err) {
    console.warn("[Nerdvana] IGDB token crash", err);
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

    if (!response.ok) {
      console.warn("[Nerdvana] IGDB game fetch failed");
      return null;
    }

    const data = await response.json();

    const rows = Array.isArray(data) ? data : [];
    const game =
      rows
        .filter((entry: any) => entry?.name)
        .sort((a: any, b: any) => {
          const aScore = scoreGameCandidate(String(a?.name ?? ""), gameName) + (a?.cover?.url ? 2 : 0);
          const bScore = scoreGameCandidate(String(b?.name ?? ""), gameName) + (b?.cover?.url ? 2 : 0);
          return bScore - aScore;
        })[0] ?? null;

    if (!game) return null;

    const image = game?.cover?.url
      ? `https:${game.cover.url.replace("t_thumb", "t_cover_big")}`
      : null;

    const year = game?.first_release_date
      ? new Date(game.first_release_date * 1000).getFullYear()
      : null;

    return {
      title: game?.name || gameName,
      image,
      year,
      rating: game?.rating ? Math.round(game.rating) : null,
      genres: game?.genres?.map((g: any) => g.name) || [],
      studio: game?.involved_companies?.[0]?.company?.name || null,
    };
  } catch (err) {
    console.warn("[Nerdvana] fetchGameVisuals crashed", err);
    return null;
  }
}

async function fetchBestGameVisuals(
  searchTerms: string[],
  env: Record<string, string | undefined>,
): Promise<GameVisualData | null> {
  const uniqueTerms = [...new Set(searchTerms.map((term) => term.trim()).filter(Boolean))];

  for (const term of uniqueTerms) {
    const result = await fetchGameVisuals(term, env);
    if (result) return result;
  }

  return null;
}

async function fetchSources(
  query: string,
  mediaLens: MediaLens,
  env: Record<string, string | undefined>,
) {
  const lensSearchQuery = (() => {
    if (mediaLens === "movies") return `${query} movie live action canon`;
    if (mediaLens === "tv") return `${query} tv series canon`;
    if (mediaLens === "anime") return `${query} anime canon main series`;
    if (mediaLens === "games") return `${query} video game canon franchise`;
    return `${query} comics canon continuity`;
  })();

  const serperKey = env.SERPER_API_KEY;
  if (serperKey) {
    try {
      return await fetchSerperSources(lensSearchQuery, serperKey);
    } catch (error) {
      console.warn("[Nerdvana] Serper source fetch failed", error);
    }
  }

  const whoogleBaseUrl = env.WHOOGLE_BASE_URL;
  if (whoogleBaseUrl) {
    try {
      return await fetchWhoogleSources(lensSearchQuery, whoogleBaseUrl);
    } catch (error) {
      console.warn("[Nerdvana] Whoogle source fetch failed", error);
    }
  }

  return [];
}

function buildFollowups(query: string): string[] {
  return [
    `Can you explain the key events behind "${query}"?`,
    "What are the strongest fan theories related to this?",
    "Which sources are most reliable for canon details?",
  ];
}

export default async function handler(req: any, res?: any) {
  const method = String(req?.method ?? "POST").toUpperCase();

  if (method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405, res);
  }

  try {
    const body = await readBody(req);

    const query = String(body?.query ?? "").trim();
    const conversation = normalizeConversation(body?.conversation);
    const spoilerMode =
      typeof body?.spoilerMode === "boolean"
        ? body.spoilerMode
        : Boolean(body?.allowSpoilers);
    const previousEntity =
      String(body?.previousEntity ?? "").trim() || undefined;
    const mediaLens = normalizeMediaLens(body?.mediaLens ?? DEFAULT_MEDIA_LENS);

    if (!query) {
      return jsonResponse({ error: "Query is required" }, 400, res);
    }

    const env =
      (
        globalThis as {
          process?: { env?: Record<string, string | undefined> };
        }
      ).process?.env ?? {};

    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      return jsonResponse(
        { error: "Missing GEMINI_API_KEY in Vercel env variables" },
        500,
        res,
      );
    }

    const groqKey = env.GROQ_API_KEY;
    const prompt = buildPrompt(
      query,
      conversation,
      spoilerMode,
      mediaLens,
      previousEntity,
    );
    const answerPromise = generateAnswer(prompt, apiKey, groqKey);
    const sourcesPromise = fetchSources(query, mediaLens, env);

    const [rawAnswer, sources] = await Promise.all([
      answerPromise,
      sourcesPromise,
    ]);

    // Extract visualContext — handle complete, incomplete, and misplaced blocks
    let visualContext = null;

    // Case 1: complete well-formed block
    const completeMatch = rawAnswer.match(
      /<visual_context>([\s\S]*?)<\/visual_context>/,
    );

    if (completeMatch) {
      try {
        visualContext = JSON.parse(completeMatch[1].trim());
      } catch {
        console.warn("[Nerdvana] Failed to parse complete visualContext JSON");
      }
    } else {
      // Case 2: opening tag present but closing tag missing (truncated response)
      const openMatch = rawAnswer.match(/<visual_context>([\s\S]*?)$/);

      if (openMatch) {
        const partial = openMatch[1].trim();

        // Attempt to close and parse the partial JSON
        const closed = partial.endsWith("}") ? partial : partial + "\n}";

        try {
          visualContext = JSON.parse(closed);
        } catch {
          console.warn("[Nerdvana] Failed to parse partial visualContext JSON");
        }
      }
    }

    const normalizedVisualContext = normalizeVisualContext(
      visualContext,
      mediaLens,
      null,
    );

    let gameVisuals: GameVisualData | null = null;

    if (normalizedVisualContext?.mediaType === "games") {
      gameVisuals = await fetchBestGameVisuals(
        [
          `${query} game`,
          query,
          `${normalizedVisualContext.entity} game`,
          normalizedVisualContext.entity,
        ],
        env,
      );
    }
    // Strip ALL visual_context remnants from answer (complete or partial)
    const answer = rawAnswer
      .replace(/<visual_context>[\s\S]*?<\/visual_context>/g, "")
      .replace(/<visual_context>[\s\S]*/g, "") // catches unclosed opening tags
      .replace(/<\/visual_context>/g, "") // catches orphaned closing tags
      .trim();

    const followups = buildFollowups(query);

    return jsonResponse(
      {
        answer,
        sources: sources.map((source) => ({
          title: source.title,
          link: source.link,
        })),
        followups,
        visualContext: normalizedVisualContext,
        gameVisuals,
      },
      200,
      res,
    );
  } catch (error) {
    console.error("Generation Failed", error);

    return jsonResponse(
      {
        error: "Generation Failed",
        details: String(error),
      },
      500,
      res,
    );
  }
}
