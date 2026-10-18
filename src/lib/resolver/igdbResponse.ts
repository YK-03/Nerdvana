import { fallbackIdentityMatches, normalizeEntityTitle } from "./entityIdentity.js";
import { normalizeNumerals } from "./dynamicEntityIngestion.js";

export type IgdbFailureCode =
  | "MISSING_PROVIDER_CREDENTIALS"
  | "PROVIDER_AUTHENTICATION_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_NETWORK_FAILURE"
  | "PROVIDER_HTTP_FAILURE"
  | "MALFORMED_PROVIDER_RESPONSE"
  | "NO_MATCHING_GAME"
  | "IDENTITY_MISMATCH"
  | "INVALID_PROVIDER_ID";

export const MAX_IGDB_DIAGNOSTIC_MESSAGE_LENGTH = 240;

function redactSensitiveDiagnosticText(value: string): string {
  return value
    .replace(/bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/(client[_-]?secret|access[_-]?token|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

/** Extracts only a short provider diagnostic; never returns an unbounded body. */
export function sanitizeIgdbProviderMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;

  let candidate = "";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const fields = ["message", "error_description", "error", "detail", "status"];
    for (const field of fields) {
      const value = parsed?.[field];
      if (typeof value === "string" || typeof value === "number") {
        candidate = String(value);
        break;
      }
    }
  } catch {
    candidate = trimmed;
  }

  if (!candidate) return undefined;
  const sanitized = redactSensitiveDiagnosticText(candidate)
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_IGDB_DIAGNOSTIC_MESSAGE_LENGTH);
  return sanitized || undefined;
}

export function classifyIgdbHttpFailure(status: number): IgdbFailureCode {
  if (status === 401 || status === 403) return "PROVIDER_AUTHENTICATION_FAILED";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status === 408 || status === 504) return "PROVIDER_TIMEOUT";
  return "PROVIDER_HTTP_FAILURE";
}

export function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function isRetryableIgdbFailure(code: IgdbFailureCode, status?: number): boolean {
  return code === "PROVIDER_TIMEOUT" ||
    code === "PROVIDER_NETWORK_FAILURE" ||
    (code === "PROVIDER_HTTP_FAILURE" && typeof status === "number" && status >= 500);
}

/**
 * Provider titles may add a subtitle to a catalog title (for example,
 * "The Witcher 3" -> "The Witcher 3: Wild Hunt"). The provider ID is still
 * required to match exactly; this only prevents a legitimate subtitle from
 * being rejected as a different title.
 */
export function verifiedGameTitleMatches(expectedTitle: string, candidateTitle: string): boolean {
  if (fallbackIdentityMatches(expectedTitle, candidateTitle, "games")) return true;

  const expectedNorm = normalizeNumerals(normalizeEntityTitle(expectedTitle));
  const candidateNorm = normalizeNumerals(normalizeEntityTitle(candidateTitle));
  if (expectedNorm && candidateNorm && expectedNorm === candidateNorm) return true;

  const separatorMatch = candidateTitle.match(/[:\-–—]\s*\S/);
  if (separatorMatch && separatorMatch.index != null) {
    const basePart = candidateTitle.slice(0, separatorMatch.index).trim();
    const basePartNorm = normalizeNumerals(normalizeEntityTitle(basePart));
    if (basePartNorm && expectedNorm && basePartNorm === expectedNorm) {
      return true;
    }
  }

  const expected = expectedTitle.trim().replace(/\s+/g, " ");
  const candidate = candidateTitle.trim().replace(/\s+/g, " ");
  if (!expected || !candidate || candidate.length <= expected.length) return false;

  const prefixMatches = candidate.slice(0, expected.length).toLocaleLowerCase() === expected.toLocaleLowerCase();
  const suffix = candidate.slice(expected.length).trim();
  if (prefixMatches && /^[:\-–—]\s*\S/.test(suffix)) return true;

  return false;
}

/**
 * Selects only the IGDB record that proves both requested identity dimensions:
 * the provider ID and the canonical game title. Presentation fields are
 * intentionally optional so sparse but valid records remain usable.
 */
export function selectVerifiedIgdbGame(
  payload: unknown,
  expectedId: string | number,
  expectedTitle: string,
): Record<string, any> | null {
  if (!Array.isArray(payload)) return null;

  const expectedIdText = String(expectedId).trim();
  if (!expectedIdText || !expectedTitle.trim()) return null;

  for (const candidate of payload) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, any>;
    if (String(record.id ?? "").trim() !== expectedIdText) continue;
    if (typeof record.name !== "string" || !record.name.trim()) continue;
    if (!verifiedGameTitleMatches(expectedTitle, record.name)) continue;
    return record;
  }

  return null;
}
