import React, { useRef, useState, useEffect, useCallback } from "react";
import { CharacterCard } from "./CharacterCard";
import { type Character } from "../../../lib/explorationTypes";

interface CharacterGridProps {
  characters: Character[];
  isExpanded?: boolean;
}

function ChevronLeftIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function CharacterGrid({ characters, isExpanded = false }: CharacterGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, characters]);

  if (!characters || characters.length === 0) {
    return null;
  }

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = direction === "left" ? -320 : 320;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  if (isExpanded) {
    return (
      <div className="flex flex-wrap items-start gap-5 sm:gap-6 py-2">
        {characters.map((character) => (
          <CharacterCard key={character.id} character={character} />
        ))}
      </div>
    );
  }

  return (
    <div className="relative group/rail">
      {/* Edge Fade Gradients */}
      {canScrollLeft && (
        <div
          className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10 transition-opacity duration-300"
          style={{ background: "linear-gradient(to right, var(--nerdvana-bg, #0b0c10), transparent)" }}
        />
      )}
      {canScrollRight && (
        <div
          className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10 transition-opacity duration-300"
          style={{ background: "linear-gradient(to left, var(--nerdvana-bg, #0b0c10), transparent)" }}
        />
      )}

      {/* Ghost Chevron Controls */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className="absolute left-0 top-9 -translate-y-1/2 z-20 p-1.5 rounded-full text-[var(--nerdvana-text)] opacity-70 hover:opacity-100 hover:bg-white/10 active:scale-95 transition-all duration-200 opacity-0 group-hover/rail:opacity-100 cursor-pointer"
        >
          <ChevronLeftIcon />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className="absolute right-0 top-9 -translate-y-1/2 z-20 p-1.5 rounded-full text-[var(--nerdvana-text)] opacity-70 hover:opacity-100 hover:bg-white/10 active:scale-95 transition-all duration-200 opacity-0 group-hover/rail:opacity-100 cursor-pointer"
        >
          <ChevronRightIcon />
        </button>
      )}

      {/* Horizontal Rail */}
      <div
        ref={scrollRef}
        className="flex items-start gap-5 sm:gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory py-2 no-scrollbar"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {characters.map((character) => (
          <CharacterCard key={character.id} character={character} />
        ))}
      </div>
    </div>
  );
}
