type SourceItem = {
  title: string;
  link: string;
};

interface SourcesPanelProps {
  sources: SourceItem[];
}

function domainFromLink(link: string) {
  try {
    return new URL(link).hostname;
  } catch {
    return "source";
  }
}

export default function SourcesPanel({ sources }: SourcesPanelProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 border-t pt-4" style={{ borderColor: "var(--nerdvana-border)" }}>
      <h3
        className="text-[0.62rem] uppercase tracking-[0.14em]"
        style={{
          fontFamily: '"Courier New", monospace',
          color: "var(--nerdvana-text)",
          opacity: 0.6
        }}
      >
        Sources
      </h3>
      <div className="mt-3 space-y-2 break-words min-w-0">
        {sources.map((source) => (
          <a
            key={`${source.link}-${source.title}`}
            href={source.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[0.86rem] hover:underline break-words min-w-0"
            style={{
              fontFamily: '"Times New Roman", serif',
              color: "var(--nerdvana-text)"
            }}
          >
            {source.title}
            <span
              className="ml-2 text-[0.64rem] uppercase tracking-[0.1em]"
              style={{ fontFamily: '"Courier New", monospace', opacity: 0.58 }}
            >
              {domainFromLink(source.link)}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
