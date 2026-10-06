import { describe, expect, it } from 'vitest';

import { LocalAI } from '../localAI';
import { LocalAIError, type LocalAIEngine } from '../types';

class FakeEngine implements LocalAIEngine {
  loadedPath: string | null = null;
  generatedPrompt: string | null = null;

  async load(modelPath: string): Promise<void> {
    this.loadedPath = modelPath;
  }

  async generate(prompt: string): Promise<string> {
    this.generatedPrompt = prompt;
    return 'A pull request proposes changes for review.';
  }

  async unload(): Promise<void> {
    this.loadedPath = null;
  }
}

describe('LocalAI', () => {
  it('starts unloaded and rejects generation before loading', async () => {
    const localAI = new LocalAI(new FakeEngine());

    expect(localAI.isModelLoaded()).toBe(false);
    await expect(localAI.generate('Hello')).rejects.toMatchObject({
      code: 'MODEL_NOT_LOADED',
    });
  });

  it('rejects a missing model path', async () => {
    const localAI = new LocalAI(new FakeEngine());

    await expect(localAI.loadModel('')).rejects.toMatchObject({
      code: 'MODEL_FILE_MISSING',
    });
  });

  it('loads and generates through the runtime abstraction', async () => {
    const engine = new FakeEngine();
    const localAI = new LocalAI(engine);

    await localAI.loadModel('file:///models/test.gguf');
    const response = await localAI.generate('Explain a pull request');

    expect(localAI.isModelLoaded()).toBe(true);
    expect(engine.loadedPath).toBe('file:///models/test.gguf');
    expect(engine.generatedPrompt).toBe('Explain a pull request');
    expect(response).toContain('pull request');
  });

  it('unloads the model and rejects later generation', async () => {
    const localAI = new LocalAI(new FakeEngine());

    await localAI.loadModel('file:///models/test.gguf');
    await localAI.unloadModel();

    expect(localAI.isModelLoaded()).toBe(false);
    await expect(localAI.generate('Hello')).rejects.toBeInstanceOf(LocalAIError);
  });

  it('maps runtime failures to a user-safe load error', async () => {
    const failingEngine: LocalAIEngine = {
      load: async () => {
        throw new Error('native allocation stack trace');
      },
      generate: async () => 'never reached',
      unload: async () => undefined,
    };
    const localAI = new LocalAI(failingEngine);

    await expect(localAI.loadModel('file:///models/test.gguf')).rejects.toEqual(
      expect.objectContaining({
        code: 'MODEL_LOAD_FAILED',
        message: 'The local model could not be loaded on this device.',
      }),
    );
  });
});
