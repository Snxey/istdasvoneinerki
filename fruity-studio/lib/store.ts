import { create } from 'zustand';
import type { Character, Project, AppSettings, StoryboardSlot, GenerationStatus } from './types';
import { DEFAULT_SETTINGS } from './types';

interface AppStore {
  // Characters
  characters: Character[];
  setCharacters: (chars: Character[]) => void;
  upsertCharacter: (char: Character) => void;
  removeCharacter: (id: string) => void;

  // Current project
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  updateSlot: (slotId: string, updates: Partial<StoryboardSlot>) => void;
  updateSlotStatus: (slotId: string, status: GenerationStatus, error?: string) => void;
  updateSlotImage: (slotId: string, blob: Blob, seed: number) => void;
  updatePrompt: (sceneIndex: number, rawText: string, enhancedPrompt: string) => void;

  // Settings
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;

  // Global generation state
  generatingCount: number;
  incrementGenerating: () => void;
  decrementGenerating: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  characters: [],
  setCharacters: (chars) => set({ characters: chars }),
  upsertCharacter: (char) =>
    set((state) => {
      const idx = state.characters.findIndex((c) => c.id === char.id);
      if (idx >= 0) {
        const updated = [...state.characters];
        updated[idx] = char;
        return { characters: updated };
      }
      return { characters: [...state.characters, char] };
    }),
  removeCharacter: (id) =>
    set((state) => ({ characters: state.characters.filter((c) => c.id !== id) })),

  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),
  updateSlot: (slotId, updates) =>
    set((state) => {
      if (!state.currentProject) return {};
      const slots = state.currentProject.slots.map((s) =>
        s.id === slotId ? { ...s, ...updates } : s,
      );
      return { currentProject: { ...state.currentProject, slots } };
    }),
  updateSlotStatus: (slotId, status, error) =>
    set((state) => {
      if (!state.currentProject) return {};
      const slots = state.currentProject.slots.map((s) =>
        s.id === slotId
          ? { ...s, status, errorMessage: error ?? s.errorMessage }
          : s,
      );
      return { currentProject: { ...state.currentProject, slots } };
    }),
  updateSlotImage: (slotId, blob, seed) =>
    set((state) => {
      if (!state.currentProject) return {};
      const slots = state.currentProject.slots.map((s) =>
        s.id === slotId
          ? { ...s, imageBlob: blob, seed, status: 'ready' as GenerationStatus, generatedAt: Date.now(), errorMessage: undefined }
          : s,
      );
      return { currentProject: { ...state.currentProject, slots } };
    }),
  updatePrompt: (sceneIndex, rawText, enhancedPrompt) =>
    set((state) => {
      if (!state.currentProject) return {};
      const parsedPrompts = state.currentProject.parsedPrompts.map((p) =>
        p.index === sceneIndex ? { ...p, rawText, enhancedPrompt } : p,
      );
      const slots = state.currentProject.slots.map((s) =>
        s.sceneIndex === sceneIndex
          ? { ...s, prompt: rawText, enhancedPrompt }
          : s,
      );
      return { currentProject: { ...state.currentProject, parsedPrompts, slots } };
    }),

  settings: { ...DEFAULT_SETTINGS },
  setSettings: (settings) => set({ settings }),

  generatingCount: 0,
  incrementGenerating: () => set((state) => ({ generatingCount: state.generatingCount + 1 })),
  decrementGenerating: () =>
    set((state) => ({ generatingCount: Math.max(0, state.generatingCount - 1) })),
}));
