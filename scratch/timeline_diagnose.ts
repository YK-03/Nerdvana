import { readFile, writeFile } from "node:fs/promises";
import { DETERMINISTIC_FIXTURE_GENERATION, TIMELINE_PHASE6A_CASES } from "./timeline_phase6a_fixtures.js";

const OUTPUT_PATH = "scratch/timeline_phase6c_diagnosis.json";

type Diagnosis = "INSUFFICIENT_EVIDENCE" | "PROMPT_OVERVIEW_BIAS" | "EXCESSIVE_CONSERVATISM" | "POOR_COMPRESSION" | "MISSING_CLIMAX_ENDING" | "CORRECT_ABSTENTION" | "NEEDS_REAL_PROVIDER_DATA";

type ControlledEvent = {
  title: string;
  description: string;
  support: "supported" | "inferred";
  phase: "setup" | "escalation" | "reversal" | "climax" | "resolution" | "unknown";
};

type CaseResult = {
  id: string;
  title: string;
  mediaType: "movie" | "tv";
  evidenceSource: string;
  evidenceCharacters: number | null;
  evidenceRichness: "rich" | "moderate" | "sparse" | "none" | "unknown";
  controlledGeneration: {
    fixtureKind: "rich_movie_undercompressed" | "rich_tv_undercompressed" | "sparse_appropriate" | "fallback_appropriate";
    eventCount: number;
    events: ControlledEvent[];
  };
  assessment: {
    distinctness: "PASS" | "NEEDS_HUMAN_REVIEW";
    chronology: "PASS" | "NEEDS_HUMAN_REVIEW";
    progression: "NEEDS_HUMAN_REVIEW";
    majorReversals: "NEEDS_HUMAN_REVIEW";
    climax: "NEEDS_HUMAN_REVIEW";
    ending: "NEEDS_HUMAN_REVIEW";
    unsupportedClaims: "PASS" | "NEEDS_HUMAN_REVIEW";
    conservativeCount: "APPROPRIATE_HYPOTHESIS" | "POSSIBLE_OVER_COMPRESSION" | "NEEDS_HUMAN_REVIEW";
  };
  likelyFailureModes: Diagnosis[];
  confidence: "controlled_hypothesis" | "observed_evidence_only";
};

function richness(source: string, characters: number | null): CaseResult["evidenceRichness"] {
  if (source === "none" || !characters) return source === "none" ? "none" : "unknown";
  if (characters >= 2500) return "rich";
  if (characters >= 1200) return "moderate";
  return "sparse";
}

function phase6aById(value: any): Map<string, any> {
  return new Map((value.results ?? []).map((result: any) => [result.id, result]));
}

function makeEvents(title: string, phases: ControlledEvent["phase"][]): ControlledEvent[] {
  return phases.map((phase, index) => ({
    title: `${title} controlled beat ${index + 1}`,
    description: phase === "unknown" ? "A broad premise-level event with no explicit evidence span." : `A controlled ${phase} event used to test evidence-to-event coverage.`,
    support: phase === "unknown" ? "inferred" : "supported",
    phase,
  }));
}

function controlledFixture(item: typeof TIMELINE_PHASE6A_CASES[number], source: string, characters: number | null): {
  fixtureKind: "rich_movie_undercompressed" | "rich_tv_undercompressed" | "sparse_appropriate" | "fallback_appropriate";
  events: ControlledEvent[];
} {
  const rich = characters !== null && characters >= 2500 && source === "wikipedia_plot";
  const fallback = source === "tmdb_overview" || source === "none";
  const fixtureKind = rich
    ? item.mediaType === "tv" ? "rich_tv_undercompressed" : "rich_movie_undercompressed"
    : fallback ? "fallback_appropriate" : "sparse_appropriate";
  const phases = rich
    ? item.mediaType === "tv" ? ["setup", "escalation"] as const : ["setup", "escalation", "reversal"] as const
    : fallback ? ["setup"] as const : ["setup", "escalation"] as const;
  const events = makeEvents(item.title, [...phases]);
  return { fixtureKind, events };
}

async function main() {
  const phase6a = JSON.parse(await readFile("scratch/timeline_phase6a_results.json", "utf8"));
  const phase6b = JSON.parse(await readFile("scratch/timeline_phase6b_multisection_results.json", "utf8"));
  const phase6aMap = phase6aById(phase6a);
  const phase6bMap = new Map((phase6b.results ?? []).map((result: any) => [result.id, result]));
  const results: CaseResult[] = [];

  for (const item of TIMELINE_PHASE6A_CASES) {
    const live = phase6aMap.get(item.id);
    const evidenceSource = live?.evidence?.source ?? "unknown";
    const evidenceCharacters = typeof live?.evidence?.characterCount === "number" ? live.evidence.characterCount : null;
    const fixture = controlledFixture(item, evidenceSource, evidenceCharacters);
    const rich = fixture.fixtureKind === "rich_movie_undercompressed" || fixture.fixtureKind === "rich_tv_undercompressed";
    const undercompressed = rich && fixture.events.length <= 3;
    const inferred = fixture.events.some((event) => event.support === "inferred");
    const likelyFailureModes: Diagnosis[] = [];
    if (fixture.fixtureKind === "fallback_appropriate") likelyFailureModes.push("CORRECT_ABSTENTION");
    if (undercompressed) {
      likelyFailureModes.push("POOR_COMPRESSION", "EXCESSIVE_CONSERVATISM");
      likelyFailureModes.push("PROMPT_OVERVIEW_BIAS");
    }
    if (!likelyFailureModes.length) likelyFailureModes.push("NEEDS_REAL_PROVIDER_DATA");

    results.push({
      id: item.id,
      title: item.title,
      mediaType: item.mediaType,
      evidenceSource,
      evidenceCharacters,
      evidenceRichness: richness(evidenceSource, evidenceCharacters),
        controlledGeneration: {
          fixtureKind: fixture.fixtureKind,
        eventCount: fixture.events.length,
        events: fixture.events,
      },
      assessment: {
        distinctness: "NEEDS_HUMAN_REVIEW",
        chronology: "NEEDS_HUMAN_REVIEW",
        progression: "NEEDS_HUMAN_REVIEW",
        majorReversals: "NEEDS_HUMAN_REVIEW",
        climax: "NEEDS_HUMAN_REVIEW",
        ending: "NEEDS_HUMAN_REVIEW",
        unsupportedClaims: inferred ? "NEEDS_HUMAN_REVIEW" : "PASS",
        conservativeCount: fixture.fixtureKind === "fallback_appropriate" ? "APPROPRIATE_HYPOTHESIS" : undercompressed ? "POSSIBLE_OVER_COMPRESSION" : "NEEDS_HUMAN_REVIEW",
      },
      likelyFailureModes,
      confidence: "controlled_hypothesis",
    });

    const multi: any = phase6bMap.get(item.id);
    if (multi?.comparison === "ADDITIONAL_MATERIAL_GAINED") {
      results[results.length - 1].likelyFailureModes = ["INSUFFICIENT_EVIDENCE", "NEEDS_REAL_PROVIDER_DATA"];
    }
  }

  const richCases = results.filter((result) => result.evidenceRichness === "rich");
  const sparseCases = results.filter((result) => result.evidenceRichness === "sparse" || result.evidenceRichness === "none");
  const hasRealGeneration = phase6a.results.some((result: any) => result.generation?.status === "success");
  const promptFinding = "prompt-v3 says descriptions should be grounded in the overview even when NARRATIVE_EVIDENCE is Wikipedia text; this is a plausible overview-bias contributor, but it is not isolated by the available provider-free run.";
  const decision = hasRealGeneration ? "PROMPT_CHANGE_JUSTIFIED" : "NEEDS_REAL_PROVIDER_DATA";

  const output = {
    generatedAt: new Date().toISOString(),
    phase: "6C",
    mode: "deterministic_controlled_hypotheses",
    decision,
    promptFinding,
    providerDataAvailable: hasRealGeneration,
    method: {
      evidence: "Phase 6A live evidence metrics",
      generation: "Existing Phase 6A deterministic fixture counts mapped to controlled rich/sparse scenarios",
      semanticJudgments: "NEEDS_HUMAN_REVIEW",
      fixedEventTarget: false,
    },
    comparison: {
      richMovieCases: richCases.map((result) => result.id),
      richTvCases: results.filter((result) => result.evidenceRichness === "rich" && result.mediaType === "tv").map((result) => result.id),
      sparseOrFallbackCases: sparseCases.map((result) => result.id),
      richCaseHypothesis: richCases.some((result) => result.likelyFailureModes.includes("POOR_COMPRESSION")) ? "Rich evidence plus short controlled output is consistent with under-compression, but not proof of model behavior." : "No controlled under-compression signal.",
      sparseCaseHypothesis: sparseCases.every((result) => result.likelyFailureModes.includes("CORRECT_ABSTENTION")) ? "Short output is consistent with correct abstention when evidence is sparse." : "Needs review.",
    },
    results,
    limitations: [
      "No real provider generation was available in Phase 6A, so this run cannot prove prompt/model behavior.",
      "Phase 6A stored no raw narrative sections, so multi-section evidence gains remain unverified.",
      "Climax, ending, chronology, progression, and unsupported-claim judgments require human evidence-span review.",
    ],
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Phase 6C diagnosis: rich cases ${richCases.length} | sparse/fallback ${sparseCases.length} | provider generation ${hasRealGeneration ? "available" : "unavailable"}`);
  console.log(`Prompt-v3 finding: overview wording is a plausible bias; provider isolation is ${hasRealGeneration ? "possible" : "not possible"}.`);
  console.log(`Decision: ${decision}`);
  console.log(`Machine-readable results: ${OUTPUT_PATH}`);
}

await main();