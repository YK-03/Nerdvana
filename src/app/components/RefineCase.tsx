import type { AnswerCategory } from "../mockAnswers";
import { useInvestigationMemory } from "../hooks/useInvestigationMemory";
import { buildAskUrl, readStoredMediaLens } from "../mediaLens";

interface RefineCaseProps {
  query: string;
  categories: AnswerCategory[];
  item?: string | null;
}

function hasCategorySignal(categories: AnswerCategory[], signal: "canon" | "lore" | "theory") {
  return categories.some((category) => {
    const id = category.id.toLowerCase();
    const title = category.title.toLowerCase();
    return id.includes(signal) || title.includes(signal);
  });
}

function hasEndingSignal(query: string) {
  return /\bending\b/i.test(query);
}

function countSourcesByType(categories: AnswerCategory[], type: string) {
  return categories.reduce((count, category) => {
    const matches = (category.sources ?? []).filter((source) => source.type === type).length;
    return count + matches;
  }, 0);
}

export default function RefineCase({ query, categories, item }: RefineCaseProps) {
  const { load } = useInvestigationMemory();
  const memory = load();
  const suggestions: string[] = [];
  const memorySuggestions: string[] = [];

  if (hasCategorySignal(categories, "canon")) {
    suggestions.push("canon timeline");
  }

  if (hasCategorySignal(categories, "lore")) {
    suggestions.push("symbolism explained");
  }

  if (hasCategorySignal(categories, "theory")) {
    suggestions.push("alternate interpretation");
  }

  const redditCount = countSourcesByType(categories, "reddit");
  if (redditCount >= 2) {
    suggestions.push("fan consensus");
  }

  if (hasEndingSignal(query)) {
    suggestions.push("ending breakdown");
  }

  if (memory && item && memory.item === item) {
    const intentSeed = memory.intent
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((part) => part.trim())
      .find((part) => part.length >= 3);

    if (intentSeed) {
      memorySuggestions.push(`${intentSeed} deeper`);
    }
    memorySuggestions.push("creator intent");
  }

  const visibleSuggestions = Array.from(new Set([...memorySuggestions, ...suggestions])).slice(0, 3);
  if (visibleSuggestions.length === 0) {
    return null;
  }

  const onRefine = (suggestion: string) => {
    const refinedQuery = `${query.trim()} ${suggestion}`.trim();
    const mediaLens = readStoredMediaLens();
    const nextUrl = buildAskUrl(refinedQuery, { item, lens: mediaLens });
    window.history.pushState({ item: item ?? "", mediaLens }, "", nextUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <section className="mb-6 border-b pb-3" style={{ borderColor: "var(--nerdvana-border)" }}>
      <p
        className="text-[0.82rem] md:text-[0.88rem]"
        style={{
          fontFamily: '"Times New Roman", serif',
          color: "var(--nerdvana-text)",
          opacity: 0.82
        }}
      >
        Refine the Query:
      </p>
      <ul
        className="mt-2 list-disc pl-5 space-y-1"
        style={{
          fontFamily: '"Times New Roman", serif',
          color: "var(--nerdvana-text)"
        }}
      >
        {visibleSuggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="nerdvana-clickable text-left transition-all duration-150 hover:underline"
              style={{
                fontFamily: '"Times New Roman", serif',
                color: "var(--nerdvana-text)"
              }}
              onClick={() => onRefine(suggestion)}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
