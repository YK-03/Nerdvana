/**
 * answerCache.ts
 *
 * Firestore-backed answer cache for initial entity responses.
 *
 * Design goals:
 *  - Exactly 1 Firestore READ per cacheable request (cache check)
 *  - At most 1 Firestore WRITE per cache miss (on successful answer)
 *  - TTL enforced at read time (no scheduled cleanup needed)
 *  - Cache key is a SHA-256 hash of the normalized composite key
 *    so the Firestore document ID is always safe, bounded, and unique
 *  - Fire-and-forget writes: cache failures never affect user responses
 *
 * Cache key dimensions:
 *  - Provider identity: packet.providerId ?? packet.canonicalEntity (normalized)
 *  - Media lens: packet.mediaLens
 *  - Spoiler policy: packet.spoilerPolicy ("safe" | "strict")
 *
 * What is NOT cached:
 *  - Follow-up / conversational answers (conversation.length > 0)
 *  - Ambiguous unresolved queries (no reliable entity identity)
 *  - SEMANTIC execution mode without a resolved entity
 *  - Failed / empty answers
 */

import { getAdminDb } from "./firebaseAdmin.js";

const COLLECTION = "answer_cache";
const TTL_MS = 36 * 60 * 60 * 1000; // 36 hours

type CacheDocument = {
  answer: string;
  cachedAt: number;
  cacheKey: string;          // human-readable composite key (for debugging)
  mediaLens: string;
  spoilerPolicy: string;
};

/**
 * Deterministically hashes a string to a hex digest using the Web Crypto API
 * (available in Node 16+ and Vercel's edge/serverless runtimes).
 * Used to produce a safe, fixed-length Firestore document ID.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Normalizes and combines the cache key dimensions into a canonical string,
 * then returns both the human-readable composite and its SHA-256 document ID.
 */
export async function buildCacheKey(
  entityIdentity: string,
  mediaLens: string,
  spoilerPolicy: string
): Promise<{ compositeKey: string; documentId: string }> {
  // Normalize each dimension to prevent trivial collisions
  const normalizedEntity = entityIdentity.toLowerCase().trim();
  const normalizedLens = mediaLens.toLowerCase().trim();
  const normalizedSpoiler = spoilerPolicy.toLowerCase().trim();

  const compositeKey = `${normalizedEntity}|${normalizedLens}|${normalizedSpoiler}`;
  const documentId = await sha256Hex(compositeKey);
  return { compositeKey, documentId };
}

/**
 * Looks up a cached answer. Returns the answer string on a valid, non-stale
 * cache hit, or null on a miss or stale entry.
 *
 * Costs exactly 1 Firestore read.
 */
export async function getCachedAnswer(documentId: string): Promise<string | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(documentId);
    const snap = await docRef.get();

    if (!snap.exists) return null;

    const data = snap.data() as CacheDocument;
    if (!data?.answer || !data?.cachedAt) return null;

    // TTL check — treat stale as a miss
    if (Date.now() - data.cachedAt > TTL_MS) {
      console.log("[CACHE_MISS] Stale entry, TTL exceeded:", data.cacheKey);
      return null;
    }

    return data.answer;
  } catch (err) {
    // Cache read failure must never break the main request
    console.error("[CACHE_READ_ERROR]", err);
    return null;
  }
}

/**
 * Writes a successful answer to the cache.
 *
 * This is designed to be called fire-and-forget:
 *   setCachedAnswer(...).catch(err => console.error("[CACHE_WRITE_ERROR]", err));
 *
 * Costs 1 Firestore write.
 */
export async function setCachedAnswer(
  documentId: string,
  compositeKey: string,
  answer: string,
  mediaLens: string,
  spoilerPolicy: string
): Promise<void> {
  const db = getAdminDb();
  const docRef = db.collection(COLLECTION).doc(documentId);
  const payload: CacheDocument = {
    answer,
    cachedAt: Date.now(),
    cacheKey: compositeKey,
    mediaLens,
    spoilerPolicy,
  };
  await docRef.set(payload);
  console.log("[CACHE_WRITE] Cached answer:", compositeKey);
}

/**
 * Determines whether a request is eligible for caching.
 *
 * A request is cacheable when ALL of the following are true:
 *  - No prior conversation messages (this is an initial answer, not a follow-up)
 *  - A reliable entity identity is available (providerId or canonicalEntity)
 *  - Execution mode is DETERMINISTIC_PROVIDER or SEMANTIC with a non-empty entity
 *  - The strategy is not DEFERRED_GROUND (which produces intentionally vague answers)
 *
 * Returns the entity identity string to use as the cache key base, or null if
 * the request is not cacheable.
 */
export function getCacheIdentity(opts: {
  conversationLength: number;
  providerId: string | null | undefined;
  canonicalEntity: string | null | undefined;
  executionMode: string;
  strategy: string | null | undefined;
  confidence?: number | null;
}): string | null {
  const { conversationLength, providerId, canonicalEntity, executionMode, strategy, confidence } = opts;

  // Follow-up questions depend on conversation context — never cache them
  if (conversationLength > 0) return null;

  // Deferred and soft-grounded answers are not stable enough to reuse.
  if (strategy === "DEFERRED_GROUND" || strategy === "SOFT_GROUND") return null;
  if (confidence != null && confidence < 0.75) return null;

  // Prefer the stable provider ID (e.g. "tmdb::movie::496243") — it's the most
  // reliable identity anchor. Fall back to the resolved canonical entity name.
  const identity = providerId?.trim() || canonicalEntity?.trim() || null;
  if (!identity) return null;

  // Pure semantic fallbacks with no resolved entity should not be cached
  // (they may produce different answers depending on the raw query wording)
  if (executionMode === "SEMANTIC" && !providerId) {
    // Only allow caching for SEMANTIC if we have a strong canonicalEntity
    // (i.e. the query resolved to something specific, not a vague concept)
    if (!canonicalEntity || canonicalEntity.length < 3) return null;
  }

  return identity;
}
