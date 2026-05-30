import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RENDER_CONTRACTS } from "../../lib/resolver/renderContracts.js";

interface ChatBubbleProps {
    role: "user" | "assistant";
    content: string;
    suggestions?: string[];
    onSuggestionClick?: (suggestion: string) => void;
    isLoading?: boolean;
    warning?: boolean;
    sources?: { title: string; url: string; }[];
    onWarningClick?: () => void;
}

export default function ChatBubble({
    role,
    content,
    suggestions,
    onSuggestionClick,
    isLoading,
    warning,
    sources,
    onWarningClick
}: ChatBubbleProps) {
    const isUser = role === "user";
    const safeSuggestions = suggestions ?? [];

    return (
        <div
            className={`${RENDER_CONTRACTS.classes.chatBubble} mb-4 flex flex-col ${isUser ? "items-end" : "items-start"}`}
            data-render-contract={RENDER_CONTRACTS.classes.chatBubble}
            data-role={role}
        >
            <div
                className={`w-full max-w-[96%] sm:max-w-[90%] md:max-w-[78%] border px-4 sm:px-5 py-3.5 transition-all duration-300 ${isUser ? "ml-auto" : "mr-auto"
                    } ${warning ? "cursor-pointer hover:border-[var(--nerdvana-accent)] hover:shadow-[0_0_15px_rgba(239,68,68,0.15)]" : ""}`}
                onClick={warning ? onWarningClick : undefined}
                style={{
                    borderColor: warning ? "var(--nerdvana-accent)" : "var(--nerdvana-border)",
                    backgroundColor: isUser
                        ? "var(--nerdvana-surface)"
                        : "var(--nerdvana-conversation-bg)",
                    fontFamily: '"Times New Roman", serif',
                    color: "var(--nerdvana-text)",
                    fontSize: "0.96rem",
                    lineHeight: "1.6",
                    position: "relative",
                    overflowWrap: "anywhere"
                }}
            >
                <div
                    className="mb-2 text-[0.62rem] uppercase tracking-[0.12em]"
                    style={{
                        fontFamily: '"Courier New", monospace',
                        opacity: 0.7
                    }}
                >
                    {isUser ? "YOU" : "NERDVANA"}
                </div>

                {/* Spoiler Warning Banner */}
                {warning && (
                    <div
                        className="mb-3 p-2.5 text-[0.75rem] border border-dashed transition-all duration-200 hover:bg-[rgba(239,68,68,0.08)]"
                        style={{
                            borderColor: "var(--nerdvana-accent)",
                            color: "var(--nerdvana-accent)",
                            fontFamily: '"Courier New", monospace'
                        }}
                    >
                        ⚠ SPOILERS HIDDEN. Click anywhere on this message to reveal.
                    </div>
                )}

                {/* Content or Skeleton */}
                <div
                    className={`${RENDER_CONTRACTS.classes.markdownBody} ${RENDER_CONTRACTS.classes.prose} prose-sm max-w-none dark:prose-invert transition-all duration-300`}
                    style={warning ? { filter: "blur(6px)", opacity: 0.4, userSelect: "none", pointerEvents: "none" } : {}}
                >
                    {content ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                strong: ({ children }) => <strong style={{ fontWeight: 700, color: "var(--nerdvana-text)" }}>{children}</strong>,
                                em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
                                ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                                li: ({ children }) => <li className="mb-1">{children}</li>,
                                a: ({ href, children }) => (
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline hover:no-underline transition-colors"
                                        style={{ color: "var(--nerdvana-accent)" }}
                                    >
                                        {children}
                                    </a>
                                ),
                                blockquote: ({ children }) => (
                                    <blockquote
                                        className="border-l-4 pl-3 my-2 italic"
                                        style={{ borderColor: "var(--nerdvana-border)", opacity: 0.8 }}
                                    >
                                        {children}
                                    </blockquote>
                                ),
                                code: ({ children }) => (
                                    <code
                                        className="px-1 py-0.5 rounded text-[0.85em]"
                                        style={{
                                            backgroundColor: "var(--nerdvana-border)",
                                            color: "var(--nerdvana-conversation-bg)",
                                            fontFamily: '"Courier New", monospace'
                                        }}
                                    >
                                        {children}
                                    </code>
                                ),
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    ) : isLoading ? (
                        <div className="animate-pulse space-y-2">
                            <div className="h-4 bg-[var(--nerdvana-border)] rounded w-3/4 opacity-30"></div>
                            <div className="h-4 bg-[var(--nerdvana-border)] rounded w-full opacity-30"></div>
                            <div className="h-4 bg-[var(--nerdvana-border)] rounded w-5/6 opacity-30"></div>
                        </div>
                    ) : null}
                </div>

                {/* Sources Footer */}
                {sources && sources.length > 0 && !isUser && (
                    <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--nerdvana-border)" }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[0.6rem] uppercase tracking-widest opacity-60" style={{ fontFamily: '"Courier New", monospace' }}>Sources</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {sources.map((s, i) => (
                                <a
                                    key={i}
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[0.7rem] hover:underline opacity-80"
                                    style={{ color: "var(--nerdvana-accent)" }}
                                >
                                    [{i + 1}] {s.title}
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Follow-up Suggestions */}
            {!isUser && safeSuggestions.length > 0 && (
                <div className="mt-2 ml-1 flex flex-wrap gap-2 w-full max-w-[96%] sm:max-w-[90%] md:max-w-[78%]">
                    {safeSuggestions.map((suggestion, idx) => (
                        <button
                            key={idx}
                            onClick={() => onSuggestionClick?.(suggestion)}
                            className="text-[0.68rem] sm:text-[0.7rem] px-3 py-2 rounded-full border transition-colors duration-200 hover:bg-[var(--nerdvana-border)] text-left"
                            style={{
                                fontFamily: '"Courier New", monospace',
                                borderColor: "var(--nerdvana-border)",
                                color: "var(--nerdvana-text)",
                                backgroundColor: "transparent"
                            }}
                        >
                            {suggestion} ➜
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
