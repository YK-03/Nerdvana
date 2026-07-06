import Header from "../components/Header";
import { EXPLORE_CATALOG, type CatalogEntity } from "../data/exploreCatalog";
import { motion } from "motion/react";

interface ExplorePageProps {
  onAskQuestion: (value: string, context?: { item?: string; mediaLens?: any }) => void;
  onNavigatePage: (page: string) => void;
}

interface ExploreCardProps {
  item: CatalogEntity;
  onAskQuestion: (value: string, context?: { item?: string; mediaLens?: any }) => void;
}

function ExploreCard({ item, onAskQuestion }: ExploreCardProps) {
  return (
    <motion.button
      key={item.id}
      className="group nerdvana-clickable relative overflow-hidden text-left border-[2px] p-4 md:p-5 transition-all duration-300 h-full"
      style={{
        borderColor: "var(--nerdvana-border)",
        backgroundColor: "var(--nerdvana-surface)"
      }}
      whileHover={{
        y: -2,
        boxShadow: "0 10px 18px rgba(26, 25, 24, 0.14)"
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={() => onAskQuestion(item.title, { item: item.providerId, mediaLens: item.mediaLens })}
    >
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover grayscale contrast-125 opacity-[0.18] transition-opacity duration-300 group-hover:opacity-[0.32]"
        />
      )}

      <div className="relative z-10">
        <h2
          className="text-[clamp(1.15rem,5vw,1.55rem)] uppercase tracking-[-0.02em]"
          style={{
            fontFamily: 'Impact, "Arial Black", sans-serif',
            color: "var(--nerdvana-text)"
          }}
        >
          {item.title}
        </h2>
        <span
          className="mt-2 inline-flex items-center text-[0.64rem] md:text-[0.7rem] uppercase tracking-[0.12em] border px-2 py-1"
          style={{
            fontFamily: '"Courier New", monospace',
            color: "var(--nerdvana-accent)",
            borderColor: "var(--nerdvana-border)",
            backgroundColor: "var(--nerdvana-message-bg)",
            opacity: 0.88
          }}
        >
          {item.theme ?? item.mediaLens}
        </span>
        <p
          className="mt-3 text-[0.95rem] sm:text-[0.98rem] leading-7"
          style={{
            fontFamily: '"Times New Roman", serif',
            color: "var(--nerdvana-text)"
          }}
        >
          {item.description}
        </p>
      </div>
    </motion.button>
  );
}

export default function ExplorePage({
  onAskQuestion,
  onNavigatePage
}: ExplorePageProps) {
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
            <h1
              className="text-[clamp(2rem,8.6vw,3.2rem)] font-black tracking-[-0.03em] leading-tight uppercase"
              style={{
                fontFamily: 'Impact, "Arial Black", sans-serif',
                color: "var(--nerdvana-text)"
              }}
            >
              Explore
            </h1>
            <p
              className="mt-3 text-[0.95rem] sm:text-sm md:text-base leading-relaxed"
              style={{
                fontFamily: '"Times New Roman", serif',
                color: "var(--nerdvana-text)",
                opacity: 0.68
              }}
            >
              Stories, universes, and ideas Nerdvana understands.
            </p>

            {EXPLORE_CATALOG.map((section) => (
              <section
                key={section.title}
                className="mt-6 sm:mt-8 border-[2px] p-4 sm:p-5 md:p-7 transition-colors duration-300"
                style={{
                  borderColor: "var(--nerdvana-border)",
                  backgroundColor: "var(--nerdvana-message-bg)"
                }}
              >
                <h2
                  className="mb-4 text-sm md:text-base uppercase tracking-[0.16em]"
                  style={{
                    fontFamily: '"Courier New", monospace',
                    color: "var(--nerdvana-accent)"
                  }}
                >
                  {section.title}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
                  {section.entities.map((item) => (
                    <ExploreCard key={item.id} item={item} onAskQuestion={onAskQuestion} />
                  ))}
                </div>
              </section>
            ))}
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


