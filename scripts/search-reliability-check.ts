import assert from "node:assert/strict";
import handler from "../api/nerdvana-answer.ts";
import {
  getProviderQualifiedSelection,
  getVerifiedItemForAnswer,
} from "../src/lib/resolver/searchSelection.ts";

function request(body: Record<string, unknown>): any {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "search-fixture" },
    json: async () => body,
  };
}

async function readResponse(response: Response) {
  return { status: response.status, body: await response.json() };
}

const originalFetch = globalThis.fetch;
const originalTmdbKey = process.env.TMDB_API_KEY;
const originalGroqKey = process.env.GROQ_API_KEY;
process.env.TMDB_API_KEY = "fixture-tmdb-key";
process.env.GROQ_API_KEY = "fixture-groq-key";

try {
  assert.equal(getProviderQualifiedSelection("tmdb::movie::603"), "tmdb::movie::603");
  assert.equal(getProviderQualifiedSelection("The Matrix"), null);
  for (const providerId of [
    "tmdb::tv::1399",
    "jikan::anime::19",
    "igdb::game::119133",
    "comicvine::volume::51453",
  ]) {
    assert.equal(getProviderQualifiedSelection(providerId), providerId);
  }
  assert.equal(getProviderQualifiedSelection("tmdb::movie"), null);
  assert.equal(getProviderQualifiedSelection("igdb::game::119133"), "igdb::game::119133");

  assert.equal(
    getVerifiedItemForAnswer(
      {
        contextPacket: { executionMode: "SEMANTIC", providerId: null },
        grounding: { selectedSelectionValue: "The Matrix" },
      },
      null,
    ),
    null,
  );
  assert.equal(
    getVerifiedItemForAnswer(
      { contextPacket: { executionMode: "DETERMINISTIC_PROVIDER", providerId: "tmdb::movie::603" } },
      null,
    ),
    "tmdb::movie::603",
  );
  assert.equal(
    getVerifiedItemForAnswer(
      { contextPacket: { executionMode: "SEMANTIC", providerId: null } },
      "The Matrix",
    ),
    null,
  );

  let tmdbSearchCalls = 0;
  let groqCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/search/movie")) {
      tmdbSearchCalls += 1;
      return new Response(JSON.stringify({
        results: [{
          id: 603,
          title: "The Matrix",
          original_title: "The Matrix",
          release_date: "1999-03-31",
          genre_ids: [878],
          overview: "A fixture overview.",
        }],
      }), { status: 200 });
    }

    if (url.includes("api.groq.com")) {
      groqCalls += 1;
      return new Response(JSON.stringify({
        choices: [{ message: { content: "The Matrix fixture answer." } }],
      }), { status: 200 });
    }

    throw new Error(`Unexpected search fixture request: ${url}`);
  };

  const plainItem = await readResponse(await handler(request({
    query: "The Matrix",
    mediaLens: "movies",
    item: "The Matrix",
    providerMetadata: {
      provider: "tmdb",
      id: "603",
      canonicalTitle: "The Matrix",
      providerType: "movie",
      providerResourceType: "movie",
    },
    conversation: [],
    spoilerMode: false,
    requestId: "typed-search-plain-item",
  })));

  assert.equal(plainItem.status, 200);
  assert.equal(plainItem.body.answer, "The Matrix fixture answer.");
  assert.equal(plainItem.body.contextPacket.mediaLens, "movies");
  assert.equal(tmdbSearchCalls, 1, "plain item must return to semantic provider search");
  assert.equal(groqCalls, 1, "answer generation must run after semantic resolution");

  tmdbSearchCalls = 0;
  groqCalls = 0;
  const directQuery = await readResponse(await handler(request({
    query: "The Matrix",
    mediaLens: "movies",
    conversation: [],
    spoilerMode: false,
    requestId: "typed-search-no-item",
  })));
  assert.equal(directQuery.status, 200);
  assert.equal(directQuery.body.answer, "The Matrix fixture answer.");
  assert.equal(tmdbSearchCalls, 1);
  assert.equal(groqCalls, 1);
} finally {
  globalThis.fetch = originalFetch;
  if (originalTmdbKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalTmdbKey;
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqKey;
}

console.log("Search reliability checks passed.");
