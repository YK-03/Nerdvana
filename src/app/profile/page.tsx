"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { collection, doc, getDoc, setDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";
import { auth, db } from "@/firebase";
import { buildAskUrl, normalizeMediaLens, type MediaLens } from "../mediaLens";
import { DEFAULT_AVATAR } from "../utils/getOrCreateAvatarSeed";

interface ProfilePageProps {
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

function continuityActive() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem("nerdvana_pref_remember_context");
  return raw !== "false";
}

export default function ProfilePage({ onNavigatePage }: ProfilePageProps) {
  const [user] = useAuthState(auth);
  const { login } = useAuth();
  
  const [username, setUsername] = useState("Explorer");
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);
  const [usernameDraft, setUsernameDraft] = useState("Explorer");
  const [savingUsername, setSavingUsername] = useState(false);
  const [lorebooks, setLorebooks] = useState<LorebookItem[]>([]);
  
  const continuityStatus = useMemo(() => continuityActive(), []);

  useEffect(() => {
    if (!user) {
      setUsername("Explorer");
      setUsernameDraft("Explorer");
      setAvatarUrl(DEFAULT_AVATAR);
      setLorebooks([]);
      return;
    }

    const fetchUser = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const data = snap.data() as { username?: string; avatar?: string } | undefined;
        
        const resolvedUsername = typeof data?.username === "string" && data.username.trim()
          ? data.username.trim()
          : user.displayName || "Explorer";
          
        const resolvedAvatar = typeof data?.avatar === "string" && data.avatar.trim()
          ? data.avatar.trim()
          : DEFAULT_AVATAR;

        setUsername(resolvedUsername);
        setUsernameDraft(resolvedUsername);
        setAvatarUrl(resolvedAvatar);
      } catch (error) {
        const fallbackName = user.displayName || "Explorer";
        setUsername(fallbackName);
        setUsernameDraft(fallbackName);
        setAvatarUrl(DEFAULT_AVATAR);
      }
    };
    fetchUser();

    const q = query(
      collection(db, "users", user.uid, "lorebooks"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as LorebookItem[];
      setLorebooks(items);
    });

    return () => unsubscribe();
  }, [user]);

  const canSaveUsername = useMemo(() => {
    const trimmed = usernameDraft.trim();
    return trimmed.length > 0 && trimmed !== username;
  }, [username, usernameDraft]);

  const onSaveUsername = async () => {
    if (!user?.uid || !canSaveUsername || savingUsername) return;

    const timeoutId = setTimeout(() => {
      setSavingUsername(false);
    }, 10000);

    try {
      setSavingUsername(true);
      const userRef = doc(db, "users", user.uid);
      const updatedSettings = { username: usernameDraft.trim() };
      
      await setDoc(userRef, updatedSettings, { merge: true });
      setUsername(updatedSettings.username);
    } catch (err) {
      console.error("SETTINGS SAVE ERROR:", err);
    } finally {
      clearTimeout(timeoutId);
      setSavingUsername(false);
    }
  };

  const handleLorebookClick = (item: LorebookItem) => {
    let restoredAnswer = { summary: "", categories: [], spoilers: "" };
    let restoredConversation: any[] = [];

    if (item.conversation && item.conversation.length > 0) {
      const firstAssistantIndex = item.conversation.findIndex(m => m.role === "assistant");
      if (firstAssistantIndex !== -1) {
        restoredAnswer = {
          summary: item.conversation[firstAssistantIndex].content,
          categories: [],
          spoilers: ""
        };
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

  if (!user) {
    return (
      <div className="min-h-screen w-full transition-colors duration-300" style={{ backgroundColor: "var(--nerdvana-conversation-bg)" }}>
        <div className="fixed inset-0 pointer-events-none paper-texture nerdvana-paper-texture-conversation" />
        <div className="relative">
          <Header onNavigate={onNavigatePage} />
          <main className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-12">
            <section className="archive-main">
              <div className="archive-header">
                <p className="archive-label">PROFILE ARCHIVE</p>
                <p className="archive-label">ACCESS LEVEL: GUEST</p>
                <p className="archive-label">STATUS: LOCKED</p>
              </div>
              <div className="archive-modules">
                <div className="archive-module">Saved Lorebooks</div>
                <div className="archive-module">Search History</div>
                <div className="archive-module">Continuity Memory</div>
              </div>
              <button
                type="button"
                className="profileSignInBtn auth-button nerdvana-clickable"
                onClick={() => {
                  login().then(() => onNavigatePage("home")).catch((error) => console.warn("Sign in failed", error));
                }}
              >
                SIGN IN
              </button>
            </section>
          </main>
        </div>
        <Footer />
        <style>{`
          .paper-texture {
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='6.5' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
            background-repeat: repeat;
          }
          .nerdvana-paper-texture-conversation { opacity: 0.04; transition: opacity 0.3s ease; }
          .dark .nerdvana-paper-texture-conversation { opacity: 0.08; }
          .archive-main { max-width: min(56rem, 100%); margin: clamp(2rem, 8vw, 6rem) auto; font-family: inherit; text-align: left; }
          .archive-header { border: 1px solid var(--nerdvana-border); background: var(--nerdvana-surface); padding: clamp(0.75rem, 2.2vw, 0.9rem) clamp(0.85rem, 2.8vw, 1rem); }
          .archive-label { font-size: 0.68rem; letter-spacing: 0.16em; opacity: 0.7; text-transform: uppercase; font-family: "Courier New", monospace; color: var(--nerdvana-text); }
          .archive-label + .archive-label { margin-top: 6px; }
          .archive-modules { margin-top: 14px; display: grid; gap: 10px; }
          .archive-module { border: 1px dashed var(--nerdvana-border); background: var(--nerdvana-surface); padding: clamp(0.7rem, 2.4vw, 0.8rem) clamp(0.8rem, 2.6vw, 0.9rem); opacity: 0.6; font-family: "Times New Roman", serif; color: var(--nerdvana-text); transition: transform 180ms ease, border-color 180ms ease, opacity 180ms ease; }
          .archive-module:hover { transform: translateX(3px); border-color: var(--nerdvana-accent); opacity: 0.86; }
          .profileSignInBtn { margin-top: 16px; padding: 9px 14px; border: 2px solid var(--nerdvana-border); box-shadow: 2px 2px 0 var(--nerdvana-accent); font-size: 0.7rem; letter-spacing: 0.15em; font-family: "Courier New", monospace; text-transform: uppercase; }
          .auth-button { background-color: var(--nerdvana-border); border-color: var(--nerdvana-border); color: var(--nerdvana-surface); transition: background-color 0.3s ease, border-color 0.3s ease, transform 0.2s ease; }
          .auth-button:hover { background-color: var(--nerdvana-accent); border-color: var(--nerdvana-accent); transform: translateY(-1px); }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full transition-colors duration-300" style={{ backgroundColor: "var(--nerdvana-conversation-bg)" }}>
      <div className="fixed inset-0 pointer-events-none paper-texture nerdvana-paper-texture-conversation" />
      <div className="relative flex-1 flex flex-col min-h-screen">
        <Header onNavigate={onNavigatePage} />
        
        <main className="flex-1 px-4 sm:px-6 lg:px-10 xl:px-12 py-10 sm:py-14 md:py-20 max-w-7xl mx-auto w-full">
          
          {/* Hero Section */}
          <section className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8 mb-16 md:mb-24">
            <img 
              src={avatarUrl} 
              alt="Avatar" 
              className="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 object-cover shadow-xl transition-transform duration-500 hover:scale-105" 
              style={{ borderColor: "var(--nerdvana-accent)" }}
            />
            <div className="text-center md:text-left">
              <h1 className="text-[clamp(2.8rem,7vw,4.5rem)] font-black tracking-[-0.03em] uppercase leading-none drop-shadow-sm" style={{ fontFamily: 'Impact, "Arial Black", sans-serif', color: "var(--nerdvana-text)" }}>
                {username}
              </h1>
              <p className="mt-3 text-[0.75rem] md:text-[0.85rem] uppercase tracking-[0.25em]" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)", opacity: 0.75 }}>
                Currently Exploring: {lorebooks.length > 0 ? lorebooks[0].topic : "The Unknown"}
              </p>
            </div>
          </section>

          {/* Your Library (Media Cards) */}
          <section className="mb-16 md:mb-24">
            <h2 className="text-[1.3rem] md:text-[1.5rem] font-bold uppercase tracking-[0.08em] mb-6 flex items-center gap-4" style={{ fontFamily: 'Impact, "Arial Black", sans-serif', color: "var(--nerdvana-text)" }}>
              Your Library
              <span className="text-[0.8rem] font-normal tracking-[0.15em] opacity-50 bg-[var(--nerdvana-border)] px-3 py-1 rounded-full text-[var(--nerdvana-surface)]" style={{ fontFamily: '"Courier New", monospace' }}>
                {lorebooks.length} Items
              </span>
            </h2>
            
            {lorebooks.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {lorebooks.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => handleLorebookClick(item)} 
                    className="group relative aspect-[2/3] nerdvana-clickable cursor-pointer overflow-hidden rounded-lg border shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1" 
                    style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-surface)" }}
                  >
                    {/* Dark gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--nerdvana-conversation-bg)] via-transparent to-transparent opacity-90 group-hover:opacity-75 transition-opacity duration-300 z-10" />
                    
                    {/* Subtle abstract background element based on topic */}
                    <div className="absolute inset-0 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-700 bg-[var(--nerdvana-text)]" />
                    
                    <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 z-20 flex flex-col justify-end h-full">
                      <h3 className="text-lg md:text-xl font-bold leading-tight line-clamp-4 mb-2 md:mb-3 drop-shadow-md" style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                        {item.topic}
                      </h3>
                      <p className="text-[0.6rem] uppercase tracking-[0.15em] opacity-70" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                        {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : "Archived"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-10 border rounded-lg border-dashed text-center opacity-60" style={{ borderColor: "var(--nerdvana-border)" }}>
                <p className="text-sm uppercase tracking-[0.1em]" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                  Your library is currently empty.
                </p>
              </div>
            )}
          </section>

          {/* Collections Section */}
          <section className="mb-20">
            <h2 className="text-[1.1rem] md:text-[1.3rem] font-bold uppercase tracking-[0.08em] mb-5" style={{ fontFamily: 'Impact, "Arial Black", sans-serif', color: "var(--nerdvana-text)" }}>
              Collections
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
              {["Favorites", "Read Later", "Deep Dives", "Game Lore"].map((col) => (
                <div 
                  key={col} 
                  className="flex-none px-6 py-2.5 border rounded-full text-[0.7rem] uppercase tracking-[0.15em] opacity-60 hover:opacity-100 cursor-not-allowed transition-opacity" 
                  style={{ borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)", backgroundColor: "var(--nerdvana-surface)" }}
                  title="Collections coming soon"
                >
                  {col}
                </div>
              ))}
            </div>
          </section>

          {/* Settings Section (Minimal) */}
          <section className="border-t pt-10" style={{ borderColor: "var(--nerdvana-border)" }}>
            <h2 className="text-[0.75rem] uppercase tracking-[0.2em] mb-8 opacity-40" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
              Preferences
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-2xl">
              
              <div className="group">
                <label className="block text-[0.65rem] uppercase tracking-[0.15em] mb-2 opacity-50 group-focus-within:opacity-100 transition-opacity" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                  Username
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value)}
                    className="flex-1 bg-transparent border-b pb-1 text-base focus:outline-none transition-colors"
                    style={{ 
                      borderColor: "var(--nerdvana-border)", 
                      color: "var(--nerdvana-text)", 
                      fontFamily: '"Times New Roman", serif',
                      borderBottomColor: canSaveUsername ? "var(--nerdvana-accent)" : "var(--nerdvana-border)"
                    }}
                  />
                  <button 
                    disabled={!canSaveUsername || savingUsername}
                    onClick={onSaveUsername}
                    className="text-[0.65rem] uppercase tracking-[0.15em] px-3 py-1.5 border rounded disabled:opacity-20 hover:bg-[var(--nerdvana-border)] hover:text-[var(--nerdvana-surface)] transition-all"
                    style={{ borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)" }}
                  >
                    {savingUsername ? "Saving" : "Save"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[0.65rem] uppercase tracking-[0.15em] mb-2 opacity-50" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                  Continuity Memory
                </label>
                <p className="text-[0.95rem] pb-1 opacity-80" style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                  {continuityStatus ? "Active (Remembers context across sessions)" : "Off"}
                </p>
              </div>

            </div>
          </section>

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
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
