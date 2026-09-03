interface MediaItem {
  type: "image" | "video";
  url: string;
}

interface MediaRowProps {
  media: MediaItem[];
}

export default function MediaRow({ media }: MediaRowProps) {
  if (media.length === 0) {
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
        Media
      </h2>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {media.map((item, index) => (
          <a
            key={`${item.url}-${index}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="nerdvana-clickable shrink-0 border w-40 h-24 flex items-center justify-center text-center px-2"
            style={{
              borderColor: "var(--nerdvana-border)",
              backgroundColor: "var(--nerdvana-surface)",
              color: "var(--nerdvana-text)"
            }}
          >
            <span
              className="text-[0.68rem] uppercase tracking-[0.12em]"
              style={{
                /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif'
              }}
            >
              {item.type === "video" ? "Video" : "Image"}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
