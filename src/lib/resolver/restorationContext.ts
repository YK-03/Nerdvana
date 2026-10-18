import type { MediaLens } from "../../app/mediaLens.js";
import type { ProviderMetadata } from "../../types/index.js";

export interface RestoredAnswer {
  summary: string;
  categories?: any[];
  spoilers?: string;
}

export interface RestoredResultLink {
  title: string;
  url: string;
  source?: string;
}

export interface RestoredConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RestorationPayload {
  query?: string;
  topic?: string;
  mediaLens?: MediaLens;
  answer?: RestoredAnswer | null;
  conversation?: RestoredConversationMessage[];
  results?: RestoredResultLink[];
  historyId?: string;
  lorebookId?: string;
  item?: string | null;
  providerMetadata?: ProviderMetadata | null;
  contextPacket?: any;
  grounding?: any;
  renderEntityPacket?: any;
  activeVisualOwnerMetadata?: any;
  rehydrated?: boolean;
  [key: string]: any;
}

/**
 * Normalizes query string for entity/topic comparison.
 */
function normalizeQuery(q: string | null | undefined): string {
  return (q || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Validates whether an incoming browser/navigation state object
 * contains an active rehydration signal matching the current query.
 */
export function isValidRestorationState(
  state: unknown,
  currentQuery: string
): boolean {
  if (!state || typeof state !== "object") {
    return false;
  }

  const typed = state as RestorationPayload;
  if (typed.rehydrated !== true) {
    return false;
  }

  const targetQuery = typed.query || typed.topic || "";
  const normalizedTarget = normalizeQuery(targetQuery);
  const normalizedCurrent = normalizeQuery(currentQuery);

  if (!normalizedTarget || !normalizedCurrent) {
    return false;
  }

  return normalizedTarget === normalizedCurrent;
}

/**
 * Checks whether the restoration payload contains sufficient content
 * (specifically a non-empty answer summary) to render immediately
 * without re-executing an expensive search.
 */
export function hasSufficientRestorationData(
  payload: RestorationPayload | null | undefined
): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const summary = payload.answer?.summary;
  if (typeof summary !== "string" || summary.trim().length === 0) {
    return false;
  }

  return true;
}

/**
 * Determines whether the initial search execution pipeline should be
 * bypassed because valid, complete restoration data is present.
 */
export function shouldSkipSearchOnRestoration(
  state: unknown,
  currentQuery: string
): boolean {
  if (!isValidRestorationState(state, currentQuery)) {
    return false;
  }
  return hasSufficientRestorationData(state as RestorationPayload);
}

/**
 * Normalizes and sanitizes conversation turns into valid ConversationMessage structures.
 */
export function normalizeRestoredConversation(
  conversation: unknown
): RestoredConversationMessage[] {
  if (!Array.isArray(conversation)) {
    return [];
  }

  return conversation
    .filter(
      (item): item is RestoredConversationMessage =>
        Boolean(item) &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
    )
    .map((item) => ({
      role: item.role,
      content: item.content
    }));
}

/**
 * Consumes the restoration payload from the state object.
 * Mutates the source state to mark `rehydrated = false` so it cannot
 * be inadvertently re-consumed by subsequent renders or navigations.
 */
export function consumeRestorationState(
  state: unknown
): RestorationPayload | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const typed = state as RestorationPayload;
  if (!typed.rehydrated) {
    return null;
  }

  const payload: RestorationPayload = {
    query: typed.query || typed.topic || "",
    topic: typed.topic || typed.query || "",
    mediaLens: typed.mediaLens,
    answer: typed.answer ? {
      summary: typed.answer.summary || "",
      categories: Array.isArray(typed.answer.categories) ? typed.answer.categories : [],
      spoilers: typed.answer.spoilers || ""
    } : null,
    conversation: normalizeRestoredConversation(typed.conversation),
    results: Array.isArray(typed.results) ? typed.results : [],
    historyId: typed.historyId,
    lorebookId: typed.lorebookId,
    item: typed.item || null,
    providerMetadata: typed.providerMetadata || null,
    contextPacket: typed.contextPacket || null,
    grounding: typed.grounding || null,
    renderEntityPacket: typed.renderEntityPacket || null,
    activeVisualOwnerMetadata: typed.activeVisualOwnerMetadata || null
  };

  // Consume the flag so this exact instance cannot trigger rehydration twice
  typed.rehydrated = false;

  return payload;
}
