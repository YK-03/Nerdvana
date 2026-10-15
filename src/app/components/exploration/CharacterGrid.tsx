import React from "react";
import { CharacterCard } from "./CharacterCard";
import { type Character } from "../../../lib/explorationTypes";

interface CharacterGridProps {
  characters: Character[];
  onSelect: (character: Character, trigger: HTMLButtonElement) => void;
}

export function CharacterGrid({ characters, onSelect }: CharacterGridProps) {
  if (!characters || characters.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 pt-0 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-7 lg:grid-cols-4">
      {characters.map((character) => (
        <CharacterCard key={character.id} character={character} onSelect={onSelect} />
      ))}
    </div>
  );
}
