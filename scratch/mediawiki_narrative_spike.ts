type MediaType = "movie" | "tv";

type TestCase = {
  requestedTitle: string;
  tmdbId: string;
  mediaType: MediaType;
  year: number;
};

type SearchResult = {
  title: string;
  snippet: string;
  timestamp?: string;
};

type NarrativeResult = {
  requestedTitle: string;
  tmdbId: string;
  expectedMediaType: MediaType;
  expectedYear: number;
  wikipediaTitle: string | null;
  pageUrl: string | null;
  correctMatch: boolean;
  matchConfidence: "high" | "medium" | "low" | "none";
  matchReason: string;
  selectedSection: string | null;
  narrativeCharacterCount: number;
  paragraphCount: number;
  signals: {
    setup: boolean;
    escalation: boolean;
    turningPoint: boolean;
    climax: boolean;
    resolution: boolean;
  };
  tmdbOnlyDefensibleBeats: string;
  wikipediaDefensibleBeats: string;
  improvement: "substantial" | "moderate" | "negligible" | "not_evaluable";
  narrativePreview: string;
  failure?: string;
};

const CASES: TestCase[] = [
  { requestedTitle: "The Dark Knight", tmdbId: "155", mediaType: "movie", year: 2008 },
  { requestedTitle: "Inception", tmdbId: "27205", mediaType: "movie", year: 2010 },
  { requestedTitle: "The Godfather", tmdbId: "238", mediaType: "movie", year: 1972 },
  { requestedTitle: "Breaking Bad", tmdbId: "1396", mediaType: "tv", year: 2008 },
  { requestedTitle: "The Walking Dead", tmdbId: "1402", mediaType: "tv", year: 2010 },
  { requestedTitle: "The Vast of Night", tmdbId: "565028", mediaType: "movie", year: 2019 },
];

const API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "NerdVana-MediaWiki-Narrative-Spike/0.1 (research probe)";
const NARRATIVE_HEADINGS = /^(plot|synopsis|story|premise)$/i;
const EXCLUDED_HEADINGS = /^(cast|characters|production|reception|awards|music|filming|trivia|references|external links|critical analysis|release|home media|legacy)$/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleTokens(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter((token) => token.length > 2));
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared++;
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

function requestUrl(params: Record<string, string>): string {
  const url = new URL(API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function fetchJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip, deflate",
      },
    });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 2) throw new Error(`HTTP ${response.status}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 3000 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("MediaWiki request exhausted retries.");
}

async function searchWikipedia(testCase: TestCase): Promise<SearchResult[]> {
  const query = `${testCase.requestedTitle} ${testCase.year} ${testCase.mediaType === "tv" ? "television series" : "film"}`;
  const data = await fetchJson(requestUrl({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "8",
    srnamespace: "0",
    format: "json",
    formatversion: "2",
    maxlag: "2",
  }));
  return Array.isArray(data?.query?.search) ? data.query.search : [];
}

function stripWikitext(value: string): string {
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

function splitParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n+/)
    .map(stripWikitext)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 80);
}

function selectSearchResult(testCase: TestCase, results: SearchResult[]): { result: SearchResult | null; confidence: NarrativeResult["matchConfidence"]; reason: string } {
  const scored = results.map((result) => {
    const overlap = tokenOverlap(testCase.requestedTitle, result.title);
    const titleNorm = normalize(result.title);
    const requestedNorm = normalize(testCase.requestedTitle);
    const exact = titleNorm === requestedNorm;
    const yearMentioned = result.snippet.includes(String(testCase.year));
    const typeMentioned = testCase.mediaType === "tv"
      ? /television series|tv series|american television series/i.test(result.snippet)
      : /film|movie/i.test(result.snippet);
    const titleHasExpectedType = testCase.mediaType === "tv"
      ? /\(TV series\)|\(television series\)| television series$/i.test(result.title)
      : !/\(TV series\)|\(television series\)|\(comic book\)|soundtrack|characters|episodes/i.test(result.title);
    const score = (exact ? 5 : 0) + overlap * 3 + (yearMentioned ? 1 : 0) + (typeMentioned ? 1 : 0) + (titleHasExpectedType ? 3 : -3);
    return { result, score, overlap, exact, yearMentioned, typeMentioned, titleHasExpectedType };
  }).sort((left, right) => right.score - left.score);

  const winner = scored[0];
  if (!winner || winner.overlap < 0.5) {
    return { result: null, confidence: "none", reason: "No search result shared enough title identity." };
  }

  const confidence = winner.exact && winner.yearMentioned && winner.typeMentioned
    ? "high"
    : winner.exact || winner.overlap >= 0.75
      ? "medium"
      : "low";
  const reason = `title overlap=${winner.overlap.toFixed(2)}, exact=${winner.exact}, yearInSnippet=${winner.yearMentioned}, typeInSnippet=${winner.typeMentioned}, titleType=${winner.titleHasExpectedType}; top candidates=${results.slice(0, 3).map((item) => item.title).join(" | ")}`;
  return { result: winner.result, confidence, reason };
}

async function fetchPage(pageTitle: string): Promise<any> {
  return fetchJson(requestUrl({
    action: "parse",
    page: pageTitle,
    prop: "wikitext|sections|revid",
    format: "json",
    formatversion: "2",
    redirects: "1",
    maxlag: "2",
  }));
}

function extractNarrative(parsed: any): { section: string | null; text: string; paragraphs: string[] } {
  const sections = Array.isArray(parsed?.parse?.sections) ? parsed.parse.sections : [];
  const candidate = sections.find((section: any) => {
    const line = String(section?.line ?? "").replace(/<[^>]+>/g, "").trim();
    return NARRATIVE_HEADINGS.test(line);
  });
  if (!candidate) return { section: null, text: "", paragraphs: [] };

  const sectionIndex = String(candidate.index ?? "");
  const wikitext = String(parsed?.parse?.wikitext ?? "");
  const headings = [...wikitext.matchAll(/^={2,6}\s*(.*?)\s*={2,6}\s*$/gm)];
  const start = headings.findIndex((heading) => heading[1].trim().toLowerCase() === String(candidate.line).trim().toLowerCase());
  const end = start >= 0 ? (headings[start + 1]?.index ?? wikitext.length) : wikitext.length;
  const raw = start >= 0 ? wikitext.slice(headings[start].index! + headings[start][0].length, end) : wikitext;
  const paragraphs = splitParagraphs(raw);
  return {
    section: `${candidate.line} (section ${sectionIndex})`,
    text: paragraphs.join(" "),
    paragraphs,
  };
}

function narrativeSignals(text: string): NarrativeResult["signals"] {
  return {
    setup: /arrives|meets|begins|introduced|sets out|lives|works as|in \d{4}/i.test(text),
    escalation: /however|but|soon|eventually|after|conflict|threat|attacks|discovers|attempts/i.test(text),
    turningPoint: /reveals|learns|realizes|betrays|turning point|changes|decides|confronts/i.test(text),
    climax: /climax|final|confrontation|battle|fight|showdown|kills|escapes|defeats/i.test(text),
    resolution: /afterward|aftermath|returns|survives|years later|ends with|epilogue|eventually lives/i.test(text),
  };
}

function estimateBeats(testCase: TestCase, narrative: string, paragraphs: string[]): { tmdb: string; wikipedia: string; improvement: NarrativeResult["improvement"] } {
  const tmdb = testCase.mediaType === "tv" ? "2–3" : "2–3";
  const signals = narrativeSignals(narrative);
  const structureSignals = Object.values(signals).filter(Boolean).length;
  const wikipedia = narrative.length >= 5000 && paragraphs.length >= 5 && structureSignals >= 4
    ? "6–8"
    : narrative.length >= 2500 && paragraphs.length >= 3 && structureSignals >= 3
      ? "5–6"
      : narrative.length >= 1000 && paragraphs.length >= 2
        ? "3–5"
        : narrative ? "2–3" : "0";
  const improvement = Number(wikipedia.split("–")[0]) >= 5 ? "substantial" : Number(wikipedia.split("–")[0]) >= 3 ? "moderate" : "negligible";
  return { tmdb, wikipedia, improvement };
}

async function run(testCase: TestCase): Promise<NarrativeResult> {
  try {
    const results = await searchWikipedia(testCase);
    const selected = selectSearchResult(testCase, results);
    if (!selected.result) {
      return {
        requestedTitle: testCase.requestedTitle, tmdbId: testCase.tmdbId, expectedMediaType: testCase.mediaType, expectedYear: testCase.year,
        wikipediaTitle: null, pageUrl: null, correctMatch: false, matchConfidence: selected.confidence, matchReason: selected.reason,
        selectedSection: null, narrativeCharacterCount: 0, paragraphCount: 0, signals: { setup: false, escalation: false, turningPoint: false, climax: false, resolution: false },
        tmdbOnlyDefensibleBeats: "2–3", wikipediaDefensibleBeats: "0", improvement: "not_evaluable", narrativePreview: "", failure: "No usable article search match.",
      };
    }

    const parsed = await fetchPage(selected.result.title);
    const narrative = extractNarrative(parsed);
    const signals = narrativeSignals(narrative.text);
    const estimate = estimateBeats(testCase, narrative.text, narrative.paragraphs);
    const pageTitle = String(parsed?.parse?.title ?? selected.result.title);
    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`;
    const correctMatch = selected.confidence === "high" || selected.confidence === "medium";
    return {
      requestedTitle: testCase.requestedTitle, tmdbId: testCase.tmdbId, expectedMediaType: testCase.mediaType, expectedYear: testCase.year,
      wikipediaTitle: pageTitle, pageUrl, correctMatch, matchConfidence: selected.confidence, matchReason: selected.reason,
      selectedSection: narrative.section, narrativeCharacterCount: narrative.text.length, paragraphCount: narrative.paragraphs.length, signals,
      tmdbOnlyDefensibleBeats: estimate.tmdb, wikipediaDefensibleBeats: estimate.wikipedia, improvement: correctMatch ? estimate.improvement : "not_evaluable",
      narrativePreview: narrative.text.slice(0, 500),
    };
  } catch (error) {
    return {
      requestedTitle: testCase.requestedTitle, tmdbId: testCase.tmdbId, expectedMediaType: testCase.mediaType, expectedYear: testCase.year,
      wikipediaTitle: null, pageUrl: null, correctMatch: false, matchConfidence: "none", matchReason: "Probe request failed.", selectedSection: null,
      narrativeCharacterCount: 0, paragraphCount: 0, signals: { setup: false, escalation: false, turningPoint: false, climax: false, resolution: false },
      tmdbOnlyDefensibleBeats: "2–3", wikipediaDefensibleBeats: "0", improvement: "not_evaluable", narrativePreview: "", failure: String(error),
    };
  }
}

const results: NarrativeResult[] = [];
for (const testCase of CASES) {
  results.push(await run(testCase));
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "MediaWiki Action API",
  note: "Temporary research probe. Narrative estimates are heuristic and require human review.",
  results,
}, null, 2));