"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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
  visual?: {
    posterUrl: string;
    backdropUrl?: string | null;
    mediaType: string;
    provider: string;
  } | null;
  visualAsset?: {
    url: string;
    posterUrl?: string | null;
    backdropUrl?: string | null;
    title: string;
    source: string;
    mediaType: string;
  } | null;
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
  const [currentExploration, setCurrentExploration] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onTriggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("Unsupported file type. Please select a JPG, PNG, or WEBP image.");
      return;
    }

    // Validate size (8MB)
    if (file.size > 8 * 1024 * 1024) {
      alert("File is too large. Please select an image smaller than 8MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const maxDim = 200; // Resize to 200x200 px
        canvas.width = maxDim;
        canvas.height = maxDim;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Crop to square
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;

        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxDim, maxDim);

        const base64Data = canvas.toDataURL("image/jpeg", 0.85);

        if (!user?.uid) return;

        try {
          const userRef = doc(db, "users", user.uid);
          await setDoc(userRef, { avatar: base64Data }, { merge: true });
          setAvatarUrl(base64Data);
          setImgError(false);
        } catch (err) {
          console.error("AVATAR UPLOAD ERROR:", err);
          alert("Failed to save avatar image.");
        }
      };
      img.onerror = () => {
        alert("Failed to load selected image.");
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      alert("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };


  useEffect(() => {
    if (!user) {
      setUsername("Explorer");
      setUsernameDraft("Explorer");
      setAvatarUrl("");
      setImgError(false);
      setLorebooks([]);
      setCurrentExploration(null);
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
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data
        };
      }) as LorebookItem[];
      setLorebooks(items);
    });

    const unsubExploration = onSnapshot(doc(db, "users", user.uid, "state", "currentExploration"), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentExploration({ id: docSnap.id, ...docSnap.data() });
      } else {
        setCurrentExploration(null);
      }
    });

    return () => {
      unsubscribe();
      unsubExploration();
    };
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

  const handleLorebookClick = (item: any) => {
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
      query: item.title || item.topic,
      conversation: restoredConversation,
      results: item.results || [],
      answer: restoredAnswer,
      rehydrated: true,
      mediaLens: normalizeMediaLens(item.mediaLens),
      item: item.providerId || null
    };

    window.history.pushState(
      stateToPush,
      "",
      buildAskUrl(item.title || item.topic, { lens: normalizeMediaLens(item.mediaLens), item: item.providerId })
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
        
        <main className="flex-1 px-4 sm:px-6 lg:px-10 xl:px-12 py-12 sm:py-16 md:py-24 max-w-5xl mx-auto w-full flex flex-col">
          <h1
            className="text-[clamp(2rem,8.6vw,3.2rem)] font-black tracking-[-0.03em] leading-tight uppercase mb-6 sm:mb-8"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              color: "var(--nerdvana-text)"
            }}
          >
            Profile
          </h1>
          
          <div 
            className="w-full border rounded-md p-6 sm:p-8 md:p-10 flex flex-col gap-0 transition-colors duration-300"
            style={{ 
              borderColor: "var(--nerdvana-border)", 
              }}
          >
            {/* Hero Section */}
            <section className="flex flex-col items-center text-center gap-4 sm:gap-6 w-full mt-2 md:mt-4">
              <div className="relative group shrink-0">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/png, image/jpeg, image/jpg, image/webp" 
                  className="hidden" 
                />
                
                {/* Pencil Edit Overlay Icon */}
                <button
                  type="button"
                  onClick={onTriggerFilePicker}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center cursor-pointer z-20 group"
                  aria-label="Upload profile picture"
                >
                  <svg className="w-8 h-8 md:w-10 md:h-10 text-white/95 scale-90 group-hover:scale-100 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>

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
                <h1 className="text-[clamp(2.5rem,6vw,4rem)] font-black tracking-[-0.02em] leading-none mb-4" style={{ fontFamily: 'Impact, "Arial Black", sans-serif', color: "var(--nerdvana-text)" }}>
                  {username}
                </h1>
                
                {/* Bio */}
                {bio && (
                  <div className="max-w-md mx-auto mb-4">
                    <p className="text-[1rem] md:text-[1.1rem] leading-relaxed opacity-90" style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                      {bio}
                    </p>
                  </div>
                )}

              </div>
            </section>

            <hr className="my-5 sm:my-6" style={{ borderColor: "var(--nerdvana-border)", opacity: 0.6 }} />

            {/* Continue Exploring (Featured Panel) */}
            <section className="w-full max-w-4xl mx-auto flex flex-col items-center">
              {currentExploration ? (() => {
                const activeStory = currentExploration;
                const visual = activeStory.visual;
                const visualAsset = activeStory.visualAsset;
                const artworkUrl = visual 
                  ? (visual.backdropUrl || visual.posterUrl || null) 
                  : (visualAsset?.backdropUrl || visualAsset?.posterUrl || visualAsset?.url || null);
                
                return (
                  <div 
                    onClick={() => handleLorebookClick(activeStory)}
                    className="group relative w-full aspect-[4/3] md:aspect-[21/9] rounded-xl border shadow-md hover:shadow-2xl transition-all duration-500 overflow-hidden nerdvana-clickable cursor-pointer transform hover:-translate-y-1"
                    style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-surface)" }}
                  >
                    {artworkUrl ? (
                      <img 
                        src={artworkUrl} 
                        alt={activeStory.title || activeStory.topic} 
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-all duration-700 bg-[var(--nerdvana-text)]" />
                    )}
                    
                    {/* Subtle gradient overlay restricted to bottom to preserve artwork */}
                    <div className="absolute bottom-0 left-0 w-full h-[60%] bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-70 transition-opacity duration-500 z-10 pointer-events-none" />
                    
                    <div className="absolute inset-0 flex flex-col justify-end items-start p-6 md:p-10 lg:p-12 z-20">
                      <span className="text-[0.6rem] md:text-[0.65rem] uppercase tracking-[0.25em] opacity-80 mb-3" style={{ fontFamily: '"Courier New", monospace', color: "white" }}>
                        Continue Exploring
                      </span>
                      <h3 className="text-[clamp(2rem,5vw,3.75rem)] font-bold uppercase tracking-tight leading-[1] mb-6 drop-shadow-md transition-transform duration-500 origin-bottom-left group-hover:scale-[1.01]" style={{ fontFamily: 'Impact, "Arial Black", sans-serif', color: "white" }}>
                        {activeStory.title || activeStory.topic}
                      </h3>
                      
                      <div>
                        <button 
                          className="nerdvana-clickable text-[0.7rem] uppercase tracking-[0.15em] px-5 py-2 border-[2px] auth-button flex items-center gap-3 transition-all duration-300" 
                          style={{ 
                            fontFamily: '"Courier New", monospace',
                            boxShadow: "2px 2px 0 var(--nerdvana-accent)",
                            color: "var(--nerdvana-surface)"
                          }}
                        >
                          Continue <span>→</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="w-full aspect-[4/3] md:aspect-[21/9] rounded-xl border border-dashed flex flex-col items-center justify-center p-8 opacity-40 transition-opacity hover:opacity-60" style={{ borderColor: "var(--nerdvana-border)" }}>
                  <p className="text-[1rem] md:text-[1.1rem] italic mb-6 text-center" style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}>
                    Pick up where your next story begins.
                  </p>
                  <button 
                    onClick={() => onNavigatePage("home")}
                    className="text-[0.65rem] uppercase tracking-[0.15em] px-6 py-2.5 border rounded-full text-[var(--nerdvana-text)] border-[var(--nerdvana-border)] hover:bg-[var(--nerdvana-text)] hover:text-[var(--nerdvana-surface)] transition-all"
                  >
                    Explore
                  </button>
                </div>
              )}
            </section>

            <hr className="my-5 sm:my-6" style={{ borderColor: "var(--nerdvana-border)", opacity: 0.6 }} />

            {/* Your Library (Media Cards) */}
            <section className="w-full flex flex-col items-center">
              <h2 className="text-[0.7rem] uppercase tracking-[0.25em] mb-6 opacity-40 text-center" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                Your Library
              </h2>
              
              {lorebooks.length > 0 ? (
                <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 justify-items-center max-w-4xl">
                  {lorebooks.map((item) => {
                    const visual = item.visual;
                    const visualAsset = item.visualAsset;
                    const artworkUrl = visual 
                      ? (visual.posterUrl || visual.backdropUrl || null) 
                      : (visualAsset?.posterUrl || visualAsset?.backdropUrl || visualAsset?.url || null);
                    
                    return (
                      <div 
                        key={item.id} 
                        onClick={() => handleLorebookClick(item)} 
                        className="group relative nerdvana-clickable cursor-pointer overflow-hidden rounded-lg border shadow-sm hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1 w-full aspect-[2/3] max-w-[260px] flex items-center justify-center p-5 text-center" 
                        style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-surface)" }}
                      >
                        {artworkUrl ? (
                          <img 
                            src={artworkUrl} 
                            alt={item.topic} 
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" 
                          />
                        ) : (
                          <span 
                            className="text-sm md:text-base font-medium opacity-80 leading-snug line-clamp-4 group-hover:opacity-100 transition-opacity duration-300"
                            style={{ fontFamily: '"Times New Roman", serif', color: "var(--nerdvana-text)" }}
                          >
                            {item.topic}
                          </span>
                        )}
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

            <hr className="my-5 sm:my-6" style={{ borderColor: "var(--nerdvana-border)", opacity: 0.6 }} />

            {/* Settings Section (Minimal) */}
            <section className="w-full flex flex-col items-center">
              <h2 className="text-[0.75rem] uppercase tracking-[0.2em] mb-6 opacity-30 text-center" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                Preferences
              </h2>
              <div className="w-full max-w-sm flex flex-col gap-6">
                
                <div className="group text-left">
                  <label className="block text-[0.65rem] uppercase tracking-[0.15em] mb-2 opacity-50 group-focus-within:opacity-100 transition-opacity" style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-text)" }}>
                    Username
                  </label>
                  <div className="flex items-center gap-3">
                    <input 
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      className={`flex-1 bg-transparent border-b pb-1 text-base focus:outline-none transition-colors duration-200 ${
                        canSaveUsername
                          ? "border-b-[var(--nerdvana-accent)] focus:border-b-[var(--nerdvana-accent-hover)]"
                          : "border-b-[var(--nerdvana-border)] focus:border-b-[var(--nerdvana-text)]"
                      }`}
                      style={{ 
                        color: "var(--nerdvana-text)", 
                        fontFamily: '"Times New Roman", serif',
                      }}
                    />
                    <button 
                      disabled={!canSaveUsername || savingUsername}
                      onClick={onSaveUsername}
                      className={`text-[0.65rem] uppercase tracking-[0.15em] px-3 py-1.5 border rounded transition-all duration-200 ${
                        canSaveUsername || savingUsername
                          ? "opacity-60 hover:opacity-100 border-[var(--nerdvana-border)] hover:border-[var(--nerdvana-text)]"
                          : "opacity-0 pointer-events-none"
                      }`}
                      style={{ color: "var(--nerdvana-text)", backgroundColor: "transparent" }}
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
                      className={`flex-1 bg-transparent border-b pb-1 text-[0.95rem] focus:outline-none transition-colors duration-200 resize-none hide-scrollbar ${
                        canSaveBio
                          ? "border-b-[var(--nerdvana-accent)] focus:border-b-[var(--nerdvana-accent-hover)]"
                          : "border-b-[var(--nerdvana-border)] focus:border-b-[var(--nerdvana-text)]"
                      }`}
                      rows={2}
                      maxLength={160}
                      placeholder="Tell people a little about your taste..."
                      style={{ 
                        color: "var(--nerdvana-text)", 
                        fontFamily: '"Times New Roman", serif',
                      }}
                    />
                    <button 
                      disabled={!canSaveBio || savingBio}
                      onClick={onSaveBio}
                      className={`text-[0.65rem] uppercase tracking-[0.15em] px-3 py-1.5 border rounded transition-all duration-200 ${
                        canSaveBio || savingBio
                          ? "opacity-60 hover:opacity-100 border-[var(--nerdvana-border)] hover:border-[var(--nerdvana-text)]"
                          : "opacity-0 pointer-events-none"
                      }`}
                      style={{ color: "var(--nerdvana-text)", backgroundColor: "transparent" }}
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
          </div>
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
        .auth-button { background-color: var(--nerdvana-border); border-color: var(--nerdvana-border); color: var(--nerdvana-surface); transition: background-color 0.3s ease, border-color 0.3s ease, transform 0.2s ease; }
        .auth-button:hover { background-color: var(--nerdvana-accent); border-color: var(--nerdvana-accent); transform: translateY(-1px); }
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
