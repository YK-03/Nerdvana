"use client";

import { useState } from "react";
import AuthModal from "../components/AuthModal";

interface MarketingPageProps {
  onNavigatePage: (page: string) => void;
  onStartInsights: () => void;
}

export default function MarketingPage({
  onNavigatePage: _onNavigatePage,
  onStartInsights
}: MarketingPageProps) {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <div className="w-full min-h-screen bg-black transition-colors duration-300 flex flex-col">
      <section className="hero relative min-h-screen flex items-center overflow-hidden bg-black">
        <div className="absolute inset-0 pointer-events-none origin-center animate-[drift_40s_linear_infinite]">
          <div className="absolute inset-0 bg-black" />
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle,#ffffff10_1px,transparent_1px),repeating-linear-gradient(0deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_2px)] [background-size:16px_16px,3px_3px]" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_45%,rgba(255,0,0,0.12)_60%,transparent_75%)]" />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,#ffffff08_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.05] mix-blend-overlay" />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_50%,rgba(255,0,0,0.12),transparent_60%)]" />
        </div>

        <div className="relative z-10 w-full max-w-3xl pl-4 sm:pl-8 lg:pl-16 pr-4 sm:pr-6 animate-[fade-up_700ms_ease-out_forwards] opacity-0 translate-y-5">
          <h1
            className="text-[clamp(2.5rem,16vw,6rem)] font-black tracking-tight uppercase text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
            style={{ fontFamily: '"Anton", Impact, "Arial Black", sans-serif' }}
          >
            NERDVANA
          </h1>

          <p className="mt-4 sm:mt-6 uppercase tracking-[0.18em] sm:tracking-[0.24em] md:tracking-[0.3em] text-white/80 text-[0.86rem] sm:text-base md:text-xl">
            THE STORY ENDED. THE QUESTIONS DIDN'T.
          </p>

          <div className="mt-7 sm:mt-10 flex flex-wrap gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onStartInsights}
              className="nerdvana-clickable bg-red-600 text-white uppercase font-semibold px-5 sm:px-6 py-3 tracking-[0.14em] shadow-[6px_6px_0_black] transition-all duration-200 ease-out hover:translate-x-1 hover:translate-y-1 hover:shadow-[3px_3px_0_black] min-h-11"
            >
              LET'S DECODE!
            </button>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="nerdvana-clickable border border-white/60 bg-transparent text-white px-5 sm:px-6 py-3 uppercase tracking-[0.14em] transition-colors duration-150 hover:bg-white/10 min-h-11"
            >
              SIGN IN
            </button>
          </div>
        </div>
      </section>

      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}

      <style>{`
        @keyframes drift {
          0% { transform: scale(1.05) translateX(0); }
          100% { transform: scale(1.05) translateX(-30px); }
        }

        @keyframes fade-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }

      `}</style>
    </div>
  );
}
