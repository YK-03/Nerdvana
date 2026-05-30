import { create } from 'zustand';
import type { MediaLens } from '../mediaLens';

export interface ExplorationRecommendation {
  title: string;
  reason: string;
  themes: string[];
  confidence: number;
  lens: MediaLens;
}

export interface ExplorationSessionStore {
  sessionId: string | null;
  query: string;
  lens: MediaLens;
  status: "idle" | "exploring" | "completed" | "failed";
  themes: string[];
  recommendations: ExplorationRecommendation[];
  reasoning: string;
  confidence: number;
  
  startExploration: (sessionId: string, query: string, lens: MediaLens) => void;
  setExplorationResults: (themes: string[], recommendations: ExplorationRecommendation[], reasoning: string, confidence: number) => void;
  setStatus: (status: "idle" | "exploring" | "completed" | "failed") => void;
  clearExplorationState: () => void;
}

export const useExplorationStore = create<ExplorationSessionStore>((set) => ({
  sessionId: null,
  query: "",
  lens: "movies" as MediaLens,
  status: "idle",
  themes: [],
  recommendations: [],
  reasoning: "",
  confidence: 0,
  
  startExploration: (sessionId, query, lens) => set({
    sessionId, query, lens, status: "exploring", themes: [], recommendations: [], reasoning: "", confidence: 0
  }),
  
  setExplorationResults: (themes, recommendations, reasoning, confidence) => set({
    themes, recommendations, reasoning, confidence, status: "completed"
  }),
  
  setStatus: (status) => set({ status }),
  
  clearExplorationState: () => set({
    sessionId: null, query: "", status: "idle", themes: [], recommendations: [], reasoning: "", confidence: 0
  })
}));
