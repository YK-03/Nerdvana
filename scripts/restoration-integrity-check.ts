import assert from "node:assert/strict";
import {
  isValidRestorationState,
  hasSufficientRestorationData,
  consumeRestorationState,
  normalizeRestoredConversation,
  shouldSkipSearchOnRestoration,
  buildRestorationPayload,
  type RestorationPayload
} from "../src/lib/resolver/restorationContext.js";
import { buildExecutionSearchKey, shouldResetConversationOnEntityChange } from "../src/lib/resolver/conversationContext.js";

console.log("Running Phase 2 restoration integrity regression checks...");

// ============================================================================
// 1. RESTORING A RECORD WITH COMPLETE ANSWER, RESULTS, AND CONVERSATION
// ============================================================================
{
  const state: RestorationPayload = {
    query: "Arcane",
    mediaLens: "tv",
    answer: {
      summary: "Arcane is an animated steampunk action-adventure series set in the League of Legends universe.",
      categories: [],
      spoilers: ""
    },
    results: [{ title: "Arcane - Netflix", url: "https://netflix.com/title/arcane" }],
    conversation: [
      { role: "user", content: "Tell me about Jinx and Vi" },
      { role: "assistant", content: "Jinx and Vi are sisters separated by tragedy in Zaun and Piltover." }
    ],
    rehydrated: true,
    historyId: "hist-123",
    item: "tmdb::tv::94605"
  };

  assert.equal(
    isValidRestorationState(state, "Arcane"),
    true,
    "Valid complete restoration state matching current query must be accepted"
  );

  assert.equal(
    hasSufficientRestorationData(state),
    true,
    "State with non-empty answer summary must be considered sufficient"
  );

  const normalizedConvo = normalizeRestoredConversation(state.conversation);
  assert.equal(normalizedConvo.length, 2, "Conversation should preserve both follow-up turns");
  assert.equal(normalizedConvo[0].role, "user");
  assert.equal(normalizedConvo[0].content, "Tell me about Jinx and Vi");
  assert.equal(normalizedConvo[1].role, "assistant");
  assert.equal(normalizedConvo[1].content, "Jinx and Vi are sisters separated by tragedy in Zaun and Piltover.");

  const skipSearch = shouldSkipSearchOnRestoration(state, "Arcane");
  assert.equal(skipSearch, true, "Search must be skipped when restoration data is complete and query matches");
}

// ============================================================================
// 2. RESTORING AN OLDER RECORD WITH MISSING OPTIONAL FIELDS
// ============================================================================
{
  // Older records may lack answer summary, item, or conversation
  const olderState: RestorationPayload = {
    query: "Inception",
    mediaLens: "movies",
    rehydrated: true,
    historyId: "hist-old-456",
    results: []
  };

  assert.equal(
    isValidRestorationState(olderState, "Inception"),
    true,
    "Older restoration state matching query should still be recognized"
  );

  assert.equal(
    hasSufficientRestorationData(olderState),
    false,
    "Older record missing answer summary is not sufficient to skip search"
  );

  const skipSearch = shouldSkipSearchOnRestoration(olderState, "Inception");
  assert.equal(skipSearch, false, "Must fall back to search when answer is missing");

  const normalized = normalizeRestoredConversation((olderState as any).conversation);
  assert.deepEqual(normalized, [], "Missing conversation should normalize safely to empty array");
}

// ============================================================================
// 3. CONTINUING A RESTORED CONVERSATION WITH CONTEXTUAL FOLLOW-UP
// ============================================================================
{
  const restoredPayload: RestorationPayload = {
    query: "Red Dead Redemption 2",
    mediaLens: "games",
    answer: {
      summary: "Red Dead Redemption 2 is a western action-adventure game by Rockstar Games.",
      categories: [],
      spoilers: ""
    },
    conversation: [
      { role: "user", content: "Who is Arthur Morgan?" },
      { role: "assistant", content: "Arthur Morgan is the central protagonist and lead outlaw." }
    ],
    rehydrated: true,
    historyId: "hist-rdr2-789",
    item: "igdb::game::25076"
  };

  // When a follow-up is submitted: follow-up query is "What happens to him?"
  // Payload sent to /api/nerdvana-answer must assemble [initial user, initial assistant, ...restoredConversation]
  const fullConversationChain = [
    { role: "user", content: restoredPayload.query },
    { role: "assistant", content: restoredPayload.answer!.summary },
    ...normalizeRestoredConversation(restoredPayload.conversation)
  ];

  assert.equal(fullConversationChain.length, 4, "Chained conversation must have 4 turns");
  assert.equal(fullConversationChain[0].content, "Red Dead Redemption 2");
  assert.equal(fullConversationChain[1].content, restoredPayload.answer!.summary);
  assert.equal(fullConversationChain[2].content, "Who is Arthur Morgan?");
  assert.equal(fullConversationChain[3].content, "Arthur Morgan is the central protagonist and lead outlaw.");
}

// ============================================================================
// 4. AVOIDING UNNECESSARY INITIAL SEARCH WHEN RESTORED DATA IS SUFFICIENT
// ============================================================================
{
  const completeState: RestorationPayload = {
    query: "The Matrix",
    mediaLens: "movies",
    answer: {
      summary: "The Matrix is a 1999 sci-fi action film directed by the Wachowskis.",
      categories: [],
      spoilers: ""
    },
    results: [{ title: "The Matrix", url: "https://imdb.com/title/tt0133093" }],
    conversation: [],
    rehydrated: true,
    item: "tmdb::movie::603"
  };

  assert.equal(
    shouldSkipSearchOnRestoration(completeState, "The Matrix"),
    true,
    "Sufficient restoration data must skip initial search"
  );

  // Search key constructed from restored state should match expected search key format
  const restoredKey = buildExecutionSearchKey(
    completeState.query,
    completeState.mediaLens || "movies",
    "user-1",
    completeState.item
  );
  assert.ok(restoredKey.includes("the matrix"), "Restored key must contain normalized query");
  assert.ok(restoredKey.includes("tmdb::movie::603"), "Restored key must contain item identifier");
}

// ============================================================================
// 5. FALLING BACK TO FRESH SEARCH WHEN RESTORATION DATA IS ABSENT OR INSUFFICIENT
// ============================================================================
{
  assert.equal(
    shouldSkipSearchOnRestoration(null, "The Matrix"),
    false,
    "Null state must not skip search"
  );
  assert.equal(
    shouldSkipSearchOnRestoration(undefined, "The Matrix"),
    false,
    "Undefined state must not skip search"
  );
  assert.equal(
    shouldSkipSearchOnRestoration({ rehydrated: false } as any, "The Matrix"),
    false,
    "State without rehydrated flag must not skip search"
  );
  assert.equal(
    shouldSkipSearchOnRestoration({ rehydrated: true, query: "The Matrix", answer: { summary: "   " } } as any, "The Matrix"),
    false,
    "Whitespace-only answer summary must not skip search"
  );
}

// ============================================================================
// 6. PRESERVING CORRECT RECORD IDENTITY AND AVOIDING DUPLICATE RECORDS
// ============================================================================
{
  const stateFromHistory: RestorationPayload = {
    query: "Dune",
    mediaLens: "movies",
    answer: { summary: "Dune is a 2021 epic sci-fi film directed by Denis Villeneuve." },
    historyId: "existing-history-doc-id-123",
    rehydrated: true
  };

  const consumed = consumeRestorationState(stateFromHistory);
  assert.ok(consumed, "Consumed state must be returned");
  assert.equal(
    consumed?.historyId,
    "existing-history-doc-id-123",
    "Existing history record ID must be preserved for subsequent updates"
  );

  const stateFromLorebook: RestorationPayload = {
    query: "Blade Runner",
    mediaLens: "movies",
    answer: { summary: "Blade Runner is a 1982 neo-noir sci-fi film." },
    lorebookId: "saved-lorebook-doc-id-456",
    rehydrated: true
  };

  const consumedLorebook = consumeRestorationState(stateFromLorebook);
  assert.ok(consumedLorebook, "Consumed lorebook state must be returned");
  assert.equal(
    consumedLorebook?.lorebookId,
    "saved-lorebook-doc-id-456",
    "Saved Lorebook record ID must be identified"
  );
  assert.equal(
    consumedLorebook?.historyId,
    undefined,
    "Lorebook must not fabricate an existing historyId"
  );
}

// ============================================================================
// 7. HANDLING NAVIGATION WHEN ASKPAGE IS REUSED INSTEAD OF REMOUNTED
// ============================================================================
{
  // If AskPage is already mounted for "Arcane" and user clicks History item for "Inception"
  const incomingHistoryState: RestorationPayload = {
    query: "Inception",
    mediaLens: "movies",
    answer: { summary: "Inception is a 2010 film directed by Christopher Nolan." },
    rehydrated: true,
    historyId: "hist-inception"
  };

  // Must match the new target query "Inception", not the previous "Arcane"
  assert.equal(
    isValidRestorationState(incomingHistoryState, "Arcane"),
    false,
    "Restoration state for Inception must not be applied if current query is Arcane"
  );
  assert.equal(
    isValidRestorationState(incomingHistoryState, "Inception"),
    true,
    "Restoration state for Inception must be applied when current query is Inception"
  );
}

// ============================================================================
// 8. CONSUMING RESTORATION STATE ONCE WITHOUT APPLYING IT TO UNRELATED NAVIGATION
// ============================================================================
{
  const rawHistoryState: RestorationPayload = {
    query: "Arcane",
    mediaLens: "tv",
    answer: { summary: "Arcane summary..." },
    rehydrated: true,
    historyId: "hist-arcane"
  };

  // First consumption: valid
  const firstConsume = consumeRestorationState(rawHistoryState);
  assert.ok(firstConsume, "First consumption must succeed");
  assert.equal(firstConsume?.query, "Arcane");

  // After consumption, rehydrated flag is consumed/cleared in the state object
  assert.equal(
    isValidRestorationState(rawHistoryState, "Arcane"),
    false,
    "Consumed state (with rehydrated cleared) must not be valid for subsequent runs"
  );
}

// ============================================================================
// 9. KEEPING DIRECT URL SEARCHES, SAME-TITLE CONTINUITY, AND ENTITY-SWITCH ISOLATION INTACT
// ============================================================================
{
  // A fresh direct URL load has state === null
  assert.equal(isValidRestorationState(null, "Batman"), false);
  assert.equal(shouldSkipSearchOnRestoration(null, "Batman"), false);

  // A plain browser back/forward with no rehydration flag
  const plainState = { mediaLens: "movies", item: "tmdb::movie::155" };
  assert.equal(isValidRestorationState(plainState, "Batman"), false);
  assert.equal(shouldSkipSearchOnRestoration(plainState, "Batman"), false);
}

// ============================================================================
// 10. PREVENTING DUPLICATE REQUESTS DURING RESTORATION AND URL SYNCHRONIZATION
// ============================================================================
{
  const restoredPayload: RestorationPayload = {
    query: "Cyberpunk 2077",
    mediaLens: "games",
    answer: { summary: "Cyberpunk 2077 is an action RPG." },
    item: "igdb::game::1877",
    rehydrated: true
  };

  // Build the search key that AskPage registers as completed
  const initialKey = buildExecutionSearchKey(
    restoredPayload.query,
    restoredPayload.mediaLens || "games",
    null,
    restoredPayload.item
  );
  // When canonical entity normalizes or URL replaces state with the same item
  const reconciledKey = buildExecutionSearchKey(
    "Cyberpunk 2077",
    "games",
    null,
    "igdb::game::1877"
  );

  assert.equal(
    initialKey,
    reconciledKey,
    "Restored search key and reconciled search key must be identical to avoid re-triggering search"
  );
}
 
// ============================================================================
// 11. PROFILE CONTINUE EXPLORING: COMPLETE RECORD RESTORATION
// ============================================================================
{
  const currentExplorationRecord = {
    title: "Severance",
    query: "Severance",
    providerId: "tmdb::tv::95396",
    item: "tmdb::tv::95396",
    mediaLens: "tv",
    visual: {
      backdropUrl: "https://image.tmdb.org/t/p/original/95396_backdrop.jpg",
      posterUrl: "https://image.tmdb.org/t/p/w500/95396_poster.jpg"
    },
    answer: {
      summary: "Severance is a workplace sci-fi psychological thriller series created by Dan Erickson.",
      categories: [],
      spoilers: ""
    },
    results: [
      { title: "Severance - Apple TV+", url: "https://tv.apple.com/show/severance" }
    ],
    conversation: [
      { role: "user", content: "Who is Mark Scout?" },
      { role: "assistant", content: "Mark Scout is the macrodata refinement team lead portrayed by Adam Scott." }
    ],
    contextPacket: {
      canonicalEntity: "Severance",
      providerId: "tmdb::tv::95396",
      mediaLens: "tv"
    },
    grounding: {
      selectedCanonicalEntity: "Severance"
    },
    renderEntityPacket: {
      title: "Severance",
      providerId: "tmdb::tv::95396"
    },
    historyId: "hist-severance-999"
  };

  const payload = buildRestorationPayload(currentExplorationRecord);

  assert.equal(payload.rehydrated, true, "Payload from current exploration must be flagged rehydrated");
  assert.equal(payload.query, "Severance", "Payload query must match title/query");
  assert.equal(payload.item, "tmdb::tv::95396", "Payload item must match providerId");
  assert.equal(payload.mediaLens, "tv", "MediaLens must be normalized");
  assert.ok(payload.answer, "Answer object must be preserved");
  assert.equal(
    payload.answer?.summary,
    "Severance is a workplace sci-fi psychological thriller series created by Dan Erickson."
  );
  assert.equal(payload.conversation?.length, 2, "Conversation turns must be preserved");
  assert.equal(payload.results?.length, 1, "Results must be preserved");
  assert.equal(payload.historyId, "hist-severance-999", "HistoryId must be preserved");
  assert.ok(payload.visual || payload.activeVisualOwnerMetadata, "Visual metadata must be preserved");

  assert.equal(
    isValidRestorationState(payload, "Severance"),
    true,
    "Restored payload must be valid for target query Severance"
  );
  assert.equal(
    hasSufficientRestorationData(payload),
    true,
    "Complete current exploration record must have sufficient restoration data"
  );
  assert.equal(
    shouldSkipSearchOnRestoration(payload, "Severance"),
    true,
    "Search must be skipped when restoring complete Profile exploration"
  );
}

// ============================================================================
// 12. PROFILE CONTINUE EXPLORING: INCOMPLETE / OLDER RECORD GRACEFUL HANDLING
// ============================================================================
{
  const olderIncompleteRecord = {
    title: "Blade Runner 2049",
    providerId: "tmdb::movie::335984",
    mediaLens: "movies",
    visual: {
      posterUrl: "https://image.tmdb.org/t/p/w500/blade_runner.jpg"
    }
    // Lacks answer, conversation, results, etc.
  };

  const payload = buildRestorationPayload(olderIncompleteRecord);

  assert.equal(payload.rehydrated, true, "Payload must be constructed with rehydrated flag");
  assert.equal(payload.query, "Blade Runner 2049", "Payload query must fall back to title");
  assert.equal(payload.item, "tmdb::movie::335984", "Payload item must use providerId");
  assert.equal(payload.mediaLens, "movies", "MediaLens must be preserved");
  assert.equal(payload.answer, null, "Incomplete record without answer must produce null answer");
  assert.deepEqual(payload.conversation, [], "Incomplete record without conversation must produce empty array");

  assert.equal(
    isValidRestorationState(payload, "Blade Runner 2049"),
    true,
    "Incomplete payload must still be valid for target query"
  );
  assert.equal(
    hasSufficientRestorationData(payload),
    false,
    "Incomplete record must NOT be considered sufficient"
  );
  assert.equal(
    shouldSkipSearchOnRestoration(payload, "Blade Runner 2049"),
    false,
    "Must NOT skip search for incomplete record — must fall back cleanly to fresh search"
  );
}

// ============================================================================
// 13. PROFILE YOUR LIBRARY: LEGACY LOREBOOK COMPATIBILITY
// ============================================================================
{
  const legacyLorebook = {
    topic: "Death Note",
    mediaLens: "anime",
    item: "jikan::anime::1535",
    conversation: [
      { role: "user", content: "What is Death Note?" },
      { role: "assistant", content: "Death Note is a psychological supernatural thriller anime." },
      { role: "user", content: "Who is L?" },
      { role: "assistant", content: "L Lawliet is the eccentric master detective who opposes Light." }
    ],
    results: [{ title: "Death Note - MAL", url: "https://myanimelist.net/anime/1535" }]
  };

  const payload = buildRestorationPayload(legacyLorebook);

  assert.equal(payload.query, "Death Note");
  assert.equal(
    payload.answer?.summary,
    "Death Note is a psychological supernatural thriller anime.",
    "First assistant turn must be extracted as canonical answer summary"
  );
  assert.equal(
    payload.conversation?.length,
    2,
    "Subsequent conversation turns must be preserved as follow-up history"
  );
  assert.equal(payload.conversation?.[0].content, "Who is L?");
  assert.equal(payload.conversation?.[1].content, "L Lawliet is the eccentric master detective who opposes Light.");
  assert.equal(hasSufficientRestorationData(payload), true);
  assert.equal(shouldSkipSearchOnRestoration(payload, "Death Note"), true);
}

// ============================================================================
// 14. PROFILE CONTEXTUAL FOLLOW-UP CONTINUATION
// ============================================================================
{
  const restoredProfileExploration = {
    title: "Arcane",
    query: "Arcane",
    providerId: "tmdb::tv::94605",
    mediaLens: "tv",
    answer: {
      summary: "Arcane is an animated series set in Piltover and Zaun.",
      categories: [],
      spoilers: ""
    },
    conversation: [
      { role: "user", content: "Who created Hextech?" },
      { role: "assistant", content: "Jayce Talis and Viktor created Hextech together." }
    ],
    historyId: "hist-arcane-followup"
  };

  const payload = buildRestorationPayload(restoredProfileExploration);

  // Full conversation chain sent to answer prompt
  const conversationChainForPrompt = [
    { role: "user", content: payload.query },
    { role: "assistant", content: payload.answer!.summary },
    ...payload.conversation!
  ];

  assert.equal(conversationChainForPrompt.length, 4, "Chained conversation must contain all 4 prior turns");
  assert.equal(conversationChainForPrompt[0].content, "Arcane");
  assert.equal(conversationChainForPrompt[1].content, "Arcane is an animated series set in Piltover and Zaun.");
  assert.equal(conversationChainForPrompt[2].content, "Who created Hextech?");
  assert.equal(conversationChainForPrompt[3].content, "Jayce Talis and Viktor created Hextech together.");

  // When next follow-up arrives:
  const newFollowUp = [
    ...payload.conversation!,
    { role: "user", content: "What happened to Viktor?" } as const,
    { role: "assistant", content: "Viktor fell ill and turned to the Hexcore." } as const
  ];
  assert.equal(newFollowUp.length, 4, "Follow-up conversation extends smoothly without losing context");
}

// ============================================================================
// 15. PROFILE RESTORATION ENTITY ISOLATION
// ============================================================================
{
  const severanceProfileState = buildRestorationPayload({
    title: "Severance",
    providerId: "tmdb::tv::95396",
    mediaLens: "tv",
    answer: { summary: "Severance summary..." }
  });

  // Target query mismatch
  assert.equal(
    isValidRestorationState(severanceProfileState, "Elden Ring"),
    false,
    "Severance restoration state must NOT apply when query is Elden Ring"
  );

  // Entity switch resets conversation
  const currentEntity = {
    canonicalEntity: "Severance",
    providerId: "tmdb::tv::95396",
    mediaLens: "tv"
  };
  const nextEntity = {
    canonicalEntity: "Elden Ring",
    providerId: "igdb::game::119133",
    mediaLens: "games"
  };
  assert.equal(
    shouldResetConversationOnEntityChange(currentEntity, nextEntity),
    true,
    "Switching entities must reset conversation state to prevent leakage"
  );
}

console.log("Phase 2 & Phase 3 restoration integrity regression checks completed.");

