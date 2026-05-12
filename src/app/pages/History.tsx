import { useEffect, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, writeBatch } from "firebase/firestore";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { buildAskUrl, normalizeMediaLens, type MediaLens } from "../mediaLens";
import { auth, db } from "@/firebase";

interface HistoryPageProps {
  onNavigatePage: (page: string) => void;
}

interface HistoryItem {
  id: string;
  query: string;
  createdAtText: string;
  conversation?: any[];
  results?: any[];
  timestamp?: number;
  mediaLens?: MediaLens;
}

function formatCreatedAt(value: unknown) {
  const maybeTimestamp = value as { toDate?: () => Date } | undefined;
  if (typeof maybeTimestamp?.toDate === "function") {
    return maybeTimestamp.toDate().toLocaleString();
  }
  return "Unknown time";
}

export default function HistoryPage({ onNavigatePage }: HistoryPageProps) {
  const [user] = useAuthState(auth);
  const { login } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }

    const historyQuery = query(collection(db, "users", user.uid, "history"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(historyQuery, (snapshot) => {
      const next = snapshot.docs
        .map((entry) => {
          const data = entry.data() as { query?: unknown; createdAt?: unknown; conversation?: any[]; results?: any[]; mediaLens?: unknown };
          if (typeof data.query !== "string" || !data.query.trim()) {
            return null;
          }
          return {
            id: entry.id,
            query: data.query,
            createdAtText: formatCreatedAt(data.createdAt),
            conversation: data.conversation || [],
            results: data.results || [],
            timestamp: (data.createdAt as any)?.toMillis?.() || Date.now(),
            mediaLens: normalizeMediaLens(data.mediaLens)
          } as HistoryItem;
        })
        .filter((entry): entry is HistoryItem => Boolean(entry));
      setItems(next);
    });

    return () => unsubscribe();
  }, [user]);

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent ensuring click doesn't trigger restore
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "history", id));
  };

  const clearAllHistory = async () => {
    if (!user || isClearing || items.length === 0) return;
    setIsClearing(true);
    try {
      // Note: We should probably query again to be safe or just use current items if small enough
      // But batch size is limited. Simplistic approach for now.
      const batch = writeBatch(db);
      items.forEach((item) => {
        batch.delete(doc(db, "users", user.uid, "history", item.id));
      });
      await batch.commit();
    } catch (e) {
      console.error("Failed to clear history", e);
    } finally {
      setIsClearing(false);
    }
  };

  const handleHistoryClick = (item: HistoryItem) => {
    // Push state with conversation and results to permit restoration without re-fetching
    const stateToPush = {
      query: item.query,
      conversation: item.conversation,
      results: item.results,
      rehydrated: true,
      historyId: item.id,
      mediaLens: item.mediaLens
    };

    window.history.pushState(stateToPush, "", buildAskUrl(item.query, { lens: item.mediaLens }));
    // Notify App
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="min-h-screen w-full flex flex-col transition-colors duration-300" style={{ backgroundColor: "var(--nerdvana-conversation-bg)" }}>
      <div className="fixed inset-0 pointer-events-none paper-texture nerdvana-paper-texture-conversation" />
      <div className="relative flex-1 flex flex-col">
        <Header onNavigate={onNavigatePage} />
        <main className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-12 flex-1">
          <article className="max-w-5xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1
                className="text-[clamp(2rem,8.6vw,3.2rem)] font-black tracking-[-0.03em] leading-tight uppercase"
                style={{ fontFamily: 'Impact, "Arial Black", sans-serif', color: "var(--nerdvana-text)" }}
              >
                History
              </h1>
              {user && (
                <button
                  type="button"
                  className="nerdvana-clickable border-[2px] px-3 py-2 text-[0.66rem] sm:text-[0.68rem] uppercase tracking-[0.12em]"
                  style={{ fontFamily: '"Courier New", monospace', borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)" }}
                  onClick={() => {
                    clearAllHistory().catch(() => undefined);
                  }}
                >
                  {isClearing ? "Clearing..." : "Clear All History"}
                </button>
              )}
            </div>

            {!user ? (
              <div className="mt-5 border p-4" style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-surface)" }}>
                <p style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                  Sign in to view and manage your search history.
                </p>
                <button
                  type="button"
                  className="mt-4 nerdvana-clickable border-[2px] px-4 py-2 text-[0.7rem] uppercase tracking-[0.15em]"
                  style={{ fontFamily: '"Courier New", monospace', borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)" }}
                  onClick={() => {
                    login().catch(() => undefined);
                  }}
                >
                  Sign In
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="border p-3 md:p-4 flex flex-col sm:flex-row items-start justify-between gap-3 nerdvana-clickable transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                    style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-surface)", cursor: "pointer" }}
                    onClick={() => handleHistoryClick(item)}
                  >
                    <div className="min-w-0">
                      <p
                        className="text-[0.66rem] uppercase tracking-[0.14em]"
                        style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)", opacity: 0.72 }}
                      >
                        {item.createdAtText}
                      </p>
                      <p
                        className="mt-1 text-[0.95rem] leading-6"
                        style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}
                      >
                        {item.query}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="nerdvana-clickable shrink-0 border px-2 py-1.5 text-[0.62rem] uppercase tracking-[0.12em] z-10 hover:bg-red-900/20"
                      style={{ fontFamily: '"Courier New", monospace', borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)" }}
                      onClick={(e) => {
                        deleteHistoryItem(e, item.id).catch(() => undefined);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {items.length === 0 && (
                  <p
                    className="text-[0.78rem] uppercase tracking-[0.12em]"
                    style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)", opacity: 0.8 }}
                  >
                    No history yet.
                  </p>
                )}
              </div>
            )}
          </article>
        </main>
        <Footer />
      </div>
      <style>{`
        .paper-texture {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='6.5' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          background-repeat: repeat;
        }
        .nerdvana-paper-texture-conversation { opacity: 0.04; transition: opacity 0.3s ease; }
        .dark .nerdvana-paper-texture-conversation { opacity: 0.08; }
      `}</style>
    </div>
  );
}
