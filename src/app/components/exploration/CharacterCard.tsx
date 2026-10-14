import { type Character } from "../../../lib/explorationTypes";

interface CharacterCardProps {
  character: Character;
}

export function CharacterCard({ character }: CharacterCardProps) {
  const initials = character.name.trim().slice(0, 2).toUpperCase();

  return (
    <article className="flex min-w-0 flex-col items-center text-center select-none">
      <div
        className="relative aspect-[4/5] w-full overflow-hidden border-[1.5px] bg-[var(--nerdvana-surface)]"
        style={{ borderColor: "var(--nerdvana-border)" }}
      >
        {character.imageUrl ? (
          <img
            src={character.imageUrl}
            alt={character.name}
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-mono text-sm font-semibold tracking-[0.12em] text-[var(--nerdvana-accent)] sm:text-base">
            {initials}
          </span>
        )}
      </div>

      <h4
        className="mt-2 line-clamp-2 min-h-[2.25rem] w-full break-words font-sans text-sm font-semibold leading-[1.15] tracking-tight text-[var(--nerdvana-text)]"
        title={character.name}
      >
        {character.name}
      </h4>
      {character.portrayedBy && (
        <div
          className="mt-1 w-full truncate font-sans text-[0.68rem] leading-tight tracking-tight text-[var(--nerdvana-text)]"
          style={{ opacity: 0.64 }}
          title={character.portrayedBy}
        >
          {character.portrayedBy}
        </div>
      )}
    </article>
  );
}
