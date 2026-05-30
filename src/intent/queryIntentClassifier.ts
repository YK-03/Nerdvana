/**
 * queryIntentClassifier.ts
 *
 * Deterministically classifies the query's intent space without LLM latency.
 */

import type { MediaLens } from "../app/mediaLens.js";
import { KNOWN_FRANCHISES } from "../lib/resolver/candidateScorer.js";
import { CANONICAL_ALIASES } from "../lib/resolver/queryNormalizer.js";

export type QueryIntentV2 =
  | "ENTITY_LOOKUP"        // "Who is Johan Liebert?"
  | "UNIVERSE_ENTRY"       // "Joker" (bare entity name)
  | "THEMATIC_DISCOVERY"   // "villains like Johan Liebert"
  | "CANON_REASONING"      // "Is Dragon Ball GT canon?"
  | "TIMELINE_REASONING"   // "MCU watch order"
  | "COMPARATIVE_REASONING"// "Batman vs Lelouch intelligence"
  | "EXPLORATORY_DISCOVERY";// "dark psychological anime"

export interface IntentClassification {
  intent: QueryIntentV2;
  confidence: number;
  signals: string[];
  entities: string[];
  isMultiEntity: boolean;
}

export function classifyQueryIntent(
  query: string,
  lens: MediaLens
): IntentClassification {
  const q = query.toLowerCase().trim();
  const signals: string[] = [];
  const entities: string[] = [];

  // Helper to extract comparison candidates (e.g. "X vs Y")
  const vsPatterns = [/\bvs\b/i, /\bversus\b/i, /\bstronger than\b/i, /\bwho would win\b/i, /\bcompared to\b/i];
  const isComparative = vsPatterns.some(pattern => pattern.test(q));

  if (isComparative) {
    signals.push("comparative_pattern");
    // Simple split to find entity mentions
    const splitParts = q.split(/\bvs\b|\bversus\b|\bstronger than\b|\bwho would win\b|\bcompared to\b/i);
    for (const part of splitParts) {
      const trimmed = part.replace(/[^a-zA-Z0-9\s]/g, "").trim();
      if (trimmed) entities.push(trimmed);
    }
    return {
      intent: "COMPARATIVE_REASONING",
      confidence: 0.95,
      signals,
      entities,
      isMultiEntity: entities.length > 1
    };
  }

  // Check timeline reasoning
  const timelinePatterns = [
    /\bwatch order\b/i,
    /\btimeline\b/i,
    /\bchronological\b/i,
    /\breading order\b/i,
    /\border to watch\b/i
  ];
  if (timelinePatterns.some(pattern => pattern.test(q))) {
    signals.push("timeline_pattern");
    return {
      intent: "TIMELINE_REASONING",
      confidence: 0.9,
      signals,
      entities: [],
      isMultiEntity: false
    };
  }

  // Check canon reasoning
  const canonPatterns = [
    /\bcanon\b/i,
    /\bcanonical\b/i,
    /\bfiller\b/i,
    /\bis\s+.*\s+canon\b/i
  ];
  if (canonPatterns.some(pattern => pattern.test(q))) {
    signals.push("canon_pattern");
    return {
      intent: "CANON_REASONING",
      confidence: 0.9,
      signals,
      entities: [],
      isMultiEntity: false
    };
  }

  // Check thematic discovery
  const thematicPatterns = [
    /\blike\b/i,
    /\bsimilar to\b/i,
    /\breminds me of\b/i,
    /\bkind of like\b/i
  ];
  if (thematicPatterns.some(pattern => pattern.test(q))) {
    signals.push("thematic_pattern");
    return {
      intent: "THEMATIC_DISCOVERY",
      confidence: 0.85,
      signals,
      entities: [],
      isMultiEntity: false
    };
  }

  // Check exploratory discovery
  const exploratoryPatterns = [
    /\bbest\b/i,
    /\btop\b/i,
    /\bdarkest\b/i,
    /\bfunniest\b/i,
    /\bscariest\b/i,
    /\bgreatest\b/i,
    /\bgames with\b/i,
    /\bmovies with\b/i,
    /\bshows with\b/i,
    /\banime with\b/i,
    /\bgames about\b/i,
    /\bmovies about\b/i,
    /\bshows about\b/i,
    /\banime about\b/i
  ];
  if (exploratoryPatterns.some(pattern => pattern.test(q))) {
    signals.push("exploratory_pattern");
    return {
      intent: "EXPLORATORY_DISCOVERY",
      confidence: 0.85,
      signals,
      entities: [],
      isMultiEntity: false
    };
  }

  // Check explicit entity lookup signals
  const lookupPatterns = [
    /\bwho is\b/i,
    /\btell me about\b/i,
    /\bwhat is\b/i,
    /\bwho was\b/i,
    /\bbackstory of\b/i
  ];
  if (lookupPatterns.some(pattern => pattern.test(q))) {
    signals.push("entity_lookup_pattern");
    const entityExtracted = q.replace(/who is|tell me about|what is|who was|backstory of/i, "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
    if (entityExtracted) entities.push(entityExtracted);
    return {
      intent: "ENTITY_LOOKUP",
      confidence: 0.9,
      signals,
      entities,
      isMultiEntity: false
    };
  }

  // Fallback heuristics: Single word or 2-word personal name → UNIVERSE_ENTRY
  const cleanQ = q.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const words = cleanQ.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    signals.push("single_word_fallback");
    entities.push(cleanQ);
    return {
      intent: "UNIVERSE_ENTRY",
      confidence: 0.8,
      signals,
      entities,
      isMultiEntity: false
    };
  }

  // Is a known franchise or alias directly matching?
  if (KNOWN_FRANCHISES.has(cleanQ) || CANONICAL_ALIASES[cleanQ]) {
    signals.push("exact_known_entity_match");
    entities.push(cleanQ);
    return {
      intent: "UNIVERSE_ENTRY",
      confidence: 0.95,
      signals,
      entities,
      isMultiEntity: false
    };
  }

  if (words.length === 2 && /^[a-z]+$/.test(words[0]) && /^[a-z]+$/.test(words[1])) {
    signals.push("two_word_name_heuristic");
    entities.push(cleanQ);
    return {
      intent: "UNIVERSE_ENTRY",
      confidence: 0.75,
      signals,
      entities,
      isMultiEntity: false
    };
  }

  // Default fallback
  signals.push("default_lookup_fallback");
  entities.push(cleanQ);
  return {
    intent: "ENTITY_LOOKUP",
    confidence: 0.6,
    signals,
    entities,
    isMultiEntity: false
  };
}
