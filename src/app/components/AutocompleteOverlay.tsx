import { useEffect, useRef } from "react";

interface AutocompleteOverlayProps {
  suggestions: any[];
  activeIndex: number;
  onSelect: (suggestion: any) => void;
  onClose: () => void;
  onActiveIndexChange: (index: number) => void;
  isVisible: boolean;
}

export default function AutocompleteOverlay({
  suggestions,
  activeIndex,
  onSelect,
  onClose,
  onActiveIndexChange,
  isVisible
}: AutocompleteOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isVisible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isVisible, onClose]);

  // Scroll active item into view within the inner scroll container
  useEffect(() => {
    if (activeIndex < 0 || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  if (!isVisible || suggestions.length === 0) return null;

  return (
    <>
      {/* ── Floating shell ── absolute, never participates in document flow */}
      <div
        ref={containerRef}
        className="nv-ac-shell absolute left-0 right-0 z-[60]"
        style={{
          top: "calc(100% + 6px)",
          willChange: "transform, opacity",
          contain: "layout style paint"
        }}
      >
        {/* Outer border frame — vintage hard-shadow aesthetic */}
        <div
          className="nv-ac-frame relative border-[2px]"
          style={{
            borderColor: "var(--nerdvana-border)",
            backgroundColor: "var(--nerdvana-surface)",
            boxShadow: [
              "5px 5px 0 var(--nerdvana-border)",          // hard ink shadow
              "0 20px 48px rgba(0, 0, 0, 0.16)",           // soft ambient depth
              "0 4px 12px rgba(0, 0, 0, 0.08)"             // close contact shadow
            ].join(", ")
          }}
        >
          {/* Paper grain texture */}
          <div
            className="nv-ac-paper absolute inset-0 pointer-events-none"
            style={{ zIndex: 0 }}
          />

          {/* ── Top cinematic fade mask ── */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
              height: "28px",
              background: "linear-gradient(to bottom, var(--nerdvana-surface) 0%, transparent 100%)",
              zIndex: 20
            }}
          />

          {/* ── Scroll container ── internal, invisible scrollbar ── */}
          <div
            ref={scrollRef}
            className="nv-ac-scroll"
            style={{
              maxHeight: "min(72vh, 720px)",
              overflowY: "auto",
              overflowX: "hidden",
              position: "relative",
              zIndex: 10,
              // Momentum scrolling on iOS
              WebkitOverflowScrolling: "touch" as any
            }}
          >
            <ul
              role="listbox"
              style={{ paddingTop: "20px", paddingBottom: "20px" }}
            >
              {suggestions.map((s, index) => {
                const isActive = index === activeIndex;
                return (
                  <li
                    key={`${s.selectionValue ?? s.displayTitle}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => onActiveIndexChange(index)}
                    onClick={() => onSelect(s)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "11px 20px",
                      cursor: "pointer",
                      borderBottom: index < suggestions.length - 1
                        ? "1px dashed rgba(120,120,120,0.13)"
                        : "none",
                      backgroundColor: isActive
                        ? "var(--nerdvana-accent)"
                        : "transparent",
                      transition: "background-color 80ms ease"
                    }}
                  >
                    {/* Left — title + metadata */}
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span
                        style={{
                          fontFamily: '"Times New Roman", serif',
                          fontWeight: 700,
                          fontSize: "0.97rem",
                          lineHeight: 1.25,
                          letterSpacing: "0.005em",
                          color: isActive
                            ? "var(--nerdvana-surface)"
                            : "var(--nerdvana-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {s.displayTitle}
                      </span>
                      {s.metadataLabel && (
                        <span
                          style={{
                            fontFamily: '"Courier New", monospace',
                            fontSize: "0.64rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.09em",
                            marginTop: "3px",
                            color: isActive
                              ? "var(--nerdvana-surface)"
                              : "var(--nerdvana-text)",
                            opacity: isActive ? 0.85 : 0.58,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {s.metadataLabel}
                        </span>
                      )}
                    </div>

                    {/* Right — media type badge */}
                    {s.mediaLabel && (
                      <span
                        style={{
                          fontFamily: '"Courier New", monospace',
                          fontSize: "0.55rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.14em",
                          flexShrink: 0,
                          padding: "3px 7px",
                          border: `1px solid ${isActive ? "var(--nerdvana-surface)" : "var(--nerdvana-border)"}`,
                          borderRadius: "1px",
                          color: isActive
                            ? "var(--nerdvana-surface)"
                            : "var(--nerdvana-text)",
                          opacity: isActive ? 0.92 : 0.7
                        }}
                      >
                        {s.mediaLabel}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── Bottom cinematic fade mask ── */}
          <div
            className="absolute bottom-0 left-0 right-0 pointer-events-none"
            style={{
              height: "28px",
              background: "linear-gradient(to top, var(--nerdvana-surface) 0%, transparent 100%)",
              zIndex: 20
            }}
          />
        </div>
      </div>

      {/* ── Invisible scrollbar + paper texture styles ── */}
      <style>{`
        /* Paper grain */
        .nv-ac-paper {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='6.5' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          opacity: 0.028;
        }
        .dark .nv-ac-paper {
          opacity: 0.055;
        }

        /* Fully invisible scrollbar — Chrome/Safari/Edge */
        .nv-ac-scroll::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }

        /* Fully invisible scrollbar — Firefox */
        .nv-ac-scroll {
          scrollbar-width: none;
        }

        /* Smooth scroll */
        .nv-ac-scroll {
          scroll-behavior: smooth;
        }
      `}</style>
    </>
  );
}
