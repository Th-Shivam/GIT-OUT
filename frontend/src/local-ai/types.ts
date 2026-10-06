export interface LocalAIEngine {
  load(modelPath: string, onProgress?: (progress: number) => void): Promise<void>;
  generate(prompt: string): Promise<string>;
  unload(): Promise<void>;
}

export type LocalAIErrorCode =
  | 'MODEL_FILE_MISSING'
  | 'MODEL_NOT_LOADED'
  | 'INVALID_PROMPT'
  | 'MODEL_LOAD_FAILED'
  | 'INSUFFICIENT_MEMORY'
  | 'INFERENCE_FAILED'
  | 'UNSUPPORTED_PLATFORM'
  | 'NATIVE_MODULE_UNAVAILABLE';

export class LocalAIError extends Error {
  constructor(
    public readonly code: LocalAIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocalAIError';
  }
}
