import type { AnswerCategory } from "../mockAnswers";

interface CaseStatusProps {
  categories: AnswerCategory[];
}

export default function CaseStatus({ categories }: CaseStatusProps) {
  const allSources = categories.flatMap((category) => category.sources ?? []);
  const wikiCount = allSources.filter((source) => source.type === "wiki").length;
  const redditCount = allSources.filter((source) => source.type === "reddit").length;
  const articleCount = allSources.filter((source) => source.type === "article").length;

  const hasCanon = categories.some((category) => category.id === "canon");
  const hasTheory = categories.some((category) => category.id === "theory");

  const statuses: string[] = [];
  if (wikiCount >= 2) statuses.push("Canon Heavy");
  if (wikiCount > 0 && articleCount > 0) statuses.push("Cross-verified");
  if (redditCount > wikiCount) statuses.push("Speculative Elements");
  if (hasCanon && hasTheory) statuses.push("Mixed Interpretation");

  const visibleStatuses = statuses.slice(0, 3);
  if (visibleStatuses.length === 0) {
    return null;
  }

  return (
    <section className="mb-6 border-b pb-3" style={{ borderColor: "var(--nerdvana-border)" }}>
      <p
        className="text-[0.68rem] md:text-[0.72rem] uppercase tracking-[0.16em]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
          color: "#555"
        }}
      >
        Query Status:
      </p>
      <p
        className="mt-1 text-[0.82rem] md:text-[0.88rem] leading-6"
        style={{
          /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif',
          color: "#555"
        }}
      >
        {visibleStatuses.join(" • ")}
      </p>
    </section>
  );
}
