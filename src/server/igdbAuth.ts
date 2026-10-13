let cachedIGDBToken: string | null = null;
let igdbTokenExpiry = 0;
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export async function getIGDBToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedIGDBToken && Date.now() < igdbTokenExpiry) {
    return cachedIGDBToken;
  }

  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const startTime = Date.now();
      const tokenRes = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
        { method: "POST" }
      );
      
      const latency = Date.now() - startTime;
      
      if (!tokenRes.ok) {
        console.error("[IGDB HEALTH] Token Refresh Failed", { 
          status: tokenRes.status, 
          latency,
          rateLimited: tokenRes.status === 429
        });
        return null;
      }
      const tokenData = await tokenRes.json();
      cachedIGDBToken = tokenData.access_token;
      // Subtract 5 minutes for safety margin
      igdbTokenExpiry = Date.now() + (tokenData.expires_in * 1000) - (5 * 60 * 1000);
      const isDebug = (typeof process !== 'undefined' && process.env?.DEBUG_AUTOCOMPLETE === "true") ||
                      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEBUG_AUTOCOMPLETE === "true") ||
                      (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEBUG_AUTOCOMPLETE === "true");
      if (isDebug) {
        console.log("[IGDB HEALTH] Token Refreshed", { status: 200, latency });
      }
      return cachedIGDBToken;
    } catch (e: any) {
      console.error("[IGDB HEALTH] Token Refresh Error", { 
        status: "error", 
        timeout: e.name === 'AbortError',
        degradedMode: true
      });
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
