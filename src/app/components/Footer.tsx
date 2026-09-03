type FooterProps = {
  variant?: "default" | "signature";
};

export default function Footer({ variant = "default" }: FooterProps) {
  const isSignature = variant === "signature";

  return (
    <footer
      className={`footer mt-8 sm:mt-10 px-4 sm:px-6 lg:px-10 xl:px-12 ${isSignature ? "footer--signature pt-1 pb-6 md:pb-8" : "py-5 border-t"}`}
      style={{
        borderColor: isSignature ? "transparent" : "var(--nerdvana-border)"
      }}
    >
      <p
        className={`font-legacy-chrome uppercase ${isSignature ? "text-center text-[0.62rem] sm:text-[0.64rem] md:text-[0.68rem] tracking-[0.16em]" : "text-center text-[0.68rem] sm:text-[0.72rem] md:text-xs tracking-[0.12em]"}`}
        style={{
          /* pre-Inter-switch: fontFamily: '"Courier New", monospace' */ fontFamily: '"Courier New", monospace',
          color: "var(--nerdvana-text)",
          opacity: isSignature ? 0.44 : 0.62
        }}
      >
        Made with love for nerds by a nerd
      </p>
    </footer>
  );
}
