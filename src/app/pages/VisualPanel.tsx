import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ResolverContextPacket, ValidatedVisualAsset } from "../canonicalResolver";
import { VISUAL_PHASE_LABELS } from "../../lib/experience/experienceLanguage";
import { recordRetrieval } from "../../lib/resolver/pipelineTracker.js";
import type { ActiveVisualOwner } from "../../app/canonicalResolver.js";

interface VisualPanelProps {
  contextPacket: ResolverContextPacket;
  activeTraceId: string | null;
  activeVisualOwner?: ActiveVisualOwner | null;
  onVisualLocked?: (owner: ActiveVisualOwner) => void;
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

export default function VisualPanel({ contextPacket, activeTraceId, activeVisualOwner, onVisualLocked }: VisualPanelProps) {
  const [visual, setVisual] = useState<ValidatedVisualAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle");
  const [errorState, setErrorState] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<RetrievalConfidence | null>(null);

  useEffect(() => {
    if (!contextPacket || !contextPacket.canonicalEntity) return;

    let cancelled = false;
    setLoading(true);
    setErrorState(null);
    setVisual(null);
    setConfidence(null);
    setSearchPhase("searching");

    const fetchVisuals = async () => {
      // Fast-path bypass: Reuse active visual owner if provided and matches intent
      if (
         activeVisualOwner &&
         activeVisualOwner.providerId === contextPacket.providerId
      ) {
        console.log("[VISUAL_OWNER_REUSED]", {
          oldProviderId: activeVisualOwner.providerId,
          newProviderId: contextPacket.providerId,
          oldTitle: activeVisualOwner.canonicalTitle,
          newTitle: contextPacket.canonicalEntity
        });
        if (activeVisualOwner.asset) {
          setVisual(activeVisualOwner.asset);
          setConfidence("high"); // Locked visuals are always high confidence
          setSearchPhase("done");
          setLoading(false);
          return;
        }
      } else if (activeVisualOwner) {
        console.log("[VISUAL_OWNER_PROVIDER_MISMATCH]", {
          oldProviderId: activeVisualOwner.providerId,
          newProviderId: contextPacket.providerId,
          oldTitle: activeVisualOwner.canonicalTitle,
          newTitle: contextPacket.canonicalEntity
        });
        console.log("[VISUAL_OWNER_INVALIDATED]", {
          oldProviderId: activeVisualOwner.providerId,
          newProviderId: contextPacket.providerId,
          oldTitle: activeVisualOwner.canonicalTitle,
          newTitle: contextPacket.canonicalEntity
        });
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

              {visual.raw && (visual.raw as any).rating && contextPacket.mediaLens !== "comics" && (
                <div className="absolute top-3 right-3">
                  <span
                    className="px-2 py-[3px] text-[0.65rem] lg:text-[0.58rem] border"
                    style={{
                      fontFamily: '"Courier New", monospace',
                      borderColor: "var(--nerdvana-border)",
                      backgroundColor: "var(--nerdvana-surface)",
                      opacity: 0.9,
                    }}
                  >
                    ★ {(visual.raw as any).rating?.toFixed?.(1) ?? (visual.raw as any).rating}
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
                <p
                  className="text-[0.67rem] leading-relaxed line-clamp-4"
                  style={{ fontFamily: '"Times New Roman", serif', opacity: 0.55 }}
                >
                  {visual.overview}
                </p>
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
  );
}
