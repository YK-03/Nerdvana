import React from "react";
import { CharacterCard } from "./CharacterCard";
import { type Character } from "../../../lib/explorationTypes";

interface CharacterGridProps {
  characters: Character[];
  isExpanded?: boolean;
}

export function CharacterGrid({ characters }: CharacterGridProps) {
  if (!characters || characters.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 py-2 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4">
      {characters.map((character) => (
        <CharacterCard key={character.id} character={character} />
      ))}
    </div>
  );
}
