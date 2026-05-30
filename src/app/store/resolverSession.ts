import { create } from 'zustand';
import type { MediaLens } from '../mediaLens';
import type { ValidatedVisualAsset } from '../../lib/resolver/canonicalResolver';
import type { TemporaryCanonicalEntity } from '../../lib/resolver/dynamicEntityIngestion';
import type { QueryIntentV2 } from '../../intent/queryIntentClassifier';
import type { AmbiguityAnalysis } from '../../intent/ambiguityScorer';
import type { GroundingStrategy } from '../../intent/groundingStrategyEngine';
import type { CandidateUniverseGraph } from '../../intent/candidateUniverseGraph';
import type { CanonicalSuggestion } from '../../lib/resolver/canonicalGrounding';

export type QueryMode = "entity" | "exploration";

export type SessionStatus =
  | "created"
  | "grounding"
  | "retrieving"
  | "visualizing"
  | "completed"
  | "failed";

export interface QuerySessionStore {
  sessionId: string | null;
  query: string;
  lens: MediaLens;
  mode: QueryMode;
  status: SessionStatus;
  createdAt: number;
  temporaryEntities: TemporaryCanonicalEntity[];
  setSession: (sessionId: string, query: string, lens: MediaLens, mode: QueryMode) => void;
  setStatus: (status: SessionStatus) => void;
  addTemporaryEntity: (entity: TemporaryCanonicalEntity) => void;
  clearTemporaryEntities: () => void;
}

export const useQuerySessionStore = create<QuerySessionStore>((set) => ({
  sessionId: null,
  query: "",
  lens: "games" as MediaLens,
  mode: "entity",
  status: "created",
  createdAt: 0,
  temporaryEntities: [],
  setSession: (sessionId, query, lens, mode) => set({
    sessionId,
    query,
    lens,
    mode,
    status: "created",
    createdAt: Date.now()
  }),
  setStatus: (status) => set({ status }),
  addTemporaryEntity: (entity) => set((state) => {
    // Avoid duplicates
    if (state.temporaryEntities.some((t) => t.id === entity.id)) return state;
    return { temporaryEntities: [...state.temporaryEntities, entity] };
  }),
  clearTemporaryEntities: () => set({ temporaryEntities: [] })
}));

export interface ResolverStore {
  canonicalEntity?: string;
  confidence?: number;
  resolverStage: string;
  universe: string;
  setResolverState: (entity: string | undefined, confidence: number | undefined, stage: string, universe: string) => void;
  clearResolverState: () => void;
}

export const useResolverStore = create<ResolverStore>((set) => ({
  canonicalEntity: undefined,
  confidence: undefined,
  resolverStage: "idle",
  universe: "",
  setResolverState: (canonicalEntity, confidence, resolverStage, universe) => set({
    canonicalEntity, confidence, resolverStage, universe
  }),
  clearResolverState: () => set({
    canonicalEntity: undefined,
    confidence: undefined,
    resolverStage: "idle",
    universe: ""
  })
}));

export interface AutocompleteStore {
  suggestions: any[];
  requestId: string | null;
  loading: boolean;
  activeIndex: number;
  setAutocompleteState: (suggestions: any[], requestId: string | null, loading: boolean) => void;
  setActiveIndex: (index: number) => void;
  clearAutocompleteState: () => void;
}

export const useAutocompleteStore = create<AutocompleteStore>((set) => ({
  suggestions: [],
  requestId: null,
  loading: false,
  activeIndex: -1,
  setAutocompleteState: (suggestions, requestId, loading) => set({
    suggestions, requestId, loading, activeIndex: -1
  }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  clearAutocompleteState: () => set({
    suggestions: [], requestId: null, loading: false, activeIndex: -1
  })
}));

export interface VisualStore {
  poster: ValidatedVisualAsset | null;
  banner: string | null;
  status: "idle" | "loading" | "resolved" | "failed";
  source: string;
  setVisualState: (poster: ValidatedVisualAsset | null, banner: string | null, status: "idle" | "loading" | "resolved" | "failed", source: string) => void;
  clearVisualState: () => void;
}

export const useVisualStore = create<VisualStore>((set) => ({
  poster: null,
  banner: null,
  status: "idle",
  source: "",
  setVisualState: (poster, banner, status, source) => set({
    poster, banner, status, source
  }),
  clearVisualState: () => set({
    poster: null, banner: null, status: "idle", source: ""
  })
}));

export interface IntentStore {
  intent: QueryIntentV2 | null;
  ambiguity: AmbiguityAnalysis | null;
  groundingStrategy: GroundingStrategy | null;
  candidateGraph: CandidateUniverseGraph | null;
  clarificationPending: boolean;
  clarificationSuggestions: CanonicalSuggestion[];
  setIntentState: (
    intent: QueryIntentV2,
    ambiguity: AmbiguityAnalysis,
    strategy: GroundingStrategy,
    graph: CandidateUniverseGraph
  ) => void;
  setClarification: (pending: boolean, suggestions: CanonicalSuggestion[]) => void;
  clearIntentState: () => void;
}

export const useIntentStore = create<IntentStore>((set) => ({
  intent: null,
  ambiguity: null,
  groundingStrategy: null,
  candidateGraph: null,
  clarificationPending: false,
  clarificationSuggestions: [],
  setIntentState: (intent, ambiguity, groundingStrategy, candidateGraph) => set({
    intent, ambiguity, groundingStrategy, candidateGraph
  }),
  setClarification: (clarificationPending, clarificationSuggestions) => set({
    clarificationPending, clarificationSuggestions
  }),
  clearIntentState: () => set({
    intent: null,
    ambiguity: null,
    groundingStrategy: null,
    candidateGraph: null,
    clarificationPending: false,
    clarificationSuggestions: []
  })
}));

export function startNewSession(query: string, lens: MediaLens, mode: QueryMode): string {
  const sessionId = crypto.randomUUID();
  useQuerySessionStore.getState().setSession(sessionId, query, lens, mode);
  useQuerySessionStore.getState().clearTemporaryEntities();
  useResolverStore.getState().clearResolverState();
  useAutocompleteStore.getState().clearAutocompleteState();
  useVisualStore.getState().clearVisualState();
  useIntentStore.getState().clearIntentState();
  return sessionId;
}
