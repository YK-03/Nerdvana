import assert from "node:assert/strict";
import { generateGroqText } from "../api/lib/groqProvider.js";
import { buildCacheKey, ANSWER_PROVIDER_VERSION } from "../api/lib/answerCache.js";
import { buildTimelineCacheKey, TIMELINE_PROVIDER_VERSION } from "../api/lib/timelineCache.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GROQ_API_KEY;
const originalAnswerFallback = process.env.GROQ_ANSWER_FALLBACK_MODEL;
const originalTimelineFallback = process.env.GROQ_TIMELINE_FALLBACK_MODEL;

function groqResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

async function run() {
  process.env.GROQ_API_KEY = "test-groq-key";
  delete process.env.GROQ_ANSWER_FALLBACK_MODEL;
  delete process.env.GROQ_TIMELINE_FALLBACK_MODEL;

  let active = 0;
  let maxActive = 0;
  const calls: string[] = [];
  let behavior: (model: string, signal: AbortSignal) => Promise<Response> = async () => groqResponse("ok");
  globalThis.fetch = async (input, init) => {
    const model = JSON.parse(String(init?.body)).model as string;
    calls.push(model);
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      return await behavior(model, init?.signal as AbortSignal);
    } finally {
      active -= 1;
    }
  };

  const success = await generateGroqText({ prompt: "answer", workload: "answer" });
  assert.equal(success.status, "success");
  assert.equal(success.model, "openai/gpt-oss-120b");
  assert.deepEqual(calls, ["openai/gpt-oss-120b"]);

  process.env.GROQ_ANSWER_FALLBACK_MODEL = "groq-test-secondary";
  calls.length = 0;
  behavior = async (model) => model === "openai/gpt-oss-120b" ? new Response("rate limited", { status: 429 }) : groqResponse("fallback");
  const fallback = await generateGroqText({ prompt: "answer", workload: "answer" });
  assert.equal(fallback.status, "success");
  assert.equal(fallback.model, "groq-test-secondary");
  assert.equal(fallback.fallbackUsed, true);
  assert.deepEqual(calls, ["openai/gpt-oss-120b", "groq-test-secondary"]);
  assert.equal(maxActive, 1, "fallback attempts must be sequential");

  calls.length = 0;
  behavior = async (model) => {
    if (model === "openai/gpt-oss-120b") {
      throw new DOMException("timeout", "AbortError");
    }
    return groqResponse("after-timeout");
  };
  const timeoutFallback = await generateGroqText({ prompt: "answer", workload: "answer" });
  assert.equal(timeoutFallback.status, "success");
  assert.deepEqual(calls, ["openai/gpt-oss-120b", "groq-test-secondary"]);

  calls.length = 0;
  process.env.GROQ_TIMELINE_FALLBACK_MODEL = "groq-test-secondary";
  behavior = async (model) => model === "openai/gpt-oss-120b" ? groqResponse("not-json") : groqResponse('{"events":[]}');
  const timelineFallback = await generateGroqText({
    prompt: "timeline",
    workload: "timeline",
    accept: (text) => {
      try { return Array.isArray(JSON.parse(text).events); } catch { return false; }
    },
  });
  assert.equal(timelineFallback.status, "success");
  assert.deepEqual(calls, ["openai/gpt-oss-120b", "groq-test-secondary"]);

  behavior = async () => groqResponse("");
  const bothFail = await generateGroqText({ prompt: "answer", workload: "answer" });
  assert.equal(bothFail.status, "provider_failure");

  const answerKey = await buildCacheKey("tmdb::movie::155", "movies", "strict");
  assert.match(answerKey.compositeKey, new RegExp(`^${ANSWER_PROVIDER_VERSION}\\|`));
  const timelineKey = await buildTimelineCacheKey("tmdb::movie::155", "movie");
  assert.match(timelineKey.compositeKey, new RegExp(`\\|${TIMELINE_PROVIDER_VERSION}\\|`));

  console.log("Groq provider checks passed", { sequentialMaxConcurrency: maxActive, attemptsTested: 5 });
}

run()
  .finally(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
    if (originalAnswerFallback === undefined) delete process.env.GROQ_ANSWER_FALLBACK_MODEL;
    else process.env.GROQ_ANSWER_FALLBACK_MODEL = originalAnswerFallback;
    if (originalTimelineFallback === undefined) delete process.env.GROQ_TIMELINE_FALLBACK_MODEL;
    else process.env.GROQ_TIMELINE_FALLBACK_MODEL = originalTimelineFallback;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
