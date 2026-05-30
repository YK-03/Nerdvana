# Nerdvana Resolver Benchmark Suite

This suite provides a deterministic evaluation framework for the `canonicalResolver.ts` system. It measures semantic correctness, lens enforcement, and franchise grounding.

## Structure

- `/types`: TypeScript interfaces for cases and results.
- `/cases`: The benchmark dataset (25+ high-ambiguity cases).
- `/runner`: The execution engine and report generator.
- `/reports`: (Reserved for automated report history).

## Running Benchmarks

To run the benchmark suite, use the following command from the project root:

```bash
npx tsx src/benchmark/runner/runResolverBenchmark.ts
```

### Phase 8A — Multimodal arbitration metrics

The runner reports **EntropyResistance**, **CrossModalGPS**, and **ResolutionCourage** for the full suite, plus a slice over `ent-*`, `vis-*`, and `arb-*` cases.

Optional CLIP sandbox (dev dependency `@xenova/transformers`):

```bash
NERDVANA_CLIP_SANDBOX=1 npx tsx src/benchmark/runner/runResolverBenchmark.ts
```

### Phase 8B — Normalized evaluation + pixel sandbox

Evaluation uses **normalized** topology-aware equivalence (legacy pass rate reported for comparison).

```bash
# Real pixel bytes in embedding sandbox
NERDVANA_CLIP_PIXELS=1 npx tsx src/benchmark/runner/runResolverBenchmark.ts

# Production visual-lookup multimodal arbitration (feature-flagged)
NERDVANA_MULTIMODAL_ARBITRATION=1
```

## Failure Categories

- `canonical_mismatch`: The resolver identified the wrong entity ID.
- `franchise_drift`: The entity is correct, but it was grounded to the wrong (or no) franchise.
- `lens_mismatch`: The resolver failed to respect the requested media lens.
- `ambiguity_collapse`: High confidence was reported for a semantically incorrect resolution.
- `low_confidence_resolution`: The resolver's confidence fell below the stability threshold (0.7).
- `entity_type_mismatch`: The resolved entity type does not match the expected intent.

## Purpose

The benchmark allows us to measure the impact of changes to `canonicalResolver.ts` and provides the baseline data needed for future ML-based reranking and calibration.
