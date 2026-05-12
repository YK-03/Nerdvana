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

const UNIVERSE_TAGLINES = [
  "The Story Ended. The Questions Didn't.",
  "Decode endings, twists, and hidden clues.",
  "From canon facts to wild theories.",
  "Every fandom has secrets. Let's unpack them."
];

const UNIVERSE_OPTIONS: Universe[] = ["Movies", "TV", "Anime", "Games", "Comics"];

const UNIVERSE_PLACEHOLDERS: Record<Universe, string[]> = {
  Movies: [
    "Explain the ending of Inception...",
    "What did Nolan really imply there?",
    "Was that scene symbolic or literal?"
  ],
  TV: [
    "Why did THAT happen in Game of Thrones?",
    "Did the finale contradict earlier seasons?",
    "What foreshadowing did I miss?"
  ],
  Anime: [
    "Was that anime ending rushed or planned?",
    "Canon arc or filler arc implications?",
    "What does that final shot really mean?"
  ],
  Games: [
    "Hidden lore behind this game ending?",
    "Was this questline choice the canon path?",
    "What did the post-credits scene imply?"
  ],
  Comics: [
    "Is this comic event canon now?",
    "Main timeline or alternate earth?",
    "Which run explains this best?"
  ]
};

const TRENDING_MYSTERIES: Record<Universe, string[]> = {
  Movies: ["Inception ending", "Interstellar bookshelf", "Dune prophecy"],
  TV: ["GOT Azor Ahai", "Dark timeline knot", "Severance finale clues"],
  Anime: ["Attack Titan paths", "JJK cursed binding", "One Piece will"],
  Games: ["Elden Ring age choice", "Silent Hill loop", "RDR2 honor lore"],
  Comics: ["Secret Wars reset", "Flashpoint paradox", "Kang variants"]
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && entry.trim()) {
      onSubmit(entry);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden overflow-y-hidden flex flex-col transition-colors duration-300" style={{ backgroundColor: "var(--nerdvana-bg)" }}>
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
                onBlur={() => onSetFocused(false)}
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

  const navigateToAsk = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const mediaLens = universeToMediaLens(selectedUniverse);
    window.history.pushState({ mediaLens }, "", buildAskUrl(trimmed, { lens: mediaLens }));
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
        />
      );
    }

    if (pathname === "/explore") {
      return (
        <ExplorePage
          onOpenItem={navigateToItem}
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
