import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { StoryTimeline } from "../../lib/timelineTypes";
import ExploreSection from "./ExploreSection";

export type TimelineStatus = "idle" | "loading" | "success" | "empty" | "error";

interface TimelineSectionProps {
  spoilerMode: boolean;
  status: TimelineStatus;
  timeline: StoryTimeline | null;
  onRetry: () => void;
  onSeasonChange: (seasonNumber: number) => void;
}

function LockedPreview() {
  return (
    <div
      className="border-y py-4 sm:py-5"
      style={{
        borderColor: "var(--nerdvana-border)",
      }}
      data-testid="timeline-locked"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--nerdvana-accent)] font-mono">
          Locked
        </span>
      </div>
      <div className="relative overflow-hidden py-5" aria-hidden="true">
        <div className="absolute left-3 right-3 top-1/2 h-px bg-[var(--nerdvana-border)]" />
        <div className="relative flex items-center justify-between">
          {["one", "two", "three", "four", "five"].map((item) => (
            <span
              key={item}
              className="h-3 w-3 rounded-full border-2 bg-[var(--nerdvana-surface)]"
              style={{ borderColor: "var(--nerdvana-accent)" }}
            />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-5 gap-2 opacity-30">
          {["one", "two", "three", "four", "five"].map((item) => (
            <span key={item} className="h-3 bg-current" />
          ))}
        </div>
      </div>
      <p className="mt-4 text-center text-[0.78rem] leading-relaxed opacity-75">
        Turn on Spoiler Mode to explore the timeline.
      </p>
    </div>
  );
}

export default function TimelineSection({
  spoilerMode,
  status,
  timeline,
  onRetry,
  onSeasonChange,
}: TimelineSectionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const eventButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timelineKey = timeline?.events.map((event) => event.id).join("|") ?? "";

  useEffect(() => {
    setSelectedIndex(0);
    eventButtonRefs.current = [];
  }, [timelineKey]);

  if (!spoilerMode) {
    return (
      <ExploreSection title="Story Timeline">
        <LockedPreview />
      </ExploreSection>
    );
  }

  if (status === "idle" || status === "loading") {
    return (
      <ExploreSection title="Story Timeline">
        <div className="border-y py-5 animate-pulse" style={{ borderColor: "var(--nerdvana-border)" }} data-testid="timeline-loading">
          <div className="h-3 w-40 bg-current opacity-20" />
          <div className="mt-6 h-2 w-full bg-current opacity-10" />
          <div className="mt-5 h-16 w-full bg-current opacity-10" />
        </div>
      </ExploreSection>
    );
  }

  if (status === "error") {
    return (
      <ExploreSection title="Story Timeline">
        <div className="border-y py-5" style={{ borderColor: "var(--nerdvana-border)" }} data-testid="timeline-error">
          <p className="text-[0.82rem] opacity-75">The timeline is unavailable right now.</p>
          <button type="button" onClick={onRetry} className="mt-3 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--nerdvana-accent)] hover:underline">
            Retry timeline
          </button>
        </div>
      </ExploreSection>
    );
  }

  if (status === "empty" || !timeline || timeline.events.length === 0) {
    return (
      <ExploreSection title="Story Timeline">
        <div className="border-y py-5 text-[0.82rem] opacity-75" style={{ borderColor: "var(--nerdvana-border)" }} data-testid="timeline-empty">
          No reliable story timeline is available for this title.
        </div>
      </ExploreSection>
    );
  }

  const events = timeline.events;
  const activeIndex = Math.min(selectedIndex, events.length - 1);
  const selectedEvent = events[activeIndex] ?? events[0];
  const seasons = timeline.mediaType === "tv" ? (timeline.seasons ?? []) : [];
  const selectedSeason = timeline.seasonNumber ?? seasons[0]?.seasonNumber ?? null;

  function selectEvent(index: number, moveFocus = false) {
    const nextIndex = Math.max(0, Math.min(index, events.length - 1));
    setSelectedIndex(nextIndex);
    if (moveFocus) eventButtonRefs.current[nextIndex]?.focus();
  }

  function handleRailKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % events.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + events.length) % events.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = events.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectEvent(nextIndex, true);
  }

  return (
    <ExploreSection title="Story Timeline" description="Explore the major story beats in chronological order.">
      <div className="py-1" data-testid="timeline-loaded">
        {seasons.length > 1 && (
          <div className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-4" style={{ borderColor: "var(--nerdvana-border)" }} aria-label="Story timeline seasons">
            {seasons.map((season) => {
              const isSelectedSeason = season.seasonNumber === selectedSeason;
              return (
                <button
                  key={season.seasonNumber}
                  type="button"
                  aria-pressed={isSelectedSeason}
                  onClick={() => {
                    if (!isSelectedSeason) onSeasonChange(season.seasonNumber);
                  }}
                  className="border-b-2 pb-1 text-[0.72rem] font-mono uppercase tracking-[0.12em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--nerdvana-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--nerdvana-bg)]"
                  style={{
                    borderColor: isSelectedSeason ? "var(--nerdvana-accent)" : "transparent",
                    color: isSelectedSeason ? "var(--nerdvana-accent)" : "var(--nerdvana-text)",
                    opacity: isSelectedSeason ? 1 : 0.58,
                  }}
                >
                  {season.name || `Season ${season.seasonNumber}`}
                </button>
              );
            })}
          </div>
        )}
        <div className="relative" role="tablist" aria-label="Story timeline events">
          <div className="absolute bottom-5 left-5 top-5 w-px bg-[var(--nerdvana-border)] sm:bottom-auto sm:left-[8%] sm:right-[8%] sm:top-5 sm:h-px sm:w-auto" aria-hidden="true" />
          <div
            className="absolute left-5 top-5 w-px bg-[var(--nerdvana-accent)] transition-[height] duration-300 sm:hidden"
            style={{ height: `${events.length === 1 ? 0 : (activeIndex / (events.length - 1)) * 100}%` }}
            aria-hidden="true"
          />
          <div
            className="absolute left-[8%] top-5 hidden h-px bg-[var(--nerdvana-accent)] transition-[width] duration-300 sm:block"
            style={{ width: `${events.length === 1 ? 0 : (activeIndex / (events.length - 1)) * 84}%` }}
            aria-hidden="true"
          />
          <div className="grid grid-cols-1 gap-1 sm:grid-flow-col sm:auto-cols-fr sm:gap-6">
            {events.map((event, index) => {
              const isSelected = index === activeIndex;
              const number = String(index + 1).padStart(2, "0");
              return (
                <button
                  type="button"
                  key={event.id}
                  id={`timeline-event-tab-${index}`}
                  ref={(element) => { eventButtonRefs.current[index] = element; }}
                  onClick={() => selectEvent(index)}
                  onKeyDown={(keyboardEvent) => handleRailKeyDown(keyboardEvent, index)}
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls="timeline-selected-event"
                  tabIndex={isSelected ? 0 : -1}
                  className="group relative z-10 grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--nerdvana-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--nerdvana-bg)] sm:block sm:py-0 sm:text-center"
                >
                  <span
                    className="col-start-1 row-start-1 flex h-10 w-10 items-center justify-center rounded-full border text-[0.68rem] font-bold font-mono transition-[background-color,border-color,color,transform] duration-200 sm:mx-auto"
                    style={{
                      borderColor: index <= activeIndex ? "var(--nerdvana-accent)" : "var(--nerdvana-border)",
                      backgroundColor: isSelected ? "var(--nerdvana-accent)" : "var(--nerdvana-bg)",
                      color: isSelected ? "var(--nerdvana-surface)" : index < activeIndex ? "var(--nerdvana-accent)" : "var(--nerdvana-text)",
                      transform: isSelected ? "scale(1.08)" : "scale(1)",
                    }}
                  >
                    {number}
                  </span>
                  <span
                    className="col-start-2 row-start-1 break-words text-[0.82rem] font-semibold leading-snug transition-[color,font-size] duration-200 sm:mt-3 sm:block sm:min-h-[2.5rem] sm:text-[0.76rem]"
                    style={{ color: isSelected ? "var(--nerdvana-accent)" : "var(--nerdvana-text)", fontSize: isSelected ? "0.86rem" : undefined }}
                  >
                    {event.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div id="timeline-selected-event" className="mt-7 min-h-[10rem] border-t pt-6 sm:mt-8 sm:max-w-3xl" style={{ borderColor: "var(--nerdvana-border)" }} role="tabpanel" aria-labelledby={`timeline-event-tab-${activeIndex}`} aria-live="polite">
          <div className="flex items-baseline gap-3">
            <span className="text-[0.72rem] font-bold tracking-[0.12em] text-[var(--nerdvana-accent)] font-mono">
              {String(selectedEvent.order).padStart(2, "0")}
            </span>
            <h4 className="text-[1.1rem] font-semibold leading-snug sm:text-[1.2rem]">{selectedEvent.title}</h4>
          </div>
          <p className="mt-4 max-w-2xl text-[0.94rem] leading-8 opacity-80 sm:text-[1rem]">{selectedEvent.description}</p>
        </div>
      </div>
    </ExploreSection>
  );
}
