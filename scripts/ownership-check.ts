import assert from "node:assert/strict";
import { buildContextPacket } from "../src/app/canonicalResolver.ts";
import { groundCanonicalIntent } from "../src/lib/resolver/canonicalGrounding.ts";
import { fallbackIdentityMatches } from "../src/lib/resolver/entityIdentity.ts";
import type { ProviderMetadata } from "../src/lib/resolver/providerMetadata.ts";

const providerId = "igdb::game::25076";
const providerMetadata: ProviderMetadata = {
  provider: "igdb",
  id: "25076",
  confidence: 0.99,
  canonicalTitle: "Red Dead Redemption 2",
  providerType: "game",
  providerResourceType: "game",
};

function grounding() {
  return groundCanonicalIntent({
    query: "Red Dead Redemption 2",
    mediaLens: "games",
    explicitSelection: providerId,
    providerMetadata,
    temporaryEntities: [],
    allowLooseSemantic: false,
  });
}

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("id.twitch.tv/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "fixture-token", expires_in: 3600 }), { status: 200 });
    }

    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([
        {
          id: 25076,
          name: "Red Dead Redemption 2",
          summary: "Fixture game metadata",
          characters: [
            {
              id: 101,
              name: "Arthur Morgan",
              description: "A member of the Van der Linde gang.",
              mug_shot: { url: "//images.example/arthur.jpg" },
            },
          ],
        },
      ]), { status: 200 });
    }

    throw new Error(`Unexpected fixture request: ${url}`);
  };

  const resolved = await buildContextPacket(
    "Red Dead Redemption 2",
    "games",
    false,
    undefined,
    grounding(),
  );

  assert.equal(resolved.packet.providerId, providerId);
  assert.equal(resolved.packet.canonicalEntity, "Red Dead Redemption 2");
  assert.equal(resolved.packet.executionMode, "DETERMINISTIC_PROVIDER");
  assert.equal(resolved.packet.deterministicOwnershipFailure, false);
  assert.equal(resolved.exploration.characters[0]?.name, "Arthur Morgan");

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    throw new Error(`Unexpected missing-provider fixture request: ${url}`);
  };

  const missingProvider = await buildContextPacket(
    "Red Dead Redemption 2",
    "games",
    false,
    undefined,
    grounding(),
  );

  assert.equal(missingProvider.packet.providerId, providerId);
  assert.equal(missingProvider.packet.deterministicOwnershipFailure, true);

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.igdb.com/v4/games")) {
      return new Response(JSON.stringify([{ id: 25076, name: "Unrelated Game" }]), { status: 200 });
    }
    throw new Error(`Unexpected unrelated-provider fixture request: ${url}`);
  };

  const unrelatedProvider = await buildContextPacket(
    "Red Dead Redemption 2",
    "games",
    false,
    undefined,
    grounding(),
  );

  assert.equal(unrelatedProvider.packet.canonicalEntity, "Red Dead Redemption 2");
  assert.equal(unrelatedProvider.packet.deterministicOwnershipFailure, true);
  assert.equal(
    fallbackIdentityMatches("Red Dead Redemption 2", "Unrelated Game", "games"),
    false,
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Deterministic ownership checks passed.");
