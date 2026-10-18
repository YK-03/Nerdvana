import assert from "node:assert/strict";
import handler from "../api/nerdvana-answer.ts";
import { MAX_IGDB_DIAGNOSTIC_MESSAGE_LENGTH, sanitizeIgdbProviderMessage, selectVerifiedIgdbGame, verifiedGameTitleMatches } from "../src/lib/resolver/igdbResponse.ts";
import { buildIgdbGameQuery } from "../src/server/igdbGame.ts";
import { invalidateIGDBToken } from "../src/server/igdbAuth.ts";

const providerId = "igdb::game::25076";
const baseBody = {
  query: "Red Dead Redemption 2",
  mediaLens: "games",
  item: providerId,
  providerMetadata: {
    provider: "igdb",
    id: "25076",
    confidence: 0.99,
    canonicalTitle: "Red Dead Redemption 2",
    providerType: "game",
    providerResourceType: "game",
  },
  conversation: [],
  spoilerMode: false,
};

function request(body = baseBody): any {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "fixture" },
    json: async () => body,
  };
}

async function readResponse(response: Response) {
  return { status: response.status, body: await response.json() };
}

const originalFetch = globalThis.fetch;
const originalGroqKey = process.env.GROQ_API_KEY;
const observedRequests: Array<{ url: string; init?: RequestInit }> = [];
process.env.GROQ_API_KEY = "fixture-groq-key";
invalidateIGDBToken();

try {
  assert.equal(buildIgdbGameQuery(28552, "full"), "fields id, name, summary; where id = 28552; limit 1;");
  assert.equal(buildIgdbGameQuery(28552, "identity"), "fields id, name; where id = 28552; limit 1;");
  assert.equal(buildIgdbGameQuery(28552, "characterImages"), "fields id, name, characters.name, characters.mug_shot.url; where id = 28552; limit 1;");
  assert.equal(sanitizeIgdbProviderMessage('{"message":"Bad\\nRequest"}'), "Bad Request");
  assert.equal(sanitizeIgdbProviderMessage("Bearer secret client_secret=hidden"), "Bearer [redacted] client_secret=[redacted]");
  assert.ok((sanitizeIgdbProviderMessage(JSON.stringify({ message: "x".repeat(1000) })) ?? "").length <= MAX_IGDB_DIAGNOSTIC_MESSAGE_LENGTH);

  // Authentication failure is surfaced as deterministic unavailability; it
  // must not be converted into a verified empty game.
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    observedRequests.push({ url, init });
    if (url.includes("id.twitch.tv/oauth2/token")) {
      return new Response("forbidden", { status: 403 });
    }
    throw new Error(`Unexpected request during auth failure: ${url}`);
  };
  const authFailure = await readResponse(await handler(request()));
  assert.equal(authFailure.status, 503);
  assert.equal(authFailure.body.code, "GAME_PROVIDER_AUTHENTICATION_FAILED");
  assert.equal(authFailure.body.retryable, true);

  // A verified response may omit optional presentation metadata.
  observedRequests.length = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    observedRequests.push({ url, init });
    if (url.includes("id.twitch.tv/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "fixture-token", expires_in: 3600 }), { status: 200 });
    }
    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([{ id: 25076, name: "Red Dead Redemption 2" }]), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "RDR2 fixture answer." } }] }), { status: 200 });
    }
    throw new Error(`Unexpected request during success: ${url}`);
  };
  const success = await readResponse(await handler(request()));
  assert.equal(success.status, 200);
  assert.equal(success.body.answer, "RDR2 fixture answer.");
  assert.equal(success.body.contextPacket.providerId, providerId);
  assert.equal(success.body.contextPacket.mediaLens, "games");
  assert.equal(success.body.contextPacket.deterministicOwnershipFailure, false);
  assert.deepEqual(success.body.exploration.characters, []);

  // A second real handler path verifies another selected game without
  // relying on the RDR2 fixture or optional metadata.
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([{ id: 75235, name: "Ghost of Tsushima" }]), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "Ghost fixture answer." } }] }), { status: 200 });
    }
    throw new Error(`Unexpected request during Ghost fixture: ${url}`);
  };
  const ghost = await readResponse(await handler(request({
    ...baseBody,
    query: "Ghost of Tsushima",
    item: "igdb::game::75235",
    providerMetadata: { ...baseBody.providerMetadata, id: "75235", canonicalTitle: "Ghost of Tsushima" },
  })));
  assert.equal(ghost.status, 200);
  assert.equal(ghost.body.answer, "Ghost fixture answer.");
  assert.equal(ghost.body.contextPacket.providerId, "igdb::game::75235");
  assert.equal(ghost.body.contextPacket.deterministicFailureCode, undefined);

  // A third production ID takes the same deterministic path. The fixture
  // proves the exact selected ID, not a title-search substitute, is requested.
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([{ id: 119133, name: "Elden Ring" }]), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "Elden Ring fixture answer." } }] }), { status: 200 });
    }
    throw new Error(`Unexpected request during Elden Ring fixture: ${url}`);
  };
  const eldenRing = await readResponse(await handler(request({
    ...baseBody,
    query: "Elden Ring",
    item: "igdb::game::119133",
    providerMetadata: { ...baseBody.providerMetadata, id: "119133", canonicalTitle: "Elden Ring" },
  })));
  assert.equal(eldenRing.status, 200);
  assert.equal(eldenRing.body.answer, "Elden Ring fixture answer.");
  assert.equal(eldenRing.body.contextPacket.providerId, "igdb::game::119133");

  // A follow-up can carry the server-rendered canonical title separately
  // from the conversational query used to ask the question.
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([{ id: 25076, name: "Red Dead Redemption 2" }]), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "Follow-up fixture answer." } }] }), { status: 200 });
    }
    throw new Error(`Unexpected request during follow-up fixture: ${url}`);
  };
  const followUp = await readResponse(await handler(request({
    ...baseBody,
    query: "Who is Arthur Morgan?",
    canonicalEntity: "Red Dead Redemption 2",
  })));
  assert.equal(followUp.status, 200);
  assert.equal(followUp.body.answer, "Follow-up fixture answer.");

  const tokenRequest = observedRequests.find((entry) => entry.url.includes("id.twitch.tv/oauth2/token"));
  const gameRequest = observedRequests.find((entry) => entry.url.includes("api.igdb.com/v4/games"));
  assert.equal(tokenRequest?.init?.method, "POST");
  assert.equal((tokenRequest?.init?.headers as Record<string, string>)?.["Content-Type"], "application/x-www-form-urlencoded");
  const tokenParams = new URLSearchParams(String(tokenRequest?.init?.body ?? ""));
  assert.ok(tokenParams.has("client_id"));
  assert.ok(tokenParams.has("client_secret"));
  assert.equal(tokenParams.get("grant_type"), "client_credentials");
  assert.equal(gameRequest?.init?.method, "POST");
  assert.equal((gameRequest?.init?.headers as Record<string, string>)["Content-Type"], "text/plain");
  assert.equal((gameRequest?.init?.headers as Record<string, string>)["Authorization"], "Bearer fixture-token");
  assert.match(String(gameRequest?.init?.body), /where id = 25076/);
  assert.match(String(gameRequest?.init?.body), /fields id, name, summary/);
  assert.doesNotMatch(String(gameRequest?.init?.body), /characters\./);

  // Wrong ID, wrong title, malformed JSON, and transient provider errors must
  // not become successful ownership through title fallback.
  const rejectedResponses = [
    { response: new Response(JSON.stringify([{ id: 999, name: "Red Dead Redemption 2" }]), { status: 200 }), status: 409, code: "GAME_IDENTITY_MISMATCH" },
    { response: new Response(JSON.stringify([{ id: 25076, name: "Red Dead Redemption" }]), { status: 200 }), status: 409, code: "GAME_IDENTITY_MISMATCH" },
    { response: new Response("<html>provider failure</html>", { status: 200 }), status: 502, code: "GAME_MALFORMED_PROVIDER_RESPONSE" },
    { response: new Response(JSON.stringify([]), { status: 200 }), status: 404, code: "GAME_NO_MATCHING_GAME" },
    { response: new Response("rate limited", { status: 429 }), status: 429, code: "GAME_PROVIDER_RATE_LIMITED" },
    { response: new Response("temporarily unavailable", { status: 503 }), status: 502, code: "GAME_PROVIDER_HTTP_FAILURE" },
  ];

  for (const rejectedFixture of rejectedResponses) {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.igdb.com/v4/games")) return rejectedFixture.response;
      if (url.includes("api.groq.com")) throw new Error("Groq must not run after ownership failure");
      throw new Error(`Unexpected request during rejected response: ${url}`);
    };

    const rejected = await readResponse(await handler(request()));
    assert.equal(rejected.status, rejectedFixture.status);
    assert.equal(rejected.body.code, rejectedFixture.code);
    assert.equal(rejected.body.contextPacket.deterministicOwnershipFailure, true);
  }

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) throw new DOMException("timed out", "TimeoutError");
    if (url.includes("api.groq.com")) throw new Error("Groq must not run after timeout");
    throw new Error(`Unexpected request during timeout: ${url}`);
  };
  const timeout = await readResponse(await handler(request()));
  assert.equal(timeout.status, 503);
  assert.equal(timeout.body.code, "GAME_PROVIDER_TIMEOUT");

  let networkAttempts = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      networkAttempts += 1;
      throw new TypeError("fetch failed");
    }
    if (url.includes("api.groq.com")) throw new Error("Groq must not run after network failure");
    throw new Error(`Unexpected request during network failure: ${url}`);
  };
  const networkFailure = await readResponse(await handler(request()));
  assert.equal(networkFailure.status, 503);
  assert.equal(networkFailure.body.code, "GAME_PROVIDER_NETWORK_FAILURE");
  assert.equal(networkAttempts, 2, "transient network failures use one bounded retry");

  let recoveryAttempts = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      recoveryAttempts += 1;
      if (recoveryAttempts === 1) throw new TypeError("fetch failed");
      return new Response(JSON.stringify([{ id: 25076, name: "Red Dead Redemption 2" }]), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "Retried fixture answer." } }] }), { status: 200 });
    }
    throw new Error(`Unexpected request during in-request recovery: ${url}`);
  };
  const recoveredAfterRetry = await readResponse(await handler(request()));
  assert.equal(recoveredAfterRetry.status, 200);
  assert.equal(recoveredAfterRetry.body.answer, "Retried fixture answer.");
  assert.equal(recoveryAttempts, 2);

  // A transient failure must not poison the next request for the same ID.
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([{ id: 25076, name: "Red Dead Redemption 2" }]), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "Recovered fixture answer." } }] }), { status: 200 });
    }
    throw new Error(`Unexpected request during recovery: ${url}`);
  };
  const recovered = await readResponse(await handler(request()));
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.answer, "Recovered fixture answer.");

  // Request metadata must not redefine the title that the provider response
  // is checked against. The same provider ID paired with forged metadata is
  // still rejected when the server response names a different game.
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([{ id: 25076, name: "Unrelated Game" }]), { status: 200 });
    }
    if (url.includes("api.groq.com")) throw new Error("Groq must not run after forged metadata");
    throw new Error(`Unexpected request during forged metadata: ${url}`);
  };
  const forgedMetadata = await readResponse(await handler(request({
    ...baseBody,
    providerMetadata: {
      ...baseBody.providerMetadata,
      canonicalTitle: "Unrelated Game",
    },
  })));
  assert.equal(forgedMetadata.status, 409);
  assert.equal(forgedMetadata.body.code, "GAME_IDENTITY_MISMATCH");
  assert.equal(forgedMetadata.body.contextPacket.deterministicOwnershipFailure, true);

  assert.equal(selectVerifiedIgdbGame([{ id: 25076, name: "Red Dead Redemption 2" }], 25076, "Red Dead Redemption 2")?.id, 25076);
  assert.equal(verifiedGameTitleMatches("The Witcher 3", "The Witcher 3: Wild Hunt"), true);
  assert.equal(selectVerifiedIgdbGame([{ id: 1942, name: "The Witcher 3: Wild Hunt" }], 1942, "The Witcher 3")?.id, 1942);
  assert.equal(verifiedGameTitleMatches("The Witcher 3", "The Witcher 2: Assassins of Kings"), false);
  assert.equal(selectVerifiedIgdbGame([{ id: 1942, name: "The Witcher 2: Assassins of Kings" }], 1942, "The Witcher 3"), null);
  assert.equal(selectVerifiedIgdbGame([{ id: 25076 }], 25076, "Red Dead Redemption 2"), null);
  assert.equal(selectVerifiedIgdbGame([{ id: 999, name: "Red Dead Redemption 2" }], 25076, "Red Dead Redemption 2"), null);
  assert.equal(selectVerifiedIgdbGame([{ id: 25076, name: "Unrelated Game" }], 25076, "Red Dead Redemption 2"), null);
} finally {
  globalThis.fetch = originalFetch;
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqKey;
}

console.log("Game resolution integration checks passed.");
