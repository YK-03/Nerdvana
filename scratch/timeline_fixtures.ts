import type { TimelineMediaType } from "../src/lib/timelineTypes.js";
import type { TimelineEvidenceResult } from "../api/lib/timelineEvidence.js";

export type TimelineEvaluationCase = {
  id: string;
  title: string;
  providerId: string;
  mediaType: TimelineMediaType;
  year: number;
  category: "strong_movie" | "sparse_movie" | "coverage_challenge" | "tv_structure" | "tv_long_running";
  tmdbTitle: string;
  tmdbOverview: string;
  expectedWikipediaTitle?: string;
  idVerification: string;
};

export type FixtureGeneration = {
  provider: "Fixture";
  model: "phase6a-fixture";
  status: "success" | "provider_failure" | "invalid_response";
  events: Array<{ title: string; description: string }>;
};

function fixtureEvents(title: string, count: number): Array<{ title: string; description: string }> {
  return Array.from({ length: count }, (_, index) => ({
    title: `${title} beat ${index + 1}`,
    description: "Fixture event retained for deterministic pipeline and rubric evaluation; semantic quality requires human review.",
  }));
}

export const TIMELINE_PHASE6A_CASES: TimelineEvaluationCase[] = [
  {
    id: "movie-dark-knight",
    title: "The Dark Knight",
    providerId: "tmdb::movie::155",
    mediaType: "movie",
    year: 2008,
    category: "strong_movie",
    tmdbTitle: "The Dark Knight",
    tmdbOverview: "Batman raises the stakes in his war on crime as the Joker unleashes chaos in Gotham.",
    expectedWikipediaTitle: "The Dark Knight",
    idVerification: "Phase 5B live probe and TMDB public title page",
  },
  {
    id: "movie-inception",
    title: "Inception",
    providerId: "tmdb::movie::27205",
    mediaType: "movie",
    year: 2010,
    category: "strong_movie",
    tmdbTitle: "Inception",
    tmdbOverview: "A skilled thief is offered a chance to regain his old life by implanting an idea in a target's subconscious.",
    expectedWikipediaTitle: "Inception",
    idVerification: "Phase 5B live probe and TMDB public title page",
  },
  {
    id: "movie-godfather",
    title: "The Godfather",
    providerId: "tmdb::movie::238",
    mediaType: "movie",
    year: 1972,
    category: "strong_movie",
    tmdbTitle: "The Godfather",
    tmdbOverview: "A chronicle of the Corleone crime family and Michael's rise into its violent power struggle.",
    expectedWikipediaTitle: "The Godfather",
    idVerification: "Phase 5B live probe and TMDB public title page",
  },
  {
    id: "movie-fight-club",
    title: "Fight Club",
    providerId: "tmdb::movie::550",
    mediaType: "movie",
    year: 1999,
    category: "strong_movie",
    tmdbTitle: "Fight Club",
    tmdbOverview: "An insomniac and a soap salesman create an underground fight club that spirals out of control.",
    expectedWikipediaTitle: "Fight Club",
    idVerification: "TMDB public title page",
  },
  {
    id: "movie-vast-of-night",
    title: "The Vast of Night",
    providerId: "tmdb::movie::565743",
    mediaType: "movie",
    year: 2019,
    category: "sparse_movie",
    tmdbTitle: "The Vast of Night",
    tmdbOverview: "Two radio-obsessed teens discover a strange frequency over the airwaves during one important night.",
    expectedWikipediaTitle: "The Vast of Night",
    idVerification: "TMDB search result verified; supersedes stale Phase 5B ID 565028, which is Candyman",
  },
  {
    id: "movie-coherence",
    title: "Coherence",
    providerId: "tmdb::movie::220289",
    mediaType: "movie",
    year: 2014,
    category: "sparse_movie",
    tmdbTitle: "Coherence",
    tmdbOverview: "Four couples gather for dinner as a mysterious comet passes overhead.",
    expectedWikipediaTitle: "Coherence",
    idVerification: "TMDB public title page",
  },
  {
    id: "movie-primer",
    title: "Primer",
    providerId: "tmdb::movie::14337",
    mediaType: "movie",
    year: 2004,
    category: "sparse_movie",
    tmdbTitle: "Primer",
    tmdbOverview: "Fledgling inventors discover a complex method to manipulate reality, with consequences that catch up to them.",
    expectedWikipediaTitle: "Primer",
    idVerification: "TMDB public title page",
  },
  {
    id: "movie-battery",
    title: "The Battery",
    providerId: "tmdb::movie::177221",
    mediaType: "movie",
    year: 2012,
    category: "coverage_challenge",
    tmdbTitle: "The Battery",
    tmdbOverview: "Two baseball players try to survive a zombie plague while disagreeing about whom to trust.",
    idVerification: "TMDB public title page",
  },
  {
    id: "tv-breaking-bad",
    title: "Breaking Bad",
    providerId: "tmdb::tv::1396",
    mediaType: "tv",
    year: 2008,
    category: "tv_structure",
    tmdbTitle: "Breaking Bad",
    tmdbOverview: "A chemistry teacher diagnosed with cancer enters the dangerous world of drugs and crime.",
    expectedWikipediaTitle: "Breaking Bad",
    idVerification: "Phase 5B live probe and TMDB public title page",
  },
  {
    id: "tv-walking-dead",
    title: "The Walking Dead",
    providerId: "tmdb::tv::1402",
    mediaType: "tv",
    year: 2010,
    category: "tv_long_running",
    tmdbTitle: "The Walking Dead",
    tmdbOverview: "A sheriff's deputy awakens in a zombie-dominated world and searches for his family and other survivors.",
    expectedWikipediaTitle: "The Walking Dead (TV series)",
    idVerification: "Phase 5B live probe and TMDB public title page",
  },
  {
    id: "tv-sopranos",
    title: "The Sopranos",
    providerId: "tmdb::tv::1398",
    mediaType: "tv",
    year: 1999,
    category: "tv_structure",
    tmdbTitle: "The Sopranos",
    tmdbOverview: "A New Jersey mobster balances family life with leadership of the criminal organization he heads.",
    expectedWikipediaTitle: "The Sopranos",
    idVerification: "TMDB public title page",
  },
  {
    id: "tv-greys-anatomy",
    title: "Grey's Anatomy",
    providerId: "tmdb::tv::1416",
    mediaType: "tv",
    year: 2005,
    category: "tv_long_running",
    tmdbTitle: "Grey's Anatomy",
    tmdbOverview: "The personal and professional lives of doctors at Seattle's Grey Sloan Memorial Hospital.",
    expectedWikipediaTitle: "Grey's Anatomy",
    idVerification: "TMDB public title page",
  },
];

export const DETERMINISTIC_FIXTURE_EVIDENCE: Record<string, TimelineEvidenceResult> = Object.fromEntries(
  TIMELINE_PHASE6A_CASES.map((item) => [item.id, {
    evidence: {
      source: item.category === "coverage_challenge" ? "tmdb_overview" : "wikipedia_plot",
      text: `Deterministic narrative fixture for ${item.title}; source coverage and semantic event quality require review against the live evidence result.`,
      priority: item.category === "coverage_challenge" ? 50 : 100,
      pageTitle: item.expectedWikipediaTitle,
      rejectionReason: item.category === "coverage_challenge" ? "fixture_coverage_challenge" : undefined,
    },
    reason: item.category === "coverage_challenge" ? "tmdb_fallback_fixture_coverage_challenge" : "fixture_selected_plot",
    pageTitle: item.expectedWikipediaTitle,
  } satisfies TimelineEvidenceResult]),
);

export const DETERMINISTIC_FIXTURE_GENERATION: Record<string, FixtureGeneration> = Object.fromEntries(
  TIMELINE_PHASE6A_CASES.map((item) => [item.id, {
    provider: "Fixture",
    model: "phase6a-fixture",
    status: "success",
    events: fixtureEvents(item.title, item.category === "coverage_challenge" ? 1 : item.mediaType === "tv" ? 2 : 3),
  } satisfies FixtureGeneration]),
);