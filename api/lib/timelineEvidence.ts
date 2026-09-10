import type { TimelineMediaType } from "../../src/lib/timelineTypes.js";

export type TimelineNarrativeSource = "wikipedia_plot" | "tmdb_overview" | "tmdb_season_overview" | "none";

export type TimelineEvidence = {
  source: TimelineNarrativeSource;
  text: string;
  priority: number;
  pageTitle?: string;
  pageUrl?: string;
  rejectionReason?: string;
};

export type TimelineEvidenceInput = {
  title: string;
  originalTitle?: string | null;
  year: number | null;
  mediaType: TimelineMediaType;
  overview?: string | null;
  seasonNumber?: number | null;
  seasonName?: string | null;
};

export type TimelineEvidenceResult = {
  evidence: TimelineEvidence;
  reason: string;
  pageTitle?: string;
};

type MediaWikiSearchResult = {
  title?: unknown;
  snippet?: unknown;
};

type MediaWikiSection = {
  line?: unknown;
  index?: unknown;
  level?: unknown;
};

type MediaWikiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type MediaWikiClientOptions = {
  fetchImpl?: MediaWikiFetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
  baseDelayMs?: number;
  userAgent?: string;
};

type CandidateScore = {
  title: string;
  score: number;
  exactTitle: boolean;
  titleOverlap: number;
  yearMatch: boolean;
  mediaTypeMatch: boolean;
  seasonMatch: boolean;
  baseTitleMatch: boolean;
  rejectedReason?: string;
};

const API_URL = "https://en.wikipedia.org/w/api.php";
const DEFAULT_USER_AGENT = "NerdVana-Timeline/1.0 (MediaWiki narrative evidence)";
const NARRATIVE_HEADINGS = new Set(["plot", "synopsis", "story"]);
const PREMISE_HEADING = "premise";
const MIN_PREMISE_CHARACTERS = 1200;
const MIN_PREMISE_PARAGRAPHS = 2;
const MAX_NARRATIVE_CHARACTERS = 16000;
const MAX_SEARCH_RESULTS = 8;
const MAX_CANDIDATES_TO_INSPECT = 4;
const MAX_RETRIES = 2;
const MAX_BACKOFF_MS = 2000;
const FORBIDDEN_TITLE_PATTERN = /\b(comic book|soundtrack|album|character(?:s)?|episode(?:s)?|franchise|season|novel|manga|game|disambiguation)\b|\b(list of|chronology of)\b/i;

const STOP_WORDS = new Set(["the", "a", "an", "of", "in", "on", "and", "or"]);

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function overlap(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

function yearFromText(value: string): number | null {
  const match = value.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function mediaTypeMatches(text: string, mediaType: TimelineMediaType): boolean {
  if (mediaType === "tv") {
    return /television series|tv series|television show|american television/i.test(text);
  }
  return /film|movie/i.test(text);
}

function titleIsForbidden(title: string): boolean {
  return FORBIDDEN_TITLE_PATTERN.test(title);
}

function buildUrl(params: Record<string, string>): string {
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function retryDelay(response: Response, attempt: number, baseDelayMs: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(MAX_BACKOFF_MS, retryAfter * 1000);
  }
  return Math.min(MAX_BACKOFF_MS, baseDelayMs * (attempt + 1));
}

async function fetchJson(
  url: string,
  options: Required<Pick<MediaWikiClientOptions, "fetchImpl" | "sleep" | "maxRetries" | "baseDelayMs" | "userAgent">>,
): Promise<any> {
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const response = await options.fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "User-Agent": options.userAgent,
      },
    });

    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === options.maxRetries) {
      throw new Error(`mediawiki_http_${response.status}`);
    }

    await options.sleep(retryDelay(response, attempt, options.baseDelayMs));
  }

  throw new Error("mediawiki_retry_exhausted");
}

function cleanWikitext(value: string): string {
  return value
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<ref[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/>/gi, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1")
    .replace(/''+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*[|*!].*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphsFromWikitext(value: string): string[] {
  return value
    .split(/\n\s*\n+/)
    .map(cleanWikitext)
    .filter((paragraph) => paragraph.length >= 80);
}

function selectSection(
  sections: MediaWikiSection[],
  wikitext: string,
): { heading: string; text: string; paragraphs: string[] } | null {
  const candidate = sections.find((section) => {
    const heading = String(section.line ?? "").replace(/<[^>]+>/g, "").trim().toLowerCase();
    return NARRATIVE_HEADINGS.has(heading) || heading === PREMISE_HEADING;
  });
  if (!candidate) return null;

  const heading = String(candidate.line ?? "").replace(/<[^>]+>/g, "").trim();
  const headingLower = heading.toLowerCase();
  const paragraphs = [...wikitext.matchAll(/^={2,6}\s*(.*?)\s*={2,6}\s*$/gm)];
  const start = paragraphs.findIndex((match) => match[1].trim().toLowerCase() === headingLower);
  if (start < 0) return null;

  const currentLevel = paragraphs[start][0].match(/^=+/)?.[0].length ?? 2;
  const endMatch = paragraphs.slice(start + 1).find((match) => {
    const level = match[0].match(/^=+/)?.[0].length ?? currentLevel;
    return level <= currentLevel;
  });
  const end = endMatch?.index ?? wikitext.length;
  const bodyStart = paragraphs[start].index! + paragraphs[start][0].length;
  const body = wikitext.slice(bodyStart, end);
  const bodyParagraphs = paragraphsFromWikitext(body);
  const text = bodyParagraphs.join(" ").slice(0, MAX_NARRATIVE_CHARACTERS).trim();

  if (headingLower === PREMISE_HEADING && (text.length < MIN_PREMISE_CHARACTERS || bodyParagraphs.length < MIN_PREMISE_PARAGRAPHS)) {
    return null;
  }
  if (!text) return null;
  return { heading, text, paragraphs: bodyParagraphs };
}

function scoreCandidate(input: TimelineEvidenceInput, result: MediaWikiSearchResult): CandidateScore {
  const title = String(result.title ?? "").trim();
  const snippet = String(result.snippet ?? "");
  const titleOverlap = overlap(input.title, title);
  const exactTitle = normalize(input.title) === normalize(title);
  const normalizedCandidateTitle = normalize(title);
  const normalizedSeasonName = normalize(input.seasonName ?? `season ${input.seasonNumber ?? ""}`);
  const seasonMatch = input.seasonNumber == null
    ? true
    : normalizedCandidateTitle.includes(`season ${input.seasonNumber}`)
      || (normalizedSeasonName.length > 0 && normalizedCandidateTitle.includes(normalizedSeasonName));
  const baseTitleMatch = normalizedCandidateTitle.includes(normalize(input.title));
  const yearMatch = input.year !== null && (yearFromText(`${title} ${snippet}`) === input.year || snippet.includes(String(input.year)));
  const mediaTypeMatch = mediaTypeMatches(`${title} ${snippet}`, input.mediaType);
  const forbidden = titleIsForbidden(title);
  const score = (exactTitle ? 5 : 0) + titleOverlap * 3 + (yearMatch ? 2 : 0) + (mediaTypeMatch ? 2 : 0) + (seasonMatch && input.seasonNumber != null ? 4 : 0) - (forbidden ? 8 : 0);
  return {
    title,
    score,
    exactTitle,
    titleOverlap,
    yearMatch,
    mediaTypeMatch,
    seasonMatch,
    baseTitleMatch,
    rejectedReason: forbidden ? "forbidden_work_type" : undefined,
  };
}

function candidateIsAcceptable(candidate: CandidateScore, input: TimelineEvidenceInput): boolean {
  if (candidate.rejectedReason || candidate.score < 5) return false;
  if (input.seasonNumber != null) {
    return candidate.seasonMatch && candidate.baseTitleMatch;
  }
  return candidate.titleOverlap >= 0.7
    && (candidate.exactTitle || candidate.titleOverlap >= 0.85);
}

export function normalizeTimelineEvidenceText(value: string): string {
  return cleanWikitext(value).slice(0, MAX_NARRATIVE_CHARACTERS).trim();
}

export function createMediaWikiEvidenceClient(options: MediaWikiClientOptions = {}) {
  const clientOptions: Required<Pick<MediaWikiClientOptions, "fetchImpl" | "sleep" | "maxRetries" | "baseDelayMs" | "userAgent">> = {
    fetchImpl: options.fetchImpl ?? fetch,
    sleep: options.sleep ?? defaultSleep,
    maxRetries: options.maxRetries ?? MAX_RETRIES,
    baseDelayMs: options.baseDelayMs ?? 300,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  };

  return {
    async resolve(input: TimelineEvidenceInput): Promise<TimelineEvidenceResult> {
      const seasonQuery = input.seasonNumber == null ? "" : (input.seasonName || `season ${input.seasonNumber}`);
      const searchQuery = `${input.title} ${seasonQuery} ${input.year ?? ""} ${input.mediaType === "tv" ? "television series" : "film"}`.trim();
      const searchData = await fetchJson(buildUrl({
        action: "query",
        list: "search",
        srsearch: searchQuery,
        srlimit: String(MAX_SEARCH_RESULTS),
        srnamespace: "0",
        format: "json",
        formatversion: "2",
        maxlag: "2",
      }), clientOptions);
      const results = Array.isArray(searchData?.query?.search) ? searchData.query.search : [];
      const candidates = results
        .map((result: MediaWikiSearchResult) => scoreCandidate(input, result))
        .filter((candidate: CandidateScore) => candidateIsAcceptable(candidate, input))
        .sort((left: CandidateScore, right: CandidateScore) => right.score - left.score)
        .slice(0, MAX_CANDIDATES_TO_INSPECT);

      if (!candidates.length) {
        return { evidence: { source: "none", text: "", priority: 0, rejectionReason: "no_acceptable_article_match" }, reason: "no_acceptable_article_match" };
      }
      if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
        return { evidence: { source: "none", text: "", priority: 0, rejectionReason: "ambiguous_article_match" }, reason: "ambiguous_article_match" };
      }

      for (const candidate of candidates) {
        try {
          const parsed = await fetchJson(buildUrl({
            action: "parse",
            page: candidate.title,
            prop: "wikitext|sections|revid",
            format: "json",
            formatversion: "2",
            redirects: "1",
            maxlag: "2",
          }), clientOptions);
          const parsedTitle = String(parsed?.parse?.title ?? candidate.title);
          const parsedSections = Array.isArray(parsed?.parse?.sections) ? parsed.parse.sections : [];
          const wikitext = String(parsed?.parse?.wikitext ?? "");
          const selected = selectSection(parsedSections, wikitext);
          if (!selected) continue;

          return {
            evidence: {
              source: "wikipedia_plot",
              text: selected.text,
              priority: 100,
              pageTitle: parsedTitle,
              pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(parsedTitle.replace(/ /g, "_"))}`,
            },
            reason: `selected_${selected.heading.toLowerCase()}`,
            pageTitle: parsedTitle,
          };
        } catch (error) {
          console.warn("[TIMELINE_NARRATIVE_EVIDENCE_REJECTED]", { title: candidate.title, reason: String(error) });
        }
      }

      return { evidence: { source: "none", text: "", priority: 0, rejectionReason: "no_usable_narrative_section" }, reason: "no_usable_narrative_section" };
    },
  };
}

const defaultClient = createMediaWikiEvidenceClient();

export async function resolveTimelineEvidence(input: TimelineEvidenceInput): Promise<TimelineEvidenceResult> {
  try {
    const result = await defaultClient.resolve(input);
    if (result.evidence.source === "wikipedia_plot") return result;
    if (input.overview?.trim() && input.seasonNumber != null) {
      return {
        evidence: { source: "tmdb_season_overview", text: input.overview.trim(), priority: 60, rejectionReason: result.reason },
        reason: `tmdb_season_fallback_${result.reason}`,
      };
    }
    if (input.overview?.trim()) {
      return {
        evidence: { source: "tmdb_overview", text: input.overview.trim(), priority: 50, rejectionReason: result.reason },
        reason: `wikipedia_fallback_${result.reason}`,
      };
    }
    return { evidence: { source: "none", text: "", priority: 0, rejectionReason: result.reason }, reason: `no_narrative_evidence_${result.reason}` };
  } catch (error) {
    const reason = `wikipedia_request_failed_${String(error).replace(/[^a-z0-9_\-]/gi, "_").slice(0, 80)}`;
    if (input.overview?.trim() && input.seasonNumber != null) {
      return { evidence: { source: "tmdb_season_overview", text: input.overview.trim(), priority: 60, rejectionReason: reason }, reason: `tmdb_season_fallback_${reason}` };
    }
    if (input.overview?.trim()) {
      return { evidence: { source: "tmdb_overview", text: input.overview.trim(), priority: 50, rejectionReason: reason }, reason: `tmdb_fallback_${reason}` };
    }
    return { evidence: { source: "none", text: "", priority: 0, rejectionReason: reason }, reason: `no_narrative_evidence_${reason}` };
  }
}
