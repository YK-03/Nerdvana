import { useEffect, useRef, useState } from "react";
import type { Character } from "../../../lib/explorationTypes";
import { getCharacterDetailContent } from "../../../lib/characterDescription";

interface CharacterDialogProps {
  character: Character;
  title?: string | null;
  spoilerMode: boolean;
  mediaLens?: string | null;
  onClose: () => void;
}

export function CharacterDialog({
  character,
  title,
  spoilerMode,
  mediaLens,
  onClose,
}: CharacterDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [revealedCharacterId, setRevealedCharacterId] = useState<string | null>(null);
  const isAnime = mediaLens?.toLowerCase() === "anime";
  const animeDescriptionRevealed = revealedCharacterId === character.id;
  const isTmdbCastCredit = character.id.startsWith("tmdb::");
  const detailContent = getCharacterDetailContent(
    character.description,
    spoilerMode,
    mediaLens,
    animeDescriptionRevealed,
  );
  const hasDescription = Boolean(detailContent.summary || detailContent.attributes.length);
  const hasAvailableDescription = Boolean(character.description?.trim());

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [onClose]);

  const dialogTitleId = "character-details-title";
  const dialogDescriptionId = "character-details-description";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-3 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={detailContent.summary ? dialogDescriptionId : undefined}
        className="max-h-[min(90vh,42rem)] w-full max-w-2xl overflow-y-auto border-2 bg-[var(--nerdvana-bg)] p-4 text-[var(--nerdvana-text)] shadow-2xl sm:p-6"
        style={{ borderColor: "var(--nerdvana-border)" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--nerdvana-border)" }}>
          <div className="min-w-0">
            <h2 id={dialogTitleId} className="break-words font-serif text-2xl font-bold leading-tight sm:text-3xl">
              {character.name}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close character details"
            className="shrink-0 border px-2.5 py-1 font-mono text-lg leading-none transition-colors hover:border-[var(--nerdvana-accent)] hover:text-[var(--nerdvana-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nerdvana-accent)]"
            style={{ borderColor: "var(--nerdvana-border)" }}
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:items-start sm:gap-6">
          <div className="mx-auto aspect-[4/5] w-36 overflow-hidden border bg-[var(--nerdvana-surface)] sm:mx-0 sm:w-full" style={{ borderColor: "var(--nerdvana-border)" }}>
            {character.imageUrl ? (
              <img src={character.imageUrl} alt="" className="h-full w-full object-cover object-top" />
            ) : (
              <span className="flex h-full items-center justify-center font-mono text-lg font-semibold tracking-[0.12em] text-[var(--nerdvana-accent)]">
                {character.name.trim().slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <dl className="grid gap-3 text-sm">
              {character.portrayedBy && (
                <div>
                  <dt className="font-mono text-[0.62rem] uppercase tracking-[0.14em] opacity-60">
                    {isTmdbCastCredit ? "Played by" : "Portrayed by"}
                  </dt>
                  <dd className="mt-0.5 break-words font-semibold">{character.portrayedBy}</dd>
                </div>
              )}
              {title && (
                <div>
                  <dt className="font-mono text-[0.62rem] uppercase tracking-[0.14em] opacity-60">From</dt>
                  <dd className="mt-0.5 break-words font-semibold">{title}</dd>
                </div>
              )}
              {character.role && (
                <div>
                  <dt className="font-mono text-[0.62rem] uppercase tracking-[0.14em] opacity-60">Role</dt>
                  <dd className="mt-0.5 break-words font-semibold">{character.role}</dd>
                </div>
              )}
            </dl>

            {isAnime && !spoilerMode && !animeDescriptionRevealed && hasAvailableDescription ? (
              <div
                className="border border-dashed p-3 text-sm leading-6"
                style={{ borderColor: "var(--nerdvana-accent)", color: "var(--nerdvana-accent)" }}
                role="note"
              >
                <p className="text-[0.75rem] uppercase tracking-[0.08em]">
                  ⚠ SPOILERS HIDDEN. Character details may reveal story information.
                </p>
                <button
                  type="button"
                  onClick={() => setRevealedCharacterId(character.id)}
                  className="mt-3 border border-dashed px-3 py-2 text-[0.75rem] uppercase tracking-[0.08em] transition-colors hover:bg-[rgba(239,68,68,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nerdvana-accent)]"
                  style={{ borderColor: "var(--nerdvana-accent)", color: "var(--nerdvana-accent)" }}
                  aria-label={`Reveal potentially spoiler-containing details for ${character.name}`}
                >
                  Reveal character details
                </button>
              </div>
            ) : null}
            {detailContent.summary && (
              <p id={dialogDescriptionId} className="whitespace-pre-line border-l-2 pl-3 text-sm leading-6" style={{ borderColor: "var(--nerdvana-accent)" }}>
                {detailContent.summary}
              </p>
            )}
            {detailContent.attributes.length > 0 && (
              <dl className="grid gap-3 border-l-2 pl-3 text-sm" style={{ borderColor: "var(--nerdvana-accent)" }}>
                {detailContent.attributes.map((attribute) => (
                  <div key={attribute.label}>
                    <dt className="font-mono text-[0.62rem] uppercase tracking-[0.14em] opacity-60">{attribute.label}</dt>
                    <dd className="mt-0.5 break-words leading-5">{attribute.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {isAnime && animeDescriptionRevealed && hasDescription ? (
              <p className="text-[0.72rem] leading-5 opacity-65">
                Revealed character details may contain spoilers.
              </p>
            ) : null}
            {!isAnime && !hasDescription && character.description && !spoilerMode ? (
              <p className="text-sm leading-6 opacity-65">
                Enable spoilers to view the available character description.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
