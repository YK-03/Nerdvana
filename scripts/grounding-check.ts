import assert from "node:assert/strict";
import { buildAnswerPrompt, buildCanonicalEvidence } from "../src/server/api/answerPrompt.js";
import { buildCacheKey, ANSWER_PROVIDER_VERSION } from "../src/server/api/answerCache.js";

const packet = (overrides: Record<string, unknown> = {}) => ({
  version: "v1",
  executionMode: "DETERMINISTIC_PROVIDER",
  ownershipGenerationId: null,
  canonicalEntity: "Bullet Train",
  expandedEntity: "Bullet Train",
  entityType: "movie",
  entityKind: "title",
  parentFranchise: null,
  universe: null,
  continuity: null,
  mediaLens: "movies",
  activeUniverse: "Bullet Train",
  spoilerPolicy: "strict",
  confidence: 0.99,
  providerId: "tmdb::movie::718930",
  providerMetadata: {
    provider: "tmdb",
    id: 718930,
    confidence: 0.99,
    canonicalTitle: "Bullet Train",
    releaseYear: 2022,
  },
  groundingConfidence: {
    authoritative: 0.99,
    inferred: 0,
    embeddingRecall: 0,
    topology: 0.98,
    continuity: 0.95,
    lens: 1,
  },
  contextualSearchQuery: "Bullet Train",
  retrievalDescriptor: "Bullet Train movie",
  visualAnchors: [],
  entityAliases: [],
  franchiseAliases: [],
  conversationMode: "canon-lookup",
  queryMode: "entity",
  telemetry: {
    groundingType: "registry",
    expansionUsed: false,
    expansionAccepted: false,
    expansionType: null,
    embeddingUsed: false,
    embeddingAccepted: false,
    continuityType: "none",
    isAmbiguous: false,
    isSelfReferential: false,
    inheritanceDepth: 0,
    qualifiedId: "tmdb::movie::718930",
    candidateHistory: [],
    lens: "movies",
    topologyUsed: false,
    candidatePoolSize: 1,
    rejectedCrossLensCandidates: 0,
    embeddingEntropyScore: 0,
    visualEntropyScore: 0,
    continuitySource: "none",
  },
  ...overrides,
}) as any;

const bulletTrainExploration = {
  characters: [
    { id: "tmdb::1", name: "Maria", portrayedBy: "Sandra Bullock" },
    { id: "tmdb::2", name: "Ladybug", portrayedBy: "Brad Pitt" },
  ],
  timeline: [], locations: [], factions: [], artifacts: [], relatedMedia: [],
};

const bulletTrainServerEvidence = {
  provenance: "server-provider-response" as const,
  providerId: "tmdb::movie::718930",
  title: "Bullet Train",
  characters: bulletTrainExploration.characters,
};

function evidenceSection(prompt: string): string {
  return prompt.split("VERIFIED_CANONICAL_EVIDENCE:\n")[1]?.split("\n\nIMPORTANT GUIDELINES:")[0] ?? "";
}

const bulletTrainPrompt = buildAnswerPrompt(
  "Who plays Maria?",
  packet(),
  [],
  bulletTrainServerEvidence,
);
assert.match(bulletTrainPrompt, /VERIFIED_CANONICAL_EVIDENCE:/);
assert.match(bulletTrainPrompt, /Maria/);
assert.match(bulletTrainPrompt, /Sandra Bullock/);
assert.match(bulletTrainPrompt, /TMDB/);

const missingMetadataPrompt = buildAnswerPrompt(
  "Tell me about this title",
  packet(),
  [],
  null,
);
assert.match(missingMetadataPrompt, /VERIFIED_CANONICAL_EVIDENCE:/);
assert.doesNotThrow(() => buildCanonicalEvidence(undefined));
assert.doesNotMatch(evidenceSection(missingMetadataPrompt), /Bullet Train/);
assert.doesNotMatch(evidenceSection(missingMetadataPrompt), /Sandra Bullock/);

const untrustedPrompt = buildAnswerPrompt(
  "Who plays Maria?",
  packet({
    canonicalEntity: "Fake Train",
    providerId: "tmdb::movie::999999",
    mediaLens: "comics",
    providerMetadata: {
      provider: "tmdb",
      id: 718930,
      confidence: 0.99,
      canonicalTitle: "Fake Train",
      releaseYear: 2099,
    },
  }),
  [],
  null,
);
assert.doesNotMatch(evidenceSection(untrustedPrompt), /Fake Train/);
assert.doesNotMatch(evidenceSection(untrustedPrompt), /999999/);
assert.doesNotMatch(evidenceSection(untrustedPrompt), /2099/);
assert.doesNotMatch(evidenceSection(untrustedPrompt), /Sandra Bullock/);

const forgedClientEvidence = {
  title: "Fake Train",
  providerId: "tmdb::movie::999999",
  characters: [{ id: "fake", name: "Maria", portrayedBy: "Fake Actor" }],
};
assert.deepEqual(
  JSON.parse(buildCanonicalEvidence(forgedClientEvidence as any)),
  { provenance: "none", facts: [] },
);

const clientControlledRequestFields = {
  exploration: forgedClientEvidence,
  temporaryEntities: [{ id: "tmdb::movie::999999", title: "Fake Train" }],
  providerMetadata: { canonicalTitle: "Fake Train", fakeActor: "Fake Actor" },
  item: "tmdb::movie::999999",
  canonicalSelection: "tmdb::movie::999999",
};
const requestWithoutServerEvidence = buildAnswerPrompt(
  "Who plays Maria?",
  packet({
    canonicalEntity: clientControlledRequestFields.temporaryEntities[0].title,
    providerId: clientControlledRequestFields.item,
    providerMetadata: clientControlledRequestFields.providerMetadata,
  }),
  [],
  null,
);
assert.deepEqual(JSON.parse(evidenceSection(requestWithoutServerEvidence)), {
  provenance: "none",
  facts: [],
});
assert.doesNotMatch(evidenceSection(requestWithoutServerEvidence), /Fake Actor/);

const oversizedExploration = {
  ...bulletTrainExploration,
  characters: Array.from({ length: 50 }, (_, index) => ({
    id: `tmdb::${index}`,
    name: `Character ${index}`,
    portrayedBy: `Actor ${index}`,
  })),
};
const boundedEvidence = buildCanonicalEvidence({
  ...bulletTrainServerEvidence,
  characters: oversizedExploration.characters,
});
assert.ok(boundedEvidence.length <= 2400);
assert.ok((boundedEvidence.match(/"fact":"/g) ?? []).length <= 12);

for (const mediaLens of ["movies", "tv", "anime", "games", "comics"]) {
  const mediaPrompt = buildAnswerPrompt(
    `Describe this ${mediaLens} title`,
    packet({ mediaLens, providerId: null }),
    [],
    bulletTrainServerEvidence,
  );
  assert.match(mediaPrompt, /USER QUERY:/);
  assert.match(mediaPrompt, /VERIFIED_CANONICAL_EVIDENCE:/);
}

const followUpPrompt = buildAnswerPrompt(
  "What about the ending?",
  packet({ executionMode: "SEMANTIC", spoilerPolicy: "safe" }),
  [{ role: "user", content: "Who plays Maria?" }],
  bulletTrainServerEvidence,
);
assert.match(followUpPrompt, /RECENT CONVERSATION STATE:/);
assert.match(followUpPrompt, /Spoilers: safe/);

assert.equal(ANSWER_PROVIDER_VERSION, "groq-v2-canonical-evidence");
const oldKey = await buildCacheKey("tmdb::movie::718930", "movies", "strict");
assert.match(oldKey.compositeKey, /^groq-v2-canonical-evidence\|/);
assert.notEqual(oldKey.compositeKey, "groq-v1|tmdb::movie::718930|movies|strict");

console.log("Phase 1A grounding checks passed.");
