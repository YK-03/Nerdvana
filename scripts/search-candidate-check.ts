import assert from "node:assert/strict";
import handler from "../api/nerdvana-answer.ts";
import { fetchDynamicEntity } from "../src/lib/resolver/dynamicEntityIngestion.js";

const originalFetch = globalThis.fetch;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

try {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.includes("api.themoviedb.org/3/search/movie")) {
      return response({
        results: [
          { id: 160, title: "L'arrivée d'un train à La Ciotat", release_date: "1896-01-01", popularity: 2 },
          { id: 329865, title: "Arrival", release_date: "2016-11-10", popularity: 80 },
        ],
      });
    }

    if (url.includes("api.igdb.com/v4/games")) {
      return response([
        { id: 140050, name: "Disco Elysium: Game Boy Edition", rating: 20 },
        { id: 26472, name: "Disco Elysium", rating: 90 },
      ]);
    }

    if (url.includes("id.twitch.tv/oauth2/token")) {
      return response({ access_token: "fixture-token", expires_in: 3600 });
    }

    if (url.includes("comicvine.gamespot.com/api/search")) {
      return response({
        results: [
          { id: 20773, name: "Saga", resource_type: "character", start_year: "2000" },
          { id: 46568, name: "Saga", resource_type: "volume", start_year: "2012", publisher: { name: "Image Comics" } },
        ],
      });
    }

    throw new Error(`Unexpected fixture request: ${url} ${init?.method ?? "GET"}`);
  };

  const arrival = await fetchDynamicEntity("arriv", "movies", { tmdb: "fixture" });
  assert.equal(arrival.entity?.id, "tmdb::movie::329865");
  assert.equal(arrival.entity?.title, "Arrival");

  const disco = await fetchDynamicEntity("Disco Elysium", "games", {
    igdbId: "fixture-client",
    igdbSecret: "fixture-secret",
  });
  assert.equal(disco.entity?.id, "igdb::game::26472");
  assert.equal(disco.entity?.title, "Disco Elysium");

  const saga = await fetchDynamicEntity("Saga", "comics", { comicVine: "fixture" });
  assert.equal(saga.entity, null);
  assert.deepEqual(
    saga.ambiguousEntities?.map((entity) => entity.id),
    ["comicvine::character::20773", "comicvine::volume::46568"],
  );

  const sagaResponse = await handler({
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "candidate-fixture" },
    json: async () => ({ query: "Saga", mediaLens: "comics", conversation: [], spoilerMode: false }),
  });
  const sagaPayload = await sagaResponse.json();
  assert.equal(sagaResponse.status, 200);
  assert.equal(sagaPayload.requiresGrounding, true);
  assert.deepEqual(
    sagaPayload.grounding.suggestions.map((suggestion: { selectionValue: string }) => suggestion.selectionValue),
    ["comicvine::character::20773", "comicvine::volume::46568"],
  );

  globalThis.fetch = async () => response({ error: "provider unavailable" }, 503);
  const providerFailure = await fetchDynamicEntity("Arrival", "movies", { tmdb: "fixture" });
  assert.equal(providerFailure.entity, null);
  assert.equal(providerFailure.ambiguousEntities, undefined);

  console.log("Search candidate checks passed.");
} finally {
  globalThis.fetch = originalFetch;
}
