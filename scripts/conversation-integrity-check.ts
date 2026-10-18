import assert from "node:assert/strict";
import { buildAnswerPrompt, type AnswerConversationMessage } from "../src/server/api/answerPrompt.js";
import {
  buildExecutionSearchKey,
  shouldResetConversationOnEntityChange,
  formatRecentConversation
} from "../src/lib/resolver/conversationContext.js";

console.log("Running Phase 1 conversation integrity regression checks...");

// ============================================================================
// 1. CANONICAL DETERMINISTIC_PROVIDER PROMPT CONTEXT RETENTION
// ============================================================================
{
  const packet = {
    version: "v1",
    executionMode: "DETERMINISTIC_PROVIDER" as const,
    ownershipGenerationId: null,
    canonicalEntity: "Red Dead Redemption 2",
    expandedEntity: "Red Dead Redemption 2",
    entityType: "game",
    entityKind: "title",
    parentFranchise: "Red Dead",
    universe: null,
    continuity: null,
    mediaLens: "games",
    activeUniverse: "Red Dead Redemption 2",
    spoilerPolicy: "strict",
    confidence: 1.0,
    providerId: "igdb::game::119171",
    conversationMode: "canon-lookup",
  } as any;

  const priorTurns: AnswerConversationMessage[] = [
    { role: "user", content: "Who is Arthur Morgan?" },
    { role: "assistant", content: "Arthur Morgan is the central protagonist and lead outlaw of Red Dead Redemption 2." }
  ];

  const followUpPrompt = buildAnswerPrompt(
    "What happens to him?",
    packet,
    priorTurns
  );

  // Must retain conversation state for canonical entities
  assert.ok(
    followUpPrompt.includes("RECENT CONVERSATION STATE:"),
    "Deterministic provider follow-up prompt must include RECENT CONVERSATION STATE header"
  );
  assert.ok(
    followUpPrompt.includes("Who is Arthur Morgan?"),
    "Prompt must include the previous user question"
  );
  assert.ok(
    followUpPrompt.includes("Arthur Morgan is the central protagonist"),
    "Prompt must include previous assistant answer to resolve referents like 'him'"
  );
  assert.ok(
    followUpPrompt.includes("What happens to him?"),
    "Prompt must include the current follow-up query"
  );

  // Must include explicit grounding guideline for conversation context
  assert.ok(
    followUpPrompt.includes("RECENT CONVERSATION STATE"),
    "Prompt guidelines must instruct LLM on how to treat conversation state"
  );
}

// ============================================================================
// 2. SEMANTIC MODE AND EMPTY CONVERSATION INTEGRITY
// ============================================================================
{
  const semanticPacket = {
    version: "v1",
    executionMode: "SEMANTIC" as const,
    ownershipGenerationId: null,
    canonicalEntity: "Some Ambiguous Work",
    mediaLens: "movies",
    spoilerPolicy: "strict",
    confidence: 0.5,
    conversationMode: "canon-lookup",
  } as any;

  const priorTurns: AnswerConversationMessage[] = [
    { role: "user", content: "Is this connected to the original?" },
    { role: "assistant", content: "It serves as a loose thematic follow-up rather than a direct sequel." }
  ];

  // Semantic mode with turns should include conversation
  const semanticPromptWithTurns = buildAnswerPrompt("Who directed it?", semanticPacket, priorTurns);
  assert.ok(
    semanticPromptWithTurns.includes("RECENT CONVERSATION STATE:"),
    "Semantic mode follow-up prompt must include RECENT CONVERSATION STATE"
  );
  assert.ok(
    semanticPromptWithTurns.includes("loose thematic follow-up"),
    "Semantic mode must include prior assistant turn"
  );

  // Semantic mode with EMPTY turns must NOT render conversation header
  const semanticPromptEmpty = buildAnswerPrompt("Initial question", semanticPacket, []);
  assert.equal(
    semanticPromptEmpty.includes("RECENT CONVERSATION STATE:"),
    false,
    "Initial prompt with empty conversation must not render RECENT CONVERSATION STATE header"
  );

  // Canonical mode with EMPTY turns must NOT render conversation header
  const deterministicPacket = {
    ...semanticPacket,
    executionMode: "DETERMINISTIC_PROVIDER" as const,
    providerId: "tmdb::movie::27205",
    canonicalEntity: "Inception"
  };
  const deterministicPromptEmpty = buildAnswerPrompt("Tell me about Inception", deterministicPacket, []);
  assert.equal(
    deterministicPromptEmpty.includes("RECENT CONVERSATION STATE:"),
    false,
    "Deterministic initial prompt with empty conversation must not render RECENT CONVERSATION STATE header"
  );
}

// ============================================================================
// 3. CONVERSATION BOUNDING AND FORMATTING
// ============================================================================
{
  const longConversation: AnswerConversationMessage[] = [
    { role: "user", content: "Turn 1" },
    { role: "assistant", content: "Answer 1" },
    { role: "user", content: "Turn 2" },
    { role: "assistant", content: "Answer 2" },
    { role: "user", content: "Turn 3" },
    { role: "assistant", content: "Answer 3" },
  ];

  const formatted = formatRecentConversation(longConversation, 4);
  assert.ok(formatted.includes("Turn 2"), "Formatted recent conversation should include recent turns");
  assert.ok(formatted.includes("Turn 3"), "Formatted recent conversation should include latest turns");
  assert.equal(formatted.includes("Turn 1"), false, "Formatted recent conversation must bound history to max turns");
}

// ============================================================================
// 4. SEARCH DEDUPLICATION KEY NORMALIZATION
// ============================================================================
{
  // Casing mismatch: input "Inception" vs response "inception"
  const inputKey = buildExecutionSearchKey("Inception", "movies", null, "tmdb::movie::27205");
  const responseKey = buildExecutionSearchKey("inception", "movies", null, "tmdb::movie::27205");
  assert.equal(
    inputKey,
    responseKey,
    "Search key must normalize casing so 'Inception' matches 'inception'"
  );

  // Meaningful distinction: mediaLens
  const movieKey = buildExecutionSearchKey("Arcane", "movies", null, null);
  const tvKey = buildExecutionSearchKey("Arcane", "tv", null, null);
  assert.notEqual(movieKey, tvKey, "Different media lenses must produce different search keys");

  // Meaningful distinction: item identity
  const batman1989 = buildExecutionSearchKey("Batman", "movies", null, "tmdb::movie::268");
  const theBatman2022 = buildExecutionSearchKey("The Batman", "movies", null, "tmdb::movie::414906");
  assert.notEqual(batman1989, theBatman2022, "Different canonical items must produce different search keys");

  // User isolation
  const user1Key = buildExecutionSearchKey("Dune", "movies", "user_123", "tmdb::movie::438631");
  const user2Key = buildExecutionSearchKey("Dune", "movies", "user_456", "tmdb::movie::438631");
  assert.notEqual(user1Key, user2Key, "Different users must produce distinct search keys");
}

// ============================================================================
// 5. CROSS-ENTITY CONVERSATION ISOLATION LOGIC
// ============================================================================
{
  const arcaneEntity = {
    title: "Arcane",
    providerId: "tmdb::tv::94605",
    mediaLens: "tv"
  };

  const inceptionEntity = {
    title: "Inception",
    providerId: "tmdb::movie::27205",
    mediaLens: "movies"
  };

  // Switching Arcane -> Inception must trigger conversation reset
  assert.equal(
    shouldResetConversationOnEntityChange(arcaneEntity, inceptionEntity),
    true,
    "Switching from Arcane to Inception must trigger conversation reset"
  );

  // Same-title follow-up must NOT reset conversation
  assert.equal(
    shouldResetConversationOnEntityChange(arcaneEntity, { ...arcaneEntity }),
    false,
    "Same-entity follow-up must preserve conversation"
  );

  // Different Batman movies must reset conversation
  const batman89 = { title: "Batman", providerId: "tmdb::movie::268", mediaLens: "movies" };
  const batman22 = { title: "The Batman", providerId: "tmdb::movie::414906", mediaLens: "movies" };
  assert.equal(
    shouldResetConversationOnEntityChange(batman89, batman22),
    true,
    "Different canonical provider IDs must trigger conversation reset even with similar titles"
  );

  // Same provider ID with slight title variation (e.g. localized or edition) must preserve
  const spiderManA = { title: "Spider-Man", providerId: "tmdb::movie::557", mediaLens: "movies" };
  const spiderManB = { title: "Spider-Man (2002)", providerId: "tmdb::movie::557", mediaLens: "movies" };
  assert.equal(
    shouldResetConversationOnEntityChange(spiderManA, spiderManB),
    false,
    "Identical canonical provider ID must preserve conversation despite title variant"
  );
}

// ============================================================================
// 6. ARCANE -> INCEPTION ISOLATION SIMULATION
// ============================================================================
{
  // 1. User explores Arcane and asks follow-ups
  const arcaneEntity = { title: "Arcane", providerId: "tmdb::tv::94605", mediaLens: "tv" };
  let activeConversation: AnswerConversationMessage[] = [
    { role: "user", content: "Tell me about Jinx and Vi." },
    { role: "assistant", content: "Jinx and Vi are sisters torn apart by conflict between Piltover and Zaun." }
  ];

  // 2. User searches Inception
  const inceptionEntity = { title: "Inception", providerId: "tmdb::movie::27205", mediaLens: "movies" };
  const mustReset = shouldResetConversationOnEntityChange(arcaneEntity, inceptionEntity);
  assert.equal(mustReset, true, "Entity switch from Arcane to Inception must trigger reset");

  if (mustReset) {
    activeConversation = []; // AskPage clears conversation state
  }

  // 3. User asks follow-up on Inception
  const inceptionFollowUpPayload = {
    query: "What was the spinning top?",
    conversation: [
      { role: "user", content: "Inception" },
      { role: "assistant", content: "Inception is a sci-fi heist movie centered around subconscious extraction and totems." },
      ...activeConversation
    ]
  };

  const inceptionPacket = {
    version: "v1",
    executionMode: "DETERMINISTIC_PROVIDER" as const,
    canonicalEntity: "Inception",
    providerId: "tmdb::movie::27205",
    mediaLens: "movies",
    spoilerPolicy: "strict",
    confidence: 1.0,
    conversationMode: "canon-lookup",
  } as any;

  const inceptionPrompt = buildAnswerPrompt(
    inceptionFollowUpPayload.query,
    inceptionPacket,
    inceptionFollowUpPayload.conversation
  );

  // Inception prompt MUST NOT contain Arcane dialogue
  assert.equal(inceptionPrompt.includes("Jinx"), false, "Inception prompt must not contain Arcane turn 'Jinx'");
  assert.equal(inceptionPrompt.includes("Zaun"), false, "Inception prompt must not contain Arcane turn 'Zaun'");
  assert.equal(inceptionPrompt.includes("Piltover"), false, "Inception prompt must not contain Arcane turn 'Piltover'");

  // Inception prompt MUST contain Inception context
  assert.ok(inceptionPrompt.includes("subconscious extraction and totems"), "Inception prompt must contain Inception root context");
  assert.ok(inceptionPrompt.includes("What was the spinning top?"), "Inception prompt must contain follow-up query");
}

// ============================================================================
// 7. SAME-TITLE MULTI-TURN CONTINUITY SIMULATION
// ============================================================================
{
  const inceptionEntity = { title: "Inception", providerId: "tmdb::movie::27205", mediaLens: "movies" };
  let conversationState: AnswerConversationMessage[] = [];

  // Turn 1
  conversationState.push(
    { role: "user", content: "What is Cobb's totem?" },
    { role: "assistant", content: "Cobb's totem is a spinning top originally belonging to his deceased wife Mal." }
  );

  // Turn 2: User asks follow-up on same title
  const sameEntityCheck = shouldResetConversationOnEntityChange(inceptionEntity, inceptionEntity);
  assert.equal(sameEntityCheck, false, "Same entity follow-up must not reset conversation");

  const turn2PayloadConversation = [
    { role: "user", content: "Inception" },
    { role: "assistant", content: "Inception is a sci-fi heist movie." },
    ...conversationState
  ];

  const inceptionPacket = {
    version: "v1",
    executionMode: "DETERMINISTIC_PROVIDER" as const,
    canonicalEntity: "Inception",
    providerId: "tmdb::movie::27205",
    mediaLens: "movies",
    spoilerPolicy: "strict",
    confidence: 1.0,
    conversationMode: "canon-lookup",
  } as any;

  const turn2Prompt = buildAnswerPrompt(
    "Why was Mal dangerous?",
    inceptionPacket,
    turn2PayloadConversation
  );

  assert.ok(turn2Prompt.includes("spinning top"), "Follow-up turn 2 must retain totem context from turn 1");
  assert.ok(turn2Prompt.includes("Why was Mal dangerous?"), "Follow-up turn 2 must include user follow-up query");
}

console.log("Phase 1 conversation integrity regression checks passed successfully.");

