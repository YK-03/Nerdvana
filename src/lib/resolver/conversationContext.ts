import type { AnswerConversationMessage } from "../../server/api/answerPrompt.js";

/**
 * Builds a consistently normalized deduplication search key.
 * Guarantees case-insensitivity and uniform delimiter structure
 * between request dispatch and response settlement.
 */
export function buildExecutionSearchKey(
  query: string,
  mediaLens: string,
  userId?: string | null,
  item?: string | null
): string {
  const normalizedQuery = (query || "").toLowerCase().trim();
  const normalizedLens = (mediaLens || "").toLowerCase().trim();
  const normalizedUser = (userId || "").trim();
  const normalizedItem = (item || "").trim();
  return `${normalizedQuery}|${normalizedLens}|${normalizedUser}|${normalizedItem}`;
}

export interface EntityIdentityDescriptor {
  providerId?: string | null;
  title?: string | null;
  mediaLens?: string | null;
}

/**
 * Determines whether transitioning between two entity representations
 * indicates a genuinely different canonical title or work, requiring
 * conversation isolation/reset.
 */
export function shouldResetConversationOnEntityChange(
  currentEntity: EntityIdentityDescriptor | null | undefined,
  nextEntity: EntityIdentityDescriptor | null | undefined
): boolean {
  if (!currentEntity || (!currentEntity.title && !currentEntity.providerId)) {
    return false;
  }
  if (!nextEntity || (!nextEntity.title && !nextEntity.providerId)) {
    return false;
  }

  // If both entities possess verified provider IDs, prioritize provider identity
  const currentProviderId = currentEntity.providerId?.trim() || null;
  const nextProviderId = nextEntity.providerId?.trim() || null;

  if (currentProviderId && nextProviderId) {
    if (currentProviderId !== nextProviderId) {
      return true;
    }
    // Same provider ID: check if lens changed unexpectedly
    if (
      currentEntity.mediaLens &&
      nextEntity.mediaLens &&
      currentEntity.mediaLens.toLowerCase().trim() !== nextEntity.mediaLens.toLowerCase().trim()
    ) {
      return true;
    }
    return false;
  }

  // If provider ID is absent on either side, compare normalized titles and media lenses
  const currentLens = (currentEntity.mediaLens || "").toLowerCase().trim();
  const nextLens = (nextEntity.mediaLens || "").toLowerCase().trim();
  if (currentLens && nextLens && currentLens !== nextLens) {
    return true;
  }

  const currentTitle = (currentEntity.title || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  const nextTitle = (nextEntity.title || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");

  if (currentTitle && nextTitle && currentTitle !== nextTitle) {
    return true;
  }

  return false;
}

/**
 * Bounds and formats recent conversation turns for prompt inclusion.
 * Limits the number of turns and characters per message to prevent
 * prompt injection or token bloat.
 */
export function formatRecentConversation(
  conversation: AnswerConversationMessage[],
  maxTurns = 4,
  maxContentChars = 800
): string {
  if (!Array.isArray(conversation) || conversation.length === 0) {
    return "";
  }

  const validMessages = conversation
    .filter(
      (msg): msg is AnswerConversationMessage =>
        Boolean(msg) &&
        (msg.role === "user" || msg.role === "assistant") &&
        typeof msg.content === "string" &&
        msg.content.trim().length > 0
    )
    .slice(-maxTurns);

  if (validMessages.length === 0) {
    return "";
  }

  return validMessages
    .map((msg) => {
      const speaker = msg.role === "assistant" ? "Nerdvana" : "User";
      let cleanContent = msg.content.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      if (cleanContent.length > maxContentChars) {
        cleanContent = cleanContent.slice(0, maxContentChars) + "...";
      }
      return `${speaker}: ${cleanContent}`;
    })
    .join("\n");
}
