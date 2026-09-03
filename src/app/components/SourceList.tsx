import { useMemo } from "react";
import type { Source } from "../mockAnswers";
import { buildSnippet } from "../utils/buildSnippet";
import { highlightQuery } from "../utils/highlightQuery";

interface SourceListProps {
  sources: Source[];
  query: string;
}

const BADGE_LABELS: Record<string, string> = {
  wiki: "WIKI",
  reddit: "reddit",
  article: "ARTICLE"
};

const AUTHORITY_CLASS: Record<string, string> = {
  wiki: "source-authoritative",
  article: "source-neutral",
  reddit: "source-community"
};

function getBadgeLabel(type: string) {
  const normalizedType = type.trim().toLowerCase();
  return BADGE_LABELS[normalizedType] ?? normalizedType.toUpperCase();
}

function getAuthorityClass(type: string) {
  const normalizedType = type.trim().toLowerCase();
  return AUTHORITY_CLASS[normalizedType] ?? "source-neutral";
}

export default function SourceList({ sources, query }: SourceListProps) {
  const visibleSources = useMemo(() => sources.slice(0, 3), [sources]);

  if (visibleSources.length === 0) {
    return null;
  }

  return (
    <section className="mt-4">
      <h4
        className="source-header text-[0.68rem] md:text-[0.72rem] tracking-[0.16em]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
          color: "var(--nerdvana-text)",
          opacity: 0.72
        }}
      >
        Filed Evidence
      </h4>
      <div className="mt-2 flex flex-col gap-2">
        {visibleSources.map((source) => (
          <a
            key={`${source.type}-${source.url}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`nerdvana-clickable source-item ${getAuthorityClass(source.type)} block border px-3 py-2`}
            style={{
              borderColor: "var(--nerdvana-border)",
              backgroundColor: "var(--nerdvana-bg)",
              color: "var(--nerdvana-text)"
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="source-badge border px-1.5 py-0.5 text-[0.62rem] tracking-[0.14em]"
                style={{
                  /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
                  borderColor: "var(--nerdvana-border)",
                  backgroundColor: "var(--nerdvana-surface)"
                }}
              >
                [{getBadgeLabel(source.type)}]
              </span>
              <span
                className="text-[0.92rem] leading-5"
                style={{
                  /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif'
                }}
              >
                {source.title}
              </span>
            </div>
            {source.text?.trim() && (
              <p className="source-snippet mt-1">
                {highlightQuery(buildSnippet(source.text, query), query)}
              </p>
            )}
          </a>
        ))}
      </div>
      <style>{`
        .source-header {
          text-transform: uppercase;
          font-variant: small-caps;
          letter-spacing: 0.14em;
        }

        .source-item {
          transition: transform 120ms ease, border-color 120ms ease, opacity 120ms ease;
        }

        .source-item:hover {
          transform: translateY(-1px);
          border-color: #a83232 !important;
        }

        .source-authoritative {
          border-width: 1.6px;
          font-weight: 600;
          background-color: #f6f2e8 !important;
        }

        .source-neutral {
          border-width: 1px;
          font-weight: 400;
        }

        .source-community {
          border-width: 1px;
          font-weight: 400;
          opacity: 0.75;
          color: rgba(26, 25, 24, 0.82) !important;
        }

        .dark .source-community {
          color: rgba(244, 239, 226, 0.82) !important;
        }

        .source-badge {
          text-transform: uppercase;
        }

        .source-community .source-badge {
          text-transform: none;
        }

        .source-snippet {
          color: #444;
          /* pre-Inter-switch: font-family: "Times New Roman", serif; */
          font-family: "Inter", sans-serif;
          font-size: 0.8rem;
          line-height: 1.4;
          max-width: 100%;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .dark .source-snippet {
          color: rgba(244, 239, 226, 0.72);
        }

        .snippet-highlight {
          font-weight: 600;
          background: rgba(168, 50, 50, 0.08);
          padding: 0 2px;
        }
      `}</style>
    </section>
  );
}
