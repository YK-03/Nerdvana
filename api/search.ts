import { checkRateLimit, getRateLimitKey } from "../src/server/api/rateLimiter.js";
import { MAX_QUERY_LENGTH } from "../src/server/api/requestSecurity.js";

export default async function handler(req: any, res?: any) {
  if (String(req?.method ?? "GET").toUpperCase() !== "GET") {
    if (res) return res.status(405).json({ error: "Method Not Allowed" });
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }
  const rateLimit = checkRateLimit(getRateLimitKey(req, "search"), 30, 60_000);
  if (!rateLimit.allowed) {
    if (res) return res.status(429).json({ error: "Too many search requests.", code: "RATE_LIMITED" });
    return new Response(JSON.stringify({ error: "Too many search requests.", code: "RATE_LIMITED" }), { status: 429 });
  }
  try {
    let q = ""

    if (req.url) {
      const url = new URL(req.url, "http://localhost")
      q = url.searchParams.get("q") || ""
    } else if (req.query) {
      q = req.query.q || ""
    }

    if (q.length > MAX_QUERY_LENGTH) {
      if (res) return res.status(400).json({ error: "Query is too long.", code: "INVALID_QUERY" });
      return new Response(JSON.stringify({ error: "Query is too long.", code: "INVALID_QUERY" }), { status: 400 });
    }

    if (!q) {
      const empty = JSON.stringify([])
      if (res) return res.status(200).send(empty)
      return new Response(empty, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q,
        gl: "in",
        hl: "en",
      }),
    })

    const data = await r.json()

    const rows = Array.isArray(data?.organic) ? data.organic : []

    const results = rows.map((r: any) => ({
      title: r.title || "",
      url: r.link || "",
      snippet: r.snippet || "",
      source: (() => {
        try {
          return new URL(r.link).hostname
        } catch {
          return ""
        }
      })(),
    }))

    if (res) {
      return res.status(200).json(results)
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("[Nerdvana] SERPER ERROR", { category: "provider_failure" })

    if (res) return res.status(502).json({ error: "Search provider unavailable.", code: "SEARCH_PROVIDER_FAILED" })
    return new Response(JSON.stringify({ error: "Search provider unavailable.", code: "SEARCH_PROVIDER_FAILED" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }
}
