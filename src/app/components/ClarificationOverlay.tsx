import type { CanonicalSuggestion } from "../../lib/resolver/canonicalGrounding.js";

interface ClarificationOverlayProps {
  suggestions: CanonicalSuggestion[];
  query: string;
  onSelect: (selectionValue: string, displayTitle: string) => void;
}

export default function ClarificationOverlay({
  suggestions,
  query,
  onSelect
}: ClarificationOverlayProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <>
      {/* ── Inline clarification card ── NV Retro style */}
      <div
        className="nv-clarification-card border-[2px] p-6 mb-6 relative overflow-hidden"
        style={{
          borderColor: "var(--nerdvana-border)",
          backgroundColor: "var(--nerdvana-surface)",
          boxShadow: "5px 5px 0 var(--nerdvana-border)",
          contain: "layout style paint"
        }}
      >
        {/* Paper texture */}
        <div className="nv-ac-paper absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} />

        <div className="relative z-10">
          <h3
            className="text-[0.7rem] sm:text-[0.75rem] uppercase tracking-[0.16em] font-semibold mb-4"
            style={{
              fontFamily: '"Courier New", monospace',
              color: "var(--nerdvana-accent)"
            }}
          >
            Did you mean?
          </h3>
          <p
            className="text-[0.98rem] leading-6 mb-4"
            style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}
          >
            We found multiple matches for <span className="font-bold">"{query}"</span>. Select one to ground your discussion:
          </p>

          <ul
            className="space-y-2.5 max-h-[320px] overflow-y-auto pr-2"
            style={{ scrollbarWidth: "thin" }}
          >
            {suggestions.map((s, idx) => (
              <li key={`${s.selectionValue}-${s.mediaLens}-${idx}`}>
                <button
                  onClick={() => onSelect(s.selectionValue, s.displayTitle)}
                  className="w-full text-left p-3.5 border-[1px] border-dashed hover:border-solid transition-all duration-150 flex items-center justify-between gap-4 group"
                  style={{
                    borderColor: "rgba(120, 120, 120, 0.3)",
                    backgroundColor: "rgba(120, 120, 120, 0.02)"
                  }}
                >
                  <div className="flex flex-col min-w-0">
                    <span
                      className="font-bold text-[0.95rem] group-hover:text-[var(--nerdvana-accent)] transition-colors duration-150"
                      style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}
                    >
                      {s.displayTitle}
                    </span>
                    {s.metadataLabel && (
                      <span
                        className="text-[0.62rem] uppercase tracking-[0.08em] mt-1"
                        style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)", opacity: 0.6 }}
                      >
                        {s.metadataLabel}
                      </span>
                    )}
                  </div>
                  {s.mediaLabel && (
                    <span
                      className="text-[0.52rem] uppercase tracking-[0.12em] px-2 py-0.5 border border-solid border-opacity-30 rounded-sm"
                      style={{
                        fontFamily: '"Courier New", monospace',
                        borderColor: "var(--nerdvana-border)",
                        color: "var(--nerdvana-text)",
                        opacity: 0.7
                      }}
                    >
                      {s.mediaLabel}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <style>{`
        .nv-ac-paper {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='6.5' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          opacity: 0.028;
        }
        .dark .nv-ac-paper {
          opacity: 0.055;
        }
      `}</style>
    </>
  );
}
