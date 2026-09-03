import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

const LOADING_LINES = [
  "Checking the fandom wiki...",
  "Connecting plot dots...",
  "Building overview..."
];

export default function ThinkingScreen({ isVisible }: { isVisible: boolean }) {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    const timer = window.setInterval(() => {
      setLineIndex((prev) => (prev + 1) % LOADING_LINES.length);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ backgroundColor: "var(--nerdvana-conversation-bg)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
        >
          <div className="pointer-events-none absolute inset-0 paper-texture opacity-[0.04] dark:opacity-[0.08]" />
          <div className="relative flex flex-col items-center justify-center">
            <p
              className="mb-6 text-center text-[0.62rem] uppercase tracking-[0.2em] opacity-70"
              style={{ /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif', color: "var(--nerdvana-text)" }}
            >
              NERDVANA
            </p>
            <motion.img
              src="/deadpool-logo.svg"
              alt="Deadpool logo"
              className="h-24 w-24 animate-thinking-spin"
              animate={{ scale: [0.98, 1.03, 0.98] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              decoding="async"
              loading="eager"
            />
            <p
              className="mt-6 text-[0.72rem] uppercase tracking-[0.12em] opacity-75"
              style={{ /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif', color: "var(--nerdvana-text)" }}
            >
              Hold up, nerd mode engaged...
            </p>
            <AnimatePresence mode="wait">
              <motion.p
                key={lineIndex}
                className="mt-2 text-[0.68rem] uppercase tracking-[0.1em] opacity-70"
                style={{ /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif', color: "var(--nerdvana-accent)" }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 0.7, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {LOADING_LINES[lineIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
