export const MAX_REQUEST_BODY_BYTES = 64 * 1024;
export const MAX_QUERY_LENGTH = 240;
export const MAX_CONVERSATION_MESSAGES = 24;
export const MAX_CONVERSATION_MESSAGE_CHARS = 4_000;
export const MAX_CONVERSATION_TOTAL_CHARS = 24_000;

export type RequestParseResult =
  | { ok: true; body: any }
  | { ok: false; status: 400 | 413 | 415; error: string };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function parseJsonBody(req: any, maxBytes = MAX_REQUEST_BODY_BYTES): Promise<RequestParseResult> {
  const contentType = String(req?.headers?.["content-type"] ?? req?.headers?.get?.("content-type") ?? "");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    return { ok: false, status: 415, error: "JSON requests are required." };
  }

  const rawContentLength = req?.headers?.["content-length"] ?? req?.headers?.get?.("content-length");
  const contentLength = Number(rawContentLength);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body is too large." };
  }

  if (req && typeof req.json === "function") {
    try {
      const body = await req.json();
      const serialized = JSON.stringify(body ?? {});
      if (byteLength(serialized) > maxBytes) {
        return { ok: false, status: 413, error: "Request body is too large." };
      }
      return { ok: true, body: body ?? {} };
    } catch {
      return { ok: false, status: 400, error: "Malformed JSON request." };
    }
  }

  if (req?.body && typeof req.body === "object") {
    const serialized = JSON.stringify(req.body);
    return byteLength(serialized) > maxBytes
      ? { ok: false, status: 413, error: "Request body is too large." }
      : { ok: true, body: req.body };
  }

  if (typeof req?.body === "string") {
    if (byteLength(req.body) > maxBytes) {
      return { ok: false, status: 413, error: "Request body is too large." };
    }
    try {
      return { ok: true, body: JSON.parse(req.body) ?? {} };
    } catch {
      return { ok: false, status: 400, error: "Malformed JSON request." };
    }
  }

  return { ok: true, body: {} };
}

export function validateQueryLength(query: unknown): string | null {
  if (typeof query !== "string" || !query.trim()) return "Query is required.";
  if (query.length > MAX_QUERY_LENGTH) return "Query is too long.";
  return null;
}

export function validateConversation(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input)) return "Conversation must be an array.";
  if (input.length > MAX_CONVERSATION_MESSAGES) return "Conversation is too long.";

  let total = 0;
  for (const message of input) {
    if (!message || typeof message !== "object") return "Conversation contains an invalid message.";
    const content = (message as any).content;
    if (typeof content !== "string") return "Conversation contains an invalid message.";
    if (content.length > MAX_CONVERSATION_MESSAGE_CHARS) return "Conversation message is too long.";
    total += content.length;
  }
  return total > MAX_CONVERSATION_TOTAL_CHARS ? "Conversation is too large." : null;
}

export function publicError(message: string, code: string): { error: string; code: string } {
  return { error: message, code };
}

export function rateLimitKey(clientIp: string, namespace: string): string {
  return clientIp === "unknown" ? `unknown:${namespace}` : `${namespace}:${clientIp}`;
}

export function redactRequestLog(input: {
  requestId?: unknown;
  mediaLens?: unknown;
  hasExplicitSelection?: boolean;
  conversationCount?: number;
}): Record<string, unknown> {
  return {
    requestId: typeof input.requestId === "string" ? input.requestId.slice(0, 80) : undefined,
    mediaLens: typeof input.mediaLens === "string" ? input.mediaLens : undefined,
    hasExplicitSelection: Boolean(input.hasExplicitSelection),
    conversationCount: Number.isFinite(input.conversationCount) ? input.conversationCount : 0,
  };
}
