import { parseProviderId } from "../lib/resolver/providerIdUtility.js";
import {
  classifyIgdbHttpFailure,
  isAbortLikeError,
  isRetryableIgdbFailure,
  sanitizeIgdbProviderMessage,
  selectVerifiedIgdbGame,
  type IgdbFailureCode,
} from "../lib/resolver/igdbResponse.js";
import { getIGDBTokenResult, invalidateIGDBToken } from "./igdbAuth.js";

const IGDB_GAME_ENDPOINT = "https://api.igdb.com/v4/games";
const MAX_GAME_REQUEST_ATTEMPTS = 2;

export type VerifiedIgdbGameResult =
  | { game: Record<string, any>; failureCode?: never; httpStatus?: number; attempts: number; providerMessage?: never }
  | { game: null; failureCode: IgdbFailureCode; httpStatus?: number; attempts: number; providerMessage?: string };

export type IgdbGameQueryVariant = "full" | "identity" | "summary" | "characters" | "characterDescriptions" | "characterImages";

export function buildIgdbGameQuery(gameId: number, variant: IgdbGameQueryVariant = "full"): string {
  const fields = variant === "identity"
    ? "id, name"
    : variant === "summary"
    ? "id, name, summary"
    : variant === "characters"
    ? "id, name, characters.name"
    : variant === "characterDescriptions"
    ? "id, name, characters.name, characters.description"
    : variant === "characterImages"
    ? "id, name, characters.name, characters.mug_shot.url"
    : "id, name, summary";
  return `fields ${fields}; where id = ${gameId}; limit 1;`;
}

function failure(
  failureCode: IgdbFailureCode,
  attempts: number,
  httpStatus?: number,
  providerMessage?: string,
): VerifiedIgdbGameResult {
  return { game: null, failureCode, httpStatus, attempts, providerMessage };
}

export async function fetchVerifiedIgdbGame(input: {
  providerId: string;
  expectedTitle: string;
  clientId: string;
  clientSecret: string;
  queryVariant?: IgdbGameQueryVariant;
  correlationId?: string;
}): Promise<VerifiedIgdbGameResult> {
  const parsedId = parseProviderId(input.providerId);
  if (parsedId.provider !== "igdb" || parsedId.resourceType !== "game" || !/^\d+$/.test(parsedId.id)) {
    return failure("INVALID_PROVIDER_ID", 0);
  }

  const gameId = Number(parsedId.id);
  if (!Number.isSafeInteger(gameId) || gameId <= 0 || !input.expectedTitle.trim()) {
    return failure("INVALID_PROVIDER_ID", 0);
  }

  let tokenResult = await getIGDBTokenResult(input.clientId, input.clientSecret);
  if (!tokenResult.token) return failure(tokenResult.failureCode, 0, tokenResult.httpStatus);

  for (let attempt = 1; attempt <= MAX_GAME_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(IGDB_GAME_ENDPOINT, {
        method: "POST",
        headers: {
          "Client-ID": input.clientId,
          Authorization: `Bearer ${tokenResult.token}`,
          "Content-Type": "text/plain",
        },
        signal: AbortSignal.timeout(10_000),
        body: buildIgdbGameQuery(gameId, input.queryVariant),
      });

      if (!response.ok) {
        const providerMessage = await response.text()
          .then(sanitizeIgdbProviderMessage)
          .catch(() => undefined);
        const failureCode = classifyIgdbHttpFailure(response.status);
        console.warn("[IGDB_PROVIDER_HTTP_FAILURE]", {
          provider: "igdb",
          endpoint: "games",
          status: response.status,
          category: failureCode,
          attempt,
          correlationId: input.correlationId ?? null,
          message: providerMessage ?? null,
        });
        if ((failureCode === "PROVIDER_AUTHENTICATION_FAILED") && attempt < MAX_GAME_REQUEST_ATTEMPTS) {
          invalidateIGDBToken(input.clientId);
          tokenResult = await getIGDBTokenResult(input.clientId, input.clientSecret);
          if (!tokenResult.token) return failure(tokenResult.failureCode, attempt, tokenResult.httpStatus);
          continue;
        }
        if (isRetryableIgdbFailure(failureCode, response.status) && attempt < MAX_GAME_REQUEST_ATTEMPTS) continue;
        return failure(failureCode, attempt, response.status, providerMessage);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return failure("MALFORMED_PROVIDER_RESPONSE", attempt, response.status);
      }
      if (!Array.isArray(payload)) return failure("MALFORMED_PROVIDER_RESPONSE", attempt, response.status);
      if (payload.length === 0) return failure("NO_MATCHING_GAME", attempt, response.status);

      const game = selectVerifiedIgdbGame(payload, gameId, input.expectedTitle);
      return game
        ? { game, attempts: attempt, httpStatus: response.status }
        : failure("IDENTITY_MISMATCH", attempt, response.status);
    } catch (error) {
      const failureCode = isAbortLikeError(error) ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_FAILURE";
      if (attempt < MAX_GAME_REQUEST_ATTEMPTS) continue;
      return failure(failureCode, attempt);
    }
  }

  return failure("PROVIDER_NETWORK_FAILURE", MAX_GAME_REQUEST_ATTEMPTS);
}
