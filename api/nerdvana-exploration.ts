import { normalizeMediaLens, type MediaLens } from "../src/app/mediaLens.js";
import { runExploration } from "../src/lib/resolver/explorationEngine.js";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

function jsonResponse(payload: unknown, status: number, res?: any) {
  if (res && typeof res.status === "function") {
    return res.status(status).json(payload);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(req: any): Promise<any> {
  if (req && typeof req.json === "function") {
    return req.json();
  }

  if (req?.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req?.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeConversation(input: unknown): ConversationMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter(
      (item): item is { role: unknown; content: unknown } =>
        Boolean(item) && typeof item === "object",
    )
    .map((item) => {
      const role: "user" | "assistant" =
        item.role === "assistant" ? "assistant" : "user";

      const content = String(item.content ?? "").trim();
      return { role, content };
    })
    .filter((item) => item.content.length > 0);
}

function buildPrompt(
  query: string,
  lens: MediaLens,
  candidates: any[],
  conversation: ConversationMessage[],
) {
  const systemRole = `You are Nerdvana, a universal media intelligence engine.

ACTIVE_CONTEXT:
- Mode: Exploration
- Lens: ${lens}

PROVIDED CANDIDATES (Deterministic Fenced Pool):
${JSON.stringify(candidates, null, 2)}

IMPORTANT GUIDELINES:
- Provide concise answers in EXACTLY 2 paragraphs. Each paragraph 3-4 sentences max.
- Do not greet the user. Start immediately with the answer content.
- Use the ACTIVE_CONTEXT and PROVIDED CANDIDATES to ground your reasoning.
- DO NOT INVENT RECOMMENDATIONS. ONLY use the candidates provided.
- If the candidates list is empty, state that you couldn't confidently identify strong matches for this theme yet in this lens.`;

  const recentConversation = conversation.slice(-4);
  const conversationContext =
    recentConversation.length > 0
      ? `\nRECENT_CONVERSATION:\n${recentConversation
          .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
          .join("\n")}`
      : "";

  return `${systemRole}${conversationContext}\n\nUSER_QUERY:\n${query}`;
}

export default async function handler(req: any, res?: any) {
  const method = String(req?.method ?? "POST").toUpperCase();
  if (method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405, res);

  try {
    const body = await readBody(req);
    const query = String(body.query ?? "").trim();
    const mediaLens = normalizeMediaLens(body.mediaLens);
    const conversation = normalizeConversation(body.conversation);

    if (!query) {
      return jsonResponse({ error: "Query is required" }, 400, res);
    }

    const env = (globalThis as any).process?.env ?? {};
    const apiKey = (env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY)?.trim() || "";

    if (!apiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY is not set" }, 500, res);
    }

    const explorationResult = runExploration(query, mediaLens);

    if (explorationResult.confidence < 0.65) {
        return jsonResponse({
            summary: `I couldn't confidently identify strong matches for "${query}" within the ${mediaLens} lens yet.`,
            explorationResult,
            categories: [],
            spoilers: "safe"
        }, 200, res);
    }

    const prompt = buildPrompt(query, mediaLens, explorationResult.recommendations, conversation);

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 600,
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    return jsonResponse(
      {
        summary: text.trim(),
        explorationResult,
        categories: [],
        spoilers: "safe",
      },
      200,
      res,
    );
  } catch (error: any) {
    console.error("[Nerdvana Exploration Error]", error);
    return jsonResponse({ error: String(error) }, 500, res);
  }
}
