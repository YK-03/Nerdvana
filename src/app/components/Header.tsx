"use client";

import { memo, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../hooks/useAuth";
import { db } from "../lib/firebase";
import UserDropdown from "./header/UserDropdown";

interface HeaderProps {
  onNavigate?: (page: string) => void;
}

function Header({ onNavigate }: HeaderProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [open, setOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [username, setUsername] = useState<string>("Explorer");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [imgError, setImgError] = useState(false);
  const { user, login, logout } = useAuth();
  const navItems = ["Explore", "Debates", "Community", "About"];
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("nerdvana-theme") as "light" | "dark" | null;
    const initialTheme = savedTheme || "light";
    setTheme(initialTheme);

    if (initialTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);

    localStorage.setItem("nerdvana-theme", newTheme);

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  useEffect(() => {
    if (!user) {
      setUsername("Explorer");
      setAvatarUrl("");
      setImgError(false);
      return;
    }

    const userRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        const data = snapshot.data() as { username?: unknown; avatar?: unknown } | undefined;
        const nextUsername =
          typeof data?.username === "string" && data.username.trim()
            ? data.username.trim()
            : user.displayName || "Explorer";
        setUsername(nextUsername);

        const hasCustomAvatar = typeof data?.avatar === "string" && data.avatar.trim() !== "";
        const nextAvatar = hasCustomAvatar
          ? (data.avatar as string).trim()
          : (user.photoURL || "");
        setAvatarUrl(nextAvatar);
        setImgError(false);
      },
      () => undefined
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!open && !mobileNavOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setOpen(false);
      }
      const inMobileNav = (target as HTMLElement).closest?.("[data-mobile-nav]");
      if (!inMobileNav) {
        setMobileNavOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [mobileNavOpen, open]);

  const handleLogout = () => {
    setOpen(false);
    logout().catch(() => undefined);
  };

  const navigateToPath = (path: string) => {
    setOpen(false);
    setMobileNavOpen(false);
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative z-50 w-full border-b-[3px] overflow-visible transition-colors duration-300"
      style={{
        backgroundColor: "var(--nerdvana-header-bg)",
        borderColor: "var(--nerdvana-border)",
        boxShadow: "0 6px 0 var(--nerdvana-shadow)"
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[6px] transition-colors duration-300"
        style={{
          background:
            "repeating-linear-gradient(90deg, var(--nerdvana-accent) 0px, var(--nerdvana-accent) 22px, var(--nerdvana-border) 22px, var(--nerdvana-border) 30px)"
        }}
      />
      <div className="absolute inset-0 pointer-events-none paper-texture opacity-70" />
      <div className="absolute inset-0 pointer-events-none header-vignette" />

      <div className="relative mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 pt-5 sm:pt-6 pb-4 sm:pb-5 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <motion.button
            onClick={() => onNavigate?.("home")}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.98 }}
            className="text-[clamp(1.4rem,6.3vw,2rem)] tracking-[-0.04em] uppercase transition-all duration-300 leading-none min-h-10"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              color: "var(--nerdvana-text)"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--nerdvana-accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--nerdvana-text)")}
          >
            NERDVANA
          </motion.button>
          <span
            className="hidden sm:inline-block px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.18em] border-[2px] transition-colors duration-300"
            style={{
              fontFamily: '"Courier New", monospace',
              borderColor: "var(--nerdvana-border)",
              backgroundColor: "var(--nerdvana-surface)",
              color: "var(--nerdvana-text)"
            }}
          >
            Issue 2026
          </span>
        </div>

        <nav
          className="hidden lg:flex items-center gap-2 p-1 border-[2px] transition-colors duration-300"
          style={{
            borderColor: "var(--nerdvana-border)",
            backgroundColor: "var(--nerdvana-surface)"
          }}
        >
          {navItems.map((item) => (
            <button
              key={item}
              onClick={() => onNavigate?.(item.toLowerCase())}
              className="px-3 py-1.5 text-[0.75rem] uppercase tracking-[0.14em] border-[1.5px] border-transparent transition-all duration-300"
              style={{
                fontFamily: '"Courier New", monospace',
                color: "var(--nerdvana-text)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--nerdvana-border)";
                e.currentTarget.style.backgroundColor = "var(--nerdvana-bg)";
                e.currentTarget.style.color = "var(--nerdvana-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "transparent";
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--nerdvana-text)";
              }}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="lg:hidden text-[0.68rem] uppercase tracking-[0.14em] transition-all duration-300 px-3 py-2 border-[2px] min-h-10"
            style={{
              fontFamily: '"Courier New", monospace',
              color: "var(--nerdvana-text)",
              borderColor: "var(--nerdvana-border)",
              backgroundColor: "var(--nerdvana-surface)"
            }}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileNavOpen}
          >
            Menu
          </button>
          <button
            onClick={toggleTheme}
            className="text-[0.66rem] sm:text-[0.7rem] uppercase tracking-[0.15em] transition-all duration-300 px-3 py-2 border-[2px] hover:-translate-y-0.5 min-h-10"
            style={{
              fontFamily: '"Courier New", monospace',
              color: "var(--nerdvana-text)",
              borderColor: "var(--nerdvana-border)",
              backgroundColor: "var(--nerdvana-surface)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--nerdvana-accent)";
              e.currentTarget.style.borderColor = "var(--nerdvana-accent)";
              e.currentTarget.style.boxShadow = "1px 1px 0 var(--nerdvana-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--nerdvana-text)";
              e.currentTarget.style.borderColor = "var(--nerdvana-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
            aria-label="Toggle theme"
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>

          {user ? (
            <>
              <div ref={userMenuRef} className="relative flex items-center">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen((prev) => !prev);
                  }}
                  className="nerdvana-clickable flex items-center justify-center w-11 h-11 rounded-full border-[2px] transition-all duration-200 hover:scale-105 hover:opacity-90 cursor-pointer overflow-hidden relative shadow-sm"
                  style={{
                    borderColor: "var(--nerdvana-border)",
                    backgroundColor: "var(--nerdvana-surface)",
                  }}
                  aria-label="User menu"
                >
                  {avatarUrl && !imgError ? (
                    <img 
                      src={avatarUrl} 
                      alt={username} 
                      onError={() => setImgError(true)}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <span 
                      className="text-[0.95rem] font-black uppercase" 
                      style={{ 
                        fontFamily: 'Impact, "Arial Black", sans-serif',
                        color: "var(--nerdvana-text)" 
                      }}
                    >
                      {username ? username.charAt(0) : "?"}
                    </span>
                  )}
                </button>
                {open && <UserDropdown onNavigate={navigateToPath} onLogout={handleLogout} />}
              </div>
            </>
          ) : (
            <button
              onClick={() => {
                login()
                  .then(() => {
                    setMobileNavOpen(false);
                    onNavigate?.("home");
                  })
                  .catch(() => undefined);
              }}
              className="text-[0.66rem] sm:text-[0.7rem] uppercase tracking-[0.15em] transition-all duration-300 px-3 sm:px-4 py-2 border-[2px] auth-button min-h-10"
              style={{
                fontFamily: '"Courier New", monospace',
                color: "var(--nerdvana-surface)",
                boxShadow: "2px 2px 0 var(--nerdvana-accent)"
              }}
            >
              Sign In
            </button>
          )}
        </div>
      </div>
      {mobileNavOpen && (
        <div
          data-mobile-nav
          className="relative z-50 mx-4 mb-4 mt-1 lg:hidden border-[2px] p-2 flex flex-col gap-1"
          style={{
            borderColor: "var(--nerdvana-border)",
            backgroundColor: "var(--nerdvana-surface)"
          }}
        >
          {navItems.map((item) => (
            <button
              key={`mobile-${item}`}
              onClick={() => {
                setMobileNavOpen(false);
                onNavigate?.(item.toLowerCase());
              }}
              className="w-full text-left px-3 py-2 text-[0.72rem] uppercase tracking-[0.14em] border-[1px] border-transparent hover:border-[var(--nerdvana-border)]"
              style={{
                fontFamily: '"Courier New", monospace',
                color: "var(--nerdvana-text)"
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .paper-texture {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='6.5' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          background-repeat: repeat;
        }

        .header-vignette {
          background: linear-gradient(90deg, rgba(235,232,223,0.28) 0%, rgba(235,232,223,0) 40%, rgba(235,232,223,0.28) 100%);
          transition: background 0.3s ease, opacity 0.3s ease;
        }

        .dark .header-vignette {
          background: linear-gradient(90deg, rgba(37,34,32,0.3) 0%, rgba(37,34,32,0) 40%, rgba(37,34,32,0.3) 100%);
        }

        .paper-texture {
          transition: opacity 0.3s ease;
        }

        .auth-button {
          background-color: var(--nerdvana-border);
          border-color: var(--nerdvana-border);
          color: var(--nerdvana-surface);
          transition: background-color 0.3s ease, border-color 0.3s ease, transform 0.2s ease;
        }

        .auth-button:hover {
          background-color: var(--nerdvana-accent);
          border-color: var(--nerdvana-accent);
          transform: translateY(-1px);
        }

        .auth-button:active {
          transform: translateY(0);
        }

        .dark .auth-button {
          background-color: var(--nerdvana-accent);
          border-color: var(--nerdvana-accent);
          color: var(--nerdvana-surface);
        }

        .dark .auth-button:hover {
          background-color: var(--nerdvana-accent-hover);
          border-color: var(--nerdvana-accent-hover);
        }

        #nerdvana-user-menu img {
          border-color: var(--nerdvana-border);
        }
      `}</style>
    </motion.header>
  );
}

export default memo(Header);
