import { resolveTimelineEvidence } from "../api/lib/timelineEvidence.js";

const cases = [
  { title: "The Dark Knight", tmdbId: "155", mediaType: "movie" as const, year: 2008, tmdbOverview: "Batman faces a criminal mastermind who plunges Gotham into anarchy." },
  { title: "Inception", tmdbId: "27205", mediaType: "movie" as const, year: 2010, tmdbOverview: "A thief who steals corporate secrets through dream-sharing technology is given an inverse task." },
  { title: "The Godfather", tmdbId: "238", mediaType: "movie" as const, year: 1972, tmdbOverview: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire." },
  { title: "Breaking Bad", tmdbId: "1396", mediaType: "tv" as const, year: 2008, tmdbOverview: "A chemistry teacher diagnosed with cancer turns to manufacturing methamphetamine." },
  { title: "The Walking Dead", tmdbId: "1402", mediaType: "tv" as const, year: 2010, tmdbOverview: "A group of survivors look for safety and security while also searching for a home." },
  { title: "The Vast of Night", tmdbId: "565028", mediaType: "movie" as const, year: 2019, tmdbOverview: "Two radio DJs uncover a strange audio frequency during one night in the 1950s." },
];

for (const item of cases) {
  try {
    const result = await resolveTimelineEvidence({
      title: item.title,
      year: item.year,
      mediaType: item.mediaType,
      overview: item.tmdbOverview,
    });
    console.log(JSON.stringify({
      title: item.title,
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      year: item.year,
      source: result.evidence.source,
      pageTitle: result.evidence.pageTitle ?? null,
      pageUrl: result.evidence.pageUrl ?? null,
      reason: result.reason,
      characterCount: result.evidence.text.length,
      hasNarrativeEvidence: Boolean(result.evidence.text),
    }));
  } catch (error) {
    console.log(JSON.stringify({
      title: item.title,
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      year: item.year,
      source: "none",
      reason: "probe_error",
      error: String(error).replace(/[^a-z0-9_\-]/gi, "_").slice(0, 100),
    }));
  }
}