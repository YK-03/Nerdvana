interface ContinuityBarProps {
  dominantItem: string | null;
  intentPhrase: string;
  source?: string;
}

function toItemLabel(item: string) {
  return item
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export default function ContinuityBar({ dominantItem, intentPhrase, source }: ContinuityBarProps) {
  if (!dominantItem || source !== "identity-stabilized") {
    return null;
  }

  return (
    <section className="continuity-bar">
      <p
        className="text-[0.75rem] uppercase tracking-[0.14em]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
          color: "#444"
        }}
      >
        Continuing Insights:
      </p>
      <p
        className="mt-1 text-[0.86rem]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif',
          color: "#444"
        }}
      >
        {toItemLabel(dominantItem)} • {intentPhrase}
      </p>

      <style>{`
        .continuity-bar {
          border-left: 3px solid #111;
          padding-left: 10px;
          margin-top: 8px;
          font-size: 13px;
          color: #444;
        }
      `}</style>
    </section>
  );
}
