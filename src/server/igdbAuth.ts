import { classifyIgdbHttpFailure, isAbortLikeError, type IgdbFailureCode } from "../lib/resolver/igdbResponse.js";

let cachedIGDBToken: string | null = null;
let cachedClientId: string | null = null;
let igdbTokenExpiry = 0;
let isRefreshing = false;
let refreshPromise: Promise<IgdbTokenResult> | null = null;

export type IgdbTokenResult =
  | { token: string; failureCode?: never; httpStatus?: number }
  | { token: null; failureCode: IgdbFailureCode; httpStatus?: number };

export function invalidateIGDBToken(clientId?: string): void {
  if (!clientId || cachedClientId === clientId) {
    cachedIGDBToken = null;
    cachedClientId = null;
    igdbTokenExpiry = 0;
  }
}

export async function getIGDBTokenResult(clientId: string, clientSecret: string): Promise<IgdbTokenResult> {
  if (cachedIGDBToken && cachedClientId === clientId && Date.now() < igdbTokenExpiry) {
    return { token: cachedIGDBToken };
  }

  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const startTime = Date.now();
      const tokenRes = await fetch(
        "https://id.twitch.tv/oauth2/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "client_credentials",
          }),
          signal: AbortSignal.timeout(8_000),
        }
      );
      
      const latency = Date.now() - startTime;
      
      if (!tokenRes.ok) {
        console.error("[IGDB HEALTH] Token Refresh Failed", { 
          status: tokenRes.status, 
          latency,
          rateLimited: tokenRes.status === 429
        });
        return { token: null, failureCode: classifyIgdbHttpFailure(tokenRes.status), httpStatus: tokenRes.status };
      }
      let tokenData: unknown;
      try {
        tokenData = await tokenRes.json();
      } catch {
        return { token: null, failureCode: "MALFORMED_PROVIDER_RESPONSE", httpStatus: tokenRes.status };
      }
      const accessToken = typeof (tokenData as any)?.access_token === "string"
        ? (tokenData as any).access_token.trim()
        : "";
      const expiresInSeconds = Number((tokenData as any)?.expires_in);
      if (!accessToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        return { token: null, failureCode: "MALFORMED_PROVIDER_RESPONSE", httpStatus: tokenRes.status };
      }
      cachedIGDBToken = accessToken;
      cachedClientId = clientId;
      // Subtract 5 minutes for safety margin
      igdbTokenExpiry = Date.now() + Math.max(0, (expiresInSeconds * 1000) - (5 * 60 * 1000));
      const isDebug = (typeof process !== 'undefined' && process.env?.DEBUG_AUTOCOMPLETE === "true") ||
                      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEBUG_AUTOCOMPLETE === "true") ||
                      (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEBUG_AUTOCOMPLETE === "true");
      if (isDebug) {
        console.log("[IGDB HEALTH] Token Refreshed", { status: 200, latency });
      }
      return { token: cachedIGDBToken };
    } catch (e: any) {
      console.error("[IGDB HEALTH] Token Refresh Error", { 
        status: "error", 
        timeout: isAbortLikeError(e),
        degradedMode: true
      });
      return {
        token: null,
        failureCode: isAbortLikeError(e) ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_FAILURE",
      };
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function getIGDBToken(clientId: string, clientSecret: string): Promise<string | null> {
  return (await getIGDBTokenResult(clientId, clientSecret)).token;
}
