import React, { useRef, useState } from "react";
import ExploreSection from "../ExploreSection";
import { CharacterGrid } from "./CharacterGrid";
import { type Character } from "../../../lib/explorationTypes";
import { CharacterDialog } from "./CharacterDialog";

interface CharacterSectionProps {
  characters?: Character[];
  title?: string | null;
  spoilerMode: boolean;
  mediaLens?: string | null;
}

const DEFAULT_VISIBLE_LIMIT = 8;

export function CharacterSection({ characters = [], title, spoilerMode, mediaLens }: CharacterSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const previousTriggerRef = useRef<HTMLButtonElement | null>(null);

  if (!characters || characters.length === 0) return null;

  const hasMore = characters.length > DEFAULT_VISIBLE_LIMIT;
  const visibleCharacters = isExpanded ? characters : characters.slice(0, DEFAULT_VISIBLE_LIMIT);

  const handleCharacterSelect = (character: Character, trigger: HTMLButtonElement) => {
    previousTriggerRef.current = trigger;
    setSelectedCharacter(character);
  };

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
    <>
      <ExploreSection title="Characters" action={viewAllAction}>
        <CharacterGrid characters={visibleCharacters} onSelect={handleCharacterSelect} />
      </ExploreSection>
      {selectedCharacter && (
        <CharacterDialog
          character={selectedCharacter}
          title={title}
          spoilerMode={spoilerMode}
          mediaLens={mediaLens}
          onClose={() => {
            setSelectedCharacter(null);
            requestAnimationFrame(() => previousTriggerRef.current?.focus());
          }}
        />
      )}
    </>
  );
}
