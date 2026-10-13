import assert from "node:assert/strict";
import {
  MAX_CONVERSATION_MESSAGES,
  MAX_REQUEST_BODY_BYTES,
  parseJsonBody,
  publicError,
  rateLimitKey,
  redactRequestLog,
  validateConversation,
  validateQueryLength,
} from "../src/server/api/requestSecurity.js";
import { getRateLimitKey } from "../src/server/api/rateLimiter.js";

assert.equal(validateQueryLength("Inception"), null);
assert.equal(validateQueryLength("x".repeat(241)), "Query is too long.");
assert.equal(validateConversation([{ role: "user", content: "Hello" }]), null);
assert.equal(validateConversation(Array.from({ length: MAX_CONVERSATION_MESSAGES + 1 }, () => ({ content: "x" }))), "Conversation is too long.");
assert.equal(validateConversation([{ content: "x".repeat(4001) }]), "Conversation message is too long.");

const malformed = await parseJsonBody({ body: "{bad" });
assert.equal(malformed.ok, false);
if (!malformed.ok) assert.equal(malformed.status, 400);

const oversized = await parseJsonBody({ body: "x".repeat(MAX_REQUEST_BODY_BYTES + 1) });
assert.equal(oversized.ok, false);
if (!oversized.ok) assert.equal(oversized.status, 413);

const oversizedByHeader = await parseJsonBody({ headers: { "content-length": String(MAX_REQUEST_BODY_BYTES + 1) }, body: "{}" });
assert.equal(oversizedByHeader.ok, false);
if (!oversizedByHeader.ok) assert.equal(oversizedByHeader.status, 413);

const unsupported = await parseJsonBody({ headers: { "content-type": "text/plain" }, body: "{}" });
assert.equal(unsupported.ok, false);
if (!unsupported.ok) assert.equal(unsupported.status, 415);

assert.equal(rateLimitKey("unknown", "answer"), "unknown:answer");
assert.notEqual(rateLimitKey("unknown", "answer"), "unknown");
assert.equal(getRateLimitKey({ headers: {} }, "timeline"), "unknown:timeline");

const log = redactRequestLog({ requestId: "r1", mediaLens: "movies", conversationCount: 2 });
assert.equal(JSON.stringify(log).includes("private question"), false);
assert.deepEqual(publicError("Request failed.", "REQUEST_FAILED"), {
  error: "Request failed.",
  code: "REQUEST_FAILED",
});

console.log("Security checks passed.");
