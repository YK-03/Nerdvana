import { useEffect, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from "firebase/firestore";
import { Trash2 } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { buildAskUrl, normalizeMediaLens, type MediaLens } from "../mediaLens";
import { auth, db } from "@/firebase";

interface SavedLorebooksProps {
  onNavigatePage: (page: string) => void;
}

interface LorebookItem {
  id: string;
  topic: string;
  conversation: { role: "user" | "assistant"; content: string }[];
  results: any[];
  createdAt: any;
  mediaLens?: MediaLens;
}

export default function SavedLorebooks({ onNavigatePage }: SavedLorebooksProps) {
  const [user] = useAuthState(auth);
  const { login } = useAuth();
  const [lorebooks, setLorebooks] = useState<LorebookItem[]>([]);

  useEffect(() => {
    if (!user) {
      setLorebooks([]);
      return;
    }

    const q = query(
      collection(db, "users", user.uid, "lorebooks"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })) as LorebookItem[];
      setLorebooks(items);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLorebookClick = (item: LorebookItem) => {
    // Navigate to search with this topic AND restore state
    // Deconstruct conversation to restore state
    // We assume:
    // [0] = User Query (Implicit)
    // [1] = Initial Answer (Assistant) -> goes to 'answer' state
    // [2...] = Follow ups -> goes to 'conversation' state

    let restoredAnswer = { summary: "", categories: [], spoilers: "" };
    let restoredConversation: any[] = [];

    if (item.conversation && item.conversation.length > 0) {
      // Find the first assistant message for the summary
      const firstAssistantIndex = item.conversation.findIndex(m => m.role === "assistant");

      if (firstAssistantIndex !== -1) {
        restoredAnswer = {
          summary: item.conversation[firstAssistantIndex].content,
          categories: [],
          spoilers: ""
        };

        // The rest after the first assistant message are follow-ups
        // (Assuming standard User -> Assistant -> User -> Assistant flow)
        // But wait, our save logic pushes: Query, Summary, then FollowUps.
        // So index 0 is Query, Index 1 is Summary.
        // Follow ups start at index 2.

        if (item.conversation.length > 2) {
          restoredConversation = item.conversation.slice(2);
        }
      }
    }

    const stateToPush = {
      query: item.topic,
      conversation: restoredConversation,
      results: item.results,
      answer: restoredAnswer,
      rehydrated: true,
      mediaLens: normalizeMediaLens(item.mediaLens)
    };

    window.history.pushState(
      stateToPush,
      "",
      buildAskUrl(item.topic, { lens: normalizeMediaLens(item.mediaLens) })
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleDelete = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!user) return;

    if (window.confirm("Are you sure you want to delete this lorebook? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "lorebooks", itemId));
      } catch (error) {
        console.error("Error deleting lorebook:", error);
        alert("Failed to delete lorebook.");
      }
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col transition-colors duration-300" style={{ backgroundColor: "var(--nerdvana-conversation-bg)" }}>
      <div className="fixed inset-0 pointer-events-none paper-texture nerdvana-paper-texture-conversation" />
      <div className="relative flex-1 flex flex-col">
        <Header onNavigate={onNavigatePage} />
        <main className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-12 flex-1">
          <article className="max-w-6xl mx-auto">
            <h1
              className="text-[clamp(2rem,8.6vw,3.2rem)] font-black tracking-[-0.03em] leading-tight uppercase"
              style={{ fontFamily: 'Impact, "Arial Black", sans-serif', color: "var(--nerdvana-text)" }}
            >
              Saved Lorebooks
            </h1>

            {!user ? (
              <div className="mt-5 border p-4" style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-surface)" }}>
                <p style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                  Sign in to view saved lorebooks.
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
              <div className="mt-6 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {lorebooks.map((item) => (
                  <div
                    key={item.id}
                    className="relative group h-full"
                  >
                    <button
                      className="nerdvana-clickable w-full text-left border p-4 transition-transform duration-150 hover:-translate-y-0.5 flex flex-col h-full"
                      style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-surface)" }}
                      onClick={() => handleLorebookClick(item)}
                    >
                      <p
                        className="text-[0.66rem] uppercase tracking-[0.14em] mb-2"
                        style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)", opacity: 0.72 }}
                      >
                        {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : "Saved Session"}
                      </p>
                      <h3
                        className="text-[1.1rem] leading-6 font-bold mb-2 break-words pr-6"
                        style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}
                      >
                        {item.topic}
                      </h3>
                      <p
                        className="text-[0.85rem] leading-5 opacity-80"
                        style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}
                      >
                        {item.conversation ? `Chat Session (${item.conversation.length} msgs)` : "Legacy Item"}
                      </p>
                    </button>

                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      className="absolute top-2 right-2 p-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 hover:text-red-500 rounded-md"
                      style={{ color: "var(--nerdvana-text)" }}
                      title="Delete Lorebook"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {lorebooks.length === 0 && (
                  <p
                    className="text-[0.78rem] uppercase tracking-[0.12em]"
                    style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)", opacity: 0.8 }}
                  >
                    No saved lorebooks yet.
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
