import { useEffect, useRef, useState } from "react";
import { generateFollowUps } from "../utils/suggestionGenerator";
import Header from "../components/Header";
import Footer from "../components/Footer";
import ChatBubble from "../components/ChatBubble";
import ResultContent from "../components/ResultContent";
import ThinkingScreen from "../components/ThinkingScreen";
import VisualPanel from "../pages/VisualPanel";
import ResultLayout from "../components/ResultLayout";
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
import { shouldMaintainFranchiseLock, type ResolverContextPacket, type ActiveVisualOwner, type ActiveVisualOwnerMetadata, extractProviderId } from "../canonicalResolver";
import { auth, db } from "../lib/firebase";
import { doc, updateDoc, setDoc } from "firebase/firestore";
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
  getFollowUpSuggestions, 
  evaluateSpoilerRisk, 
  processSemanticPivots 
} from "../lib/resolver/followUpEngine";

function mapVisualAsset(owner: ActiveVisualOwner | null) {
  if (!owner?.asset) return null;
  const asset = owner.asset;
  return {
    title: asset.title,
    posterUrl: asset.posterUrl || asset.url || null,
    backdropUrl: asset.backdropUrl || null,
    mediaType: owner.mediaType || asset.mediaType || "",
    provider: asset.source || ""
  };
}

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
  exploration?: any;
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
      clearActiveEntityState();
      setUrlParams(readAskQueryParams());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const fullQuestion = question.trim();
  const [queryInput, setQueryInput] = useState(fullQuestion);
  const [_contextPacket, _setContextPacket] = useState<ResolverContextPacket | null>(null);
  const contextPacket = _contextPacket;
  const setContextPacket = (val: React.SetStateAction<ResolverContextPacket | null>, requestIdOverride?: string) => {
    const isFn = typeof val === "function";
    const newVal = isFn ? null : (val as ResolverContextPacket | null);
    console.log(`------------------------\nSTATE WRITE\n\nrequestId: ${requestIdOverride || activeRequestIdRef.current || "none"}\nreason: Tracing state mutation\ncomponent: AskPage\ncaller: setContextPacket\nentity: ${isFn ? "function" : (newVal?.canonicalEntity || "none")}\nproviderId: ${isFn ? "function" : (newVal?.providerId || "none")}\nstack trace:\n${new Error().stack}\n------------------------`);
    _setContextPacket(val);
  };
  const activeVisualOwnerRef = useRef<ActiveVisualOwner | null>(null);
  const [activeVisualOwner, _setActiveVisualOwner] = useState<ActiveVisualOwner | null>(null);
  const setActiveVisualOwner = (val: ActiveVisualOwner | null) => {
    activeVisualOwnerRef.current = val;
    _setActiveVisualOwner(val);
  };
  const [activeVisualOwnerMetadata, _setActiveVisualOwnerMetadata] = useState<ActiveVisualOwnerMetadata | null>(null);
  const setActiveVisualOwnerMetadata = (val: ActiveVisualOwnerMetadata | null) => {
    _setActiveVisualOwnerMetadata(val);
  };
  const [_grounding, _setGrounding] = useState<CanonicalGroundingResult | null>(null);
  const grounding = _grounding;
  const setGrounding = (val: React.SetStateAction<CanonicalGroundingResult | null>, requestIdOverride?: string) => {
    const isFn = typeof val === "function";
    const newVal = isFn ? null : (val as CanonicalGroundingResult | null);
    console.log(`------------------------\nSTATE WRITE\n\nrequestId: ${requestIdOverride || activeRequestIdRef.current || "none"}\nreason: Tracing state mutation\ncomponent: AskPage\ncaller: setGrounding\nentity: ${isFn ? "function" : (newVal?.selectedCanonicalEntity || "none")}\nproviderId: ${isFn ? "function" : (newVal?.selectedSelectionValue || "none")}\nstack trace:\n${new Error().stack}\n------------------------`);
    _setGrounding(val);
  };
  const [_renderEntityPacket, _setRenderEntityPacket] = useState<RenderEntityPacket | null>(null);
  const renderEntityPacket = _renderEntityPacket;
  const setRenderEntityPacket = (val: React.SetStateAction<RenderEntityPacket | null>, requestIdOverride?: string) => {
    const isFn = typeof val === "function";
    const newVal = isFn ? null : (val as RenderEntityPacket | null);
    console.log(`------------------------\nSTATE WRITE\n\nrequestId: ${requestIdOverride || activeRequestIdRef.current || "none"}\nreason: Tracing state mutation\ncomponent: AskPage\ncaller: setRenderEntityPacket\nentity: ${isFn ? "function" : (newVal?.title || "none")}\nproviderId: ${isFn ? "function" : (newVal?.providerId || "none")}\nstack trace:\n${new Error().stack}\n------------------------`);
    _setRenderEntityPacket(val);
  };
  const [visualResolutionStatus, setVisualResolutionStatus] = useState<'idle' | 'pending' | 'resolved' | 'failed'>('idle');
  const lastExploredEntityRef = useRef("");
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

    const [results, setResults] = useState<ResultLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [_responseData, _setResponseData] = useState<ResponseData | null>(null);
  const responseData = _responseData;
  const setResponseData = (val: React.SetStateAction<ResponseData | null>, requestIdOverride?: string) => {
    const isFn = typeof val === "function";
    console.log(`------------------------\nSTATE WRITE\n\nrequestId: ${requestIdOverride || activeRequestIdRef.current || "none"}\nreason: Tracing state mutation\ncomponent: AskPage\ncaller: setResponseData\nentity: ${isFn ? "function" : "N/A"}\nproviderId: ${isFn ? "function" : "N/A"}\nstack trace:\n${new Error().stack}\n------------------------`);
    _setResponseData(val);
  };
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
  const [_conversation, _setConversation] = useState<ConversationMessage[]>([]);
  const conversation = _conversation;
  const setConversation = (val: React.SetStateAction<ConversationMessage[]>, requestIdOverride?: string) => {
    const isFn = typeof val === "function";
    console.log(`------------------------\nSTATE WRITE\n\nrequestId: ${requestIdOverride || activeRequestIdRef.current || "none"}\nreason: Tracing state mutation\ncomponent: AskPage\ncaller: setConversation\nentity: ${isFn ? "function" : "N/A"}\nproviderId: ${isFn ? "function" : "N/A"}\nstack trace:\n${new Error().stack}\n------------------------`);
    _setConversation(val);
  };
  const [followUpQuery, setFollowUpQuery] = useState("");
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);
  const [spoilerPolicy, setSpoilerPolicy] = useState(false);
  const [isRegeneratingAnswer, setIsRegeneratingAnswer] = useState(false);
  const [revealedMessageIndices, setRevealedMessageIndices] = useState<Set<number>>(new Set());
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
    setAutocompleteLoading,
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
        if (!res.ok) {
          if (inputCurrentQueryRef.current === query) {
            setAutocompleteLoading(false);
          }
          return;
        }
        const payload = await res.json();
        if (inputCurrentQueryRef.current === query) {
          if (payload.status === "ok") {
            setAutocompleteState(payload.data, null, false);
          } else if (payload.status === "empty") {
            setAutocompleteState([], null, false);
          } else {
            // Keep existing suggestions for timeouts, rate limits, provider errors
            setAutocompleteLoading(false);
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          return;
        }
        if (inputCurrentQueryRef.current === query) {
          setAutocompleteLoading(false);
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

  const clearActiveEntityState = () => {
    setContextPacket(null, "clearActiveEntityState");
    setRenderEntityPacket(null, "clearActiveEntityState");
    setGrounding(null, "clearActiveEntityState");
    setActiveVisualOwner(null);
    setActiveVisualOwnerMetadata(null);
    clearExplorationState();
  };

  const handleSelectSuggestion = (suggestion: any) => {
    const startedAt = activeExecutionRef.current?.startedAt ?? Date.now();
    const executionAgeMs = Date.now() - startedAt;

    activeExecutionRef.current = null;
    isAutocompleteSelectionRef.current = true;
    selectedSuggestionRef.current = suggestion;

    clearAutocompleteState();
    clearActiveEntityState();
    const newQuery = suggestion.displayTitle;
    const nextItem = suggestion.selectionValue;


    console.log(
      "[AUTOCOMPLETE_PROVIDER_SELECTED]",
      suggestion.selectionValue,
      suggestion.providerMetadata
    );
    if (suggestion.providerMetadata?.providerType) {
    }

    console.log(
      "[PROVIDER_ID_PROPAGATED] Navigating with provider ID:",
      nextItem
    );


    window.history.replaceState(
      { mediaLens, item: nextItem, providerMetadata: suggestion.providerMetadata },
      "",
      buildAskUrl(newQuery, { lens: mediaLens, item: nextItem })
    );


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

    isManualSubmitRef.current = true;
    selectedSuggestionRef.current = null;
    lastSearchKeyRef.current = "";
    activeExecutionRef.current = null; // Clear execution state synchronously


    // Invalidate ALL deterministic restoration sources simultaneously first
    clearActiveEntityState();
    setUrlParams({ item: "", mediaLens });

    window.history.replaceState(
      { mediaLens },
      "",
      buildAskUrl(newQuery, { lens: mediaLens })
    );


    onQuestionChange?.(newQuery);
  };

  useEffect(() => {
    // Discovery Rails and Theme Engine are disabled for Phase 9A stabilization
  }, [contextPacket]);


  const handleSaveLorebook = async () => {
    if (!user) {
      alert("Please sign in to save to library.");
      return;
    }

    const fullSession = [];
    if (fullQuestion) fullSession.push({ role: "user", content: fullQuestion });
    if (responseData?.answer?.summary) fullSession.push({ role: "assistant", content: responseData.answer.summary });
    fullSession.push(...conversation);
    if (fullSession.length === 0) return;

    try {
      const visual = mapVisualAsset(activeVisualOwner);

      const docRef = await addDoc(collection(db, "users", user.uid, "lorebooks"), {
        topic: fullQuestion,
        mediaLens,
        conversation: fullSession,
        results: results.map(s => ({ title: s.title, url: s.url })),
        visual,
        createdAt: serverTimestamp()
      });
      alert("Saved to Library!");
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

        setResults(restoredResults);

        setResponseData({
          answer: restoredAnswer,
          results: restoredResults
        }, "session-restore");

        setConversation(parsed.conversation || [], "session-restore");

        if (parsed.contextPacket) {
          setContextPacket(parsed.contextPacket, "session-restore");
        }

        if (parsed.grounding) {
          setGrounding(parsed.grounding, "session-restore");
        }

        if (parsed.renderEntityPacket) {
          setRenderEntityPacket(parsed.renderEntityPacket, "session-restore");
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
        answer: responseData?.answer || { summary: "", categories: [], spoilers: "" },
        results,
        conversation,
        contextPacket,
        grounding,
        mediaLens,
        renderEntityPacket,
        activeVisualOwnerMetadata
      })
    );
  }, [fullQuestion, responseData?.answer, results, conversation, mediaLens, contextPacket, grounding, renderEntityPacket, activeVisualOwnerMetadata]);

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

    if (isManualSubmitRef.current || !currentItem) {
      currentItem = null;
      providerMetadata = null;
      isManualSubmitRef.current = false;
    }

    if (isAutocompleteSelectionRef.current) {
      isAutocompleteSelectionRef.current = false;
      activeExecutionRef.current = null;
      lastSearchKeyRef.current = ""; // Completely bypass duplicate suppression
    }

    const desynced = (queryItem || null) !== currentItem;

    const searchKey = `${normalizedQuestion}|${mediaLens}|${user?.uid ?? ""}|${currentItem || ""}`;
    const lastKeys = Array.isArray(lastSearchKeyRef.current) ? lastSearchKeyRef.current : [lastSearchKeyRef.current];

    if (activeExecutionRef.current?.searchKey === searchKey && activeExecutionRef.current?.status === "running") {
      return;
    }

    const primaryQueryKey = `${normalizedQuestion}|${mediaLens}|${currentItem || ""}`;
    if (lastPrimaryQueryRef.current !== primaryQueryKey || isAutocompleteSelectionRef.current || desynced) {
      const currentVisualOwner = activeVisualOwnerRef.current;
      const normalizedCurrentItem = extractProviderId(currentItem);
      const normalizedOwnerId = extractProviderId(currentVisualOwner?.providerId || null);

      // Only retain visual owner if the deterministic provider IDs exactly match
      const isAlreadyCorrect = currentVisualOwner && normalizedCurrentItem && normalizedOwnerId && (normalizedCurrentItem === normalizedOwnerId);

      if (!isAlreadyCorrect) {
        setActiveVisualOwner(null);
        setActiveVisualOwnerMetadata(null);
      }
      lastPrimaryQueryRef.current = primaryQueryKey;
    }

    if (activeExecutionRef.current?.searchKey === searchKey && activeExecutionRef.current?.status === "completed") {
      setIsLoading(false);
      return;
    }

    const shouldSkip = lastKeys.includes(searchKey) && activeExecutionRef.current?.status !== "failed" && activeExecutionRef.current?.status !== "aborted";

    if (shouldSkip) {
      setIsLoading(false);
      return;
    }

    // Only assign AFTER validating this is genuinely a fresh execution path
    lastSearchKeyRef.current = searchKey;

    if (ENABLE_NERDVANA_TELEMETRY) {
    }

    if (!normalizedQuestion) {
      setResults([]);
      setResponseData(null, "empty-query");
      setIsLoading(false);
      setGrounding(null, "empty-query");
      clearExplorationState();
      setReadingOrder(null);
      setContinuationSuggestions(null);
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
    }

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
        console.log(`[ORCHESTRATION_DEBUG] runSearch Invoked!
requestId: ${context.requestId}
query: ${context.query}
item: ${context.item}
stack trace:
${new Error().stack}
----------------------------------------`);
      try {
        setIsLoading(true);
        setVisualResolutionStatus('pending');
        setReadingOrder(null);
        setRevealedMessageIndices(new Set());
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

        const finalItem = context.item || null;
        const finalMetadata = context.providerMetadata || null;
        const finalExecutionMode = (finalItem && String(finalItem).includes("::")) ? "DETERMINISTIC_PROVIDER" : "SEMANTIC";

        let endpoint = "/api/nerdvana-answer";
        let bodyPayload: any = {
            sessionId: newSessionId,
            query: context.query,
            mediaLens,
            item: finalItem || undefined,
            spoilerMode: spoilerPolicy,
            conversation: [],
            previousEntity: null,
            temporaryEntities: useQuerySessionStore.getState().temporaryEntities,
            intentResolution: resolution,
            providerMetadata: finalMetadata || undefined,
            executionMode: finalExecutionMode,
            requestId: context.requestId
        };

        console.log(`[LIFECYCLE_DEBUG_FRONTEND] Request leaving AskPage [${context.requestId}]:`, JSON.stringify({
            query: context.query,
            item: finalItem,
            lens: mediaLens,
            conversation: [],
            previousEntity: null,
            contextPacket: contextPacket
        }, null, 2));

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



        console.log(`[ASYNC_TRACE] Fetch START [${context.requestId}] for entity: ${context.query} (Item: ${finalItem})`);
        
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
        console.log(`[RAW_BACKEND_RESPONSE] [${context.requestId}]`, JSON.stringify(payload, null, 2));
        console.log(`[ASYNC_TRACE] Fetch COMPLETE [${context.requestId}] for entity: ${context.query}. Active Request is: ${activeRequestIdRef.current}`);

        // Execution Ownership Protection against stale async completions
        if (activeExecutionRef.current?.searchKey !== searchKey) {
          return;
        }
        
        if (payload?.contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && payload.contextPacket.ownershipGenerationId) {
            if (activeExecutionRef.current.ownershipGenerationId && activeExecutionRef.current.ownershipGenerationId !== payload.contextPacket.ownershipGenerationId) {
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
          const nextRenderPacket: RenderEntityPacket = {
            title: payload?.contextPacket?.canonicalEntity || payload?.grounding?.selectedCanonicalEntity || context.query,
            providerId: incomingProviderId!,
            franchiseRoot: payload?.contextPacket?.parentFranchise || payload?.grounding?.selectedFranchise || null,
            providerMetadata: payload?.contextPacket?.providerMetadata || payload?.grounding?.providerMetadata || null,
            contextPacket: payload.contextPacket
          };
          Object.freeze(nextRenderPacket);
          setRenderEntityPacket(nextRenderPacket, payload.requestId);
          console.log(`[LIFECYCLE_DEBUG_FRONTEND] State mutation (renderEntityPacket) [${context.requestId}]:`, nextRenderPacket);
        } else if (!isIncomingDeterministic) {
          setRenderEntityPacket(null, payload.requestId);
          console.log(`[LIFECYCLE_DEBUG_FRONTEND] State mutation (renderEntityPacket) [${context.requestId}]: null`);
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
            setResponseData({ answer: nextAnswer, results: [], exploration: payload?.exploration }, payload.requestId);
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
        const newSearchKey = `${canonicalTitle.toLowerCase().trim()}|${mediaLens}|${user?.uid ?? ""}|${canonicalItem}`;
        lastSearchKeyRef.current = newSearchKey;

        if (payload?.grounding) {
          setGrounding(payload.grounding, payload.requestId);
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
        console.log("=== STAGE 6: FRONTEND RECEIVED HTTP RESPONSE ===", {
          hasExploration: !!payload?.exploration,
          explorationCharactersLength: payload?.exploration?.characters?.length ?? 0,
          firstCharacter: payload?.exploration?.characters?.[0] ?? null
        });

        setResponseData({ answer: nextAnswer, results: rawResults, exploration: payload?.exploration }, payload.requestId);

        console.log("=== STAGE 7: ASKPAGE STORED RESPONSE DATA ===", {
          hasExploration: !!payload?.exploration,
          storedCharactersLength: payload?.exploration?.characters?.length ?? 0,
          firstCharacter: payload?.exploration?.characters?.[0] ?? null
        });

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
          console.log("[ENTITY_IDENTITY] Canonical Resolution Complete", {
            entity: payload.contextPacket.providerId || payload.contextPacket.canonicalEntity,
            title: payload.contextPacket.canonicalEntity,
            provider: payload.contextPacket.provider,
            providerId: payload.contextPacket.providerId
          });
          setContextPacket(payload.contextPacket, payload.requestId);
        }

        // Visual check and spoiler block check
        const isSpoilerBlocked = !spoilerPolicy && /\b(die|dies|death|dead|ending|kills|killed|final scene|spoiler|plot twist)\b/i.test(aiAnswer);

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
            if (abortController.signal.aborted) return;
            setCurrentHistoryId(docRef.id);
          } catch (error) {
            console.error("Failed to save history session", error);
          }
        }

        activeExecutionRef.current = {
          searchKey,
          status: "completed",
          startedAt: activeExecutionRef.current?.startedAt ?? Date.now()
        };
      } catch (error: any) {
        if (context.requestId !== activeRequestIdRef.current) return;
        console.error("[Nerdvana] Answer Pipeline Error:", error);

        const nextStatus = error.name === "AbortError" ? "aborted" : "failed";
        activeExecutionRef.current = {
          searchKey,
          status: nextStatus,
          startedAt: activeExecutionRef.current?.startedAt ?? Date.now()
        };

        const errorAnswer = {
          summary: `### ⚠️ Response Pipeline Error\n\nUnable to generate AI response. Please try again.\n\n*Diagnostics: ${error?.message || "Unknown network or API failure"}*`,
          categories: [],
          spoilers: ""
        };
        setResults([]);
        setResponseData({ answer: errorAnswer, results: [], exploration: undefined }, context.requestId);
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
  }, [fullQuestion, mediaLens, user, queryItem, urlParams.providerMetadata, contextPacket, renderEntityPacket]);

  const handleSpoilerToggle = async (newValue: boolean) => {
    setSpoilerPolicy(newValue);
    if (!newValue) return;

    const requestId = Math.random().toString(36).substring(2, 15);
    const traceId = `trace-${requestId}`;

    activeRequestIdRef.current = requestId;
    activeTraceIdRef.current = traceId;
    setActiveRequestId(requestId);
    setActiveTraceId(traceId);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      if (activeTraceIdRef.current) {
        recordLifecyclePhase(activeTraceIdRef.current, "CANCELLATION");
      }
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const isMainAnswer = conversation.length === 0;

    if (isMainAnswer) {
      if (!fullQuestion || !responseData?.answer?.summary) return;
      setIsRegeneratingAnswer(true);
      try {
        const followUpPayload = {
          sessionId,
          query: fullQuestion,
          mediaLens,
          item: renderEntityPacket?.providerId || contextPacket?.providerId || resolvedItem || undefined,
          providerMetadata: renderEntityPacket?.providerMetadata || contextPacket?.providerMetadata || urlParams.providerMetadata || undefined,
          spoilerMode: newValue,
          conversation: [],
          previousEntity: shouldMaintainFranchiseLock(resolvedItem, fullQuestion) ? resolvedItem : null,
          intentResolution: useIntentStore.getState().intent
            ? {
                intent: { intent: useIntentStore.getState().intent, entities: [] },
                ambiguity: useIntentStore.getState().ambiguity,
                groundingDecision: { strategy: useIntentStore.getState().strategy },
              }
            : undefined,
          requestId
        };

        const res = await fetch("/api/nerdvana-answer", {
          method: "POST",
          signal: abortController.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(followUpPayload)
        });

        if (requestId !== activeRequestIdRef.current) return;
        if (!res.ok) throw new Error("API failed");
        const data = await res.json();
        
        console.log(`[RAW_BACKEND_RESPONSE] [${requestId}]`, JSON.stringify(data, null, 2));
        
        setResponseData(prev => prev ? { ...prev, answer: { ...prev.answer, summary: data.answer || "" } } : null, requestId);
        setRevealedMessageIndices(new Set());
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("Failed to regenerate answer", err);
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsRegeneratingAnswer(false);
        }
      }
    } else {
      const lastAssistantIdx = conversation.map(m => m.role).lastIndexOf("assistant");
      if (lastAssistantIdx === -1) return;

      const userQuery = conversation[lastAssistantIdx - 1]?.content || fullQuestion;
      const history = conversation.slice(0, lastAssistantIdx - 1);

      setConversation(prev => {
        const next = [...prev];
        next[lastAssistantIdx] = { ...next[lastAssistantIdx], content: "" };
        return next;
      }, "system-reset");
      setIsGeneratingFollowUp(true);
      
      try {
        const followUpPayload = {
          sessionId,
          query: userQuery,
          mediaLens,
          item: renderEntityPacket?.providerId || contextPacket?.providerId || resolvedItem || undefined,
          providerMetadata: renderEntityPacket?.providerMetadata || contextPacket?.providerMetadata || urlParams.providerMetadata || undefined,
          spoilerMode: newValue,
          conversation: [
            { role: "user", content: fullQuestion },
            { role: "assistant", content: responseData?.answer?.summary || "No answer available" },
            ...history
          ],
          previousEntity: shouldMaintainFranchiseLock(resolvedItem, userQuery) ? resolvedItem : null,
          requestId
        };

        const res = await fetch("/api/nerdvana-answer", {
          method: "POST",
          signal: abortController.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(followUpPayload)
        });

        if (requestId !== activeRequestIdRef.current) return;
        if (!res.ok) throw new Error("API failed");
        const data = await res.json();
        
        console.log(`[RAW_BACKEND_RESPONSE] [${requestId}]`, JSON.stringify(data, null, 2));
        
        setConversation(prev => {
          const next = [...prev];
          next[lastAssistantIdx] = { ...next[lastAssistantIdx], content: data.answer || "" };
          return next;
        }, requestId);
        setRevealedMessageIndices(new Set());
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("Failed to regenerate follow-up", err);
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsGeneratingFollowUp(false);
        }
      }
    }
  };

  useEffect(() => {
    if (!contextIsValid || isAmbiguous || !resolvedItem) {
      return;
    }

    if (!responseData?.answer?.summary?.trim()) {
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
  }, [responseData?.answer?.summary, contextIsValid, fullQuestion, isAmbiguous, mediaLens, resolvedItem, saveCaseMemory, user]);

  // Current Exploration automatic state updater
  useEffect(() => {
    if (!contextIsValid || isAmbiguous || !resolvedItem) return;
    if (!responseData?.answer?.summary?.trim()) return;
    if (visualResolutionStatus !== 'resolved' && visualResolutionStatus !== 'failed') return;
    
    const explorationKey = `${resolvedItem}|${mediaLens}`;
    if (lastExploredEntityRef.current === explorationKey) return;
    
    if (user) {
      const currentExplorationData = {
        title: renderEntityPacket?.title || contextPacket?.canonicalEntity || resolvedItem,
        providerId: renderEntityPacket?.providerId || contextPacket?.providerId || resolvedItem,
        mediaLens,
        visual: mapVisualAsset(activeVisualOwnerRef.current),
        timestamp: serverTimestamp()
      };
      
      const docRef = doc(db, "users", user.uid, "state", "currentExploration");
      setDoc(docRef, currentExplorationData).catch((error) => {
        console.warn("Current Exploration sync failed", error);
      });
    }
    
    lastExploredEntityRef.current = explorationKey;
  }, [responseData?.answer?.summary, contextIsValid, isAmbiguous, mediaLens, resolvedItem, user, visualResolutionStatus, renderEntityPacket, contextPacket]);

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

    setConversation(prev => [...prev, userMessage, assistantPlaceholder], "follow-up-init");
    setFollowUpQuery("");
    setIsGeneratingFollowUp(true);
    setVisualResolutionStatus('pending');

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
        spoilerMode: spoilerPolicy,
        conversation: [
          { role: "user", content: fullQuestion },
          { role: "assistant", content: responseData?.answer?.summary || "No answer available" },
          ...conversation
        ],
        previousEntity: franchiseLocked ? resolvedItem : null,
        temporaryEntities: useQuerySessionStore.getState().temporaryEntities,
        executionMode: mode === "DETERMINISTIC" ? "DETERMINISTIC_PROVIDER" : "SEMANTIC",
        requestId: followUpContext.requestId
      };



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
          const incomingId = payload.contextPacket.providerId || null;
          const currentId = activeVisualOwner.providerId || null;
          const incomingFranchise = payload.contextPacket.parentFranchise || null;
          const currentFranchise = activeVisualOwner.franchiseRoot || null;

          if (incomingId !== currentId || incomingFranchise !== currentFranchise) {
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
        const nextRenderPacket: RenderEntityPacket = {
          title: renderEntityPacket?.title || payload?.contextPacket?.canonicalEntity || payload?.grounding?.selectedCanonicalEntity || fullQuestion,
          providerId: expectedProviderId || incomingProviderId!,
          franchiseRoot: renderEntityPacket?.franchiseRoot || payload?.contextPacket?.parentFranchise || payload?.grounding?.selectedFranchise || null,
          providerMetadata: renderEntityPacket?.providerMetadata || payload?.contextPacket?.providerMetadata || payload?.grounding?.providerMetadata || null,
          contextPacket: payload.contextPacket
        };
        Object.freeze(nextRenderPacket);
        setRenderEntityPacket(nextRenderPacket, payload.requestId);
      } else if (!isIncomingDeterministic) {
        setRenderEntityPacket(null, payload.requestId);
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
        setGrounding(payload.grounding, payload.requestId);
      }
      if (payload?.contextPacket) {
        setContextPacket(payload.contextPacket, payload.requestId);
        console.log(`[LIFECYCLE_DEBUG_FRONTEND] State mutation (contextPacket) [${followUpContext.requestId}]:`, payload.contextPacket);
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
      }, payload.requestId);

      // Visual check and spoiler block check
      const isSpoilerBlocked = !spoilerPolicy && /\b(die|dies|death|dead|ending|kills|killed|final scene|spoiler|plot twist)\b/i.test(fullAssistantAnswer);

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
      }, followUpContext.requestId);

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
                  placeholder={
                    mediaLens === "movies" ? "Search movies..." :
                    mediaLens === "tv" ? "Search TV shows..." :
                    mediaLens === "anime" ? "Search anime..." :
                    mediaLens === "games" ? "Search games..." :
                    mediaLens === "comics" ? "Search comics..." :
                    mediaLens === "books" ? "Search books..." :
                    "Search movies, shows, games, anime & comics..."
                  }
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
                { label: "Spoilers", checked: spoilerPolicy, set: handleSpoilerToggle }
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
                    <span>Save To</span>
                    <span>Library</span>
                  </span>
                  <div
                    className="absolute inset-0 bg-[var(--nerdvana-accent)] opacity-0 group-hover:opacity-5 transition-opacity duration-300"
                  />
                </button>
              </div>
            )}

            {/* Main content + Visual Panel side by side */}
            <ResultLayout
              main={
                <>
                {!isLoading && fullQuestion && responseData?.answer?.summary?.trim() && (
                  <ResultContent 
                    isLoading={isLoading}
                    fullQuestion={fullQuestion}
                    answerSummary={responseData?.answer?.summary || ""}
                    responseData={responseData}
                    isRegeneratingAnswer={isRegeneratingAnswer}
                    readingOrder={readingOrder}
                    contextPacket={contextPacket}
                    grounding={grounding}
                    results={results}
                    continuationSuggestions={continuationSuggestions}
                  />
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
                          placeholder="Search within this topic..."
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
                        const showWarning = !spoilerPolicy && isRisky && msg.role === "assistant" && !revealedMessageIndices.has(index);

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
                            onWarningClick={() => {
                              setRevealedMessageIndices(prev => {
                                const next = new Set(prev);
                                next.add(index);
                                return next;
                              });
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
              }
              sidebar={
                (contextPacket || explorationStatus === "completed") ? (
                  <>
                  {contextPacket && detectQueryMode(fullQuestion) === "entity" && (
                      <VisualPanel
                        contextPacket={(contextPacket?.executionMode === "DETERMINISTIC_PROVIDER" && renderEntityPacket) ? renderEntityPacket.contextPacket : contextPacket}
                        activeTraceId={activeTraceId}
                        reusableVisual={activeVisualOwner?.asset || null}
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
                        onVisualResolutionComplete={setVisualResolutionStatus}
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
                  </>
                ) : null
              }
            />



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
