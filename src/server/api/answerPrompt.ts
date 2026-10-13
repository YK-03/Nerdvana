import type { ServerCanonicalEvidence } from "../../lib/explorationTypes.js";
import type { ResolverContextPacket } from "../../app/canonicalResolver.js";

export type AnswerConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_CANONICAL_CHARACTERS = 8;
const MAX_CANONICAL_FACTS = 12;
const MAX_EVIDENCE_CHARS = 2400;
const MAX_FIELD_CHARS = 160;

function boundedText(value: unknown, max = MAX_FIELD_CHARS): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function providerLabel(providerId: string | null): string {
  const provider = providerId?.split("::")[0]?.toLowerCase();
  switch (provider) {
    case "tmdb":
      return "TMDB";
    case "anilist":
      return "AniList";
    case "jikan":
      return "Jikan";
    case "igdb":
      return "IGDB";
    case "comicvine":
      return "ComicVine";
    case "googlebooks":
      return "Google Books";
    case "rawg":
      return "RAWG";
    default:
      return "resolved provider";
  }
}

export function buildCanonicalEvidence(
  evidence?: ServerCanonicalEvidence | null,
): string {
  if (!evidence || evidence.provenance !== "server-provider-response") {
    return JSON.stringify({ provenance: "none", facts: [] });
  }

  const facts: Array<Record<string, string>> = [];
  const title = boundedText(evidence.title);
  if (title) {
    facts.push({ fact: "Resolved title", value: title });
  }

  const characters = evidence.characters.slice(0, MAX_CANONICAL_CHARACTERS);
  const source = providerLabel(evidence.providerId);

  for (const character of characters) {
    const name = boundedText(character?.name);
    if (!name) continue;

    const portrayedBy = boundedText(character?.portrayedBy);
    facts.push(
      portrayedBy
        ? { fact: "Character casting", character: name, portrayedBy }
        : { fact: "Character", character: name },
    );

    if (facts.length >= MAX_CANONICAL_FACTS) break;
  }

  const boundedFacts: Array<Record<string, string>> = [];
  for (const fact of facts.slice(0, MAX_CANONICAL_FACTS)) {
    const candidate = JSON.stringify({
      provenance: evidence.provenance,
      source,
      providerId: evidence.providerId,
      facts: [...boundedFacts, fact],
    });
    if (candidate.length > MAX_EVIDENCE_CHARS) break;
    boundedFacts.push(fact);
  }

  return JSON.stringify({
    provenance: evidence.provenance,
    source,
    providerId: evidence.providerId,
    facts: boundedFacts,
  });
}

export function buildAnswerPrompt(
  query: string,
  packet: ResolverContextPacket,
  conversation: AnswerConversationMessage[],
  evidence?: ServerCanonicalEvidence | null,
): string {
  const activeContext = `- Entity: ${packet.canonicalEntity ?? "Unknown"}\n- Franchise: ${packet.parentFranchise ?? "Unknown"}\n- Lens: ${packet.mediaLens}\n- Spoilers: ${packet.spoilerPolicy}\n- Mode: ${packet.conversationMode}\n- Confidence: ${packet.confidence}`;
  const canonicalEvidence = buildCanonicalEvidence(evidence);

  const systemRole = `You are Nerdvana, a universal media intelligence engine.

ACTIVE_CONTEXT:
${activeContext}

VERIFIED_CANONICAL_EVIDENCE:
${canonicalEvidence}

IMPORTANT GUIDELINES:
- Provide concise answers in EXACTLY 2 paragraphs. Each paragraph 3-4 sentences max.
- Do not greet the user. Start immediately with the answer content.
- Use the ACTIVE_CONTEXT to ground your reasoning.
- Treat VERIFIED_CANONICAL_EVIDENCE as provider-backed metadata from the server response, not general explanatory prose.
- For factual questions, do not contradict VERIFIED_CANONICAL_EVIDENCE based on unsupported recall.
- If a required fact is absent or the evidence is insufficient or conflicting, state the uncertainty instead of inventing confirmation.
- Preserve useful story explanations and interpretations beyond the metadata.
- If Mode is "deep-theory", focus on implications and thematic analysis.
- If Mode is "simple-comparison", compare the entities objectively.
- If Spoilers is "strict", naturally avoid revealing major plot twists or endings. Do not mention spoiler policies, internal settings, or give warnings.`;

  // We limit the conversation context to recent messages to prevent token explosion.
  // As per architectural rules, conversation is only consulted for ambiguous follow-ups.
  // Deterministic navigations must be strictly isolated to prevent cross-entity leaks.
  const isAmbiguousFollowUp = packet.executionMode === "SEMANTIC";
  const recentConversation = isAmbiguousFollowUp ? conversation.slice(-4) : [];

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
