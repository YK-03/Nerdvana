import { motion } from "motion/react";

export default function ThinkingLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <motion.div
        className="animate-thinking-pulse"
        initial={{ opacity: 0.65, scale: 0.96 }}
        animate={{ opacity: 0.9, scale: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <img
          src="/deadpool-logo.svg"
          alt="Deadpool logo"
          className="h-16 w-16 animate-thinking-spin opacity-85"
          decoding="async"
          loading="eager"
        />
      </motion.div>
      <p
        className="mt-4 text-[0.68rem] uppercase tracking-[0.12em] opacity-70"
        style={{ /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif', color: "var(--nerdvana-text)" }}
      >
        Decoding narrative context...
      </p>
    </div>
  );
}
