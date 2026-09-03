interface AnswerCardProps {
  answer: string;
}

export default function AnswerCard({ answer }: AnswerCardProps) {
  if (!answer.trim()) {
    return null;
  }

  return (
    <section
      className="mt-3 border px-3 py-2 md:px-4 md:py-3"
      style={{
        borderColor: "var(--nerdvana-border)",
        backgroundColor: "var(--nerdvana-surface)"
      }}
    >
      <h2
        className="text-[0.68rem] md:text-[0.72rem] uppercase tracking-[0.16em]"
        style={{
          /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif',
          color: "var(--nerdvana-text)",
          opacity: 0.72
        }}
      >
        Quick Insight
      </h2>
      <p
        className="mt-1 text-[0.86rem] leading-6"
        style={{
          /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif',
          color: "var(--nerdvana-text)",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden"
        }}
      >
        {answer}
      </p>
    </section>
  );
}
