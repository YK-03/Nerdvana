import { ENABLE_NERDVANA_TELEMETRY } from "../../config/debug";

/**
 * pipelineTracker.ts
 * 
 * Scoped, per-request query pipeline tracking to capture major architectural boundaries
 * and lifecycle phases without telemetry spam or globally mutable singleton state.
 */

export type LifecyclePhase =
  | "INGESTION"
  | "GROUNDING"
  | "VISUAL_RETRIEVAL"
  | "AI_REQUEST"
  | "NORMALIZATION"
  | "RENDER"
  | "CANCELLATION";

export type AIRenderFailureReason =
  | "EMPTY_SUMMARY"
  | "VALIDATION_FAILED"
  | "MARKDOWN_RENDER_FAILED"
  | "VISIBILITY_BLOCKED"
  | "SPOILER_GATE_BLOCKED"
  | "STATE_OVERWRITTEN"
  | "MISSING_DOM_NODE"
  | "ZERO_HEIGHT"
  | "HIDDEN_BY_CSS"
  | "UNMOUNTED_AFTER_RENDER"
  | "EMPTY_CONTENT"
  | "OVERFLOW_CLIPPED"
  | "RENDER_GUARD_BLOCKED"
  | "NORMALIZATION_FAILED";

export interface ScopedPipelineTrace {
  traceId: string;
  query: string;
  phases: { phase: LifecyclePhase; timestamp: number }[];
  retrieval: {
    started: boolean;
    mode: "DETERMINISTIC" | "EXPLORATORY" | "NONE";
    provider?: string;
    success?: boolean;
    durationMs?: number;
    failureReason?: string;
  };
  grounding: {
    strategy?: string;
    ambiguityLevel?: string;
    explicitSelection?: boolean;
    canonicalResolved?: boolean;
  };
  ai: {
    provider?: string;
    started?: boolean;
    returned?: boolean;
    parsed?: boolean;
    normalized?: boolean;
    validated?: boolean;
    aiSuccess?: boolean;
    aiRenderState?: "AI_SUCCESS" | "AI_RENDER_FAILED" | "PENDING";
    aiRenderFailureReason?: AIRenderFailureReason;
    durationMs?: number;
    failureReason?: string;
  };
  render: {
    visualRendered?: boolean;
    answerRendered?: boolean;
    renderBlocked?: boolean;
    renderFailureReason?: string;
    selector?: string;
    verification?: "SUCCESS" | "FAIL";
    containerHeight?: number;
    containerWidth?: number;
    visibilityReason?: string;
    contractStatus?: "OK" | "FAIL";
    textContent?: string;
  };
}

const activeTraces = new Map<string, ScopedPipelineTrace>();

/**
 * Creates a new pipeline trace context strictly scoped to a unique requestId/traceId.
 */
export function createScopedTrace(traceId: string, query: string): ScopedPipelineTrace {
  const trace: ScopedPipelineTrace = {
    traceId,
    query,
    phases: [{ phase: "INGESTION", timestamp: Date.now() }],
    retrieval: { started: false, mode: "NONE" },
    grounding: {},
    ai: {},
    render: {},
  };
  activeTraces.set(traceId, trace);

  // Auto-clean old traces to prevent memory leaks (keep max 50 recent)
  if (activeTraces.size > 50) {
    const oldestKey = activeTraces.keys().next().value;
    if (oldestKey !== undefined) {
      activeTraces.delete(oldestKey);
    }
  }

  if (ENABLE_NERDVANA_TELEMETRY) {
    console.log(`[Nerdvana] [Trace:${traceId}] [INGESTION] Pipeline trace initialized for query: "${query}"`);
  }
  return trace;
}

/**
 * Gets a scoped pipeline trace by traceId.
 */
export function getScopedTrace(traceId: string): ScopedPipelineTrace | null {
  return activeTraces.get(traceId) ?? null;
}

/**
 * Adds an explicit lifecycle phase marker to a scoped trace.
 */
export function recordLifecyclePhase(traceId: string, phase: LifecyclePhase) {
  const trace = activeTraces.get(traceId);
  if (!trace) return;

  trace.phases.push({ phase, timestamp: Date.now() });
  if (ENABLE_NERDVANA_TELEMETRY) {
    console.log(`[Nerdvana] [Trace:${traceId}] [${phase}] Phase marked.`);
  }
}

/**
 * Records grounding telemetry for the request scope.
 */
export function recordGrounding(
  traceId: string,
  data: Partial<ScopedPipelineTrace["grounding"]>
) {
  const trace = activeTraces.get(traceId);
  if (!trace) return;

  trace.grounding = { ...trace.grounding, ...data };
  recordLifecyclePhase(traceId, "GROUNDING");
}

/**
 * Records visual retrieval telemetry for the request scope.
 */
export function recordRetrieval(
  traceId: string,
  data: Partial<ScopedPipelineTrace["retrieval"]>
) {
  const trace = activeTraces.get(traceId);
  if (!trace) return;

  trace.retrieval = { ...trace.retrieval, ...data };
  recordLifecyclePhase(traceId, "VISUAL_RETRIEVAL");
}

/**
 * Records AI answer generation telemetry for the request scope.
 */
export function recordAI(
  traceId: string,
  data: Partial<ScopedPipelineTrace["ai"]>
) {
  const trace = activeTraces.get(traceId);
  if (!trace) return;

  trace.ai = { ...trace.ai, ...data };
  if (data.started) recordLifecyclePhase(traceId, "AI_REQUEST");
  if (data.normalized) recordLifecyclePhase(traceId, "NORMALIZATION");
}

/**
 * Records UI rendering telemetry for the request scope.
 */
export function recordRender(
  traceId: string,
  data: Partial<ScopedPipelineTrace["render"]>
) {
  const trace = activeTraces.get(traceId);
  if (!trace) return;

  trace.render = { ...trace.render, ...data };
  recordLifecyclePhase(traceId, "RENDER");
}
