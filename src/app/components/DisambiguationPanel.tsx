import { useMemo } from "react";
import type { ContextCandidate } from "../itemResolver";
import { buildAskUrl, readStoredMediaLens } from "../mediaLens";

interface DisambiguationPanelProps {
  query: string;
  candidates: ContextCandidate[];
}

export default function DisambiguationPanel({ query, candidates }: DisambiguationPanelProps) {
  const visibleCandidates = useMemo(
    () =>
      [...candidates]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3),
    [candidates]
  );

  const pushAskRoute = (itemId: string) => {
    const mediaLens = readStoredMediaLens();
    window.history.pushState(
      { item: itemId, mediaLens },
      "",
      buildAskUrl(query, { item: itemId, lens: mediaLens })
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <section
      className="mx-auto mt-8 w-full max-w-2xl border p-5 md:p-6 animate-[fade-in_220ms_ease-out]"
      style={{
        borderColor: "var(--nerdvana-border)",
        backgroundColor: "var(--nerdvana-surface)"
      }}
      aria-live="polite"
    >
      <h2
        className="text-2xl md:text-3xl font-black tracking-[-0.02em]"
        style={{
          fontFamily: 'Impact, "Arial Black", sans-serif',
          color: "var(--nerdvana-text)"
        }}
      >
        Choose what you meant
      </h2>
      <p
        className="mt-2 text-[1rem] leading-6"
        style={{
          fontFamily: '"Times New Roman", serif',
          color: "var(--nerdvana-text)",
          opacity: 0.82
        }}
      >
        Nerdvana needs a specific universe before opening results.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {visibleCandidates.map((candidate) => (
          <button
            key={`${candidate.id}-${candidate.type}`}
            type="button"
            className="nerdvana-clickable w-full border p-4 text-left transition-all duration-200"
            style={{
              borderColor: "var(--nerdvana-border)",
              backgroundColor: "var(--nerdvana-bg)",
              color: "var(--nerdvana-text)"
            }}
            onClick={() => pushAskRoute(candidate.id)}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = "#a83232";
              event.currentTarget.style.transform = "translateY(-2px)";
              event.currentTarget.style.boxShadow = "0 0 10px rgba(168, 50, 50, 0.2)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = "var(--nerdvana-border)";
              event.currentTarget.style.transform = "translateY(0)";
              event.currentTarget.style.boxShadow = "none";
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p
                className="text-[1.05rem] md:text-[1.15rem] font-black tracking-[-0.01em]"
                style={{
                  fontFamily: 'Impact, "Arial Black", sans-serif'
                }}
              >
                {candidate.label}
              </p>
              <span
                className="text-[0.67rem] uppercase tracking-[0.14em] px-2 py-1 border"
                style={{
                  fontFamily: '"Courier New", monospace',
                  borderColor: "var(--nerdvana-border)",
                  backgroundColor: "var(--nerdvana-surface)"
                }}
              >
                {candidate.type}
              </span>
            </div>
            <p
              className="mt-2 text-[0.7rem] uppercase tracking-[0.12em]"
              style={{
                fontFamily: '"Courier New", monospace',
                opacity: 0.68
              }}
            >
                Match {Math.round(candidate.confidence * 100)}%
              </p>
          </button>
        ))}
      </div>
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
