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

export default function ProfilePage({ onNavigatePage }: ProfilePageProps) {
  const [user] = useAuthState(auth);
  const { login } = useAuth();
  
  const [username, setUsername] = useState("Explorer");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [imgError, setImgError] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("Explorer");
  const [savingUsername, setSavingUsername] = useState(false);
  const [bio, setBio] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [lorebooks, setLorebooks] = useState<LorebookItem[]>([]);

  useEffect(() => {
    if (!user) {
      setUsername("Explorer");
      setUsernameDraft("Explorer");
      setAvatarUrl("");
      setImgError(false);
      setLorebooks([]);
      return;
    }

    const fetchUser = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const data = snap.data() as { username?: string; avatar?: string; bio?: string } | undefined;
        
        const resolvedUsername = typeof data?.username === "string" && data.username.trim()
          ? data.username.trim()
          : user.displayName || "Explorer";
          
        const hasCustomAvatar = typeof data?.avatar === "string" && data.avatar.trim() !== "" && data.avatar !== DEFAULT_AVATAR;
        const resolvedAvatar = hasCustomAvatar
          ? data.avatar.trim()
          : (user.photoURL || "");

        const resolvedBio = typeof data?.bio === "string" ? data.bio : "";

        setUsername(resolvedUsername);
        setUsernameDraft(resolvedUsername);
        setAvatarUrl(resolvedAvatar);
        setImgError(false);
        setBio(resolvedBio);
        setBioDraft(resolvedBio);
      } catch (error) {
        const fallbackName = user.displayName || "Explorer";
        setUsername(fallbackName);
        setUsernameDraft(fallbackName);
        setAvatarUrl(user.photoURL || "");
        setImgError(false);
        setBio("");
        setBioDraft("");
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

  const canSaveBio = useMemo(() => {
    return bioDraft !== bio;
  }, [bio, bioDraft]);

  const onSaveBio = async () => {
    if (!user?.uid || !canSaveBio || savingBio) return;

    const timeoutId = setTimeout(() => {
      setSavingBio(false);
    }, 10000);

    try {
      setSavingBio(true);
      const userRef = doc(db, "users", user.uid);
      const updatedSettings = { bio: bioDraft.trim() };
      
      await setDoc(userRef, updatedSettings, { merge: true });
      setBio(updatedSettings.bio);
      setBioDraft(updatedSettings.bio);
    } catch (err) {
      console.error("BIO SAVE ERROR:", err);
    } finally {
      clearTimeout(timeoutId);
      setSavingBio(false);
    }
  };

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
                <div className="archive-module">Bio</div>
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
        
        <main className="flex-1 px-4 sm:px-6 lg:px-10 xl:px-12 py-12 sm:py-16 md:py-24 max-w-3xl mx-auto w-full flex flex-col items-center">
          
          {/* Hero Section */}
          <section className="flex flex-col items-center text-center gap-6 mb-24 md:mb-32 w-full mt-4 md:mt-8">
            <div className="relative group shrink-0">
              {/* Upload button wrapper (future-ready) */}
              {avatarUrl && !imgError ? (
                <img 
                  src={avatarUrl} 
                  alt={username} 
                  onError={() => setImgError(true)}
                  referrerPolicy="no-referrer"
                  className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover shadow-sm transition-transform duration-500 group-hover:scale-[1.02]" 
                />
              ) : (
                <div 
                  className="w-32 h-32 md:w-40 md:h-40 rounded-full shadow-sm flex items-center justify-center transition-transform duration-500 group-hover:scale-[1.02]"
                  style={{ backgroundColor: "var(--nerdvana-border)", color: "var(--nerdvana-surface)" }}
                >
                  <span className="text-4xl md:text-5xl font-black uppercase" style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}>
                    {username ? username.charAt(0) : "?"}
                  </span>
                </div>
              )}
            </div>
            
            <div className="pt-2 md:pt-4 w-full">
              <h1 className="text-[clamp(2.5rem,6vw,4rem)] font-black tracking-[-0.02em] leading-none mb-6" style={{ fontFamily: 'Impact, "Arial Black", sans-serif', color: "var(--nerdvana-text)" }}>
                {username}
              </h1>
              
              {/* Bio */}
              {bio && (
                <div className="max-w-md mx-auto mb-12">
                  <p className="text-[1rem] md:text-[1.1rem] leading-relaxed opacity-90" style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                    {bio}
                  </p>
                </div>
              )}

              {/* Story Focal Point */}
              {lorebooks.length > 0 && (
                <div className="flex flex-col items-center">
                  <span className="text-[0.65rem] uppercase tracking-[0.2em] opacity-40 mb-2" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                    Currently exploring
                  </span>
                  <span className="text-[1.3rem] md:text-[1.5rem] italic opacity-90 mb-5" style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                    {lorebooks[0].topic}
                  </span>
                  <button 
                    onClick={() => handleLorebookClick(lorebooks[0])}
                    className="text-[0.65rem] uppercase tracking-[0.15em] px-5 py-2 border rounded hover:bg-[var(--nerdvana-text)] hover:text-[var(--nerdvana-surface)] hover:border-[var(--nerdvana-text)] transition-all duration-200 hover:-translate-y-[1px]" 
                    style={{ borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)" }}
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Your Library (Media Cards) */}
          <section className="mb-24 md:mb-32 w-full flex flex-col items-center">
            <h2 className="text-[0.7rem] uppercase tracking-[0.25em] mb-10 opacity-40 text-center" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
              Your Library
            </h2>
            
            {lorebooks.length > 0 ? (
              <div className={`w-full grid gap-6 md:gap-8 justify-items-center ${
                lorebooks.length === 1 
                  ? "grid-cols-1 max-w-3xl" 
                  : "grid-cols-2 sm:grid-cols-3 max-w-4xl"
              }`}>
                {lorebooks.map((item) => {
                  const media = item.results?.[0];
                  const artworkPath = media?.poster_path || media?.backdrop_path;
                  const artworkUrl = artworkPath ? `https://image.tmdb.org/t/p/w780${artworkPath}` : null;
                  
                  return (
                    <div 
                      key={item.id} 
                      onClick={() => handleLorebookClick(item)} 
                      className={`group relative nerdvana-clickable cursor-pointer overflow-hidden rounded-lg border shadow-sm hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1 w-full ${
                        lorebooks.length === 1 ? "aspect-[4/5] sm:aspect-[21/9]" : "aspect-[2/3] max-w-[260px]"
                      }`} 
                      style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-surface)" }}
                    >
                      {artworkUrl ? (
                        <img 
                          src={artworkUrl} 
                          alt={item.topic} 
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" 
                        />
                      ) : (
                        <div className="absolute inset-0 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-700 bg-[var(--nerdvana-text)]" />
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--nerdvana-conversation-bg)] via-[var(--nerdvana-conversation-bg)]/20 to-transparent opacity-90 group-hover:opacity-75 transition-opacity duration-500 z-10" />
                      
                      <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8 z-20 flex flex-col justify-end h-full text-center items-center">
                        <h3 className={`${lorebooks.length === 1 ? 'text-2xl md:text-4xl' : 'text-lg md:text-xl'} font-bold leading-tight line-clamp-3 mb-2 drop-shadow-lg`} style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                          {item.topic}
                        </h3>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="max-w-md w-full mx-auto p-12 border rounded-lg border-dashed text-center opacity-30" style={{ borderColor: "var(--nerdvana-border)" }}>
                <p className="text-sm uppercase tracking-[0.1em]" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                  Your library is empty.
                </p>
              </div>
            )}
          </section>

          {/* Collections Section */}
          <section className="mb-24 md:mb-32 w-full flex flex-col items-center">
            <h2 className="text-[0.7rem] uppercase tracking-[0.25em] mb-6 opacity-30 text-center" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
              Collections
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              {["Favorites", "Read Later", "Deep Dives", "Game Lore"].map((col) => (
                <div 
                  key={col} 
                  className="flex-none px-6 py-2.5 border rounded-full text-[0.7rem] uppercase tracking-[0.15em] opacity-50 hover:opacity-100 cursor-not-allowed transition-opacity" 
                  style={{ borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)", backgroundColor: "var(--nerdvana-surface)" }}
                  title="Collections coming soon"
                >
                  {col}
                </div>
              ))}
            </div>
          </section>

          {/* Settings Section (Minimal) */}
          <section className="border-t pt-16 w-full flex flex-col items-center" style={{ borderColor: "var(--nerdvana-border)" }}>
            <h2 className="text-[0.75rem] uppercase tracking-[0.2em] mb-12 opacity-30 text-center" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
              Preferences
            </h2>
            <div className="w-full max-w-sm flex flex-col gap-10">
              
              <div className="group text-left">
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
                    className={`text-[0.65rem] uppercase tracking-[0.15em] px-3 py-1.5 border rounded transition-all duration-200 ${
                      canSaveUsername || savingUsername
                        ? "opacity-100 hover:bg-[var(--nerdvana-text)] hover:border-[var(--nerdvana-text)] hover:text-[var(--nerdvana-surface)] hover:-translate-y-[1px]"
                        : "opacity-0"
                    }`}
                    style={{ borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)" }}
                  >
                    {savingUsername ? "Saving" : "Save"}
                  </button>
                </div>
              </div>

              <div className="group text-left">
                <label className="block text-[0.65rem] uppercase tracking-[0.15em] mb-2 opacity-50 group-focus-within:opacity-100 transition-opacity" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                  Bio
                </label>
                <div className="flex items-start gap-3">
                  <textarea 
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value.slice(0, 160))}
                    className="flex-1 bg-transparent border-b pb-1 text-[0.95rem] focus:outline-none transition-colors resize-none hide-scrollbar"
                    rows={2}
                    maxLength={160}
                    placeholder="Tell people a little about your taste..."
                    style={{ 
                      borderColor: "var(--nerdvana-border)", 
                      color: "var(--nerdvana-text)", 
                      fontFamily: '"Times New Roman", serif',
                      borderBottomColor: canSaveBio ? "var(--nerdvana-accent)" : "var(--nerdvana-border)"
                    }}
                  />
                  <button 
                    disabled={!canSaveBio || savingBio}
                    onClick={onSaveBio}
                    className={`text-[0.65rem] uppercase tracking-[0.15em] px-3 py-1.5 border rounded transition-all duration-200 ${
                      canSaveBio || savingBio
                        ? "opacity-100 hover:bg-[var(--nerdvana-text)] hover:border-[var(--nerdvana-text)] hover:text-[var(--nerdvana-surface)] hover:-translate-y-[1px]"
                        : "opacity-0"
                    }`}
                    style={{ borderColor: "var(--nerdvana-border)", color: "var(--nerdvana-text)" }}
                  >
                    {savingBio ? "Saving" : "Save"}
                  </button>
                </div>
                <div className="text-right text-[0.6rem] mt-2 opacity-40" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                   {bioDraft.length}/160
                </div>
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
