import assert from "node:assert/strict";
import handler from "../api/nerdvana-answer.ts";
import {
  fetchDynamicEntity,
  normalize,
  safeNormalize,
  titleMatchScore,
} from "../src/lib/resolver/dynamicEntityIngestion.ts";
import { buildContextPacket } from "../src/app/canonicalResolver.ts";
import { groundCanonicalIntent } from "../src/lib/resolver/canonicalGrounding.ts";

const originalFetch = globalThis.fetch;
const originalTmdbKey = process.env.TMDB_API_KEY;
const originalGroqKey = process.env.GROQ_API_KEY;
process.env.TMDB_API_KEY = "fixture-tmdb-key";
process.env.GROQ_API_KEY = "fixture-groq-key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function request(body: Record<string, unknown>): any {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "targeted-fix-check" },
    json: async () => body,
  };
}

async function readResponse(response: Response) {
  return { status: response.status, body: await response.json() };
}

try {
  console.log("=== 1. Testing Unicode-Safe Normalization ===");

  // Non-Latin text must preserve characters and not be reduced to empty string
  const korean = normalize("부산행");
  assert.equal(korean, "부산행");
  const japanese = normalize("モブサイコ100");
  assert.equal(japanese, "モブサイコ100");
  const chinese = normalize("别告诉她");
  assert.equal(chinese, "别告诉她");
  const mixed = normalize("Mob Psycho 100: モブサイコ100");
  assert.equal(mixed, "mob psycho 100 モブサイコ100");

  // safeNormalize must also preserve non-Latin scripts while stripping punctuation
  assert.equal(safeNormalize("부산행!"), "부산행");
  assert.equal(safeNormalize("モブサイコ100..."), "モブサイコ100");
  assert.equal(safeNormalize("The Farewell"), "farewell");

  // Mock TMDB search for non-Latin Korean query "부산행" (Train to Busan)
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search/movie")) {
      return jsonResponse({
        results: [
          {
            id: 396535,
            title: "Train to Busan",
            original_title: "부산행",
            release_date: "2016-07-20",
            popularity: 85,
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const trainToBusan = await fetchDynamicEntity("부산행", "movies", { tmdb: "fixture" });
  assert.equal(trainToBusan.entity?.id, "tmdb::movie::396535");
  assert.equal(trainToBusan.entity?.title, "부산행");

  console.log("✓ Unicode normalization preserves non-Latin scripts and resolves entities.");

  console.log("\n=== 2. Testing Symmetric Title-Overlap Scoring ===");

  // Exact match must still be 100
  assert.equal(titleMatchScore("the iron giant", "iron giant", "The Iron Giant"), 100);
  assert.equal(titleMatchScore("tunic", "tunic", "Tunic"), 100);

  // Prefix match (length >= 4) must score 80
  assert.equal(titleMatchScore("the iron giant", "iron giant", "The Iron Giant: Signature Edition"), 80);

  // Symmetrical overlap: A long query against a short candidate sharing only 1 word must NOT get score 60
  // Query: "return of the obra dinn" (5 tokens) vs candidate: "Return" (1 token)
  const shortCandidateScore = titleMatchScore(
    "return of the obra dinn",
    "return of the obra dinn",
    "Return",
  );
  assert.equal(shortCandidateScore, 0, "Short candidate must not score 60 from 1-token overlap");

  // Query: "dark matter in the universe" vs candidate: "Dark"
  assert.equal(
    titleMatchScore("dark matter in the universe", "dark matter in the universe", "Dark"),
    0,
  );

  // Symmetrical overlap: genuine high overlap (>= 70% of max tokens) scores 60
  // Query: "slay the spire downfall" (4 tokens) vs candidate: "Slay the Spire" (3 tokens) -> 3 / 4 = 75%
  assert.equal(
    titleMatchScore("slay the spire downfall", "slay the spire downfall", "Slay the Spire"),
    60,
  );

  console.log("✓ Asymmetric token overlap inflation fixed.");

  console.log("\n=== 3. Testing Anime Candidate Ranking (Not Blind First-Match) ===");

  // Competing candidates: Jikan returns Season 2 first, but query is for the base series "Mob Psycho 100"
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.jikan.moe")) {
      return jsonResponse({
        data: [
          {
            mal_id: 37510,
            title: "Mob Psycho 100 II",
            title_english: "Mob Psycho 100 Season 2",
            score: 8.8,
            members: 900000,
            aired: { prop: { from: { year: 2019 } } },
          },
          {
            mal_id: 32182,
            title: "Mob Psycho 100",
            title_english: "Mob Psycho 100",
            score: 8.5,
            members: 1800000,
            aired: { prop: { from: { year: 2016 } } },
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const mobPsycho = await fetchDynamicEntity("Mob Psycho 100", "anime", {});
  // Must choose the exact title match (Mob Psycho 100, ID 32182), NOT the first candidate (Season 2, ID 37510)
  assert.equal(mobPsycho.entity?.id, "jikan::anime::32182");
  assert.equal(mobPsycho.entity?.title, "Mob Psycho 100");
  assert.equal(mobPsycho.entity?.metadata.providerMetadata?.provider, "jikan");

  console.log("✓ Anime ranking selects base series over sequel returned first by Jikan.");

  console.log("\n=== 4. Testing IGDB Exact-Title Ties and Ambiguity ===");

  // "Syndicate" has two distinct base games: 1993 (tactical) and 2012 (FPS reboot)
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("id.twitch.tv/oauth2/token")) {
      return jsonResponse({ access_token: "fixture-token", expires_in: 3600 });
    }
    if (url.includes("api.igdb.com/v4/games")) {
      return jsonResponse([
        { id: 49, name: "Syndicate", first_release_date: 741484800, rating: 83 }, // 1993
        { id: 1006, name: "Syndicate", first_release_date: 1329782400, rating: 70 }, // 2012
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const syndicateTie = await fetchDynamicEntity("Syndicate", "games", {
    igdbId: "client-id",
    igdbSecret: "client-secret",
  });
  // Must detect ambiguity between two distinct games sharing the exact title
  assert.equal(syndicateTie.entity, null);
  assert.equal(syndicateTie.ambiguousEntities?.length, 2);
  assert.deepEqual(
    syndicateTie.ambiguousEntities?.map((e) => e.id),
    ["igdb::game::49", "igdb::game::1006"],
  );

  // If the query specifies the year "Syndicate 1993", it must resolve without ambiguity
  const syndicate1993 = await fetchDynamicEntity("Syndicate 1993", "games", {
    igdbId: "client-id",
    igdbSecret: "client-secret",
  });
  assert.equal(syndicate1993.entity?.id, "igdb::game::49");

  // Base game vs edition: "Slay the Spire" query should beat "Slay the Spire II"
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("id.twitch.tv/oauth2/token")) {
      return jsonResponse({ access_token: "fixture-token", expires_in: 3600 });
    }
    if (url.includes("api.igdb.com/v4/games")) {
      return jsonResponse([
        { id: 296831, name: "Slay the Spire II", rating: 80 },
        { id: 40477, name: "Slay the Spire", rating: 92 },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const slayTheSpire = await fetchDynamicEntity("Slay the Spire", "games", {
    igdbId: "client-id",
    igdbSecret: "client-secret",
  });
  assert.equal(slayTheSpire.entity?.id, "igdb::game::40477");
  assert.equal(slayTheSpire.entity?.title, "Slay the Spire");

  console.log("✓ IGDB exact-title tie returns ambiguity, year bonus disambiguates, base game beats edition.");

  console.log("\n=== 5. Testing Anime Fallback State Transition (Jikan fail -> AniList success) ===");

  // Test buildContextPacket when Jikan is unavailable but AniList succeeds with verified identity
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("graphql.anilist.co")) {
      return jsonResponse({
        data: {
          Page: {
            media: [
              {
                id: 128547,
                title: { english: "ODDTAXI", romaji: "Odd Taxi", native: "オッドタクシー" },
                synonyms: ["Odd Taxi"],
                meanScore: 87,
                startDate: { year: 2021 },
                characters: { edges: [] },
              },
            ],
          },
        },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  // Grounding has no provider ID (Jikan failed)
  const groundingResult = groundCanonicalIntent({
    query: "Odd Taxi",
    mediaLens: "anime",
    allowLooseSemantic: true,
  });

  const packetResult = await buildContextPacket(
    "Odd Taxi",
    "anime",
    false,
    undefined,
    groundingResult,
  );

  // Context packet must be promoted to DETERMINISTIC_PROVIDER with the verified AniList ID
  assert.equal(packetResult.packet.executionMode, "DETERMINISTIC_PROVIDER");
  assert.equal(packetResult.packet.providerId, "anilist::anime::128547");
  assert.equal(packetResult.packet.deterministicOwnershipFailure, false);
  assert.ok(packetResult.packet.ownershipGenerationId?.startsWith("gen_own_"));

  // Both providers fail: executionMode remains SEMANTIC
  globalThis.fetch = async () => jsonResponse({ data: { Page: { media: [] } } });
  const bothFailed = await buildContextPacket(
    "Unknown Anime Title",
    "anime",
    false,
    undefined,
    groundCanonicalIntent({ query: "Unknown Anime Title", mediaLens: "anime", allowLooseSemantic: true }),
  );
  assert.equal(bothFailed.packet.executionMode, "SEMANTIC");
  assert.equal(bothFailed.packet.providerId, null);

  console.log("✓ Anime state transition promotes to DETERMINISTIC_PROVIDER on verified AniList fallback.");

  console.log("\n=== 6. End-to-End Handler Integration with Fresh Subject ===");

  // Full handler invocation for "The Farewell" (movies) without autocomplete selection
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search/movie")) {
      return jsonResponse({
        results: [
          {
            id: 565310,
            title: "The Farewell",
            original_title: "The Farewell",
            release_date: "2019-07-12",
            genre_ids: [18, 35],
            overview: "A Chinese-American woman travels to Changchun for a family wedding.",
          },
        ],
      });
    }
    if (url.includes("/movie/565310")) {
      return jsonResponse({
        id: 565310,
        title: "The Farewell",
        original_title: "The Farewell",
        release_date: "2019-07-12",
        genres: [{ id: 18, name: "Drama" }, { id: 35, name: "Comedy" }],
        overview: "A Chinese-American woman travels to Changchun for a family wedding.",
        credits: { cast: [] },
      });
    }
    if (url.includes("api.groq.com")) {
      return jsonResponse({
        choices: [{ message: { content: "The Farewell fixture answer." } }],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const farewellRes = await readResponse(
    await handler(
      request({
        query: "The Farewell",
        mediaLens: "movies",
        conversation: [],
        spoilerMode: false,
        requestId: "fresh-farewell-test",
      }),
    ),
  );

  assert.equal(farewellRes.status, 200);
  assert.equal(farewellRes.body.answer, "The Farewell fixture answer.");
  assert.equal(farewellRes.body.diagnostics.ingestionSource, "tmdb");
  assert.equal(farewellRes.body.diagnostics.apiExactMatch, true);

  console.log("✓ Full API handler successfully ingests and answers fresh subject.");

  console.log("\nAll search reliability targeted fix checks passed successfully!");
} finally {
  globalThis.fetch = originalFetch;
  if (originalTmdbKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalTmdbKey;
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqKey;
}
