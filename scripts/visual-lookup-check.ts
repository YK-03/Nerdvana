import assert from "node:assert/strict";
import handler from "../api/visual-lookup.ts";

function packet(overrides: Record<string, unknown> = {}) {
  return {
    version: "v1",
    executionMode: "DETERMINISTIC_PROVIDER",
    ownershipGenerationId: "fixture-generation",
    canonicalEntity: "Monster",
    expandedEntity: "Monster",
    entityType: "anime",
    entityKind: "title",
    parentFranchise: null,
    universe: null,
    continuity: null,
    mediaLens: "anime",
    activeUniverse: "Monster",
    spoilerPolicy: "strict",
    confidence: 0.99,
    providerId: "jikan::anime::19",
    providerType: "anime",
    providerMetadata: {
      provider: "jikan",
      id: "19",
      confidence: 0.99,
      canonicalTitle: "Monster",
      providerType: "anime",
      providerResourceType: "anime",
    },
    groundingConfidence: {
      authoritative: 1,
      inferred: 0,
      embeddingRecall: 0,
      topology: 0,
      continuity: 0,
      lens: 1,
    },
    contextualSearchQuery: "Monster",
    retrievalDescriptor: "Monster",
    visualAnchors: [],
    entityAliases: [],
    franchiseAliases: [],
    conversationMode: "canon-lookup",
    queryMode: "entity",
    telemetry: {
      groundingType: "fallback",
      expansionUsed: false,
      expansionAccepted: false,
      expansionType: null,
      embeddingUsed: false,
      embeddingAccepted: false,
      continuityType: "none",
      isAmbiguous: false,
      isSelfReferential: false,
      inheritanceDepth: 0,
      qualifiedId: null,
      candidateHistory: [],
      lens: "anime",
      topologyUsed: false,
      candidatePoolSize: 1,
      rejectedCrossLensCandidates: 0,
    },
    ...overrides,
  };
}

function request(contextPacket: unknown): any {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "visual-fixture" },
    json: async () => ({ contextPacket }),
  };
}

async function read(response: Response) {
  return { status: response.status, body: await response.json() };
}

const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: {
      Media: {
        title: { english: "Monster", romaji: "Monster", native: "MONSTER" },
        coverImage: { extraLarge: "https://images.example/monster.jpg" },
        startDate: { year: 2004 },
        genres: ["Drama"],
        description: "Fixture overview",
      },
    },
  }), { status: 200 });
  const success = await read(await handler(request(packet())));
  assert.equal(success.status, 200);
  assert.equal(success.body.state, "SUCCESS");
  assert.equal(success.body.asset.source, "anilist");
  assert.equal(success.body.asset.title, "Monster");

  globalThis.fetch = async () => new Response(JSON.stringify({
    data: { Media: { title: { english: "Naruto" }, coverImage: { extraLarge: "https://images.example/naruto.jpg" } } },
  }), { status: 200 });
  const mismatch = await read(await handler(request(packet())));
  assert.equal(mismatch.status, 200);
  assert.equal(mismatch.body.state, "NO_COMPATIBLE_RESULTS");

  globalThis.fetch = async () => new Response(JSON.stringify({ data: { Media: { title: { english: "Monster" }, coverImage: null } } }), { status: 200 });
  const noImage = await read(await handler(request(packet())));
  assert.equal(noImage.status, 200);
  assert.equal(noImage.body.state, "NO_COMPATIBLE_RESULTS");

  globalThis.fetch = async () => new Response("<html>bad provider response</html>", { status: 200 });
  const malformed = await read(await handler(request(packet())));
  assert.equal(malformed.status, 502);
  assert.equal(malformed.body.code, "VISUAL_MALFORMED_PROVIDER_RESPONSE");

  globalThis.fetch = async () => new Response("rate limited", { status: 429 });
  const rateLimited = await read(await handler(request(packet())));
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.body.code, "VISUAL_PROVIDER_RATE_LIMITED");

  globalThis.fetch = async () => { throw new DOMException("timed out", "TimeoutError"); };
  const timeout = await read(await handler(request(packet())));
  assert.equal(timeout.status, 503);
  assert.equal(timeout.body.code, "VISUAL_PROVIDER_TIMEOUT");

  const malformedId = await read(await handler(request(packet({
    providerId: "jikan::not-anime::19",
  }))));
  assert.equal(malformedId.status, 200);
  assert.equal(malformedId.body.state, "NO_COMPATIBLE_RESULTS");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Visual lookup integration checks passed.");
