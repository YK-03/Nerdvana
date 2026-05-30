/**
 * groundingStrategyEngine.ts
 *
 * Implements strategy selection based on intent, ambiguity levels, and grounding results.
 */

import type { IntentClassification } from "./queryIntentClassifier.js";
import type { AmbiguityAnalysis } from "./ambiguityScorer.js";
import type { CanonicalGroundingResult } from "../lib/resolver/canonicalGrounding.js";

export type GroundingStrategy =
  | "STRICT_GROUND"   // Low ambiguity -> ground immediately
  | "SOFT_GROUND"     // Medium ambiguity with strong top candidate -> ground but warn
  | "DEFERRED_GROUND" // Exploration/thematic -> don't ground yet
  | "MULTI_GROUND"    // Comparative -> ground both entities independently
  | "GUIDED_GROUND";  // High ambiguity -> ask user to clarify

export interface GroundingDecision {
  strategy: GroundingStrategy;
  reason: string;
  topCandidate: string | null;
  alternativeCandidates: string[];
  shouldShowClarification: boolean;
}

export function selectGroundingStrategy(
  intent: IntentClassification,
  ambiguity: AmbiguityAnalysis,
  groundingResult: CanonicalGroundingResult | null
): GroundingDecision {
  const suggestions = groundingResult?.suggestions ?? [];
  const topCandidate = suggestions[0]?.canonicalEntity ?? null;
  const alternativeCandidates = suggestions.slice(1).map(s => s.canonicalEntity);

  const decision = (strategy: GroundingStrategy, reason: string): GroundingDecision => {
    return {
      strategy,
      reason,
      topCandidate,
      alternativeCandidates,
      shouldShowClarification: strategy === "GUIDED_GROUND"
    };
  };

  const hasYearDisambiguation = /\(\d{4}\)/.test(intent.entities[0] || "") || /\(\d{4}\)/.test(groundingResult?.originalQuery ?? "");
  const isDeterministicBypass = 
    groundingResult?.telemetry?.explicitSelectionUsed === true ||
    groundingResult?.telemetry?.exactTitleHit === true ||
    groundingResult?.behavior === "auto_resolve" ||
    hasYearDisambiguation ||
    (groundingResult?.selectedSelectionValue != null && groundingResult.selectedSelectionValue.length > 0) ||
    suggestions.length <= 1;

  if (isDeterministicBypass) {
    if (intent.intent === "COMPARATIVE_REASONING") {
      return decision("MULTI_GROUND", "Comparative query requires independent dual grounding (deterministic bypass)");
    }
    if (intent.intent === "THEMATIC_DISCOVERY" || intent.intent === "EXPLORATORY_DISCOVERY") {
      return decision("DEFERRED_GROUND", `Exploratory or thematic intent (${intent.intent}) defers canonical grounding (deterministic bypass)`);
    }
    return decision("STRICT_GROUND", "Deterministic grounding matched; bypassing ambiguity checks");
  }

  const intentType = intent.intent;
  const ambLevel = ambiguity.ambiguityLevel;

  // Rule 1: Comparative queries always route to MULTI_GROUND
  if (intentType === "COMPARATIVE_REASONING") {
    return decision("MULTI_GROUND", "Comparative query requires independent dual grounding");
  }

  // Rule 2: Thematic discovery and Exploratory discovery route to DEFERRED_GROUND
  if (intentType === "THEMATIC_DISCOVERY" || intentType === "EXPLORATORY_DISCOVERY") {
    return decision("DEFERRED_GROUND", `Exploratory or thematic intent (${intentType}) defers canonical grounding`);
  }

  // Rule 3: Entity lookup strategy mappings
  if (intentType === "ENTITY_LOOKUP") {
    if (ambLevel === "LOW") {
      return decision("STRICT_GROUND", "Low ambiguity entity lookup grounds immediately");
    } else if (ambLevel === "MEDIUM") {
      return decision("SOFT_GROUND", "Medium ambiguity entity lookup grounds with potential warning");
    } else {
      return decision("GUIDED_GROUND", "High ambiguity entity lookup requires user clarification");
    }
  }

  // Rule 4: Universe entry strategy mappings
  if (intentType === "UNIVERSE_ENTRY") {
    if (ambLevel === "LOW") {
      return decision("STRICT_GROUND", "Low ambiguity universe entry grounds immediately");
    } else {
      return decision("GUIDED_GROUND", "Medium/High ambiguity universe entry requires user clarification");
    }
  }

  // Rule 5: Canon/Timeline reasoning strategy mappings
  if (intentType === "CANON_REASONING" || intentType === "TIMELINE_REASONING") {
    if (ambLevel === "LOW") {
      return decision("STRICT_GROUND", `Low ambiguity ${intentType} grounds immediately`);
    } else {
      return decision("SOFT_GROUND", `Medium/High ambiguity ${intentType} grounds with soft fallback`);
    }
  }

  // Fallback to strict grounding
  return decision("STRICT_GROUND", "Fallback grounding strategy applied");
}
