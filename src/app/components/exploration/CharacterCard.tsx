import React from "react";
import { type Character } from "../../../lib/explorationTypes";

interface CharacterCardProps {
  character: Character;
}

export function CharacterCard({ character }: CharacterCardProps) {
  return (
    <div className="group flex flex-col items-center gap-2 w-20 sm:w-24 shrink-0 snap-start cursor-pointer text-center select-none">
      {/* Circular Portrait */}
      <div className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border border-white/10 group-hover:border-[var(--nerdvana-accent)] transition-all duration-300 group-hover:scale-105 bg-white/[0.03] flex items-center justify-center shrink-0">
        {character.imageUrl ? (
          <img
            src={character.imageUrl}
            alt={character.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <span className="text-[var(--nerdvana-accent)] font-sans text-xs sm:text-sm font-semibold tracking-tight">
            {character.name.substring(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Character Name (Primary Sans-Serif, High Contrast, Single-line truncate) */}
      <h4 className="font-sans text-xs sm:text-sm font-medium text-[var(--nerdvana-text)] tracking-tight leading-tight truncate w-full max-w-[85px] sm:max-w-[100px]" title={character.name}>
        {character.name}
      </h4>
      {character.portrayedBy && (
        <span className="font-sans text-[10px] sm:text-xs text-muted-foreground tracking-tight leading-none truncate w-full max-w-[85px] sm:max-w-[100px] mt-[-2px]" title={character.portrayedBy}>
          {character.portrayedBy}
        </span>
      )}
    </div>
  );
}
