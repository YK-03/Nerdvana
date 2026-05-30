import { useEffect, useState } from "react";
import { getScopedTrace, type ScopedPipelineTrace } from "../../lib/resolver/pipelineTracker.js";

interface DebugOverlayProps {
  activeTraceId: string | null;
  activeRequestId: string | null;
  searchKey: string | null;
}

export default function DebugOverlay({ activeTraceId, activeRequestId, searchKey }: DebugOverlayProps) {
  // Hard compile-time safety fence: strictly do not render in production
  if (!import.meta.env.DEV) {
    return null;
  }

  const [expanded, setExpanded] = useState(false);
  const [trace, setTrace] = useState<ScopedPipelineTrace | null>(null);

  // Observability Interval: reads trace data directly from the tracker
  // without triggering AskPage core renders or state updates.
  useEffect(() => {
    if (!activeTraceId) {
      setTrace(null);
      return;
    }

    const interval = setInterval(() => {
      const activeTrace = getScopedTrace(activeTraceId);
      setTrace(activeTrace ? { ...activeTrace } : null);
    }, 250);

    return () => clearInterval(interval);
  }, [activeTraceId]);

  if (!activeTraceId) {
    return null;
  }

  const renderState = trace?.ai?.aiRenderState ?? "PENDING";
  const renderReason = trace?.ai?.aiRenderFailureReason;

  return (
    <div
      className="fixed z-50 transition-all duration-300 font-courier text-xs"
      style={{
        bottom: "1.5rem",
        right: "1.5rem",
        width: expanded ? "380px" : "180px",
        backgroundColor: "rgba(20, 20, 20, 0.94)",
        border: "2px solid var(--nerdvana-border, #444)",
        boxShadow: "6px 6px 0px rgba(0,0,0,0.15)",
        color: "#39ff14", // High-contrast terminal green
        padding: "0.8rem",
      }}
    >
      <div className="flex justify-between items-center border-b pb-1.5 mb-2" style={{ borderColor: "rgba(57, 255, 20, 0.3)" }}>
        <span className="font-bold tracking-wider">NERDVANA TELEMETRY</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="px-1.5 py-0.5 border cursor-pointer hover:bg-[#39ff14] hover:text-black transition-colors"
          style={{ borderColor: "#39ff14" }}
        >
          {expanded ? "[ SHRINK ]" : "[ EXPAND ]"}
        </button>
      </div>

      <div className="space-y-1">
        <div>
          <span className="opacity-60">Mode: </span>
          <span
            className="font-bold uppercase px-1 py-0.2 text-[0.6rem]"
            style={{
              backgroundColor: trace?.retrieval?.mode === "DETERMINISTIC" ? "rgba(57, 255, 20, 0.2)" : "rgba(234, 179, 8, 0.2)",
              color: trace?.retrieval?.mode === "DETERMINISTIC" ? "#39ff14" : "#eab308",
              border: `1px solid ${trace?.retrieval?.mode === "DETERMINISTIC" ? "#39ff14" : "#eab308"}`
            }}
          >
            {trace?.retrieval?.mode ?? "NONE"}
          </span>
        </div>
        <div>
          <span className="opacity-60">Trace:</span> <span className="font-semibold text-white">{activeTraceId.slice(0, 8)}...</span>
        </div>
        
        {expanded && (
          <div className="mt-3 space-y-2 border-t pt-2" style={{ borderColor: "rgba(57, 255, 20, 0.15)" }}>
            <div>
              <span className="font-bold underline">1. Pipeline Boundaries</span>
              <div className="pl-2 mt-1 space-y-0.5">
                {trace?.retrieval?.started && (
                  <div>
                    • Visual:{" "}
                    <span className={trace.retrieval.success ? "text-[#39ff14]" : "text-red-500"}>
                      {trace.retrieval.success ? `SUCCESS (${trace.retrieval.provider})` : `FAILED (${trace.retrieval.failureReason ?? "unknown"})`}
                    </span>
                  </div>
                )}
                {trace?.ai?.started && (
                  <div>
                    • AI State:{" "}
                    <span
                      className={
                        renderState === "AI_SUCCESS"
                          ? "text-[#39ff14]"
                          : renderState === "AI_RENDER_FAILED"
                          ? "text-red-500 font-bold"
                          : "text-yellow-500"
                      }
                    >
                      {renderState}
                      {renderReason && ` [${renderReason}]`}
                    </span>
                  </div>
                )}
                <div>
                  • UI Render:{" "}
                  <span className={trace?.render?.answerRendered ? "text-[#39ff14]" : "text-yellow-500"}>
                    {trace?.render?.answerRendered ? "ACTIVE (PAINTED)" : trace?.render?.renderBlocked ? "BLOCKED" : "WAITING"}
                  </span>
                </div>
                <div>
                  • Selector: <span className="text-white">{trace?.render?.selector ?? "NONE"}</span>
                </div>
                <div>
                  • DOM Check: <span className="text-white">{trace?.render?.verification ?? "PENDING"}</span>
                </div>
                <div>
                  • Dimensions: <span className="text-white">{trace?.render?.containerWidth ?? 0}×{trace?.render?.containerHeight ?? 0}px</span>
                </div>
                <div>
                  • Visibility: <span className="text-white">{trace?.render?.visibilityReason ?? "UNKNOWN"}</span>
                </div>
                <div>
                  • Contract: <span className="text-white">{trace?.render?.contractStatus ?? "PENDING"}</span>
                </div>
              </div>
            </div>

            <div>
              <span className="font-bold underline">2. Grounding Strategy</span>
              <div className="pl-2 mt-1 space-y-0.5">
                <div>• Strategy: <span className="text-white">{trace?.grounding?.strategy ?? "NONE"}</span></div>
                <div>• Ambiguity: <span className="text-white">{trace?.grounding?.ambiguityLevel ?? "LOW"}</span></div>
                <div>• Selection: <span className="text-white">{trace?.grounding?.explicitSelection ? "TRUE" : "FALSE"}</span></div>
              </div>
            </div>

            <div>
              <span className="font-bold underline">3. Refined Lifecycle</span>
              <div className="pl-2 mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                {trace?.phases?.map((p, i) => {
                  const firstTimestamp = trace.phases[0]?.timestamp ?? p.timestamp;
                  const delta = p.timestamp - firstTimestamp;
                  return (
                    <div key={i} className="flex justify-between">
                      <span>• {p.phase}</span>
                      <span className="text-white">+{delta}ms</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-[0.62rem] opacity-40 border-t pt-1.5" style={{ borderColor: 'rgba(57, 255, 20, 0.1)' }}>
              Active key: {searchKey?.slice(0, 32)}...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
