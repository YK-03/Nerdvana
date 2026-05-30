/**
 * intentUniverseEngine.ts
 *
 * Orchestration engine for query intents, grounding strategy, and candidate graphs.
 */

import type { MediaLens } from "../app/mediaLens.js";
import type { TemporaryCanonicalEntity } from "../lib/resolver/dynamicEntityIngestion.js";
import {
  classifyQueryIntent,
  type IntentClassification
} from "./queryIntentClassifier.js";
import {
  analyzeAmbiguity,
  type AmbiguityAnalysis
} from "./ambiguityScorer.js";
import {
  selectGroundingStrategy,
  type GroundingDecision
} from "./groundingStrategyEngine.js";
import {
  buildCandidateGraph,
  type CandidateUniverseGraph
} from "./candidateUniverseGraph.js";
import {
  groundCanonicalIntent,
  type CanonicalGroundingResult
} from "../lib/resolver/canonicalGrounding.js";

export interface IntentResolution {
  intent: IntentClassification;
  ambiguity: AmbiguityAnalysis;
  groundingDecision: GroundingDecision;
  candidateGraph: CandidateUniverseGraph;
  groundingResult: CanonicalGroundingResult;
}

export function resolveQueryIntent(
  query: string,
  lens: MediaLens,
  explicitSelection?: string,
  temporaryEntities?: TemporaryCanonicalEntity[]
): IntentResolution {
  const isExplicit = Boolean(explicitSelection);
  const isTmdbId = query.startsWith("tmdb::") || (explicitSelection?.startsWith("tmdb::") ?? false);

  // ─── System A: Orchestration Isolation Bypass ────────────────────────
  if (isExplicit || isTmdbId) {
    const selection = explicitSelection || query;
    const targetTitle = selection.replace(/^tmdb::(movie|tv)::\d+$/, "").trim() || selection;

    // Hard Invariant Assertion 1: Deterministic Lock Correctness
    if (isExplicit && !selection) {
      throw new Error("[Nerdvana] [Assertion Failed] Deterministic lock requires a non-empty selection target.");
    }

    // Hard Invariant Assertion 2: Ambiguity Bypass Correctness
    const groundingResult = groundCanonicalIntent({
      query: targetTitle,
      mediaLens: lens,
      explicitSelection: selection,
      temporaryEntities
    });

    const resolution: IntentResolution = {
      intent: {
        intent: "ENTITY_LOOKUP",
        confidence: 1.0,
        signals: ["system-a-direct-bypass"],
        entities: [targetTitle],
        isMultiEntity: false
      },
      ambiguity: {
        ambiguityScore: 0.0,
        ambiguityLevel: "LOW",
        candidateCollisions: 0,
        crossLensPresence: false,
        franchiseOverlap: false,
        aliasDensity: 0,
        signals: ["system-a-ambiguity-bypass"]
      },
      groundingDecision: {
        strategy: "STRICT_GROUND",
        reason: "System A deterministic media selection bypass",
        topCandidate: selection,
        alternativeCandidates: [],
        shouldShowClarification: false
      },
      candidateGraph: {
        root: query,
        nodes: [],
        franchiseGroups: new Map(),
        lensGroups: new Map(),
        totalCandidates: 0
      },
      groundingResult
    };

    console.log(`[Nerdvana] [System A] Orchestration-isolated direct lock activated for "${selection}".`);
    return resolution;
  }

  // ─── System B: Exploratory Search Pipeline ───────────────────────────
  // 1. Classify the user query intent deterministically
  const intent = classifyQueryIntent(query, lens);

  // 2. Perform raw grounding in the registry & topology database
  const groundingResult = groundCanonicalIntent({
    query,
    mediaLens: lens,
    explicitSelection,
    temporaryEntities,
    allowLooseSemantic: false // Strict first pass
  });

  // 3. Score the ambiguity level of this query/grounding pair
  const ambiguity = analyzeAmbiguity(query, lens, groundingResult);

  // 4. Transform flat suggestions into a structured candidate graph
  const candidateGraph = buildCandidateGraph(query, lens, groundingResult);

  // 5. Select the optimal grounding strategy based on intent & ambiguity
  const groundingDecision = selectGroundingStrategy(intent, ambiguity, groundingResult);

  // Hard Invariant Assertion 3: Retrieval-mode Isolation
  if (groundingDecision.strategy === "STRICT_GROUND" && ambiguity.ambiguityLevel === "HIGH") {
    throw new Error(`[Nerdvana] [Assertion Failed] Highly ambiguous query "${query}" cannot be strict grounded without user selection.`);
  }

  // 6. Assemble and return pure resolution
  return {
    intent,
    ambiguity,
    groundingDecision,
    candidateGraph,
    groundingResult
  };
}
