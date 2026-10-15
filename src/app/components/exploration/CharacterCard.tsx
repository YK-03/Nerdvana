import { type Character } from "../../../lib/explorationTypes";

interface CharacterCardProps {
  character: Character;
  onSelect: (character: Character, trigger: HTMLButtonElement) => void;
}

export function CharacterCard({ character, onSelect }: CharacterCardProps) {
  const initials = character.name.trim().slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      aria-label={`Open details for ${character.name}`}
      onClick={(event) => onSelect(character, event.currentTarget)}
      className="group block min-w-0 select-none text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nerdvana-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nerdvana-bg)]"
    >
      <figure className="flex min-w-0 flex-col text-left">
        <div
          className="relative aspect-[4/5] w-full overflow-hidden border bg-[var(--nerdvana-surface)] transition-colors group-hover:border-[var(--nerdvana-accent)]"
          style={{ borderColor: "var(--nerdvana-border)" }}
        >
          {character.imageUrl ? (
            <img
              src={character.imageUrl}
              alt=""
              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-mono text-sm font-semibold tracking-[0.12em] text-[var(--nerdvana-accent)] sm:text-base">
              {initials}
            </span>
          )}
        </div>

        <figcaption className="mt-2 w-full border-l-2 pl-2 leading-tight" style={{ borderColor: "var(--nerdvana-accent)" }}>
          <h4
            className="line-clamp-2 min-h-[2.15rem] w-full break-words font-serif text-[0.98rem] font-bold leading-[1.08] tracking-tight text-[var(--nerdvana-text)] group-hover:text-[var(--nerdvana-accent)]"
            title={character.name}
          >
            {character.name}
          </h4>
          {character.portrayedBy && (
            <p
              className="mt-1 line-clamp-2 w-full break-words font-mono text-[0.61rem] uppercase leading-[1.2] tracking-[0.06em] text-[var(--nerdvana-text)]"
              style={{ opacity: 0.64 }}
              title={character.portrayedBy}
            >
              {character.portrayedBy}
            </p>
          )}
        </figcaption>
      </figure>
    </button>
  );
}
