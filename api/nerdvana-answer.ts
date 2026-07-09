import { normalizeMediaLens, DEFAULT_MEDIA_LENS, type MediaLens } from "../src/app/mediaLens.js";
import { normalizeQuery, buildContextPacket, type ResolverContextPacket } from "../src/app/canonicalResolver.js";
import { groundCanonicalIntent } from "../src/lib/resolver/canonicalGrounding.js";
import { fetchDynamicEntity, type TemporaryCanonicalEntity } from "../src/lib/resolver/dynamicEntityIngestion.js";
import {
  classifyComicsQueryType,
  isCompatibleComicVineType,
  normalizeComicVineResourceType,
} from "../src/lib/resolver/providerMetadata.js";
import { buildContinuityFollowups } from "../src/lib/resolver/continuityGraph.js";
import { buildReadingOrder, buildContinuationSuggestions } from "../src/lib/resolver/readingOrder.js";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type SourceLink = {
  title: string;
  link: string;
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
  packet: ResolverContextPacket,
  conversation: ConversationMessage[],
) {
  let activeTopic = query;

  if (conversation.length > 0) {
    const lastUserMsg = [...conversation]
      .reverse()
      .find((msg) => msg.role === "user");

    if (lastUserMsg) activeTopic = lastUserMsg.content;
  }

  const activeContext = packet.queryMode === "exploration"
    ? `- Mode: Exploration\n- Lens: ${packet.mediaLens}`
    : `- Entity: ${packet.canonicalEntity ?? "Unknown"}\n- Franchise: ${packet.parentFranchise ?? "Unknown"}\n- Lens: ${packet.mediaLens}\n- Spoilers: ${packet.spoilerPolicy}\n- Mode: ${packet.conversationMode}\n- Confidence: ${packet.confidence}`;

  const systemRole = `You are Nerdvana, a universal media intelligence engine.

ACTIVE_CONTEXT:
${activeContext}

IMPORTANT GUIDELINES:
- Provide concise answers in EXACTLY 2 paragraphs. Each paragraph 3-4 sentences max.
- Do not greet the user. Start immediately with the answer content.
- Use the ACTIVE_CONTEXT to ground your reasoning.
- If Mode is "deep-theory", focus on implications and thematic analysis.
- If Mode is "simple-comparison", compare the entities objectively.
- If Spoilers is "strict", naturally avoid revealing major plot twists or endings. Do not mention spoiler policies, internal settings, or give warnings.`;

  // We limit the conversation context to recent messages to prevent token explosion.
  const recentConversation = conversation.slice(-4);
  const conversationContext =
    recentConversation.length > 0
      ? "\n\nRECENT CONVERSATION STATE:\n" +
        recentConversation
          .map(
            (msg) =>
              `${msg.role === "user" ? "User" : "Nerdvana"}: ${msg.content}`,
          )
          .join("\n")
      : "";

  return `${systemRole}${conversationContext}\n\nUSER QUERY:\n${query}\n\nANSWER:`;
}

async function tryGemini(
  prompt: string,
  apiKey: string,
  models: string[]
): Promise<string | null> {

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      console.log("[Nerdvana] Trying Gemini model:", model);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
          }),
          signal: controller.signal,
        },
      );

      const rawText = await response.text();
      console.log(`[Nerdvana] ${model} status:`, response.status);

      if (!response.ok) {
        console.warn(`[Nerdvana] ${model} failed → trying next`);
        continue;
      }

      const data = JSON.parse(rawText);
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p?.text || "")
          .join("") || "";

      if (!text) continue;

      console.log("[Nerdvana] Success using Gemini:", model);
      return text;
    } catch (err) {
      console.warn(`[Nerdvana] ${model} crashed → trying next`, err);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function tryGroq(prompt: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    console.log("[Nerdvana] Falling back to Groq");

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500,
          temperature: 0.7,
        }),
        signal: controller.signal,
      },
    );

    const rawText = await response.text();
    console.log("[Nerdvana] Groq status:", response.status);

    if (!response.ok) {
      console.warn("[Nerdvana] Groq failed:", rawText);
      return null;
    }

    const data = JSON.parse(rawText);
    const text = data?.choices?.[0]?.message?.content ?? "";

    if (!text) return null;

    console.log("[Nerdvana] Success using Groq");
    return text;
  } catch (err) {
    console.warn("[Nerdvana] Groq crashed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAnswer(
  prompt: string,
  geminiKey: string,
  groqKey: string | undefined,
  mode: "canon-lookup" | "simple-comparison" | "spoiler-analysis" | "deep-theory" | "cross-universe-analysis" | "philosophical-analysis",
): Promise<string> {
  // Model routing based on mode
  const useProFirst = mode === "deep-theory" || mode === "cross-universe-analysis" || mode === "philosophical-analysis";
  
  const models = useProFirst
    ? ["gemini-2.5-flash", "gemini-1.5-pro", "gemini-pro-latest"]
    : ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-flash-latest"];
  
  // Try Gemini first
  const geminiResult = await tryGemini(prompt, geminiKey, models);
  if (geminiResult) return geminiResult;

  // Fall back to Groq if key is available
  if (groqKey) {
    const groqResult = await tryGroq(prompt, groqKey);
    if (groqResult) return groqResult;
  }

  // Final fallback to the remaining Gemini models if not used yet
  if (!useProFirst) {
    const fallbackResult = await tryGemini(prompt, geminiKey, ["gemini-pro-latest"]);
    if (fallbackResult) return fallbackResult;
  }

  throw new Error(
    "All models failed — Gemini quota exhausted and Groq unavailable",
  );
}

async function fetchSerperSources(
  query: string,
  apiKey: string,
): Promise<SourceLink[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "us",
      hl: "en",
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper failed: ${response.status}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.organic) ? data.organic : [];

  return rows
    .map((row: any) => ({
      title: String(row?.title ?? "").trim(),
      link: String(row?.link ?? "").trim(),
    }))
    .filter((row: SourceLink) => Boolean(row.title && row.link))
    .slice(0, 8);
}

async function fetchWhoogleSources(
  query: string,
  baseUrl: string,
): Promise<SourceLink[]> {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Whoogle failed: ${response.status}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.results) ? data.results : [];

  return rows
    .map((row: any) => ({
      title: String(row?.title ?? "").trim(),
      link: String(row?.url ?? row?.href ?? "").trim(),
    }))
    .filter((row: SourceLink) => Boolean(row.title && row.link))
    .slice(0, 8);
}

function buildFollowups(query: string): string[] {
  return [
    `Can you explain the key events behind "${query}"?`,
    "What are the strongest fan theories related to this?",
    "Which sources are most reliable for canon details?",
  ];
}

export default async function handler(req: any, res?: any) {
  const method = String(req?.method ?? "POST").toUpperCase();

  if (method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405, res);
  }

  try {
    const body = await readBody(req);

    console.log("[REQUEST_PAYLOAD_RECEIVED]", {
      item: body?.item,
      providerMetadata: body?.providerMetadata,
      body
    });

    const rawQuery = String(body?.query ?? "").trim();
    // Canonical normalization before all processing
    const canonicalQuery = normalizeQuery(rawQuery);
    const query = canonicalQuery.canonical ?? rawQuery;
    const conversation = normalizeConversation(body?.conversation);
    const spoilerMode =
      typeof body?.spoilerMode === "boolean"
        ? body.spoilerMode
        : Boolean(body?.allowSpoilers);
    const previousEntity =
      String(body?.previousEntity ?? "").trim() || undefined;
    const mediaLens = normalizeMediaLens(body?.mediaLens ?? DEFAULT_MEDIA_LENS);
    const explicitSelection =
      String(body?.item ?? body?.canonicalSelection ?? "").trim() || undefined;
    const providerMetadata = body?.providerMetadata || undefined;
    if (providerMetadata?.providerType) {
      console.log("[TYPED_PROVIDER_PROPAGATED]", {
        stage: "request_payload",
        query: rawQuery,
        mediaLens,
        providerType: providerMetadata.providerType,
        providerResourceType: providerMetadata.providerResourceType ?? null,
        providerId: body?.item ?? null,
      });
    }

    if (!query) {
      return jsonResponse({ error: "Query is required" }, 400, res);
    }

    const temporaryEntities: TemporaryCanonicalEntity[] = Array.isArray(body?.temporaryEntities) ? body.temporaryEntities : [];
    const classifiedComicType = mediaLens === "comics" ? classifyComicsQueryType(rawQuery) : null;
    if (classifiedComicType) {
      console.log("[TYPED_ENTITY_CLASSIFIED]", {
        query: rawQuery,
        mediaLens,
        providerType: classifiedComicType,
      });
    }

    // Pass 1: Strict grounding only. Semantic recovery is terminal fallback.
    let grounding = groundCanonicalIntent({
      query: rawQuery,
      mediaLens,
      explicitSelection,
      temporaryEntities,
      providerMetadata,
      allowLooseSemantic: false // STRICT CANONICAL MATCHING ONLY
    });

    const env =
      (
        globalThis as {
          process?: { env?: Record<string, string | undefined> };
        }
      ).process?.env ?? {};

    let newTempEntity: TemporaryCanonicalEntity | null = null;
    let rejectedExternalEntities = 0;
    let apiExactMatch = false;

    // If strict local grounding misses, immediately invoke provider ingestion.
    if (!grounding.selectedCanonicalEntity) {
      if (mediaLens === "comics") {
        console.warn("[TYPED_AMBIGUITY_DETECTED]", {
          query: rawQuery,
          mediaLens,
          classifiedType: classifiedComicType,
          stage: "before_provider_ingestion",
        });
      }
      console.log("[PROVIDER_INGESTION_TRIGGERED]", {
        query: rawQuery,
        mediaLens
      });

      const keys = {
        tmdb: (env.TMDB_API_KEY || env.VITE_TMDB_API_KEY)?.trim() || undefined,
        igdbId: (env.IGDB_CLIENT_ID || env.VITE_IGDB_CLIENT_ID)?.trim() || undefined,
        igdbSecret: (env.IGDB_CLIENT_SECRET || env.VITE_IGDB_CLIENT_SECRET)?.trim() || undefined,
        comicVine: (env.COMICVINE_API_KEY || env.VITE_COMICVINE_API_KEY)?.trim() || undefined,
      };

      const ingestion = await fetchDynamicEntity(rawQuery, mediaLens, keys);
      if (ingestion.entity) {
        newTempEntity = ingestion.entity;
        rejectedExternalEntities = ingestion.rejectedCount;
        apiExactMatch = true;
        console.log("[PROVIDER_ENTITY_INGESTED]", {
          query: rawQuery,
          mediaLens,
          provider: newTempEntity.source,
          id: newTempEntity.id,
          title: newTempEntity.title
        });

        temporaryEntities.push(newTempEntity);

        console.log("[REGROUND_AFTER_INGESTION]", {
          query: rawQuery,
          mediaLens,
          ingestedId: newTempEntity.id
        });

        // Reground with newly ingested temporary entities (still strict)
        grounding = groundCanonicalIntent({
          query: rawQuery,
          mediaLens,
          explicitSelection,
          temporaryEntities,
          providerMetadata,
          allowLooseSemantic: false
        });
      } else {
        rejectedExternalEntities = ingestion.rejectedCount;
      }
    }

    // Pass 3: terminal semantic fallback only after strict grounding and provider ingestion both fail.
    if (!grounding.selectedCanonicalEntity) {
      if (mediaLens === "comics") {
        console.warn("[TYPED_AMBIGUITY_DETECTED]", {
          query: rawQuery,
          mediaLens,
          classifiedType: classifiedComicType,
          stage: "before_semantic_fallback",
        });
      }
      console.log("[SEMANTIC_FALLBACK_TRIGGERED]", {
        query: rawQuery,
        mediaLens
      });
      grounding = groundCanonicalIntent({
        query: rawQuery,
        mediaLens,
        explicitSelection,
        temporaryEntities,
        providerMetadata,
        allowLooseSemantic: true // ALLOW LOOSE PREFIX MATCHING AND Fallbacks
      });
    }

    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      return jsonResponse(
        { error: "Missing GEMINI_API_KEY in Vercel env variables" },
        500,
        res,
      );
    }

    const groqKey = env.GROQ_API_KEY;
    
    // 1. Generate Context Packet(s) based on Strategy
    let packet: ResolverContextPacket;
    let packet2: ResolverContextPacket | null = null;
    let isMultiGround = false;

    const intentResolution = body?.intentResolution;
    const strategy = intentResolution?.groundingDecision?.strategy;

    if (strategy === "DEFERRED_GROUND") {
      packet = {
        version: "v1",
        executionMode: "SEMANTIC",
        ownershipGenerationId: null,
        canonicalEntity: rawQuery,
        expandedEntity: rawQuery,
        entityType: "unknown",
        entityKind: "title",
        parentFranchise: null,
        universe: null,
        continuity: null,
        mediaLens,
        activeUniverse: rawQuery,
        spoilerPolicy: spoilerMode ? "safe" : "strict",
        confidence: 0.5,
        groundingConfidence: { authoritative: 0.5, inferred: 0, embeddingRecall: 0, topology: 0, continuity: 0, lens: 0.5 },
        contextualSearchQuery: rawQuery,
        retrievalDescriptor: rawQuery,
        visualAnchors: [],
        entityAliases: [],
        franchiseAliases: [],
        conversationMode: "canon-lookup",
        queryMode: "exploration",
        telemetry: {
          groundingType: "fallback",
          expansionUsed: false,
          expansionAccepted: false,
          expansionType: null,
          embeddingUsed: false,
          embeddingAccepted: false,
          continuityType: "none",
          isAmbiguous: false,
          isSelfReferential: false,
          inheritanceDepth: 0,
          qualifiedId: null,
          candidateHistory: [],
          embeddingEntropyScore: 0,
          visualEntropyScore: 0,
          continuitySource: "none"
        }
      } as any;
    } else if (strategy === "MULTI_GROUND" && intentResolution?.intent?.entities && intentResolution.intent.entities.length >= 2) {
      isMultiGround = true;
      const entitiesToGround = intentResolution.intent.entities;
      const e1 = entitiesToGround[0];
      const e2 = entitiesToGround[1];

      const g1 = groundCanonicalIntent({ query: e1, mediaLens, temporaryEntities });
      const g2 = groundCanonicalIntent({ query: e2, mediaLens, temporaryEntities });

      packet = await buildContextPacket(e1, mediaLens, spoilerMode, previousEntity, g1);
      packet2 = await buildContextPacket(e2, mediaLens, spoilerMode, previousEntity, g2);
    } else {
      packet = await buildContextPacket(
        rawQuery,
        mediaLens,
        spoilerMode,
        previousEntity,
        grounding
      );
    }

    if (packet.providerMetadata?.providerType) {
      console.log("[TYPED_PROVIDER_PROPAGATED]", {
        stage: "context_packet",
        query: rawQuery,
        mediaLens,
        providerId: packet.providerId,
        providerType: packet.providerMetadata.providerType,
        providerResourceType: packet.providerMetadata.providerResourceType ?? null,
      });
    }

    if (packet.deterministicOwnershipFailure) {
      console.log(
        "[DETERMINISTIC_OWNERSHIP_FAILURE]",
        "Aborting semantic recovery after explicit selection."
      );

      return jsonResponse({
        answer: "Unable to establish deterministic ownership.",
        sources: [],
        followups: [],
        contextPacket: packet,
        alternatives: [],
        grounding: null,
        requiresGrounding: false
      }, 200, res);
    }

    // Strict Confidence Boundary (Phase 9C) - bypass if deferred or multi-ground
    if (strategy !== "DEFERRED_GROUND" && !isMultiGround && packet.queryMode === "entity" && packet.confidence < 0.5) {
      console.log(`[SEMANTIC FALLBACK BLOCKED] Confidence score ${packet.confidence} below threshold 0.5. Fallback blocked.`);
      return jsonResponse(
        {
          answer: "No confident match found.",
          sources: [],
          followups: [],
          contextPacket: packet,
          alternatives: [],
          grounding: null,
          requiresGrounding: false,
        },
        200,
        res
      );
    }

    // Canonical Entity Ownership Verification
    if (packet.providerMetadata) {
      const canonical = packet.providerMetadata.canonicalTitle?.toLowerCase().replace(/[^a-z0-9]/g, "");
      const root = packet.providerMetadata.franchiseRoot?.toLowerCase().replace(/[^a-z0-9]/g, "");
      const resolved = packet.canonicalEntity.toLowerCase().replace(/[^a-z0-9]/g, "");

      const titleMatch = canonical ? resolved.includes(canonical) || canonical.includes(resolved) : true;
      const rootMatch = root ? resolved.includes(root) : true;

      const expectedType = packet.providerMetadata.providerType;
      const resolvedType = packet.providerType;
      const typeMatch = expectedType && resolvedType
        ? (packet.providerMetadata.provider === "comicvine" ? isCompatibleComicVineType(expectedType, resolvedType) : expectedType === resolvedType)
        : true;

      const expectedPublisher = packet.providerMetadata.publisherLabel?.toLowerCase().replace(/[^a-z0-9]/g, "");
      const resolvedPublisher = (packet.providerMetadata.publisherLabel || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const publisherMatch = expectedPublisher && resolvedPublisher
        ? resolvedPublisher.includes(expectedPublisher) || expectedPublisher.includes(resolvedPublisher)
        : true;

      if (!titleMatch || !rootMatch || !typeMatch || !publisherMatch) {
         console.log(`[DETERMINISTIC OWNERSHIP LOST] Pre-prompt ownership verification failed! Expected canonical "${canonical}" or root "${root}", got "${resolved}"`);
         console.log(`[CANONICAL DRIFT DETECTED] Override blocked. Expected canonical "${canonical}" or root "${root}", got "${resolved}"`);
         console.log("[TYPED_OWNERSHIP_REJECTED] Ownership verification components mismatched:", {
           titleMatch, expectedTitle: canonical, gotTitle: resolved,
           rootMatch, expectedRoot: root,
           typeMatch, expectedType, gotType: resolvedType,
           publisherMatch, expectedPublisher, gotPublisher: resolvedPublisher
         });
         console.log("[DETERMINISTIC_RETRIEVAL_ABORTED] Pre-prompt ownership validation gate failed. Mismatch rejected.");
         console.log("[SEMANTIC_FALLBACK_BLOCKED] Pre-prompt ownership verification failed. Returning strict null.");
         return jsonResponse({
           answer: "No confident deterministic retrieval found.",
           sources: [],
           followups: [],
           contextPacket: packet,
           alternatives: [],
           grounding: null,
           requiresGrounding: false
         }, 200, res);
      }

      console.log("[TYPED_OWNERSHIP_VALIDATED] Pre-prompt ownership verified:", {
        title: packet.canonicalEntity,
        type: resolvedType,
        publisher: packet.providerMetadata.publisherLabel
      });
      console.log(`[DETERMINISTIC_PROVIDER_LOCK] Generating answer context for locked entity: "${packet.canonicalEntity}" (${packet.providerId})`);
    }

    if (packet.executionMode === "DETERMINISTIC_PROVIDER") {
      console.log(`[DETERMINISTIC OWNERSHIP PROPAGATED] Generating answer context for locked entity: "${packet.canonicalEntity}" (${packet.providerId})`);
    }

    // 2. Build Prompt and generate answer
    let prompt = "";
    if (isMultiGround && packet2) {
      const activeContext = `- Entity 1: ${packet.canonicalEntity ?? "Unknown"}\n- Franchise 1: ${packet.parentFranchise ?? "Unknown"}\n- Entity 2: ${packet2.canonicalEntity ?? "Unknown"}\n- Franchise 2: ${packet2.parentFranchise ?? "Unknown"}\n- Lens: ${mediaLens}\n- Mode: COMPARATIVE_REASONING`;
      const systemRole = `You are Nerdvana, a universal media intelligence engine.

ACTIVE_CONTEXT:
${activeContext}

IMPORTANT GUIDELINES:
- Provide concise answers in EXACTLY 2 paragraphs. Each paragraph 3-4 sentences max.
- Do not greet the user. Start immediately with the answer content.
- Compare the two entities objectively using the provided canonical information.`;

      const recentConversation = conversation.slice(-4);
      const conversationContext = recentConversation.length > 0
        ? "\n\nRECENT CONVERSATION STATE:\n" + recentConversation.map(msg => `${msg.role === "user" ? "User" : "Nerdvana"}: ${msg.content}`).join("\n")
        : "";
      prompt = `${systemRole}${conversationContext}\n\nUSER QUERY:\n${rawQuery}\n\nANSWER:`;
    } else {
      prompt = buildPrompt(
        query,
        packet,
        conversation,
      );
    }
    
    const answerPromise = generateAnswer(prompt, apiKey, groqKey, packet.conversationMode);
    
    // 3. Fetch sources based on canonical constraints
    const retrievalSeed = packet.contextualSearchQuery || grounding.selectedSelectionValue || grounding.selectedCanonicalEntity || query;
    const lensSearchQuery = (() => {
      if (mediaLens === "movies") return `${retrievalSeed} movie live action canon`;
      if (mediaLens === "tv") return `${retrievalSeed} tv series canon`;
      if (mediaLens === "anime") return `${retrievalSeed} anime canon main series`;
      if (mediaLens === "games") return `${retrievalSeed} video game canon franchise`;
      return `${retrievalSeed} comics canon continuity`;
    })();

    const sourcesPromise = (async () => {
      if (env.SERPER_API_KEY) {
        try {
          return await fetchSerperSources(lensSearchQuery, env.SERPER_API_KEY);
        } catch {}
      }      if (env.WHOOGLE_BASE_URL) {
        try {
          return await fetchWhoogleSources(lensSearchQuery, env.WHOOGLE_BASE_URL);
        } catch {}
      }
      return [];
    })();

    const [rawAnswer, sourceRows] = await Promise.all([
      answerPromise,
      sourcesPromise,
    ]);
    const sources = sourceRows.slice(0, grounding.policy.retrievalBreadth);

    // Ensure no residual tags (just in case LLM hallucinations include them)
    const answer = rawAnswer
      .replace(/<visual_context>[\s\S]*?<\/visual_context>/g, "")
      .replace(/<visual_context>[\s\S]*/g, "")
      .replace(/<\/visual_context>/g, "")
      .trim();

    const followups = packet.providerId && packet.executionMode === "DETERMINISTIC_PROVIDER"
      ? buildContinuityFollowups(packet.providerId, packet.canonicalEntity || query)
      : buildFollowups(query);

    const isComicsDeterministic = packet.providerId && packet.executionMode === "DETERMINISTIC_PROVIDER" && packet.providerId.startsWith("comicvine::");
    const readingOrder = isComicsDeterministic
      ? buildReadingOrder(packet.providerId!, packet.canonicalEntity || query)
      : null;
    const continuationSuggestions = isComicsDeterministic
      ? buildContinuationSuggestions(packet.providerId!, packet.canonicalEntity || query)
      : null;

    return jsonResponse(
      {
        answer,
        sources: sources.map((source) => ({
          title: source.title,
          link: source.link,
        })),
        followups,
        readingOrder,
        continuationSuggestions,
        contextPacket: packet, // Universal source of truth exported to frontend
        alternatives: grounding.suggestions,
        grounding,
        requiresGrounding: false,
        temporaryEntityCreated: newTempEntity,
        ambiguityWarning: strategy === "SOFT_GROUND" ? "Ambiguous query resolved to most likely candidate" : undefined,
        diagnostics: {
          normalizedQuery: grounding.normalizedQuery,
          exactTitleHit: grounding.telemetry.exactTitleHit ?? false,
          hydrationSource: body?.hydrationSource ?? (body?.item ? "autocomplete" : "search-input"),
          sessionQuery: body?.query ?? "",
          urlQuery: rawQuery,
          preNormalizedScore: grounding.telemetry.preNormalizedScore ?? 0,
          postNormalizedScore: grounding.telemetry.postNormalizedScore ?? 0,
          tokenCoverageRatio: grounding.telemetry.tokenCoverageRatio ?? 0,
          rejectedByForbiddenPrefix: grounding.telemetry.rejectedByForbiddenPrefix ?? false,
          ingestionSource: newTempEntity?.source ?? null,
          temporaryEntityCreated: !!newTempEntity,
          authorityTier: newTempEntity ? "external_ingested" : (grounding.selectedCanonicalEntity ? "curated_topology" : null),
          ingestionConfidence: newTempEntity ? 0.99 : 0.0,
          apiExactMatch,
          rejectedExternalEntities,
          canonRelationshipPath: packet.telemetry.canonRelationshipPath,
          continuitySource: packet.telemetry.continuitySource,
          variantResolution: packet.telemetry.variantResolution,
          inheritedUniverse: packet.telemetry.inheritedUniverse,
          adaptationLineage: packet.telemetry.adaptationLineage,
          canonAuthority: packet.telemetry.canonAuthority,
        }
      },
      200,
      res,
    );
  } catch (error) {
    console.error("Generation Failed", error);

    return jsonResponse(
      {
        error: "Generation Failed",
        details: String(error),
      },
      500,
      res,
    );
  }
}
