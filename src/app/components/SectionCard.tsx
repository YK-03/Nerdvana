interface SectionCardProps {
  title: string;
  content: string;
  hidden?: boolean;
}

export default function SectionCard({ title, content, hidden }: SectionCardProps) {
  if (hidden || !content.trim()) {
    return null;
  }

  return (
    <section
      className="mt-4 border p-4 md:p-5"
      style={{
        borderColor: "var(--nerdvana-border)",
        backgroundColor: "var(--nerdvana-message-bg)"
      }}
    >
      <h2
        className="text-[0.72rem] uppercase tracking-[0.16em]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
          color: "var(--nerdvana-accent)"
        }}
      >
        {title}
      </h2>
      <p
        className="mt-2 text-[0.96rem] leading-7"
        style={{
          /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif',
          color: "var(--nerdvana-text)"
        }}
      >
        {content}
      </p>
    </section>
  );
}
