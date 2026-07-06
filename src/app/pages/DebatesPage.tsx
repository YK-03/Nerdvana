import Header from "../components/Header";

interface DebatesPageProps {
  onNavigatePage: (page: string) => void;
}

export default function DebatesPage({ onNavigatePage }: DebatesPageProps) {
  return (
    <div
      className="min-h-screen w-full transition-colors duration-300"
      style={{ backgroundColor: "var(--nerdvana-conversation-bg)" }}
    >
      <div className="fixed inset-0 pointer-events-none paper-texture nerdvana-paper-texture-conversation" />
      <div className="relative">
        <Header onNavigate={onNavigatePage} />

        <main className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-12">
          <article className="max-w-5xl mx-auto">
            <h1
              className="text-[clamp(2rem,8.6vw,3.2rem)] font-black tracking-[-0.03em] leading-tight uppercase"
              style={{
                fontFamily: 'Impact, "Arial Black", sans-serif',
                color: "var(--nerdvana-text)"
              }}
            >
              Debates
            </h1>

            <section
              className="mt-6 sm:mt-8 border-[2px] p-4 sm:p-5 md:p-7 transition-colors duration-300"
              style={{
                borderColor: "var(--nerdvana-border)",
                backgroundColor: "var(--nerdvana-message-bg)"
              }}
            >
              <p
                className="text-[1rem] leading-7"
                style={{
                  fontFamily: '"Times New Roman", serif',
                  color: "var(--nerdvana-text)"
                }}
              >
                Debates will allow multiple interpretations of stories to be explored side by side.
              </p>
              <p
                className="mt-5 text-xs md:text-sm uppercase tracking-[0.16em]"
                style={{
                  fontFamily: '"Courier New", monospace',
                  color: "var(--nerdvana-accent)",
                  opacity: 0.8
                }}
              >
                Coming soon
              </p>
            </section>
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
