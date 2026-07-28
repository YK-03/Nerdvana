import { memo } from "react";
import { motion } from "motion/react";

interface UserDropdownProps {
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

function UserDropdown({ onNavigate, onLogout }: UserDropdownProps) {
  return (
    <motion.div
      className="absolute right-0 top-full mt-2 z-50 min-w-[11rem] w-[min(82vw,14rem)] border-[2px] p-1"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        borderColor: "var(--nerdvana-border)",
        backgroundColor: "var(--nerdvana-surface)"
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        className="nerdvana-clickable block w-full text-left px-3 py-2 text-[0.72rem] uppercase tracking-[0.12em] border-[1px] border-transparent hover:border-[var(--nerdvana-border)]"
        style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}
        onClick={() => onNavigate("/profile")}
      >
          Profile
      </button>
      <button
        className="nerdvana-clickable block w-full text-left px-3 py-2 text-[0.72rem] uppercase tracking-[0.12em] border-[1px] border-transparent hover:border-[var(--nerdvana-border)]"
        style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}
        onClick={() => onNavigate("/saved")}
      >
        Library
      </button>
      <button
        className="nerdvana-clickable block w-full text-left px-3 py-2 text-[0.72rem] uppercase tracking-[0.12em] border-[1px] border-transparent hover:border-[var(--nerdvana-border)]"
        style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}
        onClick={() => onNavigate("/history")}
      >
        History
      </button>
      <button
        onClick={onLogout}
        className="nerdvana-clickable block w-full text-left px-3 py-2 text-[0.72rem] uppercase tracking-[0.12em] border-[1px] border-transparent hover:border-[var(--nerdvana-border)]"
        style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}
      >
        Logout
      </button>
    </motion.div>
  );
}

export default memo(UserDropdown);
