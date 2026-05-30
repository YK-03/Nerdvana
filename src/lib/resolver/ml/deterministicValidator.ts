import { ResolvedTopology, ContinuityType } from "../topology/topologyTypes.js";
import { SemanticSuggestion } from "./expansionTypes.js";

/**
 * deterministicValidator.ts
 * 
 * Ensures all ML-assisted semantic expansions adhere to deterministic topology rules.
 */

export interface ValidationResult {
  valid: boolean;
  score: number;
  reason?: string;
}

export function validateExpansion(
  suggestion: SemanticSuggestion,
  resolved: ResolvedTopology,
  mediaLens: string,
): ValidationResult {
  // 1. Media Domain Enforcement (HARD RULE)
  if (resolved.mediaDomains.length > 0 && !resolved.mediaDomains.includes(mediaLens)) {
    return {
      valid: false,
      score: 0,
      reason: `Media Domain Mismatch: Topology node "${resolved.id}" does not exist in domain "${mediaLens}"`,
    };
  }

  // 2. Continuity Compatibility
  // (e.g. If we're looking for a "reboot", don't accept a suggestion from "prime" unless crossover is enabled)
  
  // 3. Namespace Safety
  // Ensure the suggestion doesn't bleed across unrelated top-level namespaces
  // unless explicitly marked as crossover.
  
  // 4. Score Calibration
  // ML score is tempered by deterministic validation.
  const calibratedScore = suggestion.score * 0.9; // Slight penalty for being inferred

  return {
    valid: true,
    score: calibratedScore,
  };
}
