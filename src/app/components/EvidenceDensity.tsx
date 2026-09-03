import type { AnswerCategory } from "../mockAnswers";

interface EvidenceDensityProps {
  categories: AnswerCategory[];
}

export default function EvidenceDensity({ categories }: EvidenceDensityProps) {
  const canonCount = categories.find((category) => category.id === "canon")?.points.length || 0;
  const loreCount = categories.find((category) => category.id === "lore")?.points.length || 0;
  const theoryCount = categories.find((category) => category.id === "theory")?.points.length || 0;

  const total = canonCount + loreCount + theoryCount;
  const canonPct = total ? canonCount / total : 0;
  const lorePct = total ? loreCount / total : 0;
  const theoryPct = total ? theoryCount / total : 0;

  return (
    <section className="mb-6">
      <p
        className="text-[0.68rem] md:text-[0.72rem] uppercase tracking-[0.16em]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
          color: "#555"
        }}
      >
        Evidence Breakdown:
      </p>
      <div className="density-bar">
        <div className="canon" style={{ width: `${canonPct * 100}%` }} />
        <div className="lore" style={{ width: `${lorePct * 100}%` }} />
        <div className="theory" style={{ width: `${theoryPct * 100}%` }} />
      </div>
      <p
        className="mt-1 text-[0.75rem] md:text-[0.8rem] leading-5"
        style={{
          /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif',
          color: "#555"
        }}
      >
        Canon • Lore • Theory
      </p>
      <style>{`
        .density-bar {
          display: flex;
          height: 6px;
          border: 1px solid #111;
          margin-top: 6px;
        }

        .density-bar .canon {
          background: #111;
        }

        .density-bar .lore {
          background: #555;
        }

        .density-bar .theory {
          background: #999;
        }
      `}</style>
    </section>
  );
}
