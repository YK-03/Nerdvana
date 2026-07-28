import React, { useState } from "react";
import ExploreSection from "../ExploreSection";
import { CharacterGrid } from "./CharacterGrid";
import { type Character } from "../../../lib/explorationTypes";

interface CharacterSectionProps {
  characters?: Character[];
}

const DEFAULT_VISIBLE_LIMIT = 8;

export function CharacterSection({ characters = [] }: CharacterSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!characters || characters.length === 0) return null;

  const hasMore = characters.length > DEFAULT_VISIBLE_LIMIT;
  const visibleCharacters = isExpanded ? characters : characters.slice(0, DEFAULT_VISIBLE_LIMIT);

  const viewAllAction = hasMore ? (
    <button
      onClick={() => setIsExpanded((prev) => !prev)}
      className="text-[0.82rem] font-medium text-[var(--nerdvana-text)] hover:text-[var(--nerdvana-accent)] transition-colors cursor-pointer flex items-center gap-1"
    >
      {isExpanded ? (
        <>
          Show main characters <span className="text-[var(--nerdvana-text)]">↑</span>
        </>
      ) : (
        <>
          See all characters ({characters.length}) <span className="text-[var(--nerdvana-text)]">→</span>
        </>
      )}
    </button>
  ) : null;

  return (
    <ExploreSection title="Characters" action={viewAllAction}>
      <CharacterGrid characters={visibleCharacters} isExpanded={isExpanded} />
    </ExploreSection>
  );
}
