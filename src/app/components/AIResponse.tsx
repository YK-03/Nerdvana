import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RENDER_CONTRACTS } from "../../lib/resolver/renderContracts.js";

interface AIResponseProps {
  text: string;
  isLoading: boolean;
  onFirstTokenRendered?: () => void;
  disableProgressiveReveal?: boolean;
}

import { ENABLE_NERDVANA_TELEMETRY } from "../../config/debug";

export default function AIResponse({
  text,
  isLoading,
  onFirstTokenRendered,
  disableProgressiveReveal = false
}: AIResponseProps) {
  const [visibleText, setVisibleText] = useState(() => disableProgressiveReveal ? text : "");
  const firstTokenEmittedRef = useRef(false);

  useEffect(() => {
    if (!text.trim()) {
      setVisibleText("");
      firstTokenEmittedRef.current = false;
      return;
    }

    if (disableProgressiveReveal) {
      setVisibleText(text);
      return;
    }

    let index = 0;
    const step = Math.max(1, Math.floor(text.length / 140));
    const timer = window.setInterval(() => {
      index = Math.min(text.length, index + step);
      setVisibleText(text.slice(0, index));

      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 16);

    return () => window.clearInterval(timer);
  }, [disableProgressiveReveal, text]);

  useEffect(() => {
    if (visibleText.length > 0 && !firstTokenEmittedRef.current) {
      firstTokenEmittedRef.current = true;
      onFirstTokenRendered?.();
    }
  }, [onFirstTokenRendered, visibleText]);

  if (!isLoading && !visibleText.trim()) {
  return (
    <section
      className={`${RENDER_CONTRACTS.classes.aiResponse} mt-4 w-full min-h-[3rem]`}
      data-render-contract={RENDER_CONTRACTS.classes.aiResponse}
    >
      <div style={{ opacity: 0.6 }}>
        Preparing response...
      </div>
    </section>
  );
}
  return (
    <section
      className={`${RENDER_CONTRACTS.classes.aiResponse} mt-4 w-full min-h-[3rem]`}
      data-render-contract={RENDER_CONTRACTS.classes.aiResponse}
      aria-live="polite"
    >
      <h2
        className="text-[0.68rem] md:text-[0.72rem] uppercase tracking-[0.16em]"
        style={{
          fontFamily: '"Courier New", monospace',
          color: "var(--nerdvana-text)",
          opacity: 0.72
        }}
      >
        Answer
      </h2>
      <div
        className={`${RENDER_CONTRACTS.classes.markdownBody} ${RENDER_CONTRACTS.classes.prose} mt-2 whitespace-pre-wrap text-[0.92rem] leading-7`}
        style={{
          fontFamily: '"Times New Roman", serif',
          color: "var(--nerdvana-text)",
          opacity: 0.96
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
            em: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>
          }}
        >
          {visibleText}
        </ReactMarkdown>
        {isLoading && (
          <span className="ml-1 inline-block h-[1em] w-[0.45ch] animate-pulse align-[-0.1em]" style={{ backgroundColor: "var(--nerdvana-text)" }} />
        )}
      </div>
    </section>
  );
}
