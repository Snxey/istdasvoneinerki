export interface Character {
  id: string;
  name: string;
  description: string;
  referenceImage?: string; // base64, stored in IndexedDB
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type GenerationStatus = 'empty' | 'generating' | 'ready' | 'approved' | 'failed';
export type GenerationProvider = 'pollinations' | 'huggingface';
export type PollinationsModel = 'flux' | 'flux-realism' | 'turbo';
export type ImageDimension = '1024x1024' | '1024x1792' | '1792x1024';

export interface ScenePrompt {
  id: string;
  index: number;
  rawText: string;           // extracted from script
  enhancedPrompt: string;    // with character descriptions injected
  attachedCharacterIds: string[];
}

export interface StoryboardSlot {
  id: string;
  sceneIndex: number;
  prompt: string;
  enhancedPrompt: string;
  status: GenerationStatus;
  imageBlob?: Blob;
  seed?: number;
  provider?: GenerationProvider;
  model?: PollinationsModel;
  errorMessage?: string;
  generatedAt?: number;
}

export interface Project {
  id: string;
  name: string;
  script: string;
  parsedPrompts: ScenePrompt[];
  slots: StoryboardSlot[];
  characterSnapshot: Character[];
  thumbnailBlob?: Blob;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  defaultProvider: GenerationProvider;
  huggingfaceToken: string;
  defaultDimension: ImageDimension;
  defaultModel: PollinationsModel;
}

export interface GenerationRequest {
  prompt: string;
  seed?: number;
  model?: PollinationsModel;
  provider?: GenerationProvider;
  width?: number;
  height?: number;
}

export interface GenerationResult {
  blob: Blob;
  seed: number;
  provider: GenerationProvider;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultProvider: 'pollinations',
  huggingfaceToken: '',
  defaultDimension: '1024x1024',
  defaultModel: 'flux',
};

export const DIMENSION_MAP: Record<ImageDimension, { width: number; height: number }> = {
  '1024x1024': { width: 1024, height: 1024 },
  '1024x1792': { width: 1024, height: 1792 },
  '1792x1024': { width: 1792, height: 1024 },
};
