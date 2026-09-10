import { readFile, writeFile } from "node:fs/promises";
import { TIMELINE_PHASE6A_CASES } from "./timeline_phase6a_fixtures.js";

type Section = { heading: string; level: number; text: string; paragraphs: string[] };
type CaseResult = {
  id: string;
  title: string;
  providerId: string;
  mediaType: "movie" | "tv";
  mode: "live" | "stored_metadata_only";
  pageTitle: string | null;
  current: {
    selectedSections: string[];
    characterCount: number | null;
    paragraphCount: number | null;
  };
  multiSection: {
    selectedSections: string[];
    characterCount: number | null;
    paragraphCount: number | null;
    additionalNarrativeMaterial: "yes" | "no" | "unknown";
    likelyMoreStoryBeats: "yes" | "no" | "unknown";
    ambiguityOrRejection: string | null;
  };
  comparison: "ADDITIONAL_MATERIAL_GAINED" | "NO_ADDITIONAL_MATERIAL" | "NEEDS_MORE_DATA";
};

const OUTPUT_PATH = "scratch/timeline_phase6b_multisection_results.json";
const API_URL = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "NerdVana-Timeline-Phase6B/0.1 (research experiment)";
const MAX_TOTAL_CHARACTERS = 16000;
const NARRATIVE_HEADINGS = new Set(["premise", "plot", "synopsis", "story"]);
const EQUIVALENT_HEADINGS = new Set(["background", "summary"]);
const EXCLUDED_HEADINGS = /^(cast|characters|production|reception|awards|music|filming|trivia|references|external links|critical analysis|release|home media|legacy|franchise|adaptations?|in popular culture|background and development)$/i;
const FORBIDDEN_CONTENT = /\b(episode list|list of episodes|cast|characters|production|reception|trivia|soundtrack|comic book|novel|manga|franchise)\b/i;

function buildUrl(params: Record<string, string>): string {
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
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

function paragraphs(value: string): string[] {
  return value.split(/\n\s*\n+/).map(cleanWikitext).filter((text) => text.length >= 80);
}

function parseSections(wikitext: string): Section[] {
  const headings = [...wikitext.matchAll(/^={2,6}\s*(.*?)\s*={2,6}\s*$/gm)];
  return headings.map((match, index) => {
    const level = match[0].match(/^=+/)?.[0].length ?? 2;
    const end = headings[index + 1]?.index ?? wikitext.length;
    const start = (match.index ?? 0) + match[0].length;
    const text = paragraphs(wikitext.slice(start, end)).join(" ").trim();
    return { heading: match[1].trim(), level, text, paragraphs: paragraphs(wikitext.slice(start, end)) };
  });
}

function eligible(section: Section): boolean {
  const heading = section.heading.toLowerCase();
  if (EXCLUDED_HEADINGS.test(section.heading) || FORBIDDEN_CONTENT.test(section.heading)) return false;
  if (!NARRATIVE_HEADINGS.has(heading) && !EQUIVALENT_HEADINGS.has(heading)) return false;
  if (heading === "premise" && (section.text.length < 1200 || section.paragraphs.length < 2)) return false;
  return section.text.length >= 160;
}

function deduplicateSections(sections: Section[]): Section[] {
  const selected: Section[] = [];
  for (const section of sections) {
    const normalized = section.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const overlaps = selected.some((existing) => {
      const existingNormalized = existing.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const shorter = normalized.length < existingNormalized.length ? normalized : existingNormalized;
      const longer = normalized.length < existingNormalized.length ? existingNormalized : normalized;
      return shorter.length > 0 && longer.includes(shorter.slice(0, Math.min(240, shorter.length)));
    });
    if (!overlaps) selected.push(section);
  }
  return selected;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate" },
  });
  if (!response.ok) throw new Error(`mediawiki_http_${response.status}`);
  return response.json();
}

async function livePage(title: string, year: number, mediaType: "movie" | "tv"): Promise<{ pageTitle: string; sections: Section[] }> {
  const query = `${title} ${year} ${mediaType === "tv" ? "television series" : "film"}`;
  const search = await fetchJson(buildUrl({ action: "query", list: "search", srsearch: query, srlimit: "5", srnamespace: "0", format: "json", formatversion: "2", maxlag: "2" }));
  const result = search?.query?.search?.[0];
  if (!result?.title) throw new Error("no_article_match");
  const parsed = await fetchJson(buildUrl({ action: "parse", page: String(result.title), prop: "wikitext|revid", format: "json", formatversion: "2", redirects: "1", maxlag: "2" }));
  const pageTitle = String(parsed?.parse?.title ?? result.title);
  return { pageTitle, sections: parseSections(String(parsed?.parse?.wikitext ?? "")) };
}

async function storedBaseline(): Promise<any> {
  return JSON.parse(await readFile("scratch/timeline_phase6a_results.json", "utf8"));
}

async function main() {
  const baseline: any = await storedBaseline();
  const baselineById = new Map(baseline.results.map((result: any) => [result.id, result]));
  const liveMode = process.argv.includes("--live");
  const results: CaseResult[] = [];

  for (const item of TIMELINE_PHASE6A_CASES) {
    const prior: any = baselineById.get(item.id);
    try {
      if (!liveMode) throw new Error("raw_section_fixture_unavailable");
      const page = await livePage(item.title, item.year, item.mediaType);
      const eligibleSections = deduplicateSections(page.sections.filter(eligible));
      const currentSection = eligibleSections.find((section) => ["plot", "synopsis", "story"].includes(section.heading.toLowerCase()))
        ?? eligibleSections.find((section) => section.heading.toLowerCase() === "premise");
      const combinedText = eligibleSections.map((section) => section.text).join(" ").slice(0, MAX_TOTAL_CHARACTERS);
      const combinedParagraphs = eligibleSections.flatMap((section) => section.paragraphs);
      const currentText = currentSection?.text ?? "";
      const currentParagraphs = currentSection?.paragraphs ?? [];
      const gained = eligibleSections.length > 1 && combinedText.length > currentText.length;
      results.push({
        id: item.id, title: item.title, providerId: item.providerId, mediaType: item.mediaType, mode: "live", pageTitle: page.pageTitle,
        current: { selectedSections: currentSection ? [currentSection.heading] : [], characterCount: currentText.length, paragraphCount: currentParagraphs.length },
        multiSection: { selectedSections: eligibleSections.map((section) => section.heading), characterCount: combinedText.length, paragraphCount: combinedParagraphs.length, additionalNarrativeMaterial: gained ? "yes" : "no", likelyMoreStoryBeats: gained ? "unknown" : "no", ambiguityOrRejection: null },
        comparison: gained ? "ADDITIONAL_MATERIAL_GAINED" : "NO_ADDITIONAL_MATERIAL",
      });
    } catch (error) {
      const reason = String(error).replace(/[^a-z0-9_\-]/gi, "_").slice(0, 100);
      results.push({
        id: item.id, title: item.title, providerId: item.providerId, mediaType: item.mediaType, mode: "stored_metadata_only", pageTitle: prior?.evidence?.pageTitle ?? null,
        current: { selectedSections: prior?.evidence?.reason?.startsWith("selected_") ? [prior.evidence.reason.slice(9)] : [], characterCount: prior?.evidence?.characterCount ?? null, paragraphCount: prior?.evidence?.paragraphCount ?? null },
        multiSection: { selectedSections: [], characterCount: null, paragraphCount: null, additionalNarrativeMaterial: "unknown", likelyMoreStoryBeats: "unknown", ambiguityOrRejection: reason },
        comparison: "NEEDS_MORE_DATA",
      });
    }
  }

  const gained = results.filter((result) => result.comparison === "ADDITIONAL_MATERIAL_GAINED").length;
  const noGain = results.filter((result) => result.comparison === "NO_ADDITIONAL_MATERIAL").length;
  const needsData = results.filter((result) => result.comparison === "NEEDS_MORE_DATA").length;
  const recommendation = gained > 0 && gained >= needsData ? "ADOPT MULTI-SECTION" : needsData > 0 ? "NEEDS MORE DATA" : "KEEP CURRENT";
  const output = { generatedAt: new Date().toISOString(), phase: "6B", mode: liveMode ? "live" : "stored_metadata_only", maxTotalCharacters: MAX_TOTAL_CHARACTERS, allowedHeadings: [...NARRATIVE_HEADINGS, ...EQUIVALENT_HEADINGS], excludedHeadings: EXCLUDED_HEADINGS.source, results, summary: { gained, noGain, needsData, recommendation } };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Phase 6B multi-section: ${results.length} cases | gained ${gained} | no gain ${noGain} | needs data ${needsData}`);
  for (const result of results) console.log(`- ${result.title}: ${result.comparison}; current ${result.current.characterCount ?? "?"} chars; multi ${result.multiSection.characterCount ?? "?"} chars; sections ${result.multiSection.selectedSections.join(", ") || "none"}`);
  console.log(`Recommendation: ${recommendation}`);
  console.log(`Machine-readable results: ${OUTPUT_PATH}`);
}

await main();