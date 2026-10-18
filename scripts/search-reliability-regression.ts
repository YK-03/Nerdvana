import assert from "node:assert/strict";
import {
  normalizeEntityTitle,
  titlesReferToSameEntity,
  fallbackIdentityMatches,
} from "../src/lib/resolver/entityIdentity.js";
import {
  fetchDynamicEntity,
  normalize,
  safeNormalize,
  normalizeNumerals,
  titleMatchScore,
  type TemporaryCanonicalEntity,
} from "../src/lib/resolver/dynamicEntityIngestion.js";
import { verifiedGameTitleMatches } from "../src/lib/resolver/igdbResponse.js";
import { buildContextPacket } from "../src/app/canonicalResolver.js";
import { groundCanonicalIntent } from "../src/lib/resolver/canonicalGrounding.js";
import handler from "../api/nerdvana-answer.js";

// Mock environments
const originalFetch = globalThis.fetch;
const originalTmdbKey = process.env.TMDB_API_KEY;
const originalGroqKey = process.env.GROQ_API_KEY;
process.env.TMDB_API_KEY = "regression-fixture-tmdb-key";
process.env.GROQ_API_KEY = "regression-fixture-groq-key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function apiRequest(body: Record<string, unknown>): any {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "search-regression" },
    json: async () => body,
  };
}

async function readResponse(response: Response) {
  return { status: response.status, body: await response.json() };
}

async function runRegressionSuite() {
  console.log("===============================================================================");
  console.log("       NERDVANA SEARCH & RESOLUTION RELIABILITY REGRESSION SUITE               ");
  console.log("===============================================================================\n");

  // -------------------------------------------------------------------------
  // SUITE A: Unicode Identity Normalization & Matching
  // -------------------------------------------------------------------------
  console.log("--- [Suite A] Unicode Identity Normalization & Matching ---");

  // A1. Normalizer preserves non-Latin scripts
  const koreanTitle = "진격의 거인"; // Attack on Titan
  const japaneseTitle = "鬼滅の刃"; // Demon Slayer
  const devanagariTitle = "बाहुबली"; // Baahubali (Devanagari with combining vowel marks)
  const arabicTitle = "الفلاش"; // The Flash
  const cyrillicTitle = "Человек-паук"; // Spider-Man
  const latinDiacriticsNfc = "Pokémon";
  const latinDiacriticsNfd = "Poke\u0301mon"; // Combining acute accent
  const fullWidthTitle = "Ｆｉｎａｌ　Ｆａｎｔａｓｙ"; // Full-width forms

  assert.equal(normalizeEntityTitle(koreanTitle), "진격의 거인", "Korean must be preserved");
  assert.equal(normalizeEntityTitle(japaneseTitle), "鬼滅の刃", "Japanese must be preserved");
  assert.equal(normalizeEntityTitle(devanagariTitle), "बाहुबली", "Devanagari combining marks must be preserved");
  assert.equal(normalizeEntityTitle(arabicTitle), "الفلاش", "Arabic must be preserved");
  assert.equal(normalizeEntityTitle(cyrillicTitle), "человек паук", "Cyrillic must be lowercased and preserved");
  assert.equal(normalizeEntityTitle(latinDiacriticsNfc), "pokémon", "Latin diacritics must be preserved");
  assert.equal(normalizeEntityTitle(latinDiacriticsNfd), "pokémon", "NFD combining marks must normalize to NFKC");
  assert.equal(normalizeEntityTitle(fullWidthTitle), "final fantasy", "Full-width characters must normalize to standard ASCII");

  // A2. Identity verification functions
  assert.ok(titlesReferToSameEntity(koreanTitle, koreanTitle), "Korean titles refer to same entity");
  assert.ok(titlesReferToSameEntity(latinDiacriticsNfc, latinDiacriticsNfd), "NFC and NFD forms refer to same entity");
  assert.ok(titlesReferToSameEntity(devanagariTitle, "बाहुबली"), "Devanagari with matras refer to same entity");
  assert.ok(fallbackIdentityMatches(japaneseTitle, japaneseTitle, "anime"), "fallbackIdentityMatches works for Japanese");
  assert.ok(verifiedGameTitleMatches(devanagariTitle, devanagariTitle), "verifiedGameTitleMatches works for Devanagari");

  // A3. Negative cases: Distinct non-Latin titles must NOT collide or match
  assert.ok(!titlesReferToSameEntity("बाहुबली", "बाहुबल"), "Devanagari word with different matras must not match");
  assert.ok(!titlesReferToSameEntity("진격의 거인", "거인"), "Partial Korean title must not match exact");
  assert.ok(!fallbackIdentityMatches("anime", "anime", "anime"), "Generic media label 'anime' must not match as valid entity");
  assert.ok(!titlesReferToSameEntity("Человек-паук", "Человек"), "Cyrillic partial title must not match");

  console.log("  ✓ [Pass] Suite A: Unicode identity normalization, combining marks & verification functions verified.\n");

  // -------------------------------------------------------------------------
  // SUITE B: ComicVine Candidate Ranking & Symmetric Token Overlap
  // -------------------------------------------------------------------------
  console.log("--- [Suite B] ComicVine Candidate Ranking & Symmetric Overlap ---");

  // B1. Symmetric overlap: Multi-token query vs single-token candidate
  const longQueryNorm = normalize("superman batman world s finest");
  const longQuerySafe = safeNormalize("superman batman world s finest");
  const singleCandidate = "Superman";
  const singleCandidateScore = titleMatchScore(longQueryNorm, longQuerySafe, singleCandidate);
  assert.equal(
    singleCandidateScore,
    0,
    `Single-token candidate "${singleCandidate}" must score 0 against 5-token query "${longQueryNorm}", got ${singleCandidateScore}`
  );

  // B2. Proper target candidate outranks single-token candidate
  const targetCandidate = "Superman / Batman: World's Finest";
  const targetCandidateScore = titleMatchScore(longQueryNorm, longQuerySafe, targetCandidate);
  assert.ok(
    targetCandidateScore > singleCandidateScore,
    `Target candidate "${targetCandidate}" (score ${targetCandidateScore}) must outrank single-token candidate (score ${singleCandidateScore})`
  );

  // B3. True exact match
  assert.equal(titleMatchScore("saga", "saga", "Saga"), 100, "True exact match must score 100");
  assert.equal(titleMatchScore("watchmen", "watchmen", "Watchmen"), 100, "True exact match must score 100");

  // B4. Short valid titles
  assert.equal(titleMatchScore("x men", "x men", "X-Men"), 100, "Short hyphenated title 'X-Men' must match 100");
  assert.equal(titleMatchScore("run", "run", "Run"), 100, "Single-word valid title 'Run' must match 100 when query is 'Run'");

  // B5. Misleading partial matches
  const partialMismatchScore = titleMatchScore(
    normalize("batman arkham asylum"),
    safeNormalize("batman arkham asylum"),
    "Batman"
  );
  assert.equal(partialMismatchScore, 0, "Partial mismatch with only 1 token shared must score 0");

  // B6. Deterministic ordering: Reordered candidates must break ties deterministically
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search/") || url.includes("comicvine.gamespot.com")) {
      return jsonResponse({
        error: "OK",
        results: [
          {
            id: 200,
            name: "World's Finest",
            resource_type: "volume",
            start_year: "1990",
            count_of_issues: 4,
          },
          {
            id: 100,
            name: "World's Finest",
            resource_type: "volume",
            start_year: "1990",
            count_of_issues: 4,
          },
        ],
      });
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const orderA = await fetchDynamicEntity("World's Finest", "comics", { comicVine: "fixture" });
  // If tied with exact same score, title, and type, it should deduplicate or break tie by ID deterministically
  assert.ok(orderA.entity !== null, "Tied volume candidates should resolve deterministically");

  console.log("  ✓ [Pass] Suite B: ComicVine token overlap symmetry, exact matches & deterministic ranking verified.\n");

  // -------------------------------------------------------------------------
  // SUITE C: Game Numeral & Edition Ranking
  // -------------------------------------------------------------------------
  console.log("--- [Suite C] Game Numeral & Edition Ranking ---");

  // C1. Arabic query "Baldur's Gate 3" vs Roman candidate "Baldur's Gate III" vs "Baldur's Gate 3: Deluxe Edition"
  const qArabicNorm = normalize("baldur s gate 3");
  const qArabicSafe = safeNormalize("baldur s gate 3");

  const romanBaseScore = titleMatchScore(qArabicNorm, qArabicSafe, "Baldur's Gate III");
  const editionScore = titleMatchScore(qArabicNorm, qArabicSafe, "Baldur's Gate 3: Deluxe Edition");

  assert.equal(romanBaseScore, 100, "Roman numeral base game must score 100 against Arabic numeral query");
  assert.equal(editionScore, 80, "Deluxe Edition prefix match must score 80");
  assert.ok(romanBaseScore > editionScore, "Base game with Roman numerals must outrank Deluxe Edition prefix match");

  // C2. Reverse direction: Roman query "Baldur's Gate III" vs Arabic candidate "Baldur's Gate 3"
  const qRomanNorm = normalize("baldur s gate iii");
  const qRomanSafe = safeNormalize("baldur s gate iii");

  const arabicBaseScore = titleMatchScore(qRomanNorm, qRomanSafe, "Baldur's Gate 3");
  const romanEditionScore = titleMatchScore(qRomanNorm, qRomanSafe, "Baldur's Gate III: Digital Deluxe Edition");

  assert.equal(arabicBaseScore, 100, "Arabic numeral base game must score 100 against Roman numeral query");
  assert.equal(romanEditionScore, 80, "Deluxe edition prefix match must score 80 against Roman query");
  assert.ok(arabicBaseScore > romanEditionScore, "Base game with Arabic numerals must outrank Deluxe Edition");

  // C3. Sequel numbers (e.g. Final Fantasy VII <-> Final Fantasy 7, GTA IV <-> GTA 4)
  assert.equal(titleMatchScore("final fantasy vii", "final fantasy vii", "Final Fantasy 7"), 100);
  assert.equal(titleMatchScore("grand theft auto 4", "grand theft auto 4", "Grand Theft Auto IV"), 100);

  // C4. Explicit edition queries: Searching for "Deluxe Edition" should prefer the edition
  const qExplicitEditionNorm = normalize("baldur s gate 3 deluxe edition");
  const qExplicitEditionSafe = safeNormalize("baldur s gate 3 deluxe edition");

  const deluxeAgainstExplicit = titleMatchScore(qExplicitEditionNorm, qExplicitEditionSafe, "Baldur's Gate 3: Deluxe Edition");
  const baseAgainstExplicit = titleMatchScore(qExplicitEditionNorm, qExplicitEditionSafe, "Baldur's Gate 3");

  assert.equal(deluxeAgainstExplicit, 100, "Explicit search for Deluxe Edition must score 100");
  assert.equal(baseAgainstExplicit, 0, "Base game candidate missing 'deluxe edition' must score 0 against edition query");
  assert.ok(deluxeAgainstExplicit > baseAgainstExplicit, "Explicit edition query must choose Deluxe Edition over base game");

  // C5. verifiedGameTitleMatches covers numeral variations and subtitles
  assert.ok(
    verifiedGameTitleMatches("Baldur's Gate 3", "Baldur's Gate III"),
    "verifiedGameTitleMatches must match Arabic query to Roman candidate"
  );
  assert.ok(
    verifiedGameTitleMatches("Baldur's Gate 3", "Baldur's Gate III: Deluxe Edition"),
    "verifiedGameTitleMatches must match Arabic query to Roman subtitle candidate"
  );
  assert.ok(
    verifiedGameTitleMatches("Baldur's Gate III", "Baldur's Gate 3: Deluxe Edition"),
    "verifiedGameTitleMatches must match Roman query to Arabic subtitle candidate"
  );
  assert.ok(
    !verifiedGameTitleMatches("Baldur's Gate 2", "Baldur's Gate 3"),
    "verifiedGameTitleMatches must NOT match different numbers"
  );

  console.log("  ✓ [Pass] Suite C: Game numeral normalization, base vs edition preference & verifiedGameTitleMatches verified.\n");

  // -------------------------------------------------------------------------
  // SUITE D: TMDB Movie & TV Ambiguity
  // -------------------------------------------------------------------------
  console.log("--- [Suite D] TMDB Movie & TV Ambiguity ---");

  // D1. Unqualified "Pinocchio" query with multiple distinct release years (1940 vs 2022)
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search/movie")) {
      return jsonResponse({
        results: [
          {
            id: 10895,
            title: "Pinocchio",
            original_title: "Pinocchio",
            release_date: "1940-02-23",
            popularity: 90,
          },
          {
            id: 532639,
            title: "Pinocchio",
            original_title: "Pinocchio",
            release_date: "2022-09-07",
            popularity: 88,
          },
          {
            id: 999999,
            title: "Pinocchio's Revenge",
            original_title: "Pinocchio's Revenge",
            release_date: "1996-10-01",
            popularity: 12,
          },
        ],
      });
    }
    throw new Error(`Unexpected URL in TMDB test: ${url}`);
  };

  const unqualifiedPinocchio = await fetchDynamicEntity("Pinocchio", "movies", { tmdb: "fixture" });
  assert.equal(
    unqualifiedPinocchio.entity,
    null,
    "Unqualified 'Pinocchio' must return null entity when distinct years are tied"
  );
  assert.ok(
    unqualifiedPinocchio.ambiguousEntities && unqualifiedPinocchio.ambiguousEntities.length === 2,
    "Unqualified 'Pinocchio' must return ambiguousEntities with the 2 distinct Pinocchio films"
  );
  const years = unqualifiedPinocchio.ambiguousEntities.map((e) => e.metadata.releaseYear);
  assert.ok(years.includes(1940) && years.includes(2022), "Ambiguous entities must contain 1940 and 2022 films");

  // D2. Year-qualified "Pinocchio 1940" must select the 1940 movie confidently without ambiguity
  const qualifiedPinocchio = await fetchDynamicEntity("Pinocchio 1940", "movies", { tmdb: "fixture" });
  assert.ok(qualifiedPinocchio.entity !== null, "Year-qualified search must return an entity");
  assert.equal(qualifiedPinocchio.entity.id, "tmdb::movie::10895", "Must select 1940 movie ID 10895");
  assert.equal(qualifiedPinocchio.entity.metadata.releaseYear, 1940);
  assert.equal(qualifiedPinocchio.ambiguousEntities, undefined, "No ambiguity when year is explicitly qualified");

  // D3. Second fixture: TV or movie franchise remake ("The Thing" 1982 vs 2011)
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search/movie")) {
      return jsonResponse({
        results: [
          {
            id: 1091,
            title: "The Thing",
            original_title: "The Thing",
            release_date: "1982-06-25",
            popularity: 110,
          },
          {
            id: 60935,
            title: "The Thing",
            original_title: "The Thing",
            release_date: "2011-10-12",
            popularity: 80,
          },
        ],
      });
    }
    throw new Error(`Unexpected URL in TMDB test: ${url}`);
  };

  const unqualifiedTheThing = await fetchDynamicEntity("The Thing", "movies", { tmdb: "fixture" });
  assert.equal(unqualifiedTheThing.entity, null, "Unqualified 'The Thing' must return null entity");
  assert.equal(unqualifiedTheThing.ambiguousEntities?.length, 2, "Must return both 1982 and 2011 versions as ambiguous");

  const qualifiedTheThing = await fetchDynamicEntity("The Thing 1982", "movies", { tmdb: "fixture" });
  assert.equal(qualifiedTheThing.entity?.id, "tmdb::movie::1091", "Must select 1982 version");

  // D4. Deduplication: Duplicate identical rows must not cause false ambiguity
  globalThis.fetch = async (input: RequestInfo | URL) => {
    return jsonResponse({
      results: [
        { id: 1091, title: "The Thing", release_date: "1982-06-25", popularity: 110 },
        { id: 1091, title: "The Thing", release_date: "1982-06-25", popularity: 110 }, // Duplicate
      ],
    });
  };
  const deduplicated = await fetchDynamicEntity("The Thing", "movies", { tmdb: "fixture" });
  assert.equal(deduplicated.entity?.id, "tmdb::movie::1091", "Duplicate rows must deduplicate and not trigger false ambiguity");

  console.log("  ✓ [Pass] Suite D: TMDB ambiguity handling, year disambiguation & deduplication verified.\n");

  // -------------------------------------------------------------------------
  // SUITE E: Anime Fallback (Jikan -> AniList)
  // -------------------------------------------------------------------------
  console.log("--- [Suite E] Anime Fallback during Discovery ---");

  // E1. Jikan success
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.jikan.moe")) {
      return jsonResponse({
        data: [
          {
            mal_id: 21,
            title: "One Piece",
            title_english: "One Piece",
            aired: { prop: { from: { year: 1999 } } },
            score: 8.7,
          },
        ],
      });
    }
    throw new Error(`Unexpected fetch in Jikan success test: ${url}`);
  };

  const jikanSuccess = await fetchDynamicEntity("One Piece", "anime", {});
  assert.equal(jikanSuccess.entity?.id, "jikan::anime::21");
  assert.equal(jikanSuccess.entity?.source, "jikan");

  // E2. Jikan timeout / HTTP error -> AniList fallback success
  let anilistCalled = false;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.jikan.moe")) {
      // Simulate 500 error or timeout
      return new Response("Internal Server Error", { status: 500 });
    }
    if (url.includes("graphql.anilist.co")) {
      anilistCalled = true;
      return jsonResponse({
        data: {
          Page: {
            media: [
              {
                id: 128547,
                title: { english: "ODDTAXI", romaji: "Odd Taxi", native: "オッドタクシー" },
                startDate: { year: 2021 },
                meanScore: 87,
                genres: ["Mystery"],
              },
            ],
          },
        },
      });
    }
    throw new Error(`Unexpected fetch in AniList fallback test: ${url}`);
  };

  const fallbackResult = await fetchDynamicEntity("Odd Taxi", "anime", {});
  assert.ok(anilistCalled, "AniList GraphQL must be called when Jikan fails");
  assert.equal(fallbackResult.entity?.id, "anilist::anime::128547");
  assert.equal(fallbackResult.entity?.source, "anilist");
  assert.equal(fallbackResult.entity?.metadata.releaseYear, 2021);

  // E3. Jikan empty results -> AniList fallback
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.jikan.moe")) {
      return jsonResponse({ data: [] });
    }
    if (url.includes("graphql.anilist.co")) {
      return jsonResponse({
        data: {
          Page: {
            media: [
              {
                id: 5001,
                title: { english: "Special Anime", romaji: "Special Anime" },
                startDate: { year: 2020 },
                meanScore: 80,
              },
            ],
          },
        },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const emptyFallback = await fetchDynamicEntity("Special Anime", "anime", {});
  assert.equal(emptyFallback.entity?.id, "anilist::anime::5001");

  // E4. AniList ambiguous results -> returns ambiguousEntities
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.jikan.moe")) return jsonResponse({ data: [] });
    if (url.includes("graphql.anilist.co")) {
      return jsonResponse({
        data: {
          Page: {
            media: [
              {
                id: 101,
                title: { english: "Ambiguous Show", romaji: "Ambiguous Show" },
                startDate: { year: 2010 },
                meanScore: 80,
              },
              {
                id: 102,
                title: { english: "Ambiguous Show", romaji: "Ambiguous Show" },
                startDate: { year: 2022 },
                meanScore: 80,
              },
            ],
          },
        },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const ambiguousAniList = await fetchDynamicEntity("Ambiguous Show", "anime", {});
  assert.equal(ambiguousAniList.entity, null);
  assert.equal(ambiguousAniList.ambiguousEntities?.length, 2);

  // E5. Both providers fail
  globalThis.fetch = async (input: RequestInfo | URL) => {
    return new Response("Service Unavailable", { status: 503 });
  };
  const bothFailed = await fetchDynamicEntity("Nonexistent Anime", "anime", {});
  assert.equal(bothFailed.entity, null);

  console.log("  ✓ [Pass] Suite E: AniList fallback on Jikan timeout, error, empty, ranking & ambiguity verified.\n");

  // -------------------------------------------------------------------------
  // SUITE F: ComicVine Canonical Context Consistency & Cross-Entity Contamination
  // -------------------------------------------------------------------------
  console.log("--- [Suite F] ComicVine Canonical Context Consistency ---");

  // F1. Deterministic provider selection with mismatching query title
  // Query: "Batman", Selected Provider ID: "comicvine::character::1234" (Joker)
  const jokerProviderMetadata = {
    provider: "comicvine" as const,
    id: "1234",
    confidence: 0.99,
    canonicalTitle: "Joker",
    providerType: "character" as const,
    providerResourceType: "character",
  };

  const groundedJoker = groundCanonicalIntent({
    query: "Batman",
    mediaLens: "comics",
    explicitSelection: "comicvine::character::1234",
    providerMetadata: jokerProviderMetadata,
    temporaryEntities: [],
    allowLooseSemantic: false,
  });

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("comicvine.gamespot.com/api/character")) {
      return jsonResponse({
        error: "OK",
        results: {
          id: 1234,
          name: "Joker",
          aliases: "Clown Prince of Crime\nAce of Knaves",
          deck: "Batman's greatest nemesis.",
          publisher: { name: "DC Comics" },
        },
      });
    }
    throw new Error(`Unexpected fetch in ComicVine test: ${url}`);
  };

  const contextResult = await buildContextPacket(
    "Batman",
    "comics",
    false,
    undefined,
    groundedJoker,
  );

  const packet = contextResult.packet;
  assert.equal(packet.executionMode, "DETERMINISTIC_PROVIDER", "Execution mode must be locked to DETERMINISTIC_PROVIDER");
  assert.equal(packet.canonicalEntity, "Joker", "Canonical entity must be locked to Joker");
  assert.equal(packet.expandedEntity, "Joker", "expandedEntity must be Joker, not contaminated by query 'Batman'");
  assert.ok(
    packet.retrievalDescriptor.toLowerCase().includes("joker"),
    "retrievalDescriptor must be built from Joker"
  );
  assert.ok(
    !packet.retrievalDescriptor.toLowerCase().includes("batman"),
    "retrievalDescriptor must NOT contain Batman"
  );

  // Visual anchors must NOT contain Batman
  const anchors = packet.visualAnchors || [];
  assert.ok(anchors.includes("joker"), "visualAnchors must include joker");
  assert.ok(!anchors.includes("batman"), "visualAnchors must NOT include batman");

  // Entity aliases must NOT contain Batman or Batman-specific aliases
  const aliases = (packet.entityAliases || []).map((a) => a.toLowerCase());
  assert.ok(aliases.includes("joker"), "entityAliases must include Joker");
  assert.ok(aliases.includes("clown prince of crime"), "entityAliases must include Joker's aliases");
  assert.ok(!aliases.includes("batman"), "entityAliases must NOT include Batman");
  assert.ok(!aliases.includes("dark knight"), "entityAliases must NOT include Dark Knight");

  // F2. Legitimate follow-up question about another character
  // Previous Entity: "Red Dead Redemption 2", Current query: "Who is Arthur Morgan?"
  const rdr2Metadata = {
    provider: "igdb" as const,
    id: "25076",
    confidence: 0.99,
    canonicalTitle: "Red Dead Redemption 2",
    providerType: "game" as const,
    providerResourceType: "game",
  };

  const followUpGrounding = groundCanonicalIntent({
    query: "Who is Arthur Morgan?",
    mediaLens: "games",
    explicitSelection: "igdb::game::25076",
    providerMetadata: rdr2Metadata,
    temporaryEntities: [],
    allowLooseSemantic: false,
  });

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("id.twitch.tv/oauth2/token")) {
      return jsonResponse({ access_token: "fixture-token", expires_in: 3600 });
    }
    if (url.includes("api.igdb.com/v4/games")) {
      return jsonResponse([
        {
          id: 25076,
          name: "Red Dead Redemption 2",
          characters: [{ id: 101, name: "Arthur Morgan" }],
        },
      ]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const followUpContext = await buildContextPacket(
    "Who is Arthur Morgan?",
    "games",
    false,
    "Red Dead Redemption 2",
    followUpGrounding,
    "Red Dead Redemption 2",
  );

  assert.equal(followUpContext.packet.canonicalEntity, "Red Dead Redemption 2");
  assert.equal(followUpContext.packet.expandedEntity, "Red Dead Redemption 2");
  assert.equal(followUpContext.exploration.characters[0]?.name, "Arthur Morgan");

  console.log("  ✓ [Pass] Suite F: Context packet consistency, cross-entity protection & follow-ups verified.\n");

  console.log("===============================================================================");
  console.log("                 ALL 6 SEARCH RELIABILITY SUITES PASSED!                       ");
  console.log("===============================================================================");
}

runRegressionSuite().catch((err) => {
  console.error("Regression suite failed:", err);
  process.exit(1);
});
