interface ResultLink {
  title: string;
  url: string;
  source?: string;
  thumbnail?: string;
}

interface SourcesListProps {
  links: ResultLink[];
}

export default function SourcesList({ links }: SourcesListProps) {
  if (links.length === 0) {
    return null;
  }

  return (
    <section className="mt-4">
      <h2
        className="text-[0.68rem] md:text-[0.72rem] uppercase tracking-[0.16em]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
          color: "var(--nerdvana-text)",
          opacity: 0.72
        }}
      >
        Sources
      </h2>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
        {links.map((link) => (
          <a
            key={`${link.url}-${link.title}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="nerdvana-clickable border p-3 transition-colors duration-150 hover:border-[var(--nerdvana-accent)]"
            style={{
              borderColor: "var(--nerdvana-border)",
              backgroundColor: "var(--nerdvana-surface)",
              color: "var(--nerdvana-text)"
            }}
          >
            <p
              className="text-[0.92rem] leading-5"
              style={{
                /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif'
              }}
            >
              {link.title}
            </p>
            <p
              className="mt-1 text-[0.66rem] uppercase tracking-[0.12em]"
              style={{
                /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
                opacity: 0.65
              }}
            >
              {link.source || "Source"}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}
