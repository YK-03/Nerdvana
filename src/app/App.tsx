import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AskPage from "./pages/AskPage";
import ExplorePage from "./pages/ExplorePage";
import ItemPage from "./pages/ItemPage";
import AboutPage from "./pages/AboutPage";
import DebatesPage from "./pages/DebatesPage";
import CommunityPage from "./pages/CommunityPage";
import HistoryPage from "./pages/History";
import SavedLorebooks from "./pages/SavedLorebooks";
import ProfilePage from "./profile/page";
import MarketingPage from "./(marketing)/page";
import { useAuth } from "./hooks/useAuth";
import {
  buildAskUrl,
  mediaLensToUniverse,
  persistMediaLens,
  readMediaLensFromSearch,
  readStoredMediaLens,
  type Universe,
  universeToMediaLens,
} from "./mediaLens";
import { useAutocompleteStore } from "./store/resolverSession";
import AutocompleteOverlay from "./components/AutocompleteOverlay";

const UNIVERSE_TAGLINES = [
  "The Story Ended. The Questions Didn't.",
  "Decode endings, twists, and hidden clues.",
  "From canon facts to wild theories.",
  "Every fandom has secrets. Let's unpack them."
];

const UNIVERSE_OPTIONS: Universe[] = ["Movies", "TV", "Anime", "Games", "Comics"];

const UNIVERSE_PLACEHOLDERS: Record<Universe, string[]> = {
  Movies: [
    "The Matrix",
    "Interstellar",
    "Fight Club"
  ],

  TV: [
    "Breaking Bad",
    "Dark",
    "Stranger Things"
  ],

  Anime: [
    "Attack on Titan",
    "Death Note",
    "Cowboy Bebop"
  ],

  Games: [
    "Red Dead Redemption 2",
    "Elden Ring",
    "Silent Hill 2"
  ],

  Comics: [
    "Secret Wars",
    "Kang the Conqueror",
    "Batman: The Killing Joke"
  ]
};

const TRENDING_MYSTERIES: Record<Universe, string[]> = {
  Movies: [
    "Inception",
    "Blade Runner 2049",
    "Dune"
  ],

  TV: [
    "Severance",
    "Dark",
    "Mr. Robot"
  ],

  Anime: [
    "One Piece",
    "Jujutsu Kaisen",
    "Monster"
  ],

  Games: [
    "Bloodborne",
    "Cyberpunk 2077",
    "Metal Gear Solid"
  ],

  Comics: [
    "Secret Wars",
    "Flashpoint",
    "House of M"
  ]
};

function readQuestionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("q") ?? "";
}

function readItemSlugFromPath(pathname: string) {
  const match = pathname.match(/^\/item\/([^/]+)$/);
  if (!match) return "";
  return decodeURIComponent(match[1]);
}

function LandingPage({
  entry,
  isFocused,
  placeholderIndex,
  taglineIndex,
  selectedUniverse,
  onSetEntry,
  onSetFocused,
  onSetUniverse,
  onSubmit,
  onNavigateHome,
  onNavigatePage
}: {
  entry: string;
  isFocused: boolean;
  placeholderIndex: number;
  taglineIndex: number;
  selectedUniverse: Universe;
  onSetEntry: (value: string) => void;
  onSetFocused: (value: boolean) => void;
  onSetUniverse: (value: Universe) => void;
  onSubmit: (value: string) => void;
  onNavigateHome: () => void;
  onNavigatePage: (page: string) => void;
}) {
  const {
    suggestions,
    activeIndex,
    loading,
    setAutocompleteState,
    setActiveIndex,
    clearAutocompleteState
  } = useAutocompleteStore();

  const debounceTimerRef = useRef<any>(null);
  const currentQueryRef = useRef("");
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const mediaLens = universeToMediaLens(selectedUniverse);
    const query = entry.trim();
    currentQueryRef.current = query;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    if (query.length < 2) {
      clearAutocompleteState();
      return;
    }

    // Set loading state in store
    setAutocompleteState(suggestions, null, true);

    debounceTimerRef.current = setTimeout(async () => {
      if (currentQueryRef.current !== query) return;

      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}&lens=${mediaLens}`, {
          signal: abortController.signal
        });
        if (!res.ok) throw new Error("Fetch failed");
        const data = await res.json();
        if (currentQueryRef.current === query) {
          setAutocompleteState(data, null, false);
        }
      } catch (err: any) {
        if (err.name !== "AbortError" && currentQueryRef.current === query) {
          setAutocompleteState([], null, false);
        }
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, [entry, selectedUniverse, clearAutocompleteState, setAutocompleteState]);

  useEffect(() => {
    return () => {
      clearAutocompleteState();
    };
  }, [clearAutocompleteState]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = activeIndex >= suggestions.length - 1 ? 0 : activeIndex + 1;
        setActiveIndex(nextIndex);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
        setActiveIndex(prevIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearAutocompleteState();
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          e.preventDefault();
          const selected = suggestions[activeIndex];
          clearAutocompleteState();
          onSubmit(selected.displayTitle);
        } else if (entry.trim()) {
          onSubmit(entry);
        }
      }
    } else {
      if (e.key === "Enter" && entry.trim()) {
        onSubmit(entry);
      }
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
    clearAutocompleteState();
    onSubmit(suggestion.displayTitle);
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden flex flex-col transition-colors duration-300" style={{ backgroundColor: "var(--nerdvana-bg)" }}>
      <Header
        onNavigate={(page) => {
          onNavigatePage(page);
        }}
      />

      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-12">
        <div
          className="deadpool-bg fixed inset-0 pointer-events-none bg-no-repeat"
          style={{ backgroundImage: "url(/image.jpg)" }}
        />
        <div className="fixed inset-0 pointer-events-none paper-texture nerdvana-paper-texture" />
        <div className="fixed -top-28 -right-20 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-opacity duration-300 nerdvana-gradient-accent" />
        <div className="fixed -bottom-20 left-1/3 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-opacity duration-300 nerdvana-gradient-dark" />
        <div className="fixed inset-0 pointer-events-none transition-opacity duration-300 nerdvana-vignette" />

        <div className="relative z-10 w-full max-w-4xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.03 }}
            transition={{ duration: 0.3 }}
            className="nerdvana-clickable text-[clamp(2.4rem,14vw,6.8rem)] font-black tracking-[-0.04em] leading-[0.85] uppercase mb-2 cursor-pointer transition-colors duration-300"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              color: "var(--nerdvana-text)"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--nerdvana-accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--nerdvana-text)")}
          >
            NERDVANA
          </motion.h1>

          <motion.p
            key={taglineIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="text-[0.95rem] sm:text-[1.0625rem] md:text-[1.2rem] mb-5 sm:mb-6 tracking-wide transition-colors duration-300"
            style={{
              fontFamily: '"Courier New", monospace',
              color: "var(--nerdvana-text)"
            }}
          >
            {UNIVERSE_TAGLINES[taglineIndex]}
          </motion.p>

          <div className="flex flex-wrap justify-center gap-2 mb-4 sm:mb-5">
            {UNIVERSE_OPTIONS.map((option) => {
              const active = selectedUniverse === option;
              return (
                <button
                  key={option}
                  onClick={() => onSetUniverse(option)}
                  className={`px-3 py-2 text-[0.68rem] sm:text-xs md:text-sm uppercase tracking-[0.12em] border-[2px] transition-all duration-300 ${active
                    ? "shadow-[2px_2px_0_var(--nerdvana-border)]"
                    : "hover:-translate-y-0.5 hover:shadow-[1px_1px_0_var(--nerdvana-border)]"
                    }`}
                  style={{
                    fontFamily: '"Courier New", monospace',
                    backgroundColor: active ? "var(--nerdvana-accent)" : "var(--nerdvana-surface)",
                    color: active ? "var(--nerdvana-surface)" : "var(--nerdvana-text)",
                    borderColor: active ? "var(--nerdvana-accent)" : "var(--nerdvana-border)",
                    opacity: active ? 1 : 0.85
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.6, delay: 0.3, type: "spring", stiffness: 110 }}
            className="relative group"
          >
            <div
              className={`relative rounded-[2px] p-[2px] transition-all duration-300 ${isFocused ? "animate-border-shift" : ""}`}
              style={{
                background: isFocused
                  ? "linear-gradient(120deg, var(--nerdvana-accent), var(--nerdvana-border), var(--nerdvana-accent))"
                  : "var(--nerdvana-border)",
                boxShadow: isFocused
                  ? "0 0 0 3px var(--nerdvana-accent)"
                  : "0 0 0 3px var(--nerdvana-border)"
              }}
            >
              <input
                type="text"
                value={entry}
                onChange={(e) => onSetEntry(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => onSetFocused(true)}
                onBlur={() => setTimeout(() => onSetFocused(false), 200)}
                placeholder={UNIVERSE_PLACEHOLDERS[selectedUniverse][placeholderIndex]}
                className={`w-full text-[1rem] sm:text-[1.0625rem] md:text-[1.2rem] px-4 sm:px-5 md:px-6 py-3.5 sm:py-4 md:py-5 focus:outline-none tracking-wide transition-all duration-300 nerdvana-input ${isFocused ? "cursor-help" : ""
                  }`}
                style={{
                  fontFamily: '"Times New Roman", serif',
                  backgroundColor: "var(--nerdvana-surface)",
                  color: "var(--nerdvana-text)",
                  caretColor: "var(--nerdvana-accent)"
                }}
                autoFocus
                spellCheck={false}
                autoCorrect="off"
                autoComplete="off"
              />
              <AutocompleteOverlay
                suggestions={suggestions}
                activeIndex={activeIndex}
                onSelect={handleSelectSuggestion}
                onClose={() => clearAutocompleteState()}
                onActiveIndexChange={(idx) => setActiveIndex(idx)}
                isVisible={isFocused && entry.trim().length >= 2}
              />
            </div>

            <div
              className="mt-3 text-[0.75rem] uppercase tracking-[0.2em] transition-all duration-300"
              style={{
                fontFamily: '"Courier New", monospace',
                color: isFocused ? "var(--nerdvana-accent)" : "var(--nerdvana-text)",
                opacity: isFocused ? 1 : 0.75
              }}
            >
              Press Enter To Open The Query
            </div>
          </motion.div>

          <div className="mt-4 sm:mt-5 flex flex-wrap justify-center gap-2">
            {TRENDING_MYSTERIES[selectedUniverse].map((prompt) => (
              <button
                key={prompt}
                onClick={() => onSubmit(prompt)}
                className="text-[0.68rem] sm:text-[0.72rem] md:text-[0.78rem] uppercase tracking-[0.09em] px-3 py-2 border-[1.8px] transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  fontFamily: '"Courier New", monospace',
                  borderColor: "var(--nerdvana-border)",
                  backgroundColor: "var(--nerdvana-bg)",
                  color: "var(--nerdvana-text)"
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <style>{`
          .deadpool-bg {
            background-position: 8% bottom;
            background-size: auto 90%;
            opacity: 0.6;
            mix-blend-mode: multiply;
            transition: opacity 0.3s ease, mix-blend-mode 0.3s ease, filter 0.3s ease;
          }

          .dark .deadpool-bg {
            opacity: 0.9;
            mix-blend-mode: multiply;
            filter: brightness(1.15) contrast(1.15) saturate(1.08);
          }

          .paper-texture {
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='6.5' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
            background-repeat: repeat;
          }

          .nerdvana-paper-texture {
            opacity: 0.045;
            transition: opacity 0.3s ease;
          }

          .dark .nerdvana-paper-texture {
            opacity: 0.12;
          }

          .nerdvana-input::placeholder {
            color: var(--nerdvana-placeholder);
            opacity: 1;
          }

          .nerdvana-gradient-accent {
            background: radial-gradient(circle, rgba(140,28,19,0.22) 0%, rgba(140,28,19,0) 70%);
          }

          .dark .nerdvana-gradient-accent {
            background: radial-gradient(circle, rgba(168,50,40,0.15) 0%, rgba(168,50,40,0) 70%);
          }

          .nerdvana-gradient-dark {
            background: radial-gradient(circle, rgba(26,25,24,0.15) 0%, rgba(26,25,24,0) 70%);
          }

          .dark .nerdvana-gradient-dark {
            background: radial-gradient(circle, rgba(74,72,69,0.2) 0%, rgba(74,72,69,0) 70%);
          }

          .nerdvana-vignette {
            background: radial-gradient(ellipse at center, rgba(235,232,223,0) 0%, rgba(235,232,223,0.4) 60%, rgba(235,232,223,0.8) 100%);
          }

          .dark .nerdvana-vignette {
            background: radial-gradient(ellipse at center, rgba(31,29,27,0) 0%, rgba(31,29,27,0.15) 60%, rgba(31,29,27,0.4) 100%);
          }

          @keyframes border-shift {
            0% {
              background-position: 0% 50%;
            }
            100% {
              background-position: 100% 50%;
            }
          }

          .animate-border-shift {
            background-size: 200% 200%;
            animation: border-shift 3s linear infinite;
          }

          @media (max-width: 1024px) {
            .deadpool-bg {
              display: none;
            }
          }

        `}</style>
      </div>
      <Footer variant="signature" />
    </div>
  );
}

export default function App() {
  const [entry, setEntry] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [selectedUniverse, setSelectedUniverse] = useState<Universe>(() => {
    const lensFromUrl = readMediaLensFromSearch(window.location.search, readStoredMediaLens());
    return mediaLensToUniverse(lensFromUrl);
  });
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [question, setQuestion] = useState(() => readQuestionFromUrl());
  const { user, loading } = useAuth();
  const prevUserRef = useRef<typeof user>(null);
  const hasResolvedAuthRef = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
      setQuestion(readQuestionFromUrl());
      setSelectedUniverse(mediaLensToUniverse(readMediaLensFromSearch(window.location.search, readStoredMediaLens())));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    persistMediaLens(universeToMediaLens(selectedUniverse));
  }, [selectedUniverse]);

  useEffect(() => {
    if (loading) return;

    // If a user is already authenticated and lands on the marketing page,
    // send them straight to /home instead of showing marketing.
    if (user && pathname === "/") {
      window.history.replaceState({}, "", "/home");
      setPathname("/home");
      setQuestion("");
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("nerdvana-auth-intent");
      }
      prevUserRef.current = user;
      if (!hasResolvedAuthRef.current) {
        hasResolvedAuthRef.current = true;
      }
      return;
    }

    const signInIntent =
      typeof window !== "undefined" && window.sessionStorage.getItem("nerdvana-auth-intent") === "signin";

    const wasLoggedOut = !prevUserRef.current;
    const signedInNow = Boolean(user);
    const shouldRedirect = signedInNow && (signInIntent || (hasResolvedAuthRef.current && wasLoggedOut));

    if (shouldRedirect) {
      window.history.pushState({}, "", "/home");
      setPathname("/home");
      setQuestion("");
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("nerdvana-auth-intent");
      }
    }

    if (!hasResolvedAuthRef.current) {
      hasResolvedAuthRef.current = true;
    }
    prevUserRef.current = user;
  }, [loading, pathname, user]);

  useEffect(() => {
    if (pathname === "/home") {
      const interval = setInterval(() => {
        setPlaceholderIndex((prev) => (prev + 1) % UNIVERSE_PLACEHOLDERS[selectedUniverse].length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [pathname, selectedUniverse]);

  useEffect(() => {
    if (pathname === "/home") {
      const interval = setInterval(() => {
        setTaglineIndex((prev) => (prev + 1) % UNIVERSE_TAGLINES.length);
      }, 4200);
      return () => clearInterval(interval);
    }
  }, [pathname]);

  useEffect(() => {
    setPlaceholderIndex(0);
  }, [selectedUniverse]);

  const navigateToAsk = (value: string, context?: { item?: string; mediaLens?: MediaLens }) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const mediaLens = context?.mediaLens ?? universeToMediaLens(selectedUniverse);
    window.history.pushState({ mediaLens, item: context?.item }, "", buildAskUrl(trimmed, { lens: mediaLens, item: context?.item }));
    setPathname("/ask");
    setQuestion(trimmed);
    setEntry("");
  };

  const navigateHome = () => {
    window.history.pushState({}, "", "/home");
    setPathname("/home");
    setQuestion("");
  };

  const navigateToExplore = () => {
    window.history.pushState({}, "", "/explore");
    setPathname("/explore");
    setQuestion("");
  };

  const navigateToAbout = () => {
    window.history.pushState({}, "", "/about");
    setPathname("/about");
    setQuestion("");
  };

  const navigateToDebates = () => {
    window.history.pushState({}, "", "/debates");
    setPathname("/debates");
    setQuestion("");
  };

  const navigateToCommunity = () => {
    window.history.pushState({}, "", "/community");
    setPathname("/community");
    setQuestion("");
  };

  const navigateToProfile = () => {
    window.history.pushState({}, "", "/profile");
    setPathname("/profile");
    setQuestion("");
  };

  const navigateToItem = (slug: string) => {
    const encoded = encodeURIComponent(slug);
    const itemPath = `/item/${encoded}`;
    window.history.pushState({}, "", itemPath);
    setPathname(itemPath);
  };

  const navigateByHeaderPage = (page: string) => {
    if (page === "home") navigateHome();
    if (page === "explore") navigateToExplore();
    if (page === "about") navigateToAbout();
    if (page === "debates") navigateToDebates();
    if (page === "community") navigateToCommunity();
    if (page === "profile") navigateToProfile();
  };

  const content = useMemo(() => {
    if (pathname === "/") {
      return (
        <MarketingPage
          onNavigatePage={navigateByHeaderPage}
          onStartInsights={() => {
            window.history.pushState({}, "", "/home");
            setPathname("/home");
            setQuestion("");
          }}
        />
      );
    }

    if (pathname === "/home") {
      return (
        <LandingPage
          entry={entry}
          isFocused={isFocused}
          placeholderIndex={placeholderIndex}
          taglineIndex={taglineIndex}
          selectedUniverse={selectedUniverse}
          onSetEntry={setEntry}
          onSetFocused={setIsFocused}
          onSetUniverse={setSelectedUniverse}
          onSubmit={navigateToAsk}
          onNavigateHome={navigateHome}
          onNavigatePage={navigateByHeaderPage}
        />
      );
    }

    if (pathname === "/ask") {
      return (
        <AskPage
          question={question}
          onNavigatePage={navigateByHeaderPage}
          onQuestionChange={setQuestion}
        />
      );
    }

    if (pathname === "/explore") {
      return (
        <ExplorePage
          onAskQuestion={navigateToAsk}
          onNavigatePage={navigateByHeaderPage}
        />
      );
    }

    if (pathname.startsWith("/item/")) {
      const slug = readItemSlugFromPath(pathname);
      return (
        <ItemPage
          slug={slug}
          onAskQuestion={navigateToAsk}
          onNavigatePage={navigateByHeaderPage}
        />
      );
    }

    if (pathname === "/about") {
      return <AboutPage onNavigatePage={navigateByHeaderPage} />;
    }

    if (pathname === "/debates") {
      return <DebatesPage onNavigatePage={navigateByHeaderPage} />;
    }

    if (pathname === "/community") {
      return <CommunityPage onNavigatePage={navigateByHeaderPage} />;
    }

    if (pathname === "/profile") {
      return <ProfilePage onNavigatePage={navigateByHeaderPage} />;
    }

    if (pathname === "/customize-profile") {
      return <ProfilePage onNavigatePage={navigateByHeaderPage} />;
    }

    if (pathname === "/saved") {
      return <SavedLorebooks onNavigatePage={navigateByHeaderPage} />;
    }

    if (pathname === "/history") {
      return <HistoryPage onNavigatePage={navigateByHeaderPage} />;
    }

    return <MarketingPage onNavigatePage={navigateByHeaderPage} onStartInsights={navigateHome} />;
  }, [entry, isFocused, pathname, placeholderIndex, question, selectedUniverse, taglineIndex]);

  return content;
}
