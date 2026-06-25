import { create } from 'zustand';

export interface ModelSummary {
  id: string;
  name: string;
  description: string;
  coverImageUrl: string | null;
  runCount: number;
  warm: boolean;
  pricing: 'output' | 'usage';
  price: { kind: string; usd: number } | null;
}

export interface ModelDetail {
  id: string;
  name: string;
  coverImageUrl: string | null;
  warm: boolean;
  versionId: string;
  inputSchema: Record<string, unknown> | null;
}

export interface CategoryDefinition {
  key: string;
  medium: 'image' | 'video' | 'audio';
  label: string;
  collectionSlug?: string;
  execution: 'sync' | 'async' | 'local';
}

export interface EstimateResult {
  usd: number;
  basis: string;
  approximate: boolean;
}

export interface RunResult {
  kind: 'image' | 'video' | 'audio' | 'text';
  urls?: string[];
  text?: string;
  segments?: Array<{ text: string; start?: number; end?: number }>;
  jobId?: string;
}

type RunState = 'idle' | 'running' | 'success' | 'error';

interface ReplicateState {
  selectedCategory: string | null;
  showCommunity: boolean;
  models: ModelSummary[];
  selectedModel: ModelDetail | null;
  formInput: Record<string, unknown>;
  estimate: EstimateResult | null;
  runState: RunState;
  result: RunResult | null;
  error: string | null;
  saveFolderId: string | null;
  history: Array<{ jobId: string; modelId: string; createdAt: Date }>;
  setCategory: (category: string | null) => void;
  setShowCommunity: (show: boolean) => void;
  setModels: (models: ModelSummary[]) => void;
  setSelectedModel: (model: ModelDetail | null) => void;
  setFormInput: (input: Record<string, unknown>) => void;
  updateFormField: (key: string, value: unknown) => void;
  setEstimate: (estimate: EstimateResult | null) => void;
  setRunState: (state: RunState) => void;
  setResult: (result: RunResult | null) => void;
  setError: (error: string | null) => void;
  setSaveFolderId: (id: string | null) => void;
  addToHistory: (entry: { jobId: string; modelId: string }) => void;
  reset: () => void;
}

const initialState: Pick<ReplicateState, 'selectedCategory' | 'showCommunity' | 'models' | 'selectedModel' | 'formInput' | 'estimate' | 'runState' | 'result' | 'error' | 'saveFolderId' | 'history'> = {
  selectedCategory: null,
  showCommunity: false,
  models: [],
  selectedModel: null,
  formInput: {},
  estimate: null,
  runState: 'idle' as RunState,
  result: null,
  error: null,
  saveFolderId: null,
  history: [],
};

export const useReplicateStore = create<ReplicateState>((set, get) => ({
  ...initialState,

  setCategory: (category) => {
    set({
      selectedCategory: category,
      models: [],
      selectedModel: null,
      formInput: {},
      estimate: null,
    });
  },

  setShowCommunity: (show) => set({ showCommunity: show }),

  setModels: (models) => set({ models }),

  setSelectedModel: (model) => set({ selectedModel: model, formInput: {} }),

  setFormInput: (input) => set({ formInput: input }),

  updateFormField: (key, value) => {
    set({ formInput: { ...get().formInput, [key]: value } });
  },

  setEstimate: (estimate) => set({ estimate }),

  setRunState: (state) => set({ runState: state }),

  setResult: (result) => set({ result }),

  setError: (error) => set({ error }),

  setSaveFolderId: (id) => set({ saveFolderId: id }),

  addToHistory: (entry) => {
    set({
      history: [
        { ...entry, createdAt: new Date() },
        ...get().history,
      ].slice(0, 50),
    });
  },

  reset: () => set(initialState),
}));
