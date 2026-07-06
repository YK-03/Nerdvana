import Header from "../components/Header";
import { EXPLORE_CATALOG } from "../data/exploreCatalog";

interface ItemPageProps {
  slug: string;
  onAskQuestion: (question: string) => void;
  onNavigatePage: (page: string) => void;
}

export default function ItemPage({
  slug,
  onAskQuestion,
  onNavigatePage
}: ItemPageProps) {
  const item = EXPLORE_CATALOG.flatMap(section => section.entities).find(e => e.id === slug);

  return (
    <div
      className="min-h-screen w-full transition-colors duration-300"
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
            {!item ? (
              <section
                className="mt-8 border-[2px] p-5 md:p-7 transition-colors duration-300"
                style={{
                  borderColor: "var(--nerdvana-border)",
                  backgroundColor: "var(--nerdvana-message-bg)"
                }}
              >
                <h1
                  className="text-[clamp(2rem,8.6vw,3.2rem)] font-black tracking-[-0.03em] leading-tight uppercase"
                  style={{
                    fontFamily: 'Impact, "Arial Black", sans-serif',
                    color: "var(--nerdvana-text)"
                  }}
                >
                  Item Not Found
                </h1>
                <p
                  className="mt-4 text-[0.98rem] sm:text-[1rem] leading-7"
                  style={{
                    fontFamily: '"Times New Roman", serif',
                    color: "var(--nerdvana-text)"
                  }}
                >
                  This entry does not exist in the current mock index.
                </p>
                <button
                  className="nerdvana-clickable mt-5 text-xs md:text-sm uppercase tracking-[0.14em] border-[2px] px-4 py-2.5"
                  style={{
                    fontFamily: '"Courier New", monospace',
                    borderColor: "var(--nerdvana-border)",
                    color: "var(--nerdvana-text)",
                    backgroundColor: "var(--nerdvana-surface)"
                  }}
                  onClick={() => onNavigatePage("explore")}
                >
                  Back to Explore
                </button>
              </section>
            ) : (
              <>
                <h1
                  className="text-[clamp(2rem,8.6vw,3.2rem)] font-black tracking-[-0.03em] leading-tight uppercase"
                  style={{
                    fontFamily: 'Impact, "Arial Black", sans-serif',
                    color: "var(--nerdvana-text)"
                  }}
                >
                  {item.title}
                </h1>
                <p
                  className="mt-3 text-[0.68rem] sm:text-xs md:text-sm uppercase tracking-[0.16em]"
                  style={{
                    fontFamily: '"Courier New", monospace',
                    color: "var(--nerdvana-accent)"
                  }}
                >
                  {item.mediaLens}
                </p>

                <section
                  className="mt-6 sm:mt-8 border-[2px] p-4 sm:p-5 md:p-7 transition-colors duration-300"
                  style={{
                    borderColor: "var(--nerdvana-border)",
                    backgroundColor: "var(--nerdvana-message-bg)"
                  }}
                >
                  <p
                    className="text-[0.98rem] sm:text-[1rem] leading-7"
                    style={{
                      fontFamily: '"Times New Roman", serif',
                      color: "var(--nerdvana-text)"
                    }}
                  >
                    {item.description}
                  </p>

                  {/* Deprecated sections for missing fields in new catalog */}
                </section>
              </>
            )}
          </article>
        </main>
      </div>

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

      `}</style>
    </div>
  );
}

