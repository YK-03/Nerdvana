/**
 * queryModeArbitrator.ts
 *
 * Coordinates API routing decisions based on Intent Resolution.
 */

import type { GroundingStrategy } from "./groundingStrategyEngine.js";
import type { CanonicalSuggestion } from "../lib/resolver/canonicalGrounding.js";

export type ApiRoute = "entity" | "clarification";

export interface IntentResolutionMinimal {
  groundingDecision: {
    strategy: GroundingStrategy;
    shouldShowClarification: boolean;
  };
  groundingResult: {
    suggestions: CanonicalSuggestion[];
  } | null;
}

export function arbitrateQueryRoute(
  resolution: IntentResolutionMinimal
): {
  route: ApiRoute;
  shouldShowClarification: boolean;
  clarificationSuggestions: CanonicalSuggestion[];
} {
  const strategy = resolution.groundingDecision.strategy;
  const suggestions = resolution.groundingResult?.suggestions ?? [];

  if (strategy === "GUIDED_GROUND") {
    return {
      route: "clarification",
      shouldShowClarification: true,
      clarificationSuggestions: suggestions
    };
  }

  // STRICT_GROUND, SOFT_GROUND, and MULTI_GROUND route to "entity".
  // Unsupported discovery queries are handled by AskPage before dispatch.
  return {
    route: "entity",
    shouldShowClarification: false,
    clarificationSuggestions: []
  };
}
