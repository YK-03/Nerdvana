import { useEffect, useRef, useState } from "react";
import { generateFollowUps } from "../utils/suggestionGenerator";
import Header from "../components/Header";
import Footer from "../components/Footer";
import ChatBubble from "../components/ChatBubble";
import AIResponse from "../components/AIResponse";
import ThinkingScreen from "../components/ThinkingScreen";
import SourcesPanel from "../components/SourcesPanel";
import VisualPanel from "../pages/VisualPanel";
import { motion } from "motion/react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { type ResultLink } from "../components/ResultStack";
import { buildIntentPhrase } from "../components/QueryIntentHeader";
import { useInvestigationMemory } from "../hooks/useInvestigationMemory";

import { saveCase } from "../utils/caseStorage";
import { saveCaseCloud } from "../utils/caseCloud";
import type { MockAnswer } from "../mockAnswers";
import { buildAskUrl, DEFAULT_MEDIA_LENS, normalizeMediaLens } from "../mediaLens";
import { shouldMaintainFranchiseLock, type ResolverContextPacket, type ActiveVisualOwner, type ActiveVisualOwnerMetadata } from "../canonicalResolver";
import { auth, db } from "../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { startNewSession, useQuerySessionStore, useAutocompleteStore, useIntentStore } from "../store/resolverSession";
import { useExplorationStore, type ExplorationRecommendation } from "../store/explorationSession";
import { detectQueryMode } from "../canonicalResolver";
import type { CanonicalGroundingResult } from "../../lib/resolver/canonicalGrounding.js";
import AutocompleteOverlay from "../components/AutocompleteOverlay";
import ClarificationOverlay from "../components/ClarificationOverlay";
import { resolveQueryIntent } from "../../intent/intentUniverseEngine";
import { arbitrateQueryRoute } from "../../intent/queryModeArbitrator";
import { validateNerdvanaAnswerResponse } from "../../lib/resolver/schemaValidator.js";
import {
  createScopedTrace,
  recordAI,
  recordRender,
  recordGrounding,
  recordRetrieval,
  recordLifecyclePhase
} from "../../lib/resolver/pipelineTracker.js";
import DebugOverlay from "../components/DebugOverlay";
import { RENDER_CONTRACTS, type RenderVerificationResult, verifyRenderNode } from "../../lib/resolver/renderContracts.js";
import { ENABLE_NERDVANA_TELEMETRY, ENABLE_CONTINUITY_TIMELINE } from "../../config/debug";
import type { ProviderMetadata } from "../../lib/resolver/providerMetadata.js";


interface ExecutionContext {
  query: string;
  item: string | null;
  mode: "DETERMINISTIC" | "EXPLORATORY";
  requestId: string;
  traceId: string;
  providerMetadata?: ProviderMetadata | null;
}

interface RenderEntityPacket {
  title: string;
  providerId: string;
  franchiseRoot: string | null;
  providerMetadata: ProviderMetadata | null;
  contextPacket: ResolverContextPacket;
}


function assertInvariant(condition: boolean, message: string) {
  if (!ENABLE_NERDVANA_TELEMETRY) return;
  if (!condition) {
    console.error(`[Nerdvana] [Assertion Violation] ${message}`);
    if (import.meta.env.DEV) {
      throw new Error(`[Assertion Violation] ${message}`);
    }
  }
}

interface AskPageProps {
  question: string;
  onNavigatePage: (page: string) => void;
  onQuestionChange?: (newQuestion: string) => void;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface ResponseData {
  answer: MockAnswer;
  results: ResultLink[];
}

function readAskQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const urlItem = params.get("item")?.trim() ?? "";
  const urlLens = params.get("lens")?.trim() ?? "";
  const stateItem =
    window.history.state && typeof window.history.state.item === "string"
      ? window.history.state.item.trim()
      : "";
  const stateLens =
    window.history.state && typeof window.history.state.mediaLens === "string"
      ? window.history.state.mediaLens.trim()
      : "";
  const providerMetadata =
    window.history.state && typeof window.history.state.providerMetadata === "object"
      ? window.history.state.providerMetadata
      : null;
  const item = urlItem || stateItem;
  return {
    item,
    mediaLens: normalizeMediaLens(urlLens || stateLens || DEFAULT_MEDIA_LENS),
    providerMetadata
  };
}

function recordRenderVerification(traceId: string, result: RenderVerificationResult) {
  recordRender(traceId, {
    selector: result.selector,
    verification: result.success ? "SUCCESS" : "FAIL",
    containerHeight: result.height,
    containerWidth: result.width,
    visibilityReason: result.reason ?? "UNKNOWN",
    contractStatus: result.contractStatus,
    textContent: result.textContent,
    answerRendered: result.success,
    visualRendered: result.success,
    renderBlocked: !result.success,
    renderFailureReason: result.success ? undefined : result.reason
  });
}

function finalizeRenderVerification(
  traceId: string,
  selector: string,
  onVerified: (result: RenderVerificationResult) => void,
  attempt = 0
) {
  if (!ENABLE_NERDVANA_TELEMETRY) return;
  const result = verifyRenderNode(selector);

  if (result.success || attempt >= 3) {
    onVerified(result);
    return;
  }

  window.requestAnimationFrame(() => {
    finalizeRenderVerification(traceId, selector, onVerified, attempt + 1);
  });
}

export default function AskPage({
  question,
  onNavigatePage,
  onQuestionChange
}: AskPageProps) {
  const [urlParams, setUrlParams] = useState(() => readAskQueryParams());
  const { item: queryItem, mediaLens } = urlParams;

  useEffect(() => {
    const handlePopState = () => {
      setUrlParams(readAskQueryParams());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const fullQuestion = question.trim();
  const [queryInput, setQueryInput] = useState(fullQuestion);
  const [contextPacket, setContextPacket] = useState<ResolverContextPacket | null>(null);
  const [activeVisualOwner, setActiveVisualOwner] = useState<ActiveVisualOwner | null>(null);
  const [activeVisualOwnerMetadata, setActiveVisualOwnerMetadata] = useState<ActiveVisualOwnerMetadata | null>(null);
  const [grounding, setGrounding] = useState<CanonicalGroundingResult | null>(null);
  const [renderEntityPacket, setRenderEntityPacket] = useState<RenderEntityPacket | null>(null);
  const resolvedItem = (contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && renderEntityPacket)
    ? renderEntityPacket.title
    : (contextPacket?.canonicalEntity ?? null);
  const isAmbiguous =
    grounding?.behavior === "require_selection" ||
    grounding?.ambiguityLevel === "medium" ||
    (contextPacket ? contextPacket.confidence < 0.5 : false);
  const contextIsValid = !!contextPacket && (!contextPacket || contextPacket.confidence >= 0.5);
  const { sessionId } = useQuerySessionStore();
  const { clarificationPending, clarificationSuggestions } = useIntentStore();

  const handleSelectClarification = (selectionValue: string, displayTitle: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("item", selectionValue);
    params.set("q", displayTitle);
    window.location.search = params.toString();
  };

  const [answer, setAnswer] = useState<MockAnswer>({ summary: "", categories: [], spoilers: "" });
  const [results, setResults] = useState<ResultLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [responseData, setResponseData] = useState<ResponseData | null>(null);
  const { save: saveCaseMemory } = useInvestigationMemory();
  const [user] = useAuthState(auth);
  const lastSavedCaseKey = useRef("");
  const isManualSubmitRef = useRef(false);
  const activeExecutionRef = useRef<{
    searchKey: string;
    ownershipGenerationId?: string | null;
    status: "idle" | "running" | "completed" | "failed" | "aborted";
    startedAt: number;
  } | null>(null);
  const isAutocompleteSelectionRef = useRef(false);
  const selectedSuggestionRef = useRef<any>(null);
  const lastPrimaryQueryRef = useRef("");
  
  const { 
    status: explorationStatus, 
    themes: explorationThemes, 
    recommendations: explorationRecs, 
    reasoning: explorationReasoning,
    startExploration,
    setExplorationResults,
    clearExplorationState
  } = useExplorationStore();

  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [followUpQuery, setFollowUpQuery] = useState("");
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);
  const [chatSpoilers, setChatSpoilers] = useState(false);
  const [readingOrder, setReadingOrder] = useState<any[] | null>(null);
  const [continuationSuggestions, setContinuationSuggestions] = useState<any[] | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSearchKeyRef = useRef("");
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeTraceIdRef = useRef<string | null>(null);


  const [isInputFocused, setIsInputFocused] = useState(false);
  const {
    suggestions,
    activeIndex,
    loading,
    setAutocompleteState,
    setActiveIndex,
    clearAutocompleteState
  } = useAutocompleteStore();

  const inputDebounceTimerRef = useRef<any>(null);
  const inputCurrentQueryRef = useRef("");
  const inputActiveAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = queryInput.trim();
    inputCurrentQueryRef.current = query;

    if (inputDebounceTimerRef.current) {
      clearTimeout(inputDebounceTimerRef.current);
    }

    if (inputActiveAbortControllerRef.current) {
      inputActiveAbortControllerRef.current.abort();
      inputActiveAbortControllerRef.current = null;
    }

    if (query.length < 2) {
      clearAutocompleteState();
      return;
    }

    // Set loading state in store
    setAutocompleteState(suggestions, null, true);

    inputDebounceTimerRef.current = setTimeout(async () => {
      if (inputCurrentQueryRef.current !== query) return;

      const abortController = new AbortController();
      inputActiveAbortControllerRef.current = abortController;

      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}&lens=${mediaLens}`, {
          signal: abortController.signal
        });
        if (!res.ok) throw new Error("Fetch failed");
        const data = await res.json();
        if (inputCurrentQueryRef.current === query) {
          setAutocompleteState(data, null, false);
        }
      } catch (err: any) {
        if (err.name !== "AbortError" && inputCurrentQueryRef.current === query) {
          setAutocompleteState([], null, false);
        }
      }
    }, 250);

    return () => {
      if (inputDebounceTimerRef.current) {
        clearTimeout(inputDebounceTimerRef.current);
      }
      if (inputActiveAbortControllerRef.current) {
        inputActiveAbortControllerRef.current.abort();
      }
    };
  }, [queryInput, mediaLens, clearAutocompleteState, setAutocompleteState]);

  useEffect(() => {
    return () => {
      clearAutocompleteState();
    };
  }, [clearAutocompleteState]);

  const handleSelectSuggestion = (suggestion: any) => {
    const startedAt = activeExecutionRef.current?.startedAt ?? Date.now();
    const executionAgeMs = Date.now() - startedAt;
    console.log("[EXECUTION INVALIDATED]", {
      searchKey: activeExecutionRef.current?.searchKey ?? "none",
      previousStatus: activeExecutionRef.current?.status ?? "idle",
      executionAgeMs,
      reason: "AUTOCOMPLETE_SELECTION"
    });

    activeExecutionRef.current = null;
    isAutocompleteSelectionRef.current = true;
    selectedSuggestionRef.current = suggestion;

    clearAutocompleteState();
    const newQuery = suggestion.displayTitle;
    const nextItem = suggestion.selectionValue;

    console.log("[AUTOCOMPLETE_RAW_SUGGESTION]", suggestion);

    console.log(
      "[AUTOCOMPLETE_PROVIDER_SELECTED]",
      suggestion.selectionValue,
      suggestion.providerMetadata
    );
    if (suggestion.providerMetadata?.providerType) {
      console.log("[TYPED_PROVIDER_PROPAGATED]", {
        stage: "autocomplete_selection",
        providerId: suggestion.selectionValue,
        providerType: suggestion.providerMetadata.providerType,
        providerResourceType: suggestion.providerMetadata.providerResourceType ?? null,
      });
    }

    console.log(
      "[PROVIDER_ID_PROPAGATED] Navigating with provider ID:",
      nextItem
    );

    console.log("[Nerdvana] [SelectSuggestion] history.state BEFORE:", window.history.state);

    window.history.replaceState(
      { mediaLens, item: nextItem, providerMetadata: suggestion.providerMetadata },
      "",
      buildAskUrl(newQuery, { lens: mediaLens, item: nextItem })
    );

    console.log("[Nerdvana] [SelectSuggestion] history.state AFTER:", window.history.state);

    onQuestionChange?.(newQuery);
    setQueryInput(newQuery);
    setUrlParams({ item: nextItem, mediaLens, providerMetadata: suggestion.providerMetadata });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = activeIndex >= suggestions.length - 1 ? 0 : activeIndex + 1;
        setActiveIndex(nextIndex);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
        setActiveIndex(prevIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearAutocompleteState();
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          e.preventDefault();
          const selected = suggestions[activeIndex];
          handleSelectSuggestion(selected);
        }
      }
    }
  };

  const handleSubmitQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const newQuery = queryInput.trim();
    if (!newQuery) return;
    clearAutocompleteState();

    const startedAt = activeExecutionRef.current?.startedAt ?? Date.now();
    const executionAgeMs = Date.now() - startedAt;
    console.log("[EXECUTION INVALIDATED]", {
      searchKey: activeExecutionRef.current?.searchKey ?? "none",
      previousStatus: activeExecutionRef.current?.status ?? "idle",
      executionAgeMs,
      reason: "MANUAL_SUBMISSION"
    });

    isManualSubmitRef.current = true;
    selectedSuggestionRef.current = null;
    lastSearchKeyRef.current = "";
    activeExecutionRef.current = null; // Clear execution state synchronously

    console.log("[Nerdvana] [Submission] history.state BEFORE:", window.history.state);

    // Invalidate ALL deterministic restoration sources simultaneously first
    setGrounding(null);
    setContextPacket(null);
    setRenderEntityPacket(null);
    setUrlParams({ item: "", mediaLens });

    window.history.replaceState(
      { mediaLens },
      "",
      buildAskUrl(newQuery, { lens: mediaLens })
    );

    console.log("[Nerdvana] [Submission] history.state AFTER:", window.history.state);

    onQuestionChange?.(newQuery);
  };

  useEffect(() => {
    // Discovery Rails and Theme Engine are disabled for Phase 9A stabilization
  }, [contextPacket]);


  const handleSaveLorebook = async () => {
    if (!user) {
      alert("Please sign in to save lorebooks.");
      return;
    }

    const fullSession = [];
    if (fullQuestion) fullSession.push({ role: "user", content: fullQuestion });
    if (answer.summary) fullSession.push({ role: "assistant", content: answer.summary });
    fullSession.push(...conversation);
    if (fullSession.length === 0) return;

    try {
      let visualAsset = null;
      if (activeVisualOwner?.asset) {
        const asset = activeVisualOwner.asset;
        const raw = (asset as any).raw || {};
        
        let posterUrl = asset.url;
        let backdropUrl = null;

        if (asset.source === "tmdb") {
           posterUrl = raw.poster_path ? `https://image.tmdb.org/t/p/w780${raw.poster_path}` : asset.url;
           backdropUrl = raw.backdrop_path ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}` : null;
        } else if (asset.source === "rawg") {
           backdropUrl = raw.background_image || null;
           posterUrl = raw.background_image || asset.url; 
        } else if (asset.source === "jikan") {
           posterUrl = raw.images?.jpg?.large_image_url || asset.url;
        } else if (asset.source === "igdb") {
           posterUrl = raw.cover?.url ? `https:${raw.cover.url.replace("t_thumb", "t_cover_big")}` : asset.url;
        }

        visualAsset = {
           url: asset.url,
           posterUrl,
           backdropUrl,
           title: asset.title,
           source: asset.source,
           mediaType: activeVisualOwner.mediaType
        };
      }

      await addDoc(collection(db, "users", user.uid, "lorebooks"), {
        topic: fullQuestion,
        mediaLens,
        conversation: fullSession,
        results: results.map(s => ({ title: s.title, url: s.url })),
        visualAsset,
        createdAt: serverTimestamp()
      });
      alert("Session saved to Lorebooks!");
    } catch (e) {
      console.error("Error saving lorebook:", e);
      alert("Failed to save.");
    }
  };

  useEffect(() => {
    setQueryInput(fullQuestion);
  }, [fullQuestion]);

  const hasRestoredSessionRef = useRef(false);

  useEffect(() => {
    if (hasRestoredSessionRef.current) return;
    hasRestoredSessionRef.current = true;

    try {
      const saved = localStorage.getItem("nerdvana_active_session");
      if (!saved) return;

      const parsed = JSON.parse(saved);

      if (parsed.topic === fullQuestion) {
        const restoredAnswer =
          parsed.answer || { summary: "", categories: [], spoilers: "" };

        const restoredResults = parsed.results || [];

        setAnswer(restoredAnswer);
        setResults(restoredResults);

        setResponseData({
          answer: restoredAnswer,
          results: restoredResults
        });

        setConversation(parsed.conversation || []);

        if (parsed.contextPacket) {
          setContextPacket(parsed.contextPacket);
        }

        if (parsed.grounding) {
          setGrounding(parsed.grounding);
        }

        if (parsed.renderEntityPacket) {
          setRenderEntityPacket(parsed.renderEntityPacket);
        }

        if (parsed.activeVisualOwnerMetadata) {
          setActiveVisualOwnerMetadata(parsed.activeVisualOwnerMetadata);
        }
      }
    } catch (e) {
      console.error("Failed to restore session", e);
    }
  }, []);

  useEffect(() => {
    if (!fullQuestion) return;

    localStorage.setItem(
      "nerdvana_active_session",
      JSON.stringify({
        topic: fullQuestion,
        answer,
        results,
        conversation,
        contextPacket,
        grounding,
        mediaLens,
        renderEntityPacket,
        activeVisualOwnerMetadata
      })
    );
  }, [fullQuestion, answer, results, conversation, mediaLens, contextPacket, grounding, renderEntityPacket, activeVisualOwnerMetadata]);

  useEffect(() => {
    if (!fullQuestion) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("lens")) return;

    window.history.replaceState(
      { 
        mediaLens, 
        ...(queryItem ? { item: queryItem } : {}),
        providerMetadata: window.history.state?.providerMetadata || urlParams.providerMetadata || null
      },
      "",
      buildAskUrl(fullQuestion, { item: queryItem, lens: mediaLens })
    );
  }, [fullQuestion, mediaLens, queryItem, urlParams.providerMetadata]);

  useEffect(() => {
    let isCancelled = false;
    const normalizedQuestion = fullQuestion.trim();

    const freshParams = readAskQueryParams();
    let currentItem = freshParams.item || selectedSuggestionRef.current?.selectionValue || null;
    let providerMetadata = freshParams.providerMetadata || 
      selectedSuggestionRef.current?.providerMetadata ||
      window.history.state?.providerMetadata || 
      urlParams.providerMetadata || 
      renderEntityPacket?.providerMetadata || 
      contextPacket?.providerMetadata || 
      null;
    const isManualSubmit = isManualSubmitRef.current;

    if (isManualSubmitRef.current) {
      currentItem = null;
      providerMetadata = null;
      isManualSubmitRef.current = false;
    }

    console.log("[EFFECT_TRIGGER] Search useEffect triggered. State:", {
      normalizedQuestion,
      currentItem,
      providerMetadata,
      isManualSubmit,
      isAutocompleteSelection: isAutocompleteSelectionRef.current
    });

    console.log("[URL_ITEM_STATE]", {
      queryItem,
      historyItem: window.history.state?.item,
      urlParamsItem: urlParams.item
    });

    if (isAutocompleteSelectionRef.current) {
      isAutocompleteSelectionRef.current = false;
      activeExecutionRef.current = null;
      lastSearchKeyRef.current = ""; // Completely bypass duplicate suppression
    }

    const desynced = (queryItem || null) !== currentItem;
    console.log("[STATE DESYNC]", {
      queryItem,
      currentItem,
      fullQuestion,
      desynced
    });

    const searchKey = `${normalizedQuestion}|${mediaLens}|${chatSpoilers}|${user?.uid ?? ""}|${currentItem || ""}`;
    const lastKeys = Array.isArray(lastSearchKeyRef.current) ? lastSearchKeyRef.current : [lastSearchKeyRef.current];

    if (activeExecutionRef.current?.searchKey === searchKey && activeExecutionRef.current?.status === "running") {
      console.log("[SEARCH EXIT]", {
        reason: "ALREADY_RUNNING",
        searchKey,
        queryItem,
        currentItem
      });
      return;
    }

    const primaryQueryKey = `${normalizedQuestion}|${mediaLens}|${currentItem || ""}`;
    if (lastPrimaryQueryRef.current !== primaryQueryKey || isAutocompleteSelectionRef.current || desynced) {
      setActiveVisualOwner(null);
      setActiveVisualOwnerMetadata(null);
      lastPrimaryQueryRef.current = primaryQueryKey;
    }

    if (activeExecutionRef.current?.searchKey === searchKey && activeExecutionRef.current?.status === "completed") {
      console.log("[SEARCH EXIT]", {
        reason: "ALREADY_COMPLETED",
        searchKey,
        queryItem,
        currentItem
      });
      setIsLoading(false);
      return;
    }

    const shouldSkip = lastKeys.includes(searchKey) && activeExecutionRef.current?.status !== "failed" && activeExecutionRef.current?.status !== "aborted";
    
    console.log("[SEARCH SUPPRESSION]", {
      searchKey,
      lastKeys,
      currentItem,
      queryItem,
      fullQuestion,
      shouldSkip
    });

    if (shouldSkip) {
      console.log("[SEARCH EXIT]", {
        reason: "SUPPRESSED_DUPLICATE",
        searchKey,
        queryItem,
        currentItem
      });
      setIsLoading(false);
      return;
    }

    // Only assign AFTER validating this is genuinely a fresh execution path
    lastSearchKeyRef.current = searchKey;

    if (ENABLE_NERDVANA_TELEMETRY) {
      console.log("[RESET PATH TRIGGERED]", "Search Key Mismatch or First Mount", { searchKey, lastKeys });
    }

    if (!normalizedQuestion) {
      setAnswer({ summary: "", categories: [], spoilers: "" });
      setResults([]);
      setResponseData(null);
      setIsLoading(false);
      setGrounding(null);
      clearExplorationState();
      setReadingOrder(null);
      setContinuationSuggestions(null);
      
      console.log("[SEARCH EXIT]", {
        reason: "EMPTY_QUERY"
      });
      return () => {
        isCancelled = true;
        if (activeTraceIdRef.current) {
          recordLifecyclePhase(activeTraceIdRef.current, "CANCELLATION");
        }
      };
    }

    const isExplicitTmdb = currentItem?.startsWith("tmdb::") || normalizedQuestion.startsWith("tmdb::");
    const isDeterministic = Boolean(currentItem) || isExplicitTmdb;
    const mode = isDeterministic ? "DETERMINISTIC" : "EXPLORATORY";

    console.log("[TV TRACE]", {
      fullQuestion,
      currentItem,
      queryItem,
      historyItem: window.history.state?.item,
      urlItem: urlParams.item,
      mode,
      mediaLens,
      manualSubmit: isManualSubmit
    });

    console.log("[Nerdvana] [Pipeline] Current Item Lock:", currentItem);
    console.log("[Nerdvana] [Pipeline] Current SearchKey:", searchKey);
    console.log("[Nerdvana] [Pipeline] Execution Mode:", mode);

    const requestId = Math.random().toString(36).substring(2, 15);
    const traceId = `trace-${requestId}`;

    const executionContext: ExecutionContext = {
      query: normalizedQuestion,
      item: currentItem,
      mode,
      requestId,
      traceId,
      providerMetadata
    };
    if (providerMetadata?.providerType) {
      console.log("[TYPED_PROVIDER_PROPAGATED]", {
        stage: "execution_context",
        providerId: currentItem,
        providerType: providerMetadata.providerType,
        providerResourceType: providerMetadata.providerResourceType ?? null,
      });
    }

    console.log("[EXECUTION STATE]", {
      searchKey,
      previousStatus: activeExecutionRef.current?.status ?? "idle",
      nextStatus: "running"
    });
    activeExecutionRef.current = {
      searchKey,
      status: "running",
      startedAt: Date.now()
    };

    activeRequestIdRef.current = requestId;
    activeTraceIdRef.current = traceId;
    setActiveRequestId(requestId);
    setActiveTraceId(traceId);

    const runSearch = async (context: ExecutionContext) => {
      try {
        setIsLoading(true);
        setReadingOrder(null);
        setContinuationSuggestions(null);

        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          if (activeTraceIdRef.current) {
            recordLifecyclePhase(activeTraceIdRef.current, "CANCELLATION");
          }
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        createScopedTrace(context.traceId, context.query);

        // Run deterministic Intent Universe Engine (Phase 13)
        const resolution = resolveQueryIntent(
          context.query,
          mediaLens,
          context.item || undefined,
          useQuerySessionStore.getState().temporaryEntities
        );

        // Assertions for System A deterministic locks (Rule 8 Assertion / Invariant assertions)
        assertInvariant(
          !isExplicitTmdb || context.mode === "DETERMINISTIC",
          `Explicit TMDB query must run in DETERMINISTIC mode. Query: ${context.query}`
        );

        assertInvariant(
          context.mode !== "DETERMINISTIC" || resolution.ambiguity.ambiguityLevel === "LOW",
          `Deterministic locks must have LOW ambiguity. Ambiguity: ${resolution.ambiguity.ambiguityLevel}`
        );

        if (context.item || context.query.startsWith("tmdb::")) {
          if (resolution.ambiguity.ambiguityScore > 0.0) {
            assertInvariant(false, `Explicit TMDB lock query must have 0.0 ambiguity. Query: ${context.query}`);
          }
          if (resolution.groundingDecision.strategy !== "STRICT_GROUND") {
            assertInvariant(false, `Explicit TMDB lock query must bypass and lock strategy. Query: ${context.query}`);
          }
        }

        recordGrounding(context.traceId, {
          strategy: resolution.groundingDecision.strategy,
          ambiguityLevel: resolution.ambiguity.ambiguityLevel,
          explicitSelection: !!context.item,
          canonicalResolved: !!resolution.groundingResult.canonicalEntity
        });

        // Save intent state in Zustand store
        useIntentStore.getState().setIntentState(
          resolution.intent.intent,
          resolution.ambiguity,
          resolution.groundingDecision.strategy,
          resolution.candidateGraph
        );

        // Arbitrate route
        const arbitration = arbitrateQueryRoute(resolution);

        if (context.requestId !== activeRequestIdRef.current) return;

        if (arbitration.route === "clarification") {
          setIsLoading(false);
          useIntentStore.getState().setClarification(true, arbitration.clarificationSuggestions);
          
          recordAI(context.traceId, {
            aiSuccess: false,
            aiRenderState: "AI_RENDER_FAILED",
            aiRenderFailureReason: "VISIBILITY_BLOCKED"
          });
          recordRender(context.traceId, {
            renderBlocked: true,
            renderFailureReason: "Search routed to clarification overlay."
          });
          return;
        } else {
          useIntentStore.getState().setClarification(false, []);
        }

        const runMode = arbitration.route === "exploration" ? "exploration" : "entity";
        const newSessionId = startNewSession(context.query, mediaLens, runMode);

        const selectedSuggestion = selectedSuggestionRef.current;
        const finalItem = urlParams.item || selectedSuggestion?.selectionValue || context.item || null;
        const finalMetadata = urlParams.providerMetadata || selectedSuggestion?.providerMetadata || context.providerMetadata || null;
        const finalExecutionMode = (finalItem && String(finalItem).includes("::")) ? "DETERMINISTIC_PROVIDER" : "SEMANTIC";

        let endpoint = "/api/nerdvana-answer";
        let bodyPayload: any = {
            sessionId: newSessionId,
            query: context.query,
            mediaLens,
            item: finalItem || undefined,
            spoilerMode: chatSpoilers,
            conversation: [],
            previousEntity: null,
            temporaryEntities: useQuerySessionStore.getState().temporaryEntities,
            intentResolution: resolution,
            providerMetadata: finalMetadata || undefined,
            executionMode: finalExecutionMode
        };

        if (runMode === "exploration") {
          endpoint = "/api/nerdvana-exploration";
          startExploration(newSessionId, context.query, mediaLens);
          bodyPayload = {
            query: context.query,
            mediaLens,
            conversation: []
          };
        }

        recordRetrieval(context.traceId, {
          started: true,
          mode: context.mode
        });

        console.log("[API_DISPATCH_PAYLOAD]", {
          item: finalItem,
          providerMetadata: finalMetadata,
          executionMode: finalExecutionMode
        });

        console.log("[FETCH_PATH_A] Dispatching runSearch fetch to endpoint:", endpoint, "with bodyPayload:", bodyPayload);

        const response = await fetch(endpoint, {
          method: "POST",
          signal: abortController.signal,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyPayload)
        });

        if (context.requestId !== activeRequestIdRef.current) {
          recordAI(context.traceId, {
            aiSuccess: false,
            aiRenderState: "AI_RENDER_FAILED",
            aiRenderFailureReason: "STATE_OVERWRITTEN"
          });
          return;
        }

        if (!response.ok) {
          throw new Error(`API ${response.status}`);
        }

        recordRetrieval(context.traceId, { success: true });
        recordAI(context.traceId, { started: true, provider: "Gemini" });

        const payload = await response.json();

        // Execution Ownership Protection against stale async completions
        if (activeExecutionRef.current?.searchKey !== searchKey) {
          console.log("[STALE EXECUTION DISCARDED]", {
            staleSearchKey: searchKey,
            activeSearchKey: activeExecutionRef.current?.searchKey
          });
          return;
        }
        
        if (payload?.contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && payload.contextPacket.ownershipGenerationId) {
            if (activeExecutionRef.current.ownershipGenerationId && activeExecutionRef.current.ownershipGenerationId !== payload.contextPacket.ownershipGenerationId) {
                console.log("[STALE OWNERSHIP REJECTED]", { 
                    expected: activeExecutionRef.current.ownershipGenerationId, 
                    received: payload.contextPacket.ownershipGenerationId 
                });
                return;
            }
            activeExecutionRef.current.ownershipGenerationId = payload.contextPacket.ownershipGenerationId;
        }

        if (context.requestId !== activeRequestIdRef.current) {
          recordAI(context.traceId, {
            aiSuccess: false,
            aiRenderState: "AI_RENDER_FAILED",
            aiRenderFailureReason: "STATE_OVERWRITTEN"
          });
          return;
        }

        // --- RENDER OWNERSHIP VERIFICATION GATE ---
        const isIncomingDeterministic = payload?.contextPacket?.executionMode === "DETERMINISTIC_PROVIDER";
        const incomingProviderId = payload?.contextPacket?.providerId || payload?.grounding?.selectedSelectionValue || null;
        
        // Active locked provider ID from the search context or previous render packet
        const expectedProviderId = context.item || renderEntityPacket?.providerId || null;

        let renderVerified = false;

        if (expectedProviderId) {
          if (isIncomingDeterministic && incomingProviderId === expectedProviderId) {
            renderVerified = true;
          }
        } else {
          if (isIncomingDeterministic && incomingProviderId) {
            renderVerified = true;
          } else if (!isIncomingDeterministic) {
            renderVerified = true;
          }
        }

        if (expectedProviderId && !renderVerified) {
          console.warn("[RENDER_OWNERSHIP_BLOCKED] Render candidate differs from provider ownership!", {
            expectedProviderId,
            incomingProviderId,
            incomingExecutionMode: payload?.contextPacket?.executionMode
          });
          setIsLoading(false);
          return;
        }

        if (isIncomingDeterministic && renderVerified) {
          console.log("[RENDER_OWNERSHIP_VERIFIED] Render candidate matches provider ownership:", incomingProviderId);
          const nextRenderPacket: RenderEntityPacket = {
            title: payload?.contextPacket?.canonicalEntity || payload?.grounding?.selectedCanonicalEntity || context.query,
            providerId: incomingProviderId!,
            franchiseRoot: payload?.contextPacket?.parentFranchise || payload?.grounding?.selectedFranchise || null,
            providerMetadata: payload?.contextPacket?.providerMetadata || payload?.grounding?.providerMetadata || null,
            contextPacket: payload.contextPacket
          };
          Object.freeze(nextRenderPacket);
          setRenderEntityPacket(nextRenderPacket);
        } else if (!isIncomingDeterministic) {
          setRenderEntityPacket(null);
        }

        recordAI(context.traceId, { returned: true });

        // Validate Response using lightweight schemaValidator
        if (runMode !== "exploration") {
          let isValid = false;
          try {
            isValid = validateNerdvanaAnswerResponse(payload);
          } catch (valErr: any) {
            recordAI(context.traceId, {
              validated: false,
              aiSuccess: false,
              aiRenderState: "AI_RENDER_FAILED",
              aiRenderFailureReason: "VALIDATION_FAILED"
            });
            throw valErr;
          }
          if (!isValid) {
            recordAI(context.traceId, {
              validated: false,
              aiSuccess: false,
              aiRenderState: "AI_RENDER_FAILED",
              aiRenderFailureReason: "VALIDATION_FAILED"
            });
            throw new Error("Lightweight response schema validation failed.");
          }
          recordAI(context.traceId, { validated: true });
        }

        if (payload?.temporaryEntityCreated) {
          useQuerySessionStore.getState().addTemporaryEntity(payload.temporaryEntityCreated);
        }

        recordAI(context.traceId, { normalized: true });

        if (runMode === "exploration") {
            const expResult = payload.explorationResult;
            if (expResult) {
                setExplorationResults(
                    expResult.themes,
                    expResult.recommendations,
                    payload.summary,
                    expResult.confidence
                );
            }
            const aiAnswer = payload.summary || "";
            
            if (!aiAnswer.trim()) {
              recordAI(context.traceId, {
                aiSuccess: false,
                aiRenderState: "AI_RENDER_FAILED",
                aiRenderFailureReason: "EMPTY_SUMMARY"
              });
              throw new Error("Exploration query returned empty summary.");
            }

            const nextAnswer = { summary: aiAnswer, categories: [], spoilers: "" } satisfies MockAnswer;
            setAnswer(nextAnswer);
            setResponseData({ answer: nextAnswer, results: [] });
            lastSearchKeyRef.current = searchKey;
            
            finalizeRenderVerification(context.traceId, RENDER_CONTRACTS.selectors.aiResponse, (result) => {
              if (context.requestId !== activeRequestIdRef.current) {
                recordAI(context.traceId, {
                  aiSuccess: false,
                  aiRenderState: "AI_RENDER_FAILED",
                  aiRenderFailureReason: "STATE_OVERWRITTEN"
                });
                return;
              }

              recordRenderVerification(context.traceId, result);

              if (!result.success) {
                recordAI(context.traceId, {
                  aiSuccess: false,
                  aiRenderState: "AI_RENDER_FAILED",
                  aiRenderFailureReason: result.reason ?? "VISIBILITY_BLOCKED"
                });
                assertInvariant(false, `AI render verification failed: ${result.reason ?? "UNKNOWN"}`);
                return;
              }

              recordAI(context.traceId, {
                aiSuccess: true,
                aiRenderState: "AI_SUCCESS"
              });
            });

            console.log("[EXECUTION STATE]", {
              searchKey,
              previousStatus: "running",
              nextStatus: "completed"
            });
            activeExecutionRef.current = {
              searchKey,
              status: "completed",
              startedAt: activeExecutionRef.current?.startedAt ?? Date.now()
            };
            return;
        }

        let canonicalTitle = context.query;
        const canonicalItem = payload?.grounding?.selectedSelectionValue || context.item || "";
        if (payload?.grounding?.selectedCanonicalEntity) {
          canonicalTitle = payload.grounding.suggestions?.[0]?.displayTitle ?? payload.grounding.selectedCanonicalEntity;
        }

        // Defensive: Set the search key ref immediately to prevent state-change re-renders 
        // from re-triggering the search pipeline.
        const newSearchKey = `${canonicalTitle.trim()}|${mediaLens}|${chatSpoilers}|${user?.uid ?? ""}|${canonicalItem}`;
        lastSearchKeyRef.current = newSearchKey;

        if (payload?.grounding) {
          setGrounding(payload.grounding);
          if (payload.grounding.selectedCanonicalEntity) {
            const params = new URLSearchParams(window.location.search);
            const nextMeta = payload.contextPacket?.providerMetadata || payload.grounding?.providerMetadata || urlParams.providerMetadata || window.history.state?.providerMetadata || null;

            if (params.get("item") !== canonicalItem || params.get("q") !== canonicalTitle) {
              window.history.replaceState(
                { mediaLens, item: canonicalItem, providerMetadata: nextMeta },
                "",
                buildAskUrl(canonicalTitle, { lens: mediaLens, item: canonicalItem })
              );
              setUrlParams({ item: canonicalItem, mediaLens, providerMetadata: nextMeta });
            }
            if (canonicalTitle !== context.query) {
              if (payload?.contextPacket?.executionMode !== "DETERMINISTIC_PROVIDER") {
                onQuestionChange?.(canonicalTitle);
                setQueryInput(canonicalTitle);
              }
            }
          }
        }

        const rawSources = Array.isArray(payload?.sources) ? payload.sources : [];
        const aiAnswer = String(payload?.answer ?? "");

        if (!aiAnswer.trim()) {
          recordAI(context.traceId, {
            aiSuccess: false,
            aiRenderState: "AI_RENDER_FAILED",
            aiRenderFailureReason: "EMPTY_SUMMARY"
          });
          throw new Error("Answer response returned empty answer text.");
        }

        let rawResults;
        try {
          rawResults = rawSources
            .map((source: { title?: string; link?: string }) => {
              const url = String(source?.link ?? "").trim();
              let hostname = "";
              try {
                hostname = new URL(url).hostname;
              } catch {
                hostname = "";
              }

              return {
                title: String(source?.title ?? "").trim(),
                url,
                source: hostname,
                snippet: ""
              } satisfies ResultLink;
            })
            .filter((source) => Boolean(source.url));
        } catch (normErr: any) {
          recordAI(context.traceId, {
            aiSuccess: false,
            aiRenderState: "AI_RENDER_FAILED",
            aiRenderFailureReason: "NORMALIZATION_FAILED"
          });
          throw normErr;
        }

        const nextAnswer = { summary: aiAnswer, categories: [], spoilers: "" } satisfies MockAnswer;
        setResults(rawResults);
        setAnswer(nextAnswer);
        setResponseData({ answer: nextAnswer, results: rawResults });

        if (payload?.readingOrder) {
          setReadingOrder(payload.readingOrder);
        } else {
          setReadingOrder(null);
        }

        if (payload?.continuationSuggestions) {
          setContinuationSuggestions(payload.continuationSuggestions);
        } else {
          setContinuationSuggestions(null);
        }

        if (payload?.contextPacket) {
          setContextPacket(payload.contextPacket);
        }

        // Visual check and spoiler block check
        const isSpoilerBlocked = !chatSpoilers && /\b(die|dies|death|dead|ending|kills|killed|final scene|spoiler|plot twist)\b/i.test(aiAnswer);

        finalizeRenderVerification(context.traceId, RENDER_CONTRACTS.selectors.aiResponse, (result) => {
          if (context.requestId !== activeRequestIdRef.current) {
            recordAI(context.traceId, {
              aiSuccess: false,
              aiRenderState: "AI_RENDER_FAILED",
              aiRenderFailureReason: "STATE_OVERWRITTEN"
            });
            return;
          }

          recordRenderVerification(context.traceId, result);

          if (!result.success) {
            recordAI(context.traceId, {
              aiSuccess: false,
              aiRenderState: "AI_RENDER_FAILED",
              aiRenderFailureReason: result.reason ?? "VISIBILITY_BLOCKED"
            });
            assertInvariant(false, `AI render verification failed: ${result.reason ?? "UNKNOWN"}`);
            return;
          }

          if (isSpoilerBlocked) {
            recordAI(context.traceId, {
              aiSuccess: false,
              aiRenderState: "AI_RENDER_FAILED",
              aiRenderFailureReason: "SPOILER_GATE_BLOCKED"
            });
            recordRender(context.traceId, {
              answerRendered: true,
              visualRendered: true,
              renderBlocked: true,
              renderFailureReason: "Answer contains spoilers and spoiler warning is active.",
              verification: "FAIL",
              contractStatus: "FAIL",
              visibilityReason: "SPOILER_GATE_BLOCKED"
            });
            return;
          }

          recordAI(context.traceId, {
            aiSuccess: true,
            aiRenderState: "AI_SUCCESS"
          });

          assertInvariant(result.visible, "AI success requires a visible DOM node.");
          assertInvariant(result.height > 0, "AI success requires positive DOM height.");
          assertInvariant(result.width > 0, "AI success requires positive DOM width.");
        });

        if (user && canonicalTitle.trim()) {
          try {
            const docRef = await addDoc(collection(db, "users", user.uid, "history"), {
              query: canonicalTitle.trim(),
              mediaLens,
              conversation: [],
              results: rawResults.map((r: any) => ({ title: r.title, url: r.url })),
              createdAt: serverTimestamp()
            });

            if (context.requestId !== activeRequestIdRef.current) return;
            setCurrentHistoryId(docRef.id);
          } catch (error) {
            console.error("Failed to save history session", error);
          }
        }

        console.log("[EXECUTION STATE]", {
          searchKey,
          previousStatus: "running",
          nextStatus: "completed"
        });
        activeExecutionRef.current = {
          searchKey,
          status: "completed",
          startedAt: activeExecutionRef.current?.startedAt ?? Date.now()
        };
      } catch (error: any) {
        if (context.requestId !== activeRequestIdRef.current) return;
        console.error("[Nerdvana] Answer Pipeline Error:", error);

        const nextStatus = error.name === "AbortError" ? "aborted" : "failed";
        console.log("[EXECUTION STATE]", {
          searchKey,
          previousStatus: "running",
          nextStatus
        });
        activeExecutionRef.current = {
          searchKey,
          status: nextStatus,
          startedAt: activeExecutionRef.current?.startedAt ?? Date.now()
        };

        setAnswer({
          summary: `### ⚠️ Response Pipeline Error\n\nUnable to generate AI response. Please try again.\n\n*Diagnostics: ${error?.message || "Unknown network or API failure"}*`,
          categories: [],
          spoilers: ""
        });
        setResults([]);
        setResponseData(null);
        lastSearchKeyRef.current = searchKey;
        
        recordRender(context.traceId, { renderBlocked: true, renderFailureReason: error.message });
      } finally {
        if (context.requestId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    runSearch(executionContext);

    return () => {
      isCancelled = true;
      if (activeTraceIdRef.current) {
        recordLifecyclePhase(activeTraceIdRef.current, "CANCELLATION");
      }
    };
  }, [chatSpoilers, fullQuestion, mediaLens, user, queryItem, urlParams.providerMetadata, contextPacket, renderEntityPacket]);

  useEffect(() => {
    if (!contextIsValid || isAmbiguous || !resolvedItem) {
      return;
    }

    if (!answer.summary.trim()) {
      return;
    }

    const caseKey = `${resolvedItem}|${fullQuestion}`;
    if (lastSavedCaseKey.current === caseKey) {
      return;
    }

    const now = Date.now();
    saveCase({
      id: `${resolvedItem}-${now}`,
      query: fullQuestion,
      item: resolvedItem,
      intent: buildIntentPhrase(fullQuestion),
      timestamp: now,
      mediaLens
    });

    saveCaseMemory({
      item: resolvedItem,
      intent: buildIntentPhrase(fullQuestion),
      timestamp: now
    });

    if (user) {
      saveCaseCloud(user.uid, {
        id: `${resolvedItem}-${now}`,
        query: fullQuestion,
        item: resolvedItem,
        intent: buildIntentPhrase(fullQuestion),
        timestamp: now
      }).catch((error) => {
        console.warn("Query cloud sync failed", error);
      });
    }

    lastSavedCaseKey.current = caseKey;
  }, [answer.summary, contextIsValid, fullQuestion, isAmbiguous, mediaLens, resolvedItem, saveCaseMemory, user]);

  const handleFollowUpSubmit = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();

    const trimmedQuery = overrideQuery ? overrideQuery.trim() : followUpQuery.trim();
    if (!trimmedQuery || isGeneratingFollowUp) return;

    const userMessage: ConversationMessage = {
      role: "user",
      content: trimmedQuery
    };
    const assistantPlaceholder: ConversationMessage = {
      role: "assistant",
      content: ""
    };

    setConversation(prev => [...prev, userMessage, assistantPlaceholder]);
    setFollowUpQuery("");
    setIsGeneratingFollowUp(true);

    const requestId = Math.random().toString(36).substring(2, 15);
    const traceId = `trace-${requestId}`;
    
     // Propagate mode from active context or TMDB selections if present
    const isPreviousDeterministic = Boolean(resolvedItem?.startsWith("tmdb::")) || Boolean(contextPacket?.providerId) || (contextPacket?.executionMode === "DETERMINISTIC_PROVIDER");
    const mode = isPreviousDeterministic ? "DETERMINISTIC" : "EXPLORATORY";

    const followUpContext: ExecutionContext = {
      query: trimmedQuery,
      item: null,
      mode,
      requestId,
      traceId
    };

    activeRequestIdRef.current = requestId;
    activeTraceIdRef.current = traceId;
    setActiveRequestId(requestId);
    setActiveTraceId(traceId);

    createScopedTrace(traceId, trimmedQuery);
    recordRetrieval(traceId, { started: true, mode });

    let fullAssistantAnswer = "";

    try {
      const franchiseLocked = shouldMaintainFranchiseLock(
        resolvedItem,
        trimmedQuery,
      );

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        if (activeTraceIdRef.current) {
          recordLifecyclePhase(activeTraceIdRef.current, "CANCELLATION");
        }
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const followUpPayload = {
        sessionId,
        query: trimmedQuery,
        mediaLens,
        item: renderEntityPacket?.providerId || contextPacket?.providerId || resolvedItem || undefined,
        providerMetadata: renderEntityPacket?.providerMetadata || contextPacket?.providerMetadata || urlParams.providerMetadata || undefined,
        spoilerMode: chatSpoilers,
        conversation: [
          { role: "user", content: fullQuestion },
          { role: "assistant", content: answer.summary || "No answer available" },
          ...conversation
        ],
        previousEntity: franchiseLocked ? resolvedItem : null,
        temporaryEntities: useQuerySessionStore.getState().temporaryEntities,
        executionMode: mode === "DETERMINISTIC" ? "DETERMINISTIC_PROVIDER" : "SEMANTIC"
      };

      console.log("[API_DISPATCH_PAYLOAD]", followUpPayload);

      console.log("[FETCH_PATH_B] Dispatching follow-up fetch with payload:", followUpPayload);

      const response = await fetch("/api/nerdvana-answer", {
        method: "POST",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(followUpPayload)
      });

      if (followUpContext.requestId !== activeRequestIdRef.current) {
        recordAI(followUpContext.traceId, {
          aiSuccess: false,
          aiRenderState: "AI_RENDER_FAILED",
          aiRenderFailureReason: "STATE_OVERWRITTEN"
        });
        return;
      }

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`API ${response.status}: ${details}`);
      }

      recordRetrieval(traceId, { success: true });
      recordAI(traceId, { started: true, provider: "Gemini" });

      const payload = await response.json();
      if (followUpContext.requestId !== activeRequestIdRef.current) {
        recordAI(followUpContext.traceId, {
          aiSuccess: false,
          aiRenderState: "AI_RENDER_FAILED",
          aiRenderFailureReason: "STATE_OVERWRITTEN"
        });
        return;
      }

      // --- RENDER OWNERSHIP VERIFICATION GATE (FOLLOW-UP) ---
      const isIncomingDeterministic = payload?.contextPacket?.executionMode === "DETERMINISTIC_PROVIDER";
      const incomingProviderId = payload?.contextPacket?.providerId || payload?.grounding?.selectedSelectionValue || null;
      
      const expectedProviderId = renderEntityPacket?.providerId || contextPacket?.providerId || null;

      let renderVerified = false;

      if (expectedProviderId) {
        if (isIncomingDeterministic && incomingProviderId === expectedProviderId) {
          renderVerified = true;
        }
      } else {
        if (isIncomingDeterministic && incomingProviderId) {
          renderVerified = true;
        } else if (!isIncomingDeterministic) {
          renderVerified = true;
        }
      }

      if (payload?.contextPacket) {
        if (activeVisualOwner) {
          const incomingId = payload.contextPacket.providerId;
          const currentId = activeVisualOwner.providerId;
          const incomingFranchise = payload.contextPacket.parentFranchise;
          const currentFranchise = activeVisualOwner.franchiseRoot;

          if ((incomingId && currentId && incomingId !== currentId) ||
              (incomingFranchise && currentFranchise && incomingFranchise !== currentFranchise)) {
            console.log("[VISUAL_OWNERSHIP_PIVOT] Follow-up query shifted entities or franchises. Clearing visual lock.", {
              currentId, incomingId, currentFranchise, incomingFranchise
            });
            setActiveVisualOwner(null);
            setActiveVisualOwnerMetadata(null);
          }
        }
      }

      if (expectedProviderId && !renderVerified) {
        console.warn("[RENDER_OWNERSHIP_BLOCKED] Follow-up render candidate differs from provider ownership!", {
          expectedProviderId,
          incomingProviderId,
          incomingExecutionMode: payload?.contextPacket?.executionMode
        });
        setIsGeneratingFollowUp(false);
        return;
      }

      if (isIncomingDeterministic && renderVerified) {
        console.log("[RENDER_OWNERSHIP_VERIFIED] Follow-up render candidate matches provider ownership:", incomingProviderId);
        const nextRenderPacket: RenderEntityPacket = {
          title: renderEntityPacket?.title || payload?.contextPacket?.canonicalEntity || payload?.grounding?.selectedCanonicalEntity || fullQuestion,
          providerId: expectedProviderId || incomingProviderId!,
          franchiseRoot: renderEntityPacket?.franchiseRoot || payload?.contextPacket?.parentFranchise || payload?.grounding?.selectedFranchise || null,
          providerMetadata: renderEntityPacket?.providerMetadata || payload?.contextPacket?.providerMetadata || payload?.grounding?.providerMetadata || null,
          contextPacket: payload.contextPacket
        };
        Object.freeze(nextRenderPacket);
        setRenderEntityPacket(nextRenderPacket);
      }

      recordAI(traceId, { returned: true });

      let isValid = false;
      try {
        isValid = validateNerdvanaAnswerResponse(payload);
      } catch (valErr: any) {
        recordAI(followUpContext.traceId, {
          validated: false,
          aiSuccess: false,
          aiRenderState: "AI_RENDER_FAILED",
          aiRenderFailureReason: "VALIDATION_FAILED"
        });
        throw valErr;
      }
      if (!isValid) {
        recordAI(followUpContext.traceId, {
          validated: false,
          aiSuccess: false,
          aiRenderState: "AI_RENDER_FAILED",
          aiRenderFailureReason: "VALIDATION_FAILED"
        });
        throw new Error("Lightweight response schema validation failed.");
      }
      recordAI(traceId, { validated: true });

      if (payload?.temporaryEntityCreated) {
        useQuerySessionStore.getState().addTemporaryEntity(payload.temporaryEntityCreated);
      }
      
      fullAssistantAnswer = payload?.answer ?? "";
      
      if (!fullAssistantAnswer.trim()) {
        recordAI(followUpContext.traceId, {
          aiSuccess: false,
          aiRenderState: "AI_RENDER_FAILED",
          aiRenderFailureReason: "EMPTY_SUMMARY"
        });
        throw new Error("Answer response returned empty answer text.");
      }

      recordAI(traceId, { normalized: true });

      if (payload?.grounding) {
        setGrounding(payload.grounding);
      }
      if (payload?.contextPacket) {
        setContextPacket(payload.contextPacket);
      }

      const rawData = Array.isArray(payload?.sources) ? payload.sources : [];
      if (rawData.length > 0) {
        const rawResults = rawData
          .map((r: any) => {
            const url = String(r?.link ?? "");
            let source = "Source";
            if (url) {
              try {
                source = new URL(url).hostname;
              } catch {
                source = "Source";
              }
            }

            return {
              title: String(r?.title ?? ""),
              url,
              source,
              snippet: ""
            };
          })
          .filter((item) => Boolean(item.url));

        const seen = new Set(results.map((r) => r.url));
        const mergedResults = [...results];
        for (const result of rawResults) {
          if (!seen.has(result.url)) {
            seen.add(result.url);
            mergedResults.push(result);
          }
        }

        setResults(mergedResults);
      }

      setConversation(prev => {
        const newConv = [...prev];
        newConv[newConv.length - 1] = {
          role: "assistant",
          content: fullAssistantAnswer
        };
        return newConv;
      });

      // Visual check and spoiler block check
      const isSpoilerBlocked = !chatSpoilers && /\b(die|dies|death|dead|ending|kills|killed|final scene|spoiler|plot twist)\b/i.test(fullAssistantAnswer);

      finalizeRenderVerification(followUpContext.traceId, RENDER_CONTRACTS.selectors.assistantBubble, (result) => {
        if (followUpContext.requestId !== activeRequestIdRef.current) {
          recordAI(followUpContext.traceId, {
            aiSuccess: false,
            aiRenderState: "AI_RENDER_FAILED",
            aiRenderFailureReason: "STATE_OVERWRITTEN"
          });
          return;
        }

        recordRenderVerification(followUpContext.traceId, result);

        if (!result.success) {
          recordAI(followUpContext.traceId, {
            aiSuccess: false,
            aiRenderState: "AI_RENDER_FAILED",
            aiRenderFailureReason: result.reason ?? "VISIBILITY_BLOCKED"
          });
          assertInvariant(false, `Follow-up render verification failed: ${result.reason ?? "UNKNOWN"}`);
          return;
        }

        if (isSpoilerBlocked) {
          recordAI(followUpContext.traceId, {
            aiSuccess: false,
            aiRenderState: "AI_RENDER_FAILED",
            aiRenderFailureReason: "SPOILER_GATE_BLOCKED"
          });
          recordRender(followUpContext.traceId, {
            answerRendered: true,
            visualRendered: true,
            renderBlocked: true,
            renderFailureReason: "Answer contains spoilers and spoiler warning is active.",
            verification: "FAIL",
            contractStatus: "FAIL",
            visibilityReason: "SPOILER_GATE_BLOCKED"
          });
          return;
        }

        recordAI(followUpContext.traceId, {
          aiSuccess: true,
          aiRenderState: "AI_SUCCESS"
        });

        assertInvariant(result.visible, "Follow-up success requires a visible DOM node.");
        assertInvariant(result.height > 0, "Follow-up success requires positive DOM height.");
        assertInvariant(result.width > 0, "Follow-up success requires positive DOM width.");
      });

    } catch (error: any) {
      if (followUpContext.requestId !== activeRequestIdRef.current) return;
      console.error("Follow-up generation failed:", error);

      const errorMessage = error.message.includes("Failed to fetch")
        ? "Connection Error: Unable to reach /api/nerdvana-answer."
        : `Error: ${error.message}`;

      setConversation(prev => {
        const newConv = [...prev];
        const last = newConv[newConv.length - 1];
        if (last && last.role === "assistant") {
          last.content += `\n\n${errorMessage}`;
        } else {
          newConv.push({ role: "assistant", content: errorMessage });
        }
        return newConv;
      });

      recordRender(traceId, { renderBlocked: true, renderFailureReason: error.message });
    } finally {
      if (followUpContext.requestId === activeRequestIdRef.current) {
        setIsGeneratingFollowUp(false);
      }

      if (followUpContext.requestId === activeRequestIdRef.current && user && currentHistoryId) {
        const finalConversation = [
          ...conversation,
          { role: "user", content: trimmedQuery } as ConversationMessage,
          { role: "assistant", content: fullAssistantAnswer } as ConversationMessage
        ];

        updateDoc(doc(db, "users", user.uid, "history", currentHistoryId), {
          conversation: finalConversation
        }).catch(err => console.error("Failed to update history conversation", err));
      }
    }
  };

  if (ENABLE_NERDVANA_TELEMETRY) {
    console.log("[ASKPAGE RENDER]", {
      isLoading,
      answerSummary: answer?.summary,
      fullQuestion,
      queryItem,
      canonicalItem: grounding?.selectedSelectionValue || "",
    });
  }

  return (
    <div
      className="min-h-screen w-full overflow-x-hidden transition-colors duration-300"
      style={{ backgroundColor: "var(--nerdvana-conversation-bg)" }}
    >
      <div className="fixed inset-0 pointer-events-none paper-texture nerdvana-paper-texture-conversation" />
      <div className="relative">
        <Header
          onNavigate={(page) => {
            onNavigatePage(page);
          }}
        />

        <main className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-12">
          <article className="max-w-5xl mx-auto">
            <form method="get" action="/ask" className="mb-4" onSubmit={handleSubmitQuery}>
              <div
                className="relative border-[2px] p-[2px]"
                style={{
                  borderColor: "var(--nerdvana-border)",
                  backgroundColor: "var(--nerdvana-surface)"
                }}
              >
                <input
                  name="q"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
                  placeholder="Ask Nerdvana anything..."
                  className="askQueryInput w-full px-3 sm:px-4 py-3 text-[0.98rem] sm:text-[1rem] md:text-[1.08rem] focus:outline-none"
                  style={{
                    fontFamily: '"Times New Roman", serif',
                    backgroundColor: "var(--nerdvana-surface)",
                    color: "var(--nerdvana-text)"
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                {((contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && renderEntityPacket) ? renderEntityPacket.providerId : queryItem) && queryInput.trim() === fullQuestion && (
                  <input type="hidden" name="item" value={(contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && renderEntityPacket) ? renderEntityPacket.providerId : queryItem} />
                )}
                <input type="hidden" name="lens" value={mediaLens} />
                <AutocompleteOverlay
                  suggestions={suggestions}
                  activeIndex={activeIndex}
                  onSelect={handleSelectSuggestion}
                  onClose={() => clearAutocompleteState()}
                  onActiveIndexChange={(idx) => setActiveIndex(idx)}
                  isVisible={isInputFocused && queryInput.trim().length >= 2}
                />
              </div>
            </form>

            {clarificationPending && clarificationSuggestions.length > 0 && (
              <ClarificationOverlay
                suggestions={clarificationSuggestions}
                query={fullQuestion}
                onSelect={handleSelectClarification}
              />
            )}

            <div className="mb-4 flex flex-wrap justify-start sm:justify-end gap-3 sm:gap-6 items-center">
              {[
                { label: "Conversation Spoilers", checked: chatSpoilers, set: setChatSpoilers }
              ].map((sw, idx) => (
                <label key={idx} className="nerdvana-clickable flex items-center gap-2 group select-none">
                  <span
                    className="text-[0.65rem] lg:text-[0.58rem] uppercase tracking-[0.1em]"
                    style={{
                      fontFamily: '"Courier New", monospace',
                      color: sw.checked ? "var(--nerdvana-accent)" : "var(--nerdvana-text)",
                      opacity: sw.checked ? 1 : 0.7,
                      transition: "color 0.2s"
                    }}
                  >
                    {sw.label}
                  </span>
                  <div
                    className="relative w-9 h-5 rounded-full transition-colors duration-200"
                    style={{
                      backgroundColor: sw.checked ? "var(--nerdvana-accent)" : "rgba(120,120,120,0.3)",
                      border: "1px solid var(--nerdvana-border)"
                    }}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={sw.checked}
                      onChange={(e) => sw.set(e.target.checked)}
                    />
                    <div
                      className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${sw.checked ? "translate-x-4" : "translate-x-0"
                        }`}
                    />
                  </div>
                </label>
              ))}
            </div>

            {!isLoading && fullQuestion && user && (
              <div className="mb-6 flex justify-start sm:justify-end">
                <button
                  onClick={handleSaveLorebook}
                  className="group relative px-4 py-2.5 border-[2px] transition-all duration-300 hover:-translate-y-0.5"
                  style={{
                    borderColor: "var(--nerdvana-border)",
                    backgroundColor: "var(--nerdvana-surface)",
                    color: "var(--nerdvana-text)"
                  }}
                >
                  <span
                    className="flex items-center gap-2 text-[0.7rem] sm:text-[0.75rem] uppercase tracking-[0.15em]"
                    style={{ fontFamily: '"Courier New", monospace' }}
                  >
                    <span>Save</span>
                    <span>Lorebook</span>
                  </span>
                  <div
                    className="absolute inset-0 bg-[var(--nerdvana-accent)] opacity-0 group-hover:opacity-5 transition-opacity duration-300"
                  />
                </button>
              </div>
            )}

            {/* Main content + Visual Panel side by side */}
            <div className="flex flex-col-reverse lg:flex-row gap-8 items-start">
              <div className="flex-1 min-w-0 w-full">
                {!isLoading && fullQuestion && answer.summary.trim() && (
                  <motion.div
                    key={responseData ? `${fullQuestion}-${responseData.answer.summary.length}` : `empty-${fullQuestion}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                    <AIResponse
                      text={answer.summary}
                      isLoading={false}
                      disableProgressiveReveal
                    />

                    {/* Timeline & Reading Order Progression Panel */}
                    {ENABLE_CONTINUITY_TIMELINE && readingOrder && readingOrder.length > 0 && (
                      <div className="mt-6 mb-6 p-5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(135deg,rgba(25,25,35,0.85),rgba(15,15,22,0.95))] backdrop-blur-md shadow-2xl transition-all duration-300">
                        <div className="flex items-center justify-between mb-4 border-b border-[rgba(255,255,255,0.06)] pb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--nerdvana-accent)] text-[0.65rem] lg:text-[0.6rem] animate-pulse">●</span>
                            <h3 className="text-[0.68rem] uppercase tracking-[0.2em] font-semibold text-gray-300 font-mono">
                              Continuity Timeline & Reading Order
                            </h3>
                          </div>
                          {contextPacket?.providerMetadata?.publisherLabel && (
                            <span
                              className="text-[0.65rem] lg:text-[0.58rem] uppercase tracking-[0.1em] px-2 py-0.5 rounded font-mono font-semibold"
                              style={{
                                backgroundColor: (() => {
                                  const pub = contextPacket.providerMetadata.publisherLabel.toLowerCase();
                                  if (pub.includes("marvel")) return "rgba(229, 9, 20, 0.15)";
                                  if (pub.includes("dc")) return "rgba(0, 75, 145, 0.15)";
                                  if (pub.includes("image")) return "rgba(102, 51, 153, 0.15)";
                                  return "rgba(255, 255, 255, 0.05)";
                                })(),
                                color: (() => {
                                  const pub = contextPacket.providerMetadata.publisherLabel.toLowerCase();
                                  if (pub.includes("marvel")) return "#ff5c5c";
                                  if (pub.includes("dc")) return "#5cafff";
                                  if (pub.includes("image")) return "#dca3ff";
                                  return "#cccccc";
                                })(),
                                border: `1px solid ${(() => {
                                  const pub = contextPacket.providerMetadata.publisherLabel.toLowerCase();
                                  if (pub.includes("marvel")) return "rgba(229, 9, 20, 0.3)";
                                  if (pub.includes("dc")) return "rgba(0, 75, 145, 0.3)";
                                  if (pub.includes("image")) return "rgba(102, 51, 153, 0.3)";
                                  return "rgba(255, 255, 255, 0.1)";
                                })()}`
                              }}
                            >
                              {contextPacket.providerMetadata.publisherLabel}
                            </span>
                          )}
                        </div>

                        {/* Reading Order List */}
                        <div className="relative mt-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
                            {readingOrder.map((item, idx) => (
                              <div
                                key={idx}
                                className="group relative p-3.5 rounded-lg bg-[rgba(255,255,255,0.015)] hover:bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.04)] hover:border-[var(--nerdvana-accent)] transition-all duration-300 hover:-translate-y-0.5 shadow-md flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <span className="text-[0.65rem] lg:text-[0.6rem] font-mono text-[var(--nerdvana-accent)] font-bold">
                                      {String(idx + 1).padStart(2, "0")}
                                    </span>
                                    <span className="text-[0.65rem] lg:text-[0.52rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-gray-400 font-mono">
                                      {item.type}
                                    </span>
                                    {item.year && (
                                      <span className="text-[0.65rem] lg:text-[0.58rem] font-mono text-gray-400 ml-auto">
                                        {item.year}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-[0.82rem] font-bold text-white mb-1.5 group-hover:text-[var(--nerdvana-accent)] transition-colors duration-300 font-serif">
                                    {item.title}
                                  </h4>
                                </div>
                                {item.reason && (
                                  <p className="text-[0.7rem] text-gray-400 leading-relaxed font-sans line-clamp-3 mt-1 opacity-80">
                                    {item.reason}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Continuation Sequel Timelines */}
                        {continuationSuggestions && continuationSuggestions.length > 0 && (
                          <div className="mt-5 pt-4 border-t border-[rgba(255,255,255,0.05)]">
                            <p className="text-[0.65rem] lg:text-[0.62rem] uppercase tracking-[0.15em] text-gray-400 font-mono mb-2.5">
                              Next Arc & Sequel Timeline Continuation:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {continuationSuggestions.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] hover:border-[var(--nerdvana-accent)] transition-colors duration-300"
                                >
                                  <span className="w-1 h-1 rounded-full bg-[var(--nerdvana-accent)]" />
                                  <span className="text-[0.74rem] font-semibold text-gray-300">
                                    {item.title}
                                  </span>
                                  <span className="text-[0.65rem] lg:text-[0.52rem] uppercase font-mono px-1.5 py-0.2 bg-[rgba(255,255,255,0.05)] text-gray-400 rounded">
                                    {item.type}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {grounding?.behavior === "require_selection" && grounding.suggestions.length > 1 && (
                      <div
                        className="mt-5 rounded-lg border px-4 py-3 text-sm"
                        style={{
                          borderColor: "var(--nerdvana-border)",
                          backgroundColor: "rgba(50, 50, 50, 0.03)",
                          color: "var(--nerdvana-text)"
                        }}
                      >
                        <p
                          className="mb-2 uppercase tracking-[0.16em] text-[0.68rem] font-semibold"
                          style={{ fontFamily: '"Courier New", monospace' }}
                        >
                          Looking for:
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                          {grounding.suggestions.slice(0, 3).map((suggestion) => (
                            <li
                              key={`${suggestion.selectionValue}-${suggestion.mediaLens}`}
                              className="text-[0.92rem] leading-6"
                              style={{ fontFamily: '"Times New Roman", serif' }}
                            >
                              <span className="font-semibold">{suggestion.displayTitle}</span>
                              {suggestion.metadataLabel ? ` — ${suggestion.metadataLabel}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <SourcesPanel
                      sources={results.map((result) => ({
                        title: result.title,
                        link: result.url
                      }))}
                    />
                    
                    {/* Phase 8E: Experience Intelligence Discovery Rails Disabled for Phase 9A */}
                  </motion.div>
                )}

                {!isLoading && fullQuestion && (
                  <div className="mt-12 border-t-2 pt-8" style={{ borderColor: "var(--nerdvana-border)" }}>
                    <form onSubmit={handleFollowUpSubmit}>
                      <div
                        className="border-[2px] p-[2px]"
                        style={{
                          borderColor: "var(--nerdvana-border)",
                          backgroundColor: "var(--nerdvana-surface)"
                        }}
                      >
                        <input
                          value={followUpQuery}
                          onChange={(e) => setFollowUpQuery(e.target.value)}
                          placeholder="Ask a follow-up..."
                          disabled={isGeneratingFollowUp}
                          className="followUpInput w-full px-3 sm:px-4 py-3 text-[0.98rem] sm:text-[1rem] md:text-[1.08rem] focus:outline-none"
                          spellCheck={false}
                          autoComplete="off"
                          style={{
                            fontFamily: '"Times New Roman", serif',
                            backgroundColor: "var(--nerdvana-surface)",
                            color: "var(--nerdvana-text)",
                            opacity: isGeneratingFollowUp ? 0.6 : 1
                          }}
                        />
                      </div>
                      {isGeneratingFollowUp && (
                        <div className="pt-2 text-[0.7rem] uppercase tracking-[0.16em] font-courier opacity-50">
                          Thinking...
                        </div>
                      )}
                    </form>
                  </div>
                )}

                {!isLoading && conversation.length > 0 && (
                  <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--nerdvana-border)" }}>
                    <h3
                      className="mb-4 text-[0.66rem] md:text-[0.72rem] uppercase tracking-[0.18em] sm:tracking-[3px]"
                      style={{
                        fontFamily: '"Special Elite", monospace',
                        color: "var(--nerdvana-text)",
                        opacity: 0.96
                      }}
                    >
                      CONVERSATION
                    </h3>

                    <div className="space-y-2">
                      {conversation.map((msg, index) => {
                        const suggestions =
                          msg.role === "assistant" && index === conversation.length - 1
                            ? generateFollowUps(
                                msg.content,
                                (contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && renderEntityPacket) ? renderEntityPacket.title : (contextPacket?.canonicalEntity ?? null),
                                (contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && renderEntityPacket) ? renderEntityPacket.franchiseRoot : (contextPacket?.parentFranchise ?? null),
                                mediaLens,
                                null
                              )
                            : undefined;

                        const prevMsg = index > 0 ? conversation[index - 1] : null;
                        const userQueryContext = prevMsg?.role === "user" ? prevMsg.content : "";

                        const spoilerKeywords = /\b(die|dies|death|dead|ending|kills|killed|final scene|spoiler|plot twist)\b/i;
                        const isRisky = spoilerKeywords.test(msg.content) || spoilerKeywords.test(userQueryContext);
                        const showWarning = !chatSpoilers && isRisky && msg.role === "assistant";

                        const isLast = index === conversation.length - 1;
                        const isBubbleLoading = isGeneratingFollowUp && isLast && msg.role === "assistant";

                        return (
                          <ChatBubble
                            key={index}
                            role={msg.role}
                            content={msg.content}
                            suggestions={suggestions}
                            onSuggestionClick={(s) => {
                              setFollowUpQuery(s);
                              handleFollowUpSubmit(undefined, s);
                            }}
                            warning={showWarning}
                            isLoading={isBubbleLoading}
                            onWarningClick={() => setChatSpoilers(true)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Visual Panel — sticky sidebar */}
              {(contextPacket || explorationStatus === "completed") && (
                <div className="w-full max-w-md mx-auto lg:mx-0 lg:w-72 flex-shrink-0 sticky top-24">
                  {contextPacket && detectQueryMode(fullQuestion) === "entity" && (
                      <VisualPanel
                        contextPacket={(contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && renderEntityPacket) ? renderEntityPacket.contextPacket : contextPacket}
                        activeTraceId={activeTraceId}
                        activeVisualOwner={activeVisualOwner}
                        onVisualLocked={(owner) => {
                          setActiveVisualOwner(owner);
                          setActiveVisualOwnerMetadata({
                            providerId: owner.providerId,
                            canonicalTitle: owner.canonicalTitle,
                            mediaType: owner.mediaType,
                            providerType: owner.providerType,
                            franchiseRoot: owner.franchiseRoot,
                            executionMode: owner.executionMode
                          });
                        }}
                      />
                  )}
                  {explorationStatus === "completed" && explorationRecs.length > 0 && (
                      <div className="flex flex-col gap-4 p-4 border rounded-lg" style={{ borderColor: "var(--nerdvana-border)" }}>
                        <h3 className="text-xs uppercase tracking-widest font-semibold font-courier">Recommendations</h3>
                        {explorationRecs.map((rec, i) => (
                           <div key={i} className="text-sm">
                             <div className="font-bold font-times">{rec.title}</div>
                             <div className="text-xs opacity-75 mt-1">{rec.reason || "Thematic Match"}</div>
                           </div>
                        ))}
                      </div>
                  )}
                </div>
              )}
            </div>



          </article>
        </main>
      </div>
      <Footer />
      <ThinkingScreen isVisible={isLoading} />

      <style>{`
        .paper-texture {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='6.5' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          background-repeat: repeat;
        }
        .nerdvana-paper-texture-conversation {
          opacity: 0.04;
          transition: opacity 0.3s ease;
        }
        .dark .nerdvana-paper-texture-conversation {
          opacity: 0.08;
        }
        .categoryLabel {
          font-family: "Special Elite", monospace;
          letter-spacing: 3px;
          border-top: 1px solid var(--nerdvana-border);
          margin-top: 40px;
          padding-top: 10px;
          color: var(--nerdvana-text);
          opacity: 0.96;
        }
        .spoilerCard {
          cursor: pointer;
        }
        .spoilerCard:hover {
          filter: none;
        }
        .askQueryInput::placeholder {
          color: var(--nerdvana-text);
          opacity: 0.55;
        }
        .followUpInput::placeholder {
          color: var(--nerdvana-text);
          opacity: 0.55;
        }
        .dark .askQueryInput {
          color: #f5f1e8 !important;
          background-color: #1a1918 !important;
        }
        .dark .askQueryInput::placeholder {
          color: #d9d4c8;
          opacity: 0.72;
        }
        .dark .followUpInput {
          color: #f5f1e8 !important;
          background-color: #1a1918 !important;
        }
        .dark .followUpInput::placeholder {
          color: #d9d4c8;
          opacity: 0.72;
        }
      `}</style>
      {ENABLE_NERDVANA_TELEMETRY && (
        <DebugOverlay activeTraceId={activeTraceId} activeRequestId={activeRequestId} searchKey={Array.isArray(lastSearchKeyRef.current) ? lastSearchKeyRef.current[1] : lastSearchKeyRef.current} />
      )}
    </div>
  );
}
