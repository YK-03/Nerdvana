export default async function handler(req: any, res?: any) {
  try {
    let q = ""

    if (req.url) {
      const url = new URL(req.url, "http://localhost")
      q = url.searchParams.get("q") || ""
    } else if (req.query) {
      q = req.query.q || ""
    }

    console.log("[Nerdvana] SERPER QUERY:", q)

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
    console.error("[Nerdvana] SERPER ERROR:", e)

    if (res) return res.status(200).json([])
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
}
