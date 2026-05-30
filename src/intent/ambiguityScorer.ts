/**
 * ambiguityScorer.ts
 *
 * Deterministically calculates ambiguity scores and levels for query grounding.
 */

import type { MediaLens } from "../app/mediaLens.js";
import type { CanonicalGroundingResult } from "../lib/resolver/canonicalGrounding.js";

export type AmbiguityLevel = "LOW" | "MEDIUM" | "HIGH";

export interface AmbiguityAnalysis {
  ambiguityScore: number;
  ambiguityLevel: AmbiguityLevel;
  candidateCollisions: number;
  crossLensPresence: boolean;
  franchiseOverlap: boolean;
  aliasDensity: number;
  signals: string[];
}

const HIGH_AMBIGUITY_TOKENS = new Set([
  "joker", "flash", "avatar", "halo", "doom", "loki", "bleach", "fate", "link",
  "arcane", "sonic", "castlevania", "light", "spawn", "seven"
]);

export function analyzeAmbiguity(
  query: string,
  lens: MediaLens,
  groundingResult: CanonicalGroundingResult | null
): AmbiguityAnalysis {
  const suggestions = groundingResult?.suggestions ?? [];
  const hasYearDisambiguation = /\(\d{4}\)/.test(query) || /\(\d{4}\)/.test(groundingResult?.originalQuery ?? "");
  
  const isDeterministicBypass = 
    groundingResult?.telemetry?.explicitSelectionUsed === true ||
    groundingResult?.telemetry?.exactTitleHit === true ||
    groundingResult?.behavior === "auto_resolve" ||
    hasYearDisambiguation ||
    (groundingResult?.selectedSelectionValue != null && groundingResult.selectedSelectionValue.length > 0) ||
    suggestions.length <= 1;

  if (isDeterministicBypass) {
    return {
      ambiguityScore: 0,
      ambiguityLevel: "LOW",
      candidateCollisions: suggestions.length,
      crossLensPresence: false,
      franchiseOverlap: false,
      aliasDensity: 0,
      signals: ["deterministic_grounding_bypass"]
    };
  }

  const q = query.toLowerCase().trim();
  const signals: string[] = [];
  let score = 0;

  // 1. High ambiguity token match (+0.4)
  if (HIGH_AMBIGUITY_TOKENS.has(q)) {
    score += 0.4;
    signals.push("high_ambiguity_token_match");
  }

  // 2. Short word penalty (+0.15)
  if (q.length <= 4) {
    score += 0.15;
    signals.push("short_query_word");
  }

  const candidateCollisions = suggestions.length;

  // 3. Collision candidate counts (+0.3 if >= 3 suggestions with a small score gap)
  let smallScoreGap = false;
  if (suggestions.length >= 2) {
    const topScore = suggestions[0].score ?? 0;
    const runnerUpScore = suggestions[1].score ?? 0;
    // If the gap between top two suggestions is small (e.g. less than 15 points)
    if (topScore - runnerUpScore < 15) {
      smallScoreGap = true;
    }
  }

  if (suggestions.length >= 3 && smallScoreGap) {
    score += 0.3;
    signals.push("multiple_high_scoring_candidates");
  } else if (suggestions.length >= 2) {
    score += 0.1;
    signals.push("multiple_candidates_present");
  }

  // 4. Cross-lens existence (+0.2)
  const activeLenses = new Set(suggestions.map(s => s.mediaLens));
  const crossLensPresence = activeLenses.size > 1;
  if (crossLensPresence) {
    score += 0.2;
    signals.push("cross_lens_collisions");
  }

  // 5. Franchise overlap (+0.2)
  const franchises = new Set(suggestions.map(s => s.franchise?.toLowerCase()).filter(Boolean));
  const franchiseOverlap = franchises.size > 1;
  if (franchiseOverlap) {
    score += 0.2;
    signals.push("franchise_universe_overlap");
  }

  // 6. Alias density (+0.1)
  const uniqueAliases = new Set(suggestions.flatMap(s => s.aliases ?? []));
  const aliasDensity = uniqueAliases.size;
  if (aliasDensity >= 3) {
    score += 0.1;
    signals.push("high_alias_density");
  }

  // Clamp score between 0.0 and 1.0
  const ambiguityScore = Math.min(1.0, Math.max(0.0, Number(score.toFixed(2))));

  let ambiguityLevel: AmbiguityLevel = "LOW";
  if (ambiguityScore >= 0.6) {
    ambiguityLevel = "HIGH";
  } else if (ambiguityScore >= 0.3) {
    ambiguityLevel = "MEDIUM";
  }

  return {
    ambiguityScore,
    ambiguityLevel,
    candidateCollisions,
    crossLensPresence,
    franchiseOverlap,
    aliasDensity,
    signals
  };
}
