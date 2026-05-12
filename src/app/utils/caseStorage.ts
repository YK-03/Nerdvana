import type { MediaLens } from "../mediaLens";

export type CaseFile = {
  id: string;
  query: string;
  item: string | null;
  intent: string;
  timestamp: number;
  mediaLens?: MediaLens;
};

const CASE_STORAGE_KEY = "nerdvana_cases";

export function getCases(): CaseFile[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return JSON.parse(window.localStorage.getItem(CASE_STORAGE_KEY) || "[]") as CaseFile[];
  } catch {
    return [];
  }
}

export function saveCase(newCase: CaseFile) {
  if (typeof window === "undefined") {
    return;
  }

  const existing = getCases();
  const updated = [newCase, ...existing.filter((entry) => entry.id !== newCase.id)].slice(0, 20);
  window.localStorage.setItem(CASE_STORAGE_KEY, JSON.stringify(updated));
}

export function setCases(cases: CaseFile[]) {
  if (typeof window === "undefined") {
    return;
  }

  const limited = [...cases]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);
  window.localStorage.setItem(CASE_STORAGE_KEY, JSON.stringify(limited));
}
