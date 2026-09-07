import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface AuthModalProps {
  onClose: () => void;
}

type AuthMode = "login" | "signup";

function getAuthErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "The email or password is incorrect.";
    case "auth/user-not-found":
      return "No account was found with that email.";
    case "auth/email-already-in-use":
      return "That email is already registered. Try logging in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Choose a password with at least 6 characters.";
    default:
      return "We could not complete sign in. Please try again.";
  }
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { login, loginWithEmail, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage("");
    setConfirmPassword("");
  };

  const handleGoogleLogin = async () => {
    setErrorMessage("");
    setSubmitting(true);
    try {
      await login();
      onClose();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Choose a password with at least 6 characters.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUp(normalizedEmail, password);
      } else {
        await loginWithEmail(normalizedEmail, password);
      }
      onClose();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="w-full max-w-md border-[3px] p-5 sm:p-7 shadow-[8px_8px_0_var(--nerdvana-shadow)]"
        style={{
          borderColor: "var(--nerdvana-border)",
          backgroundColor: "var(--nerdvana-surface)",
          color: "var(--nerdvana-text)"
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] opacity-70">Nerdvana access</p>
            <h2 id="auth-modal-title" className="mt-1 text-2xl font-black uppercase">
              {mode === "login" ? "Log in" : "Sign up"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-[2px] px-2 py-1 text-lg leading-none"
            style={{ borderColor: "var(--nerdvana-border)" }}
            aria-label="Close authentication dialog"
          >
            x
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 border-[2px]" style={{ borderColor: "var(--nerdvana-border)" }}>
          {(["login", "signup"] as AuthMode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => changeMode(option)}
              className="px-3 py-2 text-[0.72rem] uppercase tracking-[0.14em]"
              style={{
                backgroundColor: mode === option ? "var(--nerdvana-accent)" : "transparent",
                color: mode === option ? "var(--nerdvana-surface)" : "var(--nerdvana-text)"
              }}
            >
              {option === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-[0.72rem] uppercase tracking-[0.12em]">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="mt-1 w-full border-[2px] px-3 py-2.5 text-base outline-none"
              style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-bg)", color: "var(--nerdvana-text)" }}
              required
            />
          </label>
          <label className="block text-[0.72rem] uppercase tracking-[0.12em]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              className="mt-1 w-full border-[2px] px-3 py-2.5 text-base outline-none"
              style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-bg)", color: "var(--nerdvana-text)" }}
              required
            />
          </label>
          {mode === "signup" && (
            <label className="block text-[0.72rem] uppercase tracking-[0.12em]">
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="mt-1 w-full border-[2px] px-3 py-2.5 text-base outline-none"
                style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-bg)", color: "var(--nerdvana-text)" }}
                required
              />
            </label>
          )}

          {errorMessage && (
            <p className="border-[2px] px-3 py-2 text-sm" role="alert" style={{ borderColor: "var(--nerdvana-accent)", color: "var(--nerdvana-accent)" }}>
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full border-[2px] px-4 py-3 text-[0.75rem] uppercase tracking-[0.16em] disabled:opacity-60"
            style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "var(--nerdvana-border)", color: "var(--nerdvana-surface)" }}
          >
            {submitting ? "Working..." : mode === "login" ? "Log in with email" : "Create account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[0.68rem] uppercase tracking-[0.16em] opacity-65">
          <span className="h-px flex-1" style={{ backgroundColor: "var(--nerdvana-border)" }} />
          <span>or continue with</span>
          <span className="h-px flex-1" style={{ backgroundColor: "var(--nerdvana-border)" }} />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={submitting}
          className="w-full border-[2px] px-4 py-3 text-[0.75rem] uppercase tracking-[0.16em] disabled:opacity-60"
          style={{ borderColor: "var(--nerdvana-border)", backgroundColor: "transparent", color: "var(--nerdvana-text)" }}
        >
          Continue with Google
        </button>
      </section>
    </div>
  );
}
