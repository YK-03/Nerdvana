import { buildContextPacket } from "../../app/canonicalResolver.js";
import { groundCanonicalIntent } from "../../lib/resolver/canonicalGrounding.js";
import { RESOLVER_CASES } from "../cases/resolverCases.js";
import {
  BenchmarkResult,
  AggregateStats,
  FailureCategory,
  EvaluationResult,
  BenchmarkCase,
} from "../types/benchmarkCase.js";
import {
  normalizeIdentity,
  canonicalEquivalent,
  franchiseEquivalent,
  entityTypeEquivalent,
  continuityEquivalent,
} from "../evaluation/benchmarkNormalization.js";

/**
 * Nerdvana Resolver Benchmark Runner
 * Phase 8B: Legacy + normalized evaluation semantics.
 */

function evaluateCaseLegacy(actual: any, expected: any): EvaluationResult {
  return {
    canonicalCorrect:
      actual.canonicalEntity.toLowerCase().includes(expected.canonicalEntity.toLowerCase()) ||
      expected.canonicalEntity.toLowerCase().includes(actual.canonicalEntity.toLowerCase()),
    franchiseCorrect:
      actual.parentFranchise === expected.franchise ||
      (actual.parentFranchise &&
        expected.franchise &&
        actual.parentFranchise.toLowerCase() === expected.franchise.toLowerCase()),
    lensCorrect: actual.mediaLens === expected.mediaLens,
    entityTypeCorrect: actual.entityType === expected.entityType,
    continuityCorrect: !expected.continuity || actual.continuity === expected.continuity,
  };
}

function evaluateCaseNormalized(
  actual: any,
  expected: any,
  testCase: BenchmarkCase
): EvaluationResult {
  const actualNorm = normalizeIdentity(actual.canonicalEntity, {
    qualifiedId: actual.telemetry?.qualifiedId,
    continuity: actual.continuity,
    parentFranchise: actual.parentFranchise,
    mediaLens: actual.mediaLens,
  });
  const expectedNorm = normalizeIdentity(expected.canonicalEntity, {
    continuity: expected.continuity,
    parentFranchise: expected.franchise,
    mediaLens: expected.mediaLens,
  });

  const strictContinuity = Boolean(expected.continuity);
  const canonicalCorrect = canonicalEquivalent(actualNorm, expectedNorm, {
    strictContinuity,
  });
  const franchiseCorrect = franchiseEquivalent(
    actual.parentFranchise,
    expected.franchise,
    actualNorm.entityStem,
    expectedNorm.entityStem
  );
  const lensCorrect = actual.mediaLens === expected.mediaLens;
  const entityTypeCorrect = entityTypeEquivalent(
    actual.entityType,
    expected.entityType,
    canonicalCorrect
  );
  const continuityCorrect = continuityEquivalent(
    actual.continuity,
    expected.continuity,
    actualNorm,
    expectedNorm
  );

  return {
    canonicalCorrect,
    franchiseCorrect,
    lensCorrect,
    entityTypeCorrect,
    continuityCorrect,
  };
}

function classifyFailures(evaluation: EvaluationResult, actual: any, expected: any): FailureCategory[] {
  const failures: FailureCategory[] = [];

  if (!evaluation.lensCorrect) failures.push("lens_mismatch");
  
  if (!evaluation.canonicalCorrect) {
    if (actual.confidence < 0.5) failures.push("unknown_entity");
    else failures.push("canonical_mismatch");
  }

  if (evaluation.canonicalCorrect && !evaluation.franchiseCorrect) {
    failures.push("franchise_drift");
  }

  if (!evaluation.entityTypeCorrect) {
    failures.push("entity_type_mismatch");
  }

  if (actual.confidence >= 0.9 && !evaluation.canonicalCorrect) {
    failures.push("ambiguity_collapse"); // High confidence but wrong ID
  }

  if (actual.confidence < 0.7) {
    failures.push("low_confidence_resolution");
  }

  return failures;
}

async function runBenchmark() {
  const usePixels = process.env.NERDVANA_CLIP_PIXELS === "1";
  console.log("\n=====================================");
  console.log("NERDVANA RESOLVER BENCHMARK v2 (Phase 8B)");
  console.log(`Evaluation: normalized | Pixels: ${usePixels ? "ON" : "OFF"}`);
  console.log("=====================================\n");

  const results: BenchmarkResult[] = [];
  const stats: AggregateStats = {
    total: RESOLVER_CASES.length,
    passed: 0,
    canonicalAccuracy: 0,
    franchiseAccuracy: 0,
    lensAccuracy: 0,
    entityTypeAccuracy: 0,
    failureDistribution: {
      canonical_mismatch: 0,
      franchise_drift: 0,
      lens_mismatch: 0,
      entity_type_mismatch: 0,
      ambiguity_collapse: 0,
      cross_universe_bleed: 0,
      low_confidence_resolution: 0,
      unknown_entity: 0,
    },
    topologyStats: {
      continuityAccuracy: 0,
      variantsDetected: 0,
      crossoversDetected: 0,
      inheritanceHits: 0,
      qualifiedHits: 0,
      totalInheritanceDepth: 0,
      expansionHits: 0,
      expansionRejections: 0,
      topologyInvalidNeighborsProposed: 0,
      topologyInvalidNeighborsRejected: 0,
    },
    groundingTypeDistribution: {
      topology: 0,
      registry: 0,
      heuristic: 0,
      fallback: 0,
    },
    averageConfidence: 0,
    averageGroundingConfidence: {
      authoritative: 0,
      inferred: 0,
      embeddingRecall: 0,
      topology: 0,
      lens: 0,
      continuity: 0,
    },
    falseConfidenceCount: 0,
    selfReferentialCount: 0,
    entropyStats: {
      averageEntropy: 0,
      maxEntropy: 0,
      entropyHotspots: [] as string[],
      entropyPressureCases: 0,
      entropyResilientResolutions: 0,
    },
    crossModalStats: {
      proposed: 0,
      rejected: 0,
      safeDecisions: 0,
      unsafeAcceptances: 0,
      continuityBreaches: 0,
      collisions: [] as { query: string; candidate: string; reason: string }[],
    },
    resolutionCourageStats: {
      difficultMultimodalCases: 0,
      courageousAttempts: 0,
      acceptedUnderUncertainty: 0,
    },
    normalizationStats: {
      legacyPassRate: 0,
      normalizedPassRate: 0,
      legacyPassed: 0,
      normalizedPassed: 0,
      evaluationNoiseReduced: 0,
    },
    groundingMetrics: {
      intentGroundingSuccessRate: 0,
      ambiguityResolutionEfficiency: 0,
      namespacePurityScore: 0,
      canonicalSelectionStability: 0,
      evaluatedCases: 0,
      matchedCases: 0,
      stableCases: 0,
      conflictFreeCases: 0,
      autoBehaviorHits: 0,
      guidedBehaviorHits: 0,
    },
    pressureCaseCount: 0,
    failureHotspots: {} as Record<string, number>,
    dangerousNeighbors: [] as { candidate: string; reason: string; entropy: string }[],
  };

  function isUnsafeMultimodalAccept(
    entry: { modality?: string; accepted: boolean; governanceFailureType?: string; namespace?: string },
    expected: BenchmarkCase["expected"],
    query: string
  ): boolean {
    if (!entry.accepted || entry.modality !== "image") return false;
    const fail = entry.governanceFailureType;
    if (fail === "namespace_bleed" || fail === "continuity_conflict" || fail === "visual_archetype_collision") {
      return true;
    }
    const q = query.toLowerCase();
    if (q.includes("marvel") && entry.namespace?.toLowerCase() === "dc") return true;
    if (q.includes("dc ") && entry.namespace?.toLowerCase() === "marvel") return true;
    if (q.includes("prime") && entry.candidate?.toLowerCase().includes("beyond")) return true;
    return false;
  }

  for (const testCase of RESOLVER_CASES) {
    const grounding = groundCanonicalIntent({
      query: testCase.query,
      mediaLens: testCase.lens as any,
    });
    const packet = await buildContextPacket(testCase.query, testCase.lens as any, false, undefined, grounding);
    
    const legacyEval = evaluateCaseLegacy(packet, testCase.expected);
    const evaluation = evaluateCaseNormalized(packet, testCase.expected, testCase);
    const legacyFailures = classifyFailures(legacyEval, packet, testCase.expected);
    const failures = classifyFailures(evaluation, packet, testCase.expected);
    const legacyPassed =
      legacyFailures.length === 0 ||
      (legacyEval.canonicalCorrect && legacyEval.lensCorrect);
    const passed =
      failures.length === 0 || (evaluation.canonicalCorrect && evaluation.lensCorrect);

    if (legacyPassed) stats.normalizationStats.legacyPassed++;
    if (passed) stats.normalizationStats.normalizedPassed++;
    if (!legacyPassed && passed) stats.normalizationStats.evaluationNoiseReduced++;

    if (testCase.expectedGrounding) {
      stats.groundingMetrics.evaluatedCases++;
      const selectedMatch =
        !testCase.expectedGrounding.selectedCanonicalEntity ||
        grounding.selectedCanonicalEntity === testCase.expectedGrounding.selectedCanonicalEntity;
      const matched =
        grounding.ambiguityLevel === testCase.expectedGrounding.ambiguityLevel &&
        grounding.behavior === testCase.expectedGrounding.behavior &&
        selectedMatch;
      if (matched) {
        stats.groundingMetrics.matchedCases++;
      }
      if (grounding.suggestions[0]?.mediaLens === testCase.lens) {
        stats.groundingMetrics.conflictFreeCases++;
      }
      const topScore = grounding.suggestions[0]?.score ?? 0;
      const secondScore = grounding.suggestions[1]?.score ?? 0;
      if (grounding.suggestions.length > 0 && topScore >= secondScore) {
        stats.groundingMetrics.stableCases++;
      }
      if (grounding.behavior === "auto_resolve") {
        stats.groundingMetrics.autoBehaviorHits++;
      } else {
        stats.groundingMetrics.guidedBehaviorHits++;
      }
    }

    const isPressure =
      testCase.pressureCase ||
      testCase.benchmarkTags?.includes("entropy_pressure") ||
      /^(ent-|vis-|arb-|press-)/.test(testCase.id);
    if (isPressure) stats.pressureCaseCount++;

    const result: BenchmarkResult = {
      caseId: testCase.id,
      query: testCase.query,
      lens: testCase.lens,
      actual: {
        canonicalEntity: packet.canonicalEntity,
        franchise: packet.parentFranchise,
        universe: packet.universe,
        continuity: packet.continuity,
        mediaLens: packet.mediaLens,
        entityType: packet.entityType,
        confidence: packet.confidence,
        groundingConfidence: packet.groundingConfidence,
        telemetry: packet.telemetry,
      },
      evaluation,
      passed,
      failures,
      confidence: packet.confidence,
    };

    results.push(result);

    // Update Stats
    if (passed) stats.passed++;
    if (evaluation.canonicalCorrect) stats.canonicalAccuracy++;
    if (evaluation.franchiseCorrect) stats.franchiseAccuracy++;
    if (evaluation.lensCorrect) stats.lensAccuracy++;
    if (evaluation.entityTypeCorrect) stats.entityTypeAccuracy++;

    failures.forEach(f => stats.failureDistribution[f]++);
    stats.averageConfidence += packet.confidence;
    stats.averageGroundingConfidence.authoritative += packet.groundingConfidence.authoritative;
    stats.averageGroundingConfidence.inferred += packet.groundingConfidence.inferred;
    stats.averageGroundingConfidence.embeddingRecall += packet.groundingConfidence.embeddingRecall;
    stats.averageGroundingConfidence.topology += packet.groundingConfidence.topology;
    stats.averageGroundingConfidence.lens += packet.groundingConfidence.lens;
    stats.averageGroundingConfidence.continuity += packet.groundingConfidence.continuity;

    stats.groundingTypeDistribution[packet.telemetry.groundingType]++;
    if (packet.telemetry.isSelfReferential) stats.selfReferentialCount++;
    if (packet.telemetry.expansionUsed) stats.topologyStats.expansionHits++;
    if (packet.telemetry.expansionUsed && !packet.telemetry.expansionAccepted) stats.topologyStats.expansionRejections++;
    
    // Phase 6: Governance Metrics
    const embeddingHistory = packet.telemetry.candidateHistory?.filter(h => h.stage === "embedding_neighbor") || [];
    stats.topologyStats.topologyInvalidNeighborsProposed += embeddingHistory.length;
    stats.topologyStats.topologyInvalidNeighborsRejected += embeddingHistory.filter(h => !h.accepted).length;

    const entropy = packet.telemetry.embeddingEntropyScore ?? 0;
    const visualEntropy =
      (packet.telemetry as { visualEntropyScore?: number }).visualEntropyScore ?? 0;
    const pressureEntropy = Math.max(entropy, visualEntropy);
    stats.entropyStats.averageEntropy += pressureEntropy;
    if (pressureEntropy > stats.entropyStats.maxEntropy) {
      stats.entropyStats.maxEntropy = pressureEntropy;
    }

    // Formalized Entropy Resistance Calculation
    // Pressure case = embedding or visual entropy, or multimodal arbitration under uncertainty
    const mmTel = (packet.telemetry as { multimodalArbitration?: { arbitrationAttempted?: boolean } })
      .multimodalArbitration;
    const taggedPressure =
      testCase.pressureCase ||
      testCase.benchmarkTags?.includes("entropy_pressure") ||
      /^(ent-|vis-|arb-|press-)/.test(testCase.id);

    if (
      pressureEntropy > 0.003 ||
      mmTel?.arbitrationAttempted ||
      taggedPressure
    ) {
      stats.entropyStats.entropyPressureCases++;
      if (evaluation.canonicalCorrect && evaluation.franchiseCorrect) {
        stats.entropyStats.entropyResilientResolutions++;
      }
    }

    if (pressureEntropy > 0.05) {
      stats.entropyStats.entropyHotspots.push(testCase.query);
    }

    const mmTelemetry = (packet.telemetry as { multimodalArbitration?: {
      arbitrationAttempted?: boolean;
      difficultCase?: boolean;
      acceptedUnderUncertainty?: boolean;
      resolutionCourage?: number;
    } }).multimodalArbitration;

    if (mmTelemetry?.difficultCase) {
      stats.resolutionCourageStats.difficultMultimodalCases++;
    }
    if (mmTelemetry?.arbitrationAttempted) {
      stats.resolutionCourageStats.courageousAttempts++;
    }
    if (mmTelemetry?.acceptedUnderUncertainty) {
      stats.resolutionCourageStats.acceptedUnderUncertainty++;
    }

    const multimodalHistory =
      packet.telemetry.candidateHistory?.filter(
        (h) => h.stage === "embedding_neighbor" || h.stage === "cross_modal_arbitration"
      ) || [];

    multimodalHistory.forEach((d) => {
      if (d.modality === "image" || d.stage === "cross_modal_arbitration") {
        stats.crossModalStats.proposed++;
      }

      const unsafe = isUnsafeMultimodalAccept(d, testCase.expected, testCase.query);
      if (d.accepted && unsafe) {
        stats.crossModalStats.unsafeAcceptances++;
        if (d.governanceFailureType === "continuity_conflict") {
          stats.crossModalStats.continuityBreaches++;
        }
      } else if (!d.accepted || (d.accepted && !unsafe)) {
        if (d.modality === "image" || d.stage === "cross_modal_arbitration") {
          stats.crossModalStats.safeDecisions++;
        }
        if (!d.accepted && d.modality === "image") {
          stats.crossModalStats.rejected++;
        }
      }

      if (
        !d.accepted &&
        (d.governanceFailureType === "visual_archetype_collision" ||
          d.governanceFailureType === "silhouette_ambiguity")
      ) {
        stats.crossModalStats.collisions.push({
          query: testCase.query,
          candidate: d.candidate,
          reason: d.reason,
        });
      }
    });

    const dangerous = packet.telemetry.candidateHistory?.filter(
      (h) => h.stage === "embedding_neighbor" && !h.accepted
    ) || [];
    dangerous.forEach((d) => {
      const failType = d.governanceFailureType ?? "unknown";
      stats.failureHotspots[failType] = (stats.failureHotspots[failType] || 0) + 1;

      if (stats.dangerousNeighbors.length < 20) {
        stats.dangerousNeighbors.push({
          candidate: d.candidate,
          reason: d.reason,
          entropy: (d.entropySource as string) ?? "none",
        });
      }
    });

    if (
      testCase.expected.continuity &&
      packet.continuity &&
      packet.continuity !== testCase.expected.continuity &&
      packet.telemetry.embeddingAccepted
    ) {
      stats.crossModalStats.continuityBreaches++;
    }

    if (evaluation.continuityCorrect) stats.topologyStats.continuityAccuracy++;
    if (packet.telemetry.inheritanceDepth > 0 || packet.telemetry.groundingType === "topology") stats.topologyStats.inheritanceHits++;
    if (packet.telemetry.qualifiedId && testCase.query.includes("::")) stats.topologyStats.qualifiedHits++;
    stats.topologyStats.totalInheritanceDepth += packet.telemetry.inheritanceDepth;

    if (packet.confidence >= 0.9 && !evaluation.canonicalCorrect) {
      stats.falseConfidenceCount++;
    }

    // Individual Case Logging
    const status = passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    const gType = packet.telemetry.groundingType === "topology" ? "\x1b[35m[MOD]\x1b[0m" : packet.telemetry.groundingType === "registry" ? "\x1b[36m[REG]\x1b[0m" : "\x1b[33m[HEU]\x1b[0m";
    console.log(`[${testCase.id}] ${status} ${gType} | Query: "${testCase.query}" (${testCase.lens}) -> "${packet.canonicalEntity}"`);
    if (packet.telemetry.qualifiedId) console.log(`    Qualified ID: ${packet.telemetry.qualifiedId} (Depth: ${packet.telemetry.inheritanceDepth})`);
    if (packet.continuity) console.log(`    Continuity: ${packet.continuity} (${packet.telemetry.continuityType})`);
    if (packet.universe) console.log(`    Universe: ${packet.universe}`);
    if (!passed) {
      console.log(`    Expected: "${testCase.expected.canonicalEntity}" | Franchise: "${testCase.expected.franchise}"`);
      console.log(`    Failures: ${failures.join(", ")}`);
    }
  }

  // Finalize Stats
  stats.canonicalAccuracy = (stats.canonicalAccuracy / stats.total) * 100;
  stats.franchiseAccuracy = (stats.franchiseAccuracy / stats.total) * 100;
  stats.lensAccuracy = (stats.lensAccuracy / stats.total) * 100;
  stats.entityTypeAccuracy = (stats.entityTypeAccuracy / stats.total) * 100;
  
  stats.averageConfidence = stats.averageConfidence / stats.total;
  stats.averageGroundingConfidence.authoritative /= stats.total;
  stats.averageGroundingConfidence.inferred /= stats.total;
  stats.averageGroundingConfidence.embeddingRecall /= stats.total;
  stats.averageGroundingConfidence.topology /= stats.total;
  stats.averageGroundingConfidence.lens /= stats.total;
  stats.averageGroundingConfidence.continuity /= stats.total;

  stats.normalizationStats.legacyPassRate =
    (stats.normalizationStats.legacyPassed / stats.total) * 100;
  stats.normalizationStats.normalizedPassRate =
    (stats.normalizationStats.normalizedPassed / stats.total) * 100;
  if (stats.groundingMetrics.evaluatedCases > 0) {
    stats.groundingMetrics.intentGroundingSuccessRate =
      (stats.groundingMetrics.matchedCases / stats.groundingMetrics.evaluatedCases) * 100;
    stats.groundingMetrics.ambiguityResolutionEfficiency =
      (stats.groundingMetrics.guidedBehaviorHits / stats.groundingMetrics.evaluatedCases) * 100;
    stats.groundingMetrics.namespacePurityScore =
      (stats.groundingMetrics.conflictFreeCases / stats.groundingMetrics.evaluatedCases) * 100;
    stats.groundingMetrics.canonicalSelectionStability =
      (stats.groundingMetrics.stableCases / stats.groundingMetrics.evaluatedCases) * 100;
  }

  printReport(stats, results);
}

function printReport(stats: AggregateStats, results: BenchmarkResult[]) {
  console.log("\n=====================================");
  console.log("FINAL BENCHMARK REPORT");
  console.log("=====================================");
  console.log(`Total Cases: ${stats.total}`);
  console.log(`Overall Pass Rate (normalized): ${((stats.passed / stats.total) * 100).toFixed(1)}%`);
  console.log("-------------------------------------");
  console.log("BENCHMARK NORMALIZATION (Phase 8B):");
  console.log(`- Legacy Pass Rate:      ${stats.normalizationStats.legacyPassRate.toFixed(1)}%`);
  console.log(`- Normalized Pass Rate:  ${stats.normalizationStats.normalizedPassRate.toFixed(1)}%`);
  console.log(`- Noise Reduced (fixes): ${stats.normalizationStats.evaluationNoiseReduced} cases`);
  console.log(`- Pressure Case Tags:    ${stats.pressureCaseCount}`);
  console.log("-------------------------------------");
  console.log(`Canonical Accuracy:  ${stats.canonicalAccuracy.toFixed(1)}%`);
  console.log(`Franchise Accuracy:  ${stats.franchiseAccuracy.toFixed(1)}%`);
  console.log(`Lens Accuracy:       ${stats.lensAccuracy.toFixed(1)}%`);
  console.log(`Entity Type Accuracy: ${stats.entityTypeAccuracy.toFixed(1)}%`);
  console.log("-------------------------------------");
  console.log(`Average Confidence:  ${(stats.averageConfidence * 100).toFixed(1)}%`);
  console.log(`  - Authoritative:   ${(stats.averageGroundingConfidence.authoritative * 100).toFixed(1)}%`);
  console.log(`  - Inferred (ML):   ${(stats.averageGroundingConfidence.inferred * 100).toFixed(1)}%`);
  console.log(`  - Embed Recall:    ${(stats.averageGroundingConfidence.embeddingRecall * 100).toFixed(1)}%`);
  console.log(`False Confidences:   ${stats.falseConfidenceCount} (High confidence, wrong identity)`);
  console.log("-------------------------------------");
  if (stats.groundingMetrics.evaluatedCases > 0) {
    console.log("CANONICAL GROUNDING (Phase 8D):");
    console.log(`- IntentGroundingSuccessRate: ${(stats.groundingMetrics.intentGroundingSuccessRate).toFixed(1)}%`);
    console.log(`- AmbiguityResolutionEfficiency: ${(stats.groundingMetrics.ambiguityResolutionEfficiency).toFixed(1)}%`);
    console.log(`- NamespacePurityScore: ${(stats.groundingMetrics.namespacePurityScore).toFixed(1)}%`);
    console.log(`- CanonicalSelectionStability: ${(stats.groundingMetrics.canonicalSelectionStability).toFixed(1)}%`);
    console.log("-------------------------------------");
  }
  console.log("GROUNDING TELEMETRY:");
  console.log(`- Registry Hits:     ${stats.groundingTypeDistribution.registry}`);
  console.log(`- Heuristic Fallback: ${stats.groundingTypeDistribution.heuristic}`);
  console.log(`- Generic Fallback:   ${stats.groundingTypeDistribution.fallback}`);
  console.log(`- Self-Referential:  ${stats.selfReferentialCount}`);
  console.log("-------------------------------------");
  console.log("TOPOLOGY METRICS:");
  console.log(`- Continuity Accuracy: ${((stats.topologyStats.continuityAccuracy / stats.total) * 100).toFixed(1)}%`);
  console.log(`- Inheritance Usage:  ${((stats.topologyStats.inheritanceHits / stats.total) * 100).toFixed(1)}%`);
  console.log(`- ML Expansion Hits:  ${stats.topologyStats.expansionHits}`);
  console.log(`- ML Rejections:      ${stats.topologyStats.expansionRejections}`);
  console.log(`- Coverage Density:   ${(((stats.groundingTypeDistribution.topology) / stats.total) * 100).toFixed(1)}%`);
  
  const govScore = stats.topologyStats.topologyInvalidNeighborsProposed > 0 
    ? (stats.topologyStats.topologyInvalidNeighborsRejected / stats.topologyStats.topologyInvalidNeighborsProposed) 
    : 1.0;
  console.log(`- semanticGovernancePreservationScore: ${(govScore * 100).toFixed(1)}%`);
  console.log(`  (Rejected ${stats.topologyStats.topologyInvalidNeighborsRejected} / ${stats.topologyStats.topologyInvalidNeighborsProposed} proposed neighbors)`);
  
  console.log("-------------------------------------");
  console.log("ENTROPY & RESILIENCE (Phase 7.5):");
  const entropyResistance = stats.entropyStats.entropyPressureCases > 0
    ? (stats.entropyStats.entropyResilientResolutions / stats.entropyStats.entropyPressureCases)
    : 1.0;

  console.log(`- Formalized EntropyResistance: ${(entropyResistance * 100).toFixed(1)}%`);
  console.log(`  (${stats.entropyStats.entropyResilientResolutions} resilient / ${stats.entropyStats.entropyPressureCases} pressure cases)`);
  console.log(`- Avg Entropy Score:            ${(stats.entropyStats.averageEntropy / stats.total).toFixed(3)}`);
  console.log(`- Max Entropy Burst:            ${stats.entropyStats.maxEntropy.toFixed(3)}`);

  console.log("-------------------------------------");
  console.log("CROSS-MODAL GOVERNANCE (Phase 8A):");
  const gpsDenom =
    stats.crossModalStats.safeDecisions + stats.crossModalStats.unsafeAcceptances;
  const crossModalGps =
    gpsDenom > 0
      ? stats.crossModalStats.safeDecisions / gpsDenom
      : 1.0;
  console.log(`- CrossModalGPS:               ${(crossModalGps * 100).toFixed(1)}%`);
  console.log(`  (safe ${stats.crossModalStats.safeDecisions} / unsafe ${stats.crossModalStats.unsafeAcceptances})`);
  console.log(`- Continuity Breaches:         ${stats.crossModalStats.continuityBreaches}`);
  console.log(`- Visual Archetype Collisions: ${stats.crossModalStats.collisions.length}`);

  const resolutionCourage =
    stats.resolutionCourageStats.difficultMultimodalCases > 0
      ? stats.resolutionCourageStats.courageousAttempts /
        stats.resolutionCourageStats.difficultMultimodalCases
      : 0;
  console.log("-------------------------------------");
  console.log("RESOLUTION COURAGE (Phase 8A):");
  console.log(`- ResolutionCourage:           ${(resolutionCourage * 100).toFixed(1)}%`);
  console.log(
    `  (${stats.resolutionCourageStats.courageousAttempts} attempts / ${stats.resolutionCourageStats.difficultMultimodalCases} difficult cases)`
  );
  console.log(
    `- Accepted Under Uncertainty:  ${stats.resolutionCourageStats.acceptedUnderUncertainty}`
  );

  const phase8aCases = results.filter((r) =>
    /^(ent-|vis-|arb-)/.test(r.caseId)
  );
  const phase8aPressure = phase8aCases.filter((r) => {
    const score =
      (r.actual.telemetry as { embeddingEntropyScore?: number }).embeddingEntropyScore ?? 0;
    return score > 0;
  });
  const phase8aResilient = phase8aPressure.filter(
    (r) => r.evaluation.canonicalCorrect && r.evaluation.franchiseCorrect
  );
  if (phase8aPressure.length > 0) {
    console.log("-------------------------------------");
    console.log("PHASE 8A SLICE (ent-* + vis-* + arb-*):");
    console.log(
      `- EntropyResistance: ${((phase8aResilient.length / phase8aPressure.length) * 100).toFixed(1)}% (${phase8aResilient.length}/${phase8aPressure.length})`
    );
    const phase8aPassed = phase8aCases.filter((r) => r.passed).length;
    console.log(
      `- Pass rate: ${((phase8aPassed / phase8aCases.length) * 100).toFixed(1)}% (${phase8aPassed}/${phase8aCases.length})`
    );
  }
  
  if (stats.crossModalStats.collisions.length > 0) {
    console.log("  Top Visual Hotspots:");
    stats.crossModalStats.collisions.slice(0, 3).forEach(c => {
      console.log(`  * "${c.query}" -> ${c.candidate} (${c.reason.slice(0, 40)}...)`);
    });
  }

  console.log("-------------------------------------");
  console.log("GOVERNANCE FAILURE HOTSPOTS:");
  Object.entries(stats.failureHotspots)
    .sort(([, a], [, b]) => b - a)
    .forEach(([type, count]) => {
      console.log(`- ${type.padEnd(25)}: ${count}`);
    });
  console.log("-------------------------------------");
  console.log("TOP DANGEROUS NEIGHBORS (REJECTED):");
  stats.dangerousNeighbors.slice(0, 5).forEach(n => {
    console.log(`- [${n.entropy}] ${n.candidate}: ${n.reason.slice(0, 60)}...`);
  });
  console.log("-------------------------------------");
  console.log("TOP FAILURE CATEGORIES:");
  
  Object.entries(stats.failureDistribution)
    .sort(([, a], [, b]) => b - a)
    .filter(([, count]) => count > 0)
    .forEach(([fail, count]) => {
      console.log(`- ${fail}: ${count}`);
    });

  console.log("\nWORST PERFORMING QUERIES:");
  results.filter(r => !r.passed).slice(0, 5).forEach(r => {
    console.log(`- ${r.query} (${r.lens}): ${r.failures.join(", ")}`);
  });

  console.log("\n[SYSTEM VERDICT]");
  if (stats.canonicalAccuracy > 90) console.log("Reliability: PRODUCTION READY");
  else if (stats.canonicalAccuracy > 75) console.log("Reliability: STABLE BUT NEEDS GROUNDING");
  else console.log("Reliability: FRAGILE - RERANKING REQUIRED");
  console.log("=====================================\n");
}

// Execute
runBenchmark().catch(console.error);
