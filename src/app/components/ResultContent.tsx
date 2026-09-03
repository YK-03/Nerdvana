import React from "react";
import { motion } from "motion/react";
import AIResponse from "./AIResponse";
import SourcesPanel from "./SourcesPanel";
import { CharacterSection } from "./exploration/CharacterSection";
import ExploreSection from "./ExploreSection";
import { ENABLE_CONTINUITY_TIMELINE } from "../../config/debug";

interface ResultContentProps {
  isLoading: boolean;
  fullQuestion: string;
  answerSummary: string;
  responseData: any;
  isRegeneratingAnswer: boolean;
  readingOrder: any[] | null;
  contextPacket: any;
  grounding: any;
  results: any[];
  continuationSuggestions: any[] | null;
}

export default function ResultContent({
  isLoading,
  fullQuestion,
  answerSummary,
  responseData,
  isRegeneratingAnswer,
  readingOrder,
  contextPacket,
  grounding,
  results,
  continuationSuggestions
}: ResultContentProps) {
  console.log("[ENTITY_IDENTITY] Answer", {
    entity: contextPacket?.providerId || contextPacket?.canonicalEntity,
    title: contextPacket?.canonicalEntity,
    provider: contextPacket?.provider,
    providerId: contextPacket?.providerId
  });

  console.log("[ENTITY_IDENTITY] Characters", {
    entity: contextPacket?.providerId || contextPacket?.canonicalEntity, // Characters are bound to the Answer's responseData, which is driven by contextPacket
    title: contextPacket?.canonicalEntity,
    provider: contextPacket?.provider,
    providerId: contextPacket?.providerId
  });
  if (isLoading || !fullQuestion || !answerSummary.trim()) {
    return null;
  }

  return (
    <motion.div
      key={responseData ? `${fullQuestion}-${responseData.answer.summary.length}` : `empty-${fullQuestion}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <AIResponse
        text={answerSummary}
        isLoading={isRegeneratingAnswer}
        disableProgressiveReveal
      />

      {/* Exploration Sections */}
      <CharacterSection characters={responseData?.exploration?.characters} />


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
              {readingOrder.map((item: any, idx: number) => (
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
                {continuationSuggestions.map((item: any, idx: number) => (
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
            style={{ /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Inter", sans-serif' }}
          >
            Looking for:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {grounding.suggestions.slice(0, 3).map((suggestion: any) => (
              <li
                key={`${suggestion.selectionValue}-${suggestion.mediaLens}`}
                className="text-[0.92rem] leading-6"
                style={{ /* pre-Inter-switch: fontFamily: '"Times New Roman", serif' */ fontFamily: '"Inter", sans-serif' }}
              >
                <span className="font-semibold">{suggestion.displayTitle}</span>
                {suggestion.metadataLabel ? ` — ${suggestion.metadataLabel}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <SourcesPanel
        sources={results.map((result: any) => ({
          title: result.title,
          link: result.url
        }))}
      />
      
      {/* Phase 8E: Experience Intelligence Discovery Rails Disabled for Phase 9A */}
    </motion.div>
  );
}
