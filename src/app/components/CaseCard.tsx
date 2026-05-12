import type { CaseFile } from "../utils/caseStorage";
import { buildAskUrl } from "../mediaLens";

interface CaseCardProps {
  caseFile: CaseFile;
}

function toRelativeTime(timestamp: number) {
  const deltaMs = Math.max(0, Date.now() - timestamp);
  const deltaMin = Math.floor(deltaMs / 60000);
  if (deltaMin < 1) return "just now";
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHours = Math.floor(deltaMin / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function toItemLabel(item: string | null) {
  if (!item) return "General Query";
  return item
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export default function CaseCard({ caseFile }: CaseCardProps) {
  const onOpenCase = () => {
    const nextUrl = buildAskUrl(caseFile.query, {
      item: caseFile.item ?? "",
      lens: caseFile.mediaLens
    });
    window.history.pushState({ item: caseFile.item ?? "", mediaLens: caseFile.mediaLens }, "", nextUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <button
      type="button"
      className="case-card nerdvana-clickable block w-full text-left transition-all duration-200 hover:-translate-y-[2px]"
      onClick={onOpenCase}
      style={{
        border: "1px solid var(--nerdvana-border)",
        padding: "12px",
        marginBottom: "10px",
        backgroundColor: "var(--nerdvana-surface)",
        boxShadow: "0 1px 0 var(--nerdvana-shadow)"
      }}
    >
      <h4
        className="text-[1rem] font-black tracking-[-0.01em]"
        style={{
          fontFamily: 'Impact, "Arial Black", sans-serif',
          color: "var(--nerdvana-text)"
        }}
      >
        {caseFile.intent}
      </h4>
      <p
        className="mt-1 text-[0.82rem] leading-5"
        style={{
          fontFamily: '"Times New Roman", serif',
          color: "var(--nerdvana-text)"
        }}
      >
        {toItemLabel(caseFile.item)} | {toRelativeTime(caseFile.timestamp)}
      </p>
    </button>
  );
}
