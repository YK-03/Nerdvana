import { useEffect, useMemo, useRef, useState } from "react";
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
import { useIdentityIntent } from "../hooks/useIdentityIntent";
import { saveCase } from "../utils/caseStorage";
import { saveCaseCloud } from "../utils/caseCloud";
import type { MockAnswer } from "../mockAnswers";
import { applyIdentityStabilization, isContextValid, resolveContext } from "../itemResolver";
import { buildAskUrl, DEFAULT_MEDIA_LENS, normalizeMediaLens } from "../mediaLens";
import { createOptimisticVisualContext, normalizeVisualContext, type VisualContext } from "../visualContext";
import { auth, db } from "../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

interface AskPageProps {
  question: string;
  onNavigatePage: (page: string) => void;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface ResponseData {
  answer: MockAnswer;
  results: ResultLink[];
}

function mergeVisualContext(payload: any, mediaLens: string): VisualContext | null {
  return normalizeVisualContext(payload?.visualContext, mediaLens, payload?.gameVisuals ?? null);
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
  const item = urlItem || stateItem;
  return {
    item,
    mediaLens: normalizeMediaLens(urlLens || stateLens || DEFAULT_MEDIA_LENS)
  };
}

export default function AskPage({
  question: _question,
  onNavigatePage
}: AskPageProps) {
  const [search, setSearch] = useState(() => window.location.search);
  const location = useMemo(() => ({ search }), [search]);
  const queryFromURL = new URLSearchParams(location.search).get("q") || "";
  const { item: queryItem, mediaLens } = readAskQueryParams();
  const fullQuestion = queryFromURL.trim();
  const inferredContext = useMemo(
    () => resolveContext(fullQuestion, queryItem, mediaLens),
    [fullQuestion, mediaLens, queryItem]
  );
  const { dominantItem } = useIdentityIntent();
  const resolvedContext = useMemo(
    () => applyIdentityStabilization(inferredContext, dominantItem),
    [dominantItem, inferredContext]
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (inferredContext.source !== "inferred") return;

    console.log("[Identity Stabilization]", {
      inferredItem: inferredContext.item,
      dominantItem,
      finalItem: resolvedContext.item
    });
  }, [dominantItem, inferredContext.item, inferredContext.source, resolvedContext.item]);

  const resolvedItem = resolvedContext.item;
  const isAmbiguous = resolvedContext.source === "ambiguous";
  const contextIsValid = useMemo(() => isContextValid(resolvedContext), [resolvedContext]);
  const optimisticVisualContext = useMemo(() => {
    if (!fullQuestion) return null;
    return createOptimisticVisualContext(
      fullQuestion,
      mediaLens,
      contextIsValid && !isAmbiguous ? resolvedItem : null,
    );
  }, [contextIsValid, fullQuestion, isAmbiguous, mediaLens, resolvedItem]);

  const historyState = typeof window !== "undefined" ? window.history.state : {};
  const isRestored = historyState?.rehydrated === true;

  const [answer, setAnswer] = useState<MockAnswer>(
    isRestored && historyState.answer ? historyState.answer : { summary: "", categories: [], spoilers: "" }
  );
  const [results, setResults] = useState<ResultLink[]>(
    isRestored && historyState.results ? historyState.results : []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [responseData, setResponseData] = useState<ResponseData | null>(
    isRestored && historyState.answer
      ? {
        answer: historyState.answer as MockAnswer,
        results: (historyState.results as ResultLink[]) ?? []
      }
      : null
  );
  const { save: saveCaseMemory } = useInvestigationMemory();
  const [user] = useAuthState(auth);
  const lastSavedCaseKey = useRef("");
  const lastSavedQueryRef = useRef(isRestored ? fullQuestion : "");

  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(
    isRestored && historyState.historyId ? historyState.historyId : null
  );

  const [conversation, setConversation] = useState<ConversationMessage[]>(
    isRestored && historyState.conversation ? historyState.conversation : []
  );
  const [followUpQuery, setFollowUpQuery] = useState("");
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);
  const [chatSpoilers, setChatSpoilers] = useState(false);

  // Visual context state
  const [visualContext, setVisualContext] = useState<VisualContext | null>(null);
  const displayVisualContext = visualContext ?? optimisticVisualContext;

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
      await addDoc(collection(db, "users", user.uid, "lorebooks"), {
        topic: fullQuestion,
        mediaLens,
        conversation: fullSession,
        results: results.map(s => ({ title: s.title, url: s.url })),
        createdAt: serverTimestamp()
      });
      alert("Session saved to Lorebooks!");
    } catch (e) {
      console.error("Error saving lorebook:", e);
      alert("Failed to save.");
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nerdvana_active_session");
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (parsed.topic === fullQuestion) {
        console.log("Restoring active session from localStorage");
        const restoredAnswer = parsed.answer || { summary: "", categories: [], spoilers: "" };
        const restoredResults = parsed.results || [];
        setAnswer(restoredAnswer);
        setResults(restoredResults);
        setResponseData({
          answer: restoredAnswer,
          results: restoredResults
        });
        setConversation(parsed.conversation || []);
        if (parsed.visualContext) {
          setVisualContext(
            normalizeVisualContext(
              parsed.visualContext,
              parsed.visualContext.mediaLens ?? parsed.mediaLens ?? mediaLens,
              parsed.visualContext.gameVisuals ?? null
            )
          );
        }
        if (!new URLSearchParams(window.location.search).get("lens") && parsed.mediaLens) {
          const restoredLens = normalizeMediaLens(parsed.mediaLens);
          window.history.replaceState(
            { ...(window.history.state || {}), mediaLens: restoredLens },
            "",
            buildAskUrl(fullQuestion, { item: queryItem, lens: restoredLens })
          );
          setSearch(window.location.search);
        }
      }
    } catch (e) {
      console.error("Failed to restore session", e);
    }
  }, [fullQuestion, queryItem]);

  useEffect(() => {
    if (!fullQuestion) return;

    localStorage.setItem(
      "nerdvana_active_session",
      JSON.stringify({
        topic: fullQuestion,
        answer,
        results,
        conversation,
        visualContext,
        mediaLens
      })
    );
  }, [fullQuestion, answer, results, conversation, mediaLens, visualContext]);

  useEffect(() => {
    const syncSearch = () => setSearch(window.location.search);
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      syncSearch();
    };
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      syncSearch();
    };
    window.addEventListener("popstate", syncSearch);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", syncSearch);
    };
  }, []);

  useEffect(() => {
    if (!fullQuestion) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("lens")) return;

    window.history.replaceState(
      { ...(window.history.state || {}), mediaLens },
      "",
      buildAskUrl(fullQuestion, { item: queryItem, lens: mediaLens })
    );
    setSearch(window.location.search);
  }, [fullQuestion, mediaLens, queryItem]);

  useEffect(() => {
    let isCancelled = false;
    const normalizedQuestion = fullQuestion.trim();

    setAnswer({ summary: "", categories: [], spoilers: "" });
    setResults([]);
    setResponseData(null);
    setIsLoading(false);

    if (!normalizedQuestion) {
      return () => {
        isCancelled = true;
      };
    }

    const runSearch = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/nerdvana-answer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query: normalizedQuestion,
            mediaLens,
            spoilerMode: chatSpoilers,
            conversation: [],
            previousEntity: null
          })
        });

        if (!response.ok) {
          throw new Error(`API ${response.status}`);
        }

        const payload = await response.json();
        if (isCancelled) return;

        const rawSources = Array.isArray(payload?.sources) ? payload.sources : [];
        const aiAnswer = String(payload?.answer ?? "");
        const rawResults = rawSources
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

        const nextAnswer = { summary: aiAnswer, categories: [], spoilers: "" } satisfies MockAnswer;
        setResults(rawResults);
        setAnswer(nextAnswer);
        setResponseData({ answer: nextAnswer, results: rawResults });

        // Set visual context from initial query (always update on fresh search)
        if (payload?.visualContext) {
          setVisualContext(mergeVisualContext(payload, mediaLens));
        }

        if (user && normalizedQuestion) {
          const historyState = window.history.state || {};
          const alreadySaved = historyState.historySaved && historyState.query === normalizedQuestion;

          if (historyState.rehydrated || alreadySaved) {
            console.log("History session already exists or restoring, skipping save.");

            if (historyState.historyId) {
              setCurrentHistoryId(historyState.historyId);
            }
            lastSavedQueryRef.current = normalizedQuestion;

            if (historyState.answer && !aiAnswer) {
              setAnswer(historyState.answer);
              setResponseData({
                answer: historyState.answer as MockAnswer,
                results: (historyState.results as ResultLink[]) ?? rawResults
              });
            }
            if (historyState.conversation && conversation.length === 0) {
              setConversation(historyState.conversation);
            }
          } else {
            console.log("Creating new history session for:", user.uid, normalizedQuestion);
            try {
              const docRef = await addDoc(collection(db, "users", user.uid, "history"), {
                query: normalizedQuestion,
                mediaLens,
                conversation: [],
                results: rawResults.map((r: any) => ({ title: r.title, url: r.url })),
                createdAt: serverTimestamp()
              });

              if (isCancelled) return;
              setCurrentHistoryId(docRef.id);
              lastSavedQueryRef.current = normalizedQuestion;

              window.history.replaceState({
                ...historyState,
                historySaved: true,
                historyId: docRef.id,
                query: normalizedQuestion,
                mediaLens
              }, "");
            } catch (error) {
              console.error("Failed to save history session", error);
            }
          }
        }
      } catch {
        if (isCancelled) return;
        setAnswer({ summary: "", categories: [], spoilers: "" });
        setResults([]);
        setResponseData(null);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    runSearch();

    return () => {
      isCancelled = true;
    };
  }, [chatSpoilers, fullQuestion, mediaLens, user]);

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

    let fullAssistantAnswer = "";

    try {
      const response = await fetch("/api/nerdvana-answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: trimmedQuery,
          mediaLens,
          spoilerMode: chatSpoilers,
          conversation: [
            { role: "user", content: fullQuestion },
            { role: "assistant", content: answer.summary || "No answer available" },
            ...conversation
          ],
          previousEntity: visualContext?.entity ?? null
        })
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`API ${response.status}: ${details}`);
      }

      const payload = await response.json();
      fullAssistantAnswer = payload?.answer ?? "";

      // Update visual context only if topic changed
      if (payload?.visualContext?.changed) {
        setVisualContext(mergeVisualContext(payload, mediaLens));
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

    } catch (error: any) {
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
    } finally {
      setIsGeneratingFollowUp(false);

      if (user && currentHistoryId) {
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
            <form method="get" action="/ask" className="mb-4">
              <div
                className="border-[2px] p-[2px]"
                style={{
                  borderColor: "var(--nerdvana-border)",
                  backgroundColor: "var(--nerdvana-surface)"
                }}
              >
                <input
                  name="q"
                  defaultValue={fullQuestion}
                  placeholder="Ask Nerdvana anything..."
                  className="askQueryInput w-full px-3 sm:px-4 py-3 text-[0.98rem] sm:text-[1rem] md:text-[1.08rem] focus:outline-none"
                  style={{
                    fontFamily: '"Times New Roman", serif',
                    backgroundColor: "var(--nerdvana-surface)",
                    color: "var(--nerdvana-text)"
                  }}
                />
                {resolvedItem && <input type="hidden" name="item" value={resolvedItem} />}
                <input type="hidden" name="lens" value={mediaLens} />
              </div>
            </form>

            <div className="mb-4 flex flex-wrap justify-start sm:justify-end gap-3 sm:gap-6 items-center">
              {[
                { label: "Conversation Spoilers", checked: chatSpoilers, set: setChatSpoilers }
              ].map((sw, idx) => (
                <label key={idx} className="nerdvana-clickable flex items-center gap-2 group select-none">
                  <span
                    className="text-[0.58rem] sm:text-[0.6rem] uppercase tracking-[0.1em]"
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

            {!isLoading && fullQuestion && (
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
            <div className="flex gap-8 items-start">
              <div className="flex-1 min-w-0">
                {!isLoading && fullQuestion && (
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
                    <SourcesPanel
                      sources={results.map((result) => ({
                        title: result.title,
                        link: result.url
                      }))}
                    />
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
                          placeholder="Ask a follow-up about this topic..."
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
                        <p
                          className="mt-2 text-[0.68rem] uppercase tracking-[0.12em]"
                          style={{ fontFamily: '"Courier New", monospace', opacity: 0.7, color: "var(--nerdvana-text)" }}
                        >
                          Generating response...
                        </p>
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
                            ? generateFollowUps(msg.content, fullQuestion)
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
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Visual Panel — sticky sidebar */}
              {displayVisualContext && (
                <div className="hidden lg:block w-72 flex-shrink-0 sticky top-24">
                  <VisualPanel context={displayVisualContext} />
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
    </div>
  );
}
