import { LocalAIError, type LocalAIEngine } from './types';

export class LocalAI {
  private loaded = false;

  constructor(private readonly engine: LocalAIEngine) {}

  async loadModel(
    modelPath: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    if (!modelPath.trim()) {
      throw new LocalAIError(
        'MODEL_FILE_MISSING',
        'Choose a local GGUF model before loading it.',
      );
    }

    if (this.loaded) {
      await this.unloadModel();
    }

    try {
      await this.engine.load(modelPath, onProgress);
      this.loaded = true;
    } catch (error) {
      this.loaded = false;
      if (error instanceof LocalAIError) {
        throw error;
      }
      throw new LocalAIError(
        'MODEL_LOAD_FAILED',
        'The local model could not be loaded on this device.',
      );
    }
  }

  isModelLoaded(): boolean {
    return this.loaded;
  }

  async generate(prompt: string): Promise<string> {
    if (!this.loaded) {
      throw new LocalAIError(
        'MODEL_NOT_LOADED',
        'Load a local model before generating a response.',
      );
    }

    if (!prompt.trim()) {
      throw new LocalAIError(
        'INVALID_PROMPT',
        'Enter a prompt before generating a response.',
      );
    }

    try {
      const response = await this.engine.generate(prompt.trim());
      if (!response.trim()) {
        throw new LocalAIError(
          'INFERENCE_FAILED',
          'The local model returned an empty response.',
        );
      }
      return response.trim();
    } catch (error) {
      if (error instanceof LocalAIError) {
        throw error;
      }
      throw new LocalAIError(
        'INFERENCE_FAILED',
        'The local model could not generate a response.',
      );
    }
  }

  async unloadModel(): Promise<void> {
    if (!this.loaded) {
      return;
    }

    await this.engine.unload();
    this.loaded = false;
  }
}
