import { memo, useEffect, useState } from "react";
import { motion } from "motion/react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";

interface HistoryPanelProps {
  uid: string;
  onSelectQuery: (query: string) => void;
}

interface HistoryEntry {
  id: string;
  query: string;
}

function HistoryPanel({ uid, onSelectQuery }: HistoryPanelProps) {
  const [items, setItems] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const ref = query(collection(db, "users", uid, "history"), orderBy("createdAt", "desc"), limit(30));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setItems(
          snap.docs
            .map((entry) => ({ id: entry.id, ...(entry.data() as { query?: unknown }) }))
            .filter((entry) => typeof entry.query === "string" && entry.query.trim().length > 0) as HistoryEntry[]
        );
      },
      () => {
        setItems([]);
      }
    );
    return () => unsub();
  }, [uid]);

  return (
    <motion.div
      className="absolute right-0 top-full mt-2 z-50 w-[min(90vw,20rem)] border-[2px] p-2"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        borderColor: "var(--nerdvana-border)",
        backgroundColor: "var(--nerdvana-surface)"
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <p
        className="mb-2 text-[0.64rem] uppercase tracking-[0.14em]"
        style={{ /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif', color: "var(--nerdvana-text)", opacity: 0.7 }}
      >
        Recent Search History
      </p>
      <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
        {items.length === 0 ? (
          <p className="text-[0.82rem]" style={{ /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif', color: "var(--nerdvana-text)", opacity: 0.8 }}>
            No history yet.
          </p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              className="nerdvana-clickable block w-full text-left border px-2 py-1.5 text-[0.8rem] hover:-translate-y-[1px] transition-transform duration-150"
              style={{
                /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif',
                color: "var(--nerdvana-text)",
                borderColor: "var(--nerdvana-border)"
              }}
              onClick={() => onSelectQuery(item.query)}
            >
              {item.query}
            </button>
          ))
        )}
      </div>
    </motion.div>
  );
}

export default memo(HistoryPanel);
