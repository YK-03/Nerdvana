import { useEffect, useLayoutEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import type { ResolverContextPacket, ValidatedVisualAsset } from "../canonicalResolver";
import { VISUAL_PHASE_LABELS } from "../../lib/experience/experienceLanguage";
import { recordRetrieval } from "../../lib/resolver/pipelineTracker.js";
import type { ActiveVisualOwner } from "../../app/canonicalResolver.js";

interface VisualPanelProps {
  contextPacket: ResolverContextPacket;
  activeTraceId: string | null;
  reusableVisual?: ValidatedVisualAsset | null;
  onVisualLocked?: (owner: ActiveVisualOwner) => void;
  onVisualResolutionComplete?: (status: 'resolved' | 'failed') => void;
}

type RetrievalConfidence = "high" | "medium" | "low" | "fallback";
type RetrievalMode = "STRICT" | "RELAXED" | "FRANCHISE" | "ENTITY" | "POPULARITY";

interface RetrievalOutcome {
  state: "SUCCESS" | "NO_COMPATIBLE_RESULTS" | "PROCESSING_ERROR" | "API_ERROR";
  asset?: ValidatedVisualAsset;
  reason?: string;
  error?: string;
  confidence?: RetrievalConfidence;
  mode?: RetrievalMode;
}



// ─── Adaptive Search Status Labels ────────────────────────────────────

type SearchPhase =
  | "idle"
  | "searching"
  | "relaxing"
  | "franchise"
  | "entity"
  | "best-available"
  | "done";

const PHASE_LABELS: Record<SearchPhase, string> = {
  idle: "",
  searching: VISUAL_PHASE_LABELS.STRICT,
  relaxing: VISUAL_PHASE_LABELS.RELAXED,
  franchise: VISUAL_PHASE_LABELS.FRANCHISE,
  entity: VISUAL_PHASE_LABELS.ENTITY,
  "best-available": VISUAL_PHASE_LABELS.POPULARITY,
  done: "",
};

const CONFIDENCE_BADGE: Record<RetrievalConfidence, string | null> = {
  high: null,
  medium: null,
  low: VISUAL_PHASE_LABELS.APPROXIMATE_BADGE,
  fallback: VISUAL_PHASE_LABELS.APPROXIMATE_BADGE,
};

// ─── Component ────────────────────────────────────────────────────────

export default function VisualPanel({ contextPacket, activeTraceId, reusableVisual, onVisualLocked, onVisualResolutionComplete }: VisualPanelProps) {
  console.log("[ENTITY_IDENTITY] Sidebar", {
    entity: contextPacket?.providerId || contextPacket?.canonicalEntity,
    title: contextPacket?.canonicalEntity,
    provider: contextPacket?.provider,
    providerId: contextPacket?.providerId
  });
  const [visual, setVisual] = useState<ValidatedVisualAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle");
  const [errorState, setErrorState] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<RetrievalConfidence | null>(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [canExpandOverview, setCanExpandOverview] = useState(false);

  const modalWrapperRef = useRef<HTMLDivElement | null>(null);
  const trailerIframeRef = useRef<HTMLIFrameElement | null>(null);
  const overviewTextRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!isTrailerOpen) return;

    // Immediately focus modal wrapper on open to capture keyboard events
    modalWrapperRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsTrailerOpen(false);
      }
    };

    const handleWindowBlur = () => {
      // If user clicks inside the cross-origin trailer iframe (e.g. pause/scrub),
      // refocus the modal wrapper so Escape key continues capturing in the parent window.
      setTimeout(() => {
        if (isTrailerOpen && document.activeElement === trailerIframeRef.current) {
          modalWrapperRef.current?.focus();
        }
      }, 0);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isTrailerOpen]);

  useLayoutEffect(() => {
    const el = overviewTextRef.current;
    if (!visual?.overview || !el || isOverviewExpanded) return;

    const measureOverview = () => {
      const wasClamped = el.classList.contains("line-clamp-4");
      if (!wasClamped) el.classList.add("line-clamp-4");

      const isOverflowing = el.scrollHeight > el.clientHeight + 2;

      if (!wasClamped) el.classList.remove("line-clamp-4");
      setCanExpandOverview(isOverflowing);
    };

    measureOverview();

    const resizeObserver = new ResizeObserver(measureOverview);
    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  }, [visual?.overview, isOverviewExpanded]);

  useEffect(() => {
    if (!contextPacket || !contextPacket.canonicalEntity) return;

    let cancelled = false;
    setLoading(true);
    setErrorState(null);
    setVisual(null);
    setConfidence(null);
    setIsTrailerOpen(false);
    setIsOverviewExpanded(false);
    setSearchPhase("searching");

    const fetchVisuals = async () => {
      // Fast-path bypass: Reuse visual if AskPage explicitly provides it AND entity matches
      if (reusableVisual) {
        const reusableTitle = (reusableVisual.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const canonicalTitle = (contextPacket.canonicalEntity || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const providerTitle = (contextPacket.providerMetadata?.canonicalTitle || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        
        const matchesEntity = reusableTitle.includes(canonicalTitle) || canonicalTitle.includes(reusableTitle) ||
                              (providerTitle && (reusableTitle.includes(providerTitle) || providerTitle.includes(reusableTitle)));

        if (matchesEntity) {
          console.log("[VISUAL_OWNER_REUSED]", {
            reusedTitle: reusableVisual.title
          });
          setVisual(reusableVisual);
          setConfidence("high"); // Locked visuals are always high confidence
          setSearchPhase("done");
          setLoading(false);
          onVisualResolutionComplete?.("resolved");
          return;
        }
      }

      try {
        if (activeTraceId) {
          recordRetrieval(activeTraceId, {
            started: true,
            mode: contextPacket.providerId ? "DETERMINISTIC" : "EXPLORATORY"
          });
        }

        const response = await fetch("/api/visual-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextPacket }),
        });

        // Always try to parse body even on error responses
        let outcome: RetrievalOutcome;
        try {
          outcome = await response.json();
        } catch {
          const errMsg = response.ok
            ? "Visual retrieval failed safely."
            : `Provider temporarily unavailable (Status: ${response.status})`;
          
          if (activeTraceId) {
            recordRetrieval(activeTraceId, {
              success: false,
              failureReason: errMsg
            });
          }
          throw new Error(errMsg);
        }

        if (cancelled) return;

        // Animate phase progression based on mode
        if (outcome.mode === "RELAXED") setSearchPhase("relaxing");
        else if (outcome.mode === "FRANCHISE") setSearchPhase("franchise");
        else if (outcome.mode === "ENTITY") setSearchPhase("entity");
        else if (outcome.mode === "POPULARITY") setSearchPhase("best-available");

         if (outcome.state === "SUCCESS" && outcome.asset) {
           if (activeTraceId) {
             recordRetrieval(activeTraceId, {
               success: true,
               provider: outcome.asset.source
             });
           }
           setVisual(outcome.asset);
           setConfidence(outcome.confidence ?? "high");
           setSearchPhase("done");

          if (onVisualLocked) {
            onVisualLocked({
              providerId: contextPacket.providerId || null,
              canonicalTitle: contextPacket.canonicalEntity || null,
              mediaType: contextPacket.mediaLens,
              providerType: contextPacket.providerMetadata?.providerType || null,
              asset: outcome.asset,
              franchiseRoot: contextPacket.parentFranchise || null,
              executionMode: contextPacket.executionMode,
              lockedAt: Date.now()
            });
          }
          onVisualResolutionComplete?.("resolved");
          return;
        }



        if (activeTraceId) {
          recordRetrieval(activeTraceId, {
            success: false,
            failureReason: outcome.reason || outcome.error || "No compatible results"
          });
        }

        setSearchPhase("done");
        setVisual(null);

        const userFriendlyError =
          outcome.state === "NO_COMPATIBLE_RESULTS"
            ? VISUAL_PHASE_LABELS.NOT_FOUND
            : outcome.state === "PROCESSING_ERROR"
            ? VISUAL_PHASE_LABELS.UNAVAILABLE
            : outcome.error || outcome.reason || VISUAL_PHASE_LABELS.NO_IMAGE;

        setErrorState(userFriendlyError);
        onVisualResolutionComplete?.("failed");
      } catch (err: any) {
        if (cancelled) return;

        if (activeTraceId) {
          recordRetrieval(activeTraceId, {
            success: false,
            failureReason: err.message || "Visual lookup failed"
          });
        }

        setSearchPhase("done");
        setVisual(null);
        setErrorState(err.message || "Visual retrieval failed safely.");
        onVisualResolutionComplete?.("failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchVisuals();
    return () => { cancelled = true; };
  }, [contextPacket, activeTraceId]);

  if (!contextPacket || !contextPacket.canonicalEntity) return null;

  const confidenceBadge = confidence ? CONFIDENCE_BADGE[confidence] : null;

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
        key={contextPacket.canonicalEntity}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="overflow-hidden border-[2px]"
        style={{
          borderColor: "var(--nerdvana-border)",
          backgroundColor: "var(--nerdvana-surface)",
          color: "var(--nerdvana-text)",
        }}
      >
        {/* Loading skeleton */}
        {loading && (
          <div className="p-5 space-y-3 animate-pulse">
            <div className="w-full bg-current opacity-10" style={{ height: "240px" }} />
            <div className="h-3 w-3/4 bg-current opacity-10" />
            <div className="h-2 w-1/2 bg-current opacity-10" />
            {/* Adaptive search status */}
            {searchPhase !== "idle" && searchPhase !== "done" && (
              <div
                className="h-2 text-[0.65rem] lg:text-[0.5rem] uppercase tracking-[0.18em] opacity-30 mt-2"
                style={{ fontFamily: '"Courier New", monospace' }}
              >
                {PHASE_LABELS[searchPhase]}
              </div>
            )}
          </div>
        )}

        {/* Visual success state */}
        {!loading && visual && (
          <>
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "2/3", maxHeight: "300px" }}>
              {visual.url ? (
                <img
                  src={visual.url}
                  alt={visual.title}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center" />
              )}

              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to top, var(--nerdvana-surface) 0%, transparent 55%)",
                }}
              />

              {/* Confidence badge for degraded results */}
              {confidenceBadge && (
                <div className="absolute top-3 left-3">
                  <span
                    className="px-2 py-[3px] text-[0.65rem] lg:text-[0.5rem] border"
                    style={{
                      fontFamily: '"Courier New", monospace',
                      borderColor: "var(--nerdvana-border)",
                      backgroundColor: "var(--nerdvana-surface)",
                      opacity: 0.7,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {confidenceBadge}
                  </span>
                </div>
              )}

            </div>

            <div className="px-4 pt-0 pb-4 space-y-2">
              <h3
                className="text-[0.9rem] leading-snug font-semibold"
                style={{ fontFamily: '"Special Elite", monospace' }}
              >
                {visual.title}
              </h3>

              {visual.year && (
                <div
                  className="flex flex-wrap gap-x-3 text-[0.65rem] lg:text-[0.6rem] uppercase tracking-[0.1em]"
                  style={{ fontFamily: '"Courier New", monospace', opacity: 0.55 }}
                >
                  <span>{visual.year}</span>
                </div>
              )}

              {visual.genres && visual.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {visual.genres.map((genre) => (
                    <span
                      key={genre}
                      className="text-[0.65rem] lg:text-[0.52rem] uppercase tracking-[0.08em] px-2 py-0.5 border"
                      style={{
                        borderColor: "var(--nerdvana-border)",
                        fontFamily: '"Courier New", monospace',
                        opacity: 0.65,
                      }}
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {visual.overview && (
                <div
                  className="border-t pt-2"
                  style={{ borderColor: "var(--nerdvana-border)", opacity: 0.25 }}
                />
              )}

              {visual.overview && (
                <div className="space-y-1">
                  <p
                    ref={overviewTextRef}
                    className={`text-[0.67rem] leading-relaxed ${isOverviewExpanded ? "" : "line-clamp-4"}`}
                    style={{ fontFamily: '"Times New Roman", serif', opacity: 0.55 }}
                  >
                    {visual.overview}
                  </p>
                  {canExpandOverview && (
                    <button
                      type="button"
                      onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                      className="text-[0.62rem] lg:text-[0.54rem] uppercase tracking-[0.12em] font-semibold transition-colors hover:text-[var(--nerdvana-accent)] cursor-pointer block"
                      style={{
                        fontFamily: '"Courier New", monospace',
                        color: isOverviewExpanded ? "var(--nerdvana-text)" : "var(--nerdvana-accent)",
                        opacity: isOverviewExpanded ? 0.6 : 0.9,
                      }}
                      aria-expanded={isOverviewExpanded}
                    >
                      {isOverviewExpanded ? "Read less" : "Read more"}
                    </button>
                  )}
                </div>
              )}

              {/* Official Trailer Section */}
              {visual.trailerKey && (
                <>
                  <div
                    className="border-t pt-2 mt-2"
                    style={{ borderColor: "var(--nerdvana-border)", opacity: 0.25 }}
                  />
                  <div className="pt-0.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[0.65rem] lg:text-[0.55rem] uppercase tracking-[0.14em] font-semibold flex items-center gap-1.5"
                        style={{ fontFamily: '"Courier New", monospace', color: "var(--nerdvana-accent)" }}
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--nerdvana-accent)]" />
                        Official Trailer
                      </span>
                      <span
                        className="text-[0.6rem] lg:text-[0.5rem] uppercase tracking-[0.1em] opacity-40"
                        style={{ fontFamily: '"Courier New", monospace' }}
                      >
                        YouTube
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsTrailerOpen(true)}
                      className="group relative w-full aspect-video overflow-hidden border bg-black/50 block cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
                      style={{ borderColor: "var(--nerdvana-border)" }}
                      aria-label={`Play trailer for ${visual.title}`}
                    >
                      <img
                        src={`https://img.youtube.com/vi/${visual.trailerKey}/hqdefault.jpg`}
                        alt={`${visual.title} Trailer Thumbnail`}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
                        loading="lazy"
                      />
                      {/* Dark gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                      {/* Noir/Newspaper Play Button Icon */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div
                          className="w-9 h-9 rounded-full border-[2px] flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110"
                          style={{
                            borderColor: "var(--nerdvana-accent)",
                            backgroundColor: "rgba(18, 18, 20, 0.9)",
                            color: "var(--nerdvana-accent)",
                            boxShadow: "0 0 12px rgba(229, 9, 20, 0.4)"
                          }}
                        >
                          <svg
                            className="w-4 h-4 ml-0.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>

                      {/* Action Caption */}
                      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between pointer-events-none">
                        <span
                          className="text-[0.62rem] lg:text-[0.52rem] uppercase tracking-[0.12em] font-mono text-white/90 drop-shadow"
                          style={{ fontFamily: '"Courier New", monospace' }}
                        >
                          ▶ Watch Trailer
                        </span>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Empty / error state */}
        {!loading && !visual && (
          <div
            className="p-5 text-[0.65rem] lg:text-[0.6rem] uppercase tracking-[0.14em]"
            style={{ fontFamily: '"Courier New", monospace', opacity: 0.3 }}
          >
            {errorState || VISUAL_PHASE_LABELS.NO_IMAGE}
          </div>
        )}
      </motion.div>
    </AnimatePresence>

    {/* Trailer Modal Lightbox via Portal to escape all ancestor stacking contexts */}
    {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {isTrailerOpen && visual?.trailerKey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/85 backdrop-blur-sm"
            onClick={() => setIsTrailerOpen(false)}
          >
            <motion.div
              ref={modalWrapperRef}
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative w-full max-w-4xl border-[2px] shadow-2xl overflow-hidden focus:outline-none z-[10000]"
              style={{
                borderColor: "var(--nerdvana-border)",
                backgroundColor: "var(--nerdvana-surface)",
                color: "var(--nerdvana-text)",
                boxShadow: "8px 8px 0 var(--nerdvana-border)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Bar */}
              <div
                className="flex items-center justify-between px-4 py-2.5 border-b-[2px]"
                style={{
                  borderColor: "var(--nerdvana-border)",
                  backgroundColor: "rgba(0, 0, 0, 0.04)"
                }}
              >
                <div className="flex items-center gap-2 overflow-hidden pr-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--nerdvana-accent)" }}
                  />
                  <h4
                    className="text-[0.8rem] sm:text-[0.88rem] font-bold truncate uppercase tracking-wider"
                    style={{ fontFamily: '"Special Elite", monospace' }}
                  >
                    {visual.title} — Official Trailer
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTrailerOpen(false)}
                  className="px-2.5 py-1 text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-[1px] transition-colors hover:bg-[var(--nerdvana-accent)] hover:text-white"
                  style={{
                    fontFamily: '"Courier New", monospace',
                    borderColor: "var(--nerdvana-border)",
                    color: "var(--nerdvana-text)"
                  }}
                  aria-label="Close trailer modal"
                >
                  [✕ ESC]
                </button>
              </div>

              {/* 16:9 Video Container */}
              <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>
                <iframe
                  ref={trailerIframeRef}
                  src={`https://www.youtube.com/embed/${visual.trailerKey}?autoplay=1&rel=0`}
                  title={`${visual.title} Official Trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>

              {/* Footer */}
              <div
                className="px-4 py-1.5 flex items-center justify-between text-[0.62rem] uppercase tracking-[0.1em] border-t"
                style={{
                  borderColor: "var(--nerdvana-border)",
                  fontFamily: '"Courier New", monospace',
                  opacity: 0.6
                }}
              >
                <span>Nerdvana Archival Media Player</span>
                <span>Press ESC or click outside to dismiss</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  );
}
