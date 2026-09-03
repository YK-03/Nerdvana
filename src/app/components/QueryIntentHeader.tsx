interface QueryIntentHeaderProps {
  query: string;
  context?: {
    item: string | null;
    source: "explicit" | "query" | "inferred" | "identity-stabilized" | "unknown";
  };
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "why",
  "with"
]);

function toTitleCase(value: string) {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

export function buildIntentPhrase(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return "Open Query";

  const meaningfulWords = trimmed
    .split(/[^a-zA-Z0-9]+/g)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()));

  if (meaningfulWords.length === 0) {
    return trimmed;
  }

  const phraseWords = meaningfulWords.slice(0, 2);
  return toTitleCase(phraseWords.join(" "));
}

function buildContextLabel(
  context?: {
    item: string | null;
    source: "explicit" | "query" | "inferred" | "identity-stabilized" | "unknown";
  }
) {
  if (!context || context.source === "unknown" || !context.item) {
    return "";
  }

  const itemLabel = toTitleCase(context.item.replace(/[-_]+/g, " "));
  if (context.source === "inferred") {
    return `${itemLabel} (inferred)`;
  }

  return itemLabel;
}

export default function QueryIntentHeader({ query, context }: QueryIntentHeaderProps) {
  const contextLabel = buildContextLabel(context);
  const summaryLabel = contextLabel ? "Quick Insight" : "Limited insight available";

  return (
    <section className="mb-7 border-b pb-3" style={{ borderColor: "var(--nerdvana-border)" }}>
      <p
        className="text-[0.82rem] md:text-[0.9rem] uppercase tracking-[0.12em]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif',
          color: "var(--nerdvana-text)",
          opacity: 0.86,
          fontVariant: "small-caps"
        }}
      >
        {summaryLabel}
      </p>
    </section>
  );
}

