import { isExternalProviderId } from "./providerIdUtility.js";

export type SearchResolutionStatus =
  | "pending"
  | "resolved"
  | "ambiguous"
  | "not_found"
  | "provider_unavailable";

/**
 * The item parameter is reserved for a provider-qualified selection. Plain
 * titles remain search text and must never establish canonical ownership.
 */
export function getProviderQualifiedSelection(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const parts = normalized.split("::");
  return isExternalProviderId(normalized) && parts.length === 3 && parts.every(Boolean)
    ? normalized
    : null;
}

export function getVerifiedItemForAnswer(
  payload: unknown,
  currentItem: unknown,
): string | null {
  if (!payload || typeof payload !== "object") {
    return getProviderQualifiedSelection(currentItem);
  }

  const packet = (payload as { contextPacket?: unknown }).contextPacket;
  if (packet && typeof packet === "object") {
    const typedPacket = packet as {
      executionMode?: unknown;
      providerId?: unknown;
    };
    if (typedPacket.executionMode === "DETERMINISTIC_PROVIDER") {
      const verifiedProviderId = getProviderQualifiedSelection(typedPacket.providerId);
      if (verifiedProviderId) return verifiedProviderId;
    }
  }

  return getProviderQualifiedSelection(currentItem);
}
