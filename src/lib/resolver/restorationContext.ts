import { normalizeMediaLens, type MediaLens } from "../../app/mediaLens.js";
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

/**
 * Constructs a standardized RestorationPayload from an exploration record,
 * history document, or saved lorebook.
 */
export function buildRestorationPayload(
  record: any
): RestorationPayload {
  if (!record || typeof record !== "object") {
    return { rehydrated: false };
  }

  const query = (record.query || record.title || record.topic || "").trim();
  const topic = (record.topic || record.title || record.query || "").trim();
  const item = record.providerId || record.item || null;
  const mediaLens = normalizeMediaLens(record.mediaLens);

  let restoredAnswer: RestoredAnswer | null = null;
  let restoredConversation: RestoredConversationMessage[] = [];

  if (record.answer && typeof record.answer.summary === "string" && record.answer.summary.trim()) {
    restoredAnswer = {
      summary: record.answer.summary,
      categories: Array.isArray(record.answer.categories) ? record.answer.categories : [],
      spoilers: typeof record.answer.spoilers === "string" ? record.answer.spoilers : ""
    };
    restoredConversation = normalizeRestoredConversation(record.conversation);
  } else if (Array.isArray(record.conversation) && record.conversation.length > 0) {
    const firstAssistantIdx = record.conversation.findIndex(
      (m: any) => m && m.role === "assistant" && typeof m.content === "string" && m.content.trim()
    );

    if (firstAssistantIdx !== -1) {
      restoredAnswer = {
        summary: record.conversation[firstAssistantIdx].content,
        categories: [],
        spoilers: ""
      };

      if (record.conversation.length > firstAssistantIdx + 1) {
        restoredConversation = normalizeRestoredConversation(
          record.conversation.slice(firstAssistantIdx + 1)
        );
      }
    } else {
      restoredConversation = normalizeRestoredConversation(record.conversation);
    }
  }

  const results = Array.isArray(record.results)
    ? record.results
        .filter((r: any) => r && typeof r.title === "string" && typeof r.url === "string")
        .map((r: any) => ({
          title: r.title,
          url: r.url,
          source: typeof r.source === "string" ? r.source : undefined
        }))
    : [];

  const visualMeta =
    record.activeVisualOwnerMetadata || record.visual || record.visualAsset || null;

  return {
    query,
    topic,
    mediaLens,
    answer: restoredAnswer,
    conversation: restoredConversation,
    results,
    item,
    contextPacket: record.contextPacket || null,
    grounding: record.grounding || null,
    renderEntityPacket: record.renderEntityPacket || null,
    activeVisualOwnerMetadata: visualMeta,
    visual: visualMeta,
    historyId: record.historyId || record.historyDocId || (record.id && !record.lorebookId ? record.id : undefined),
    lorebookId: record.lorebookId || (record.id && record.lorebookId ? record.id : undefined),
    providerMetadata: record.providerMetadata || null,
    rehydrated: true
  };
}

