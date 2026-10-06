import { Platform } from 'react-native';
import { initLlama, type LlamaContext } from 'llama.rn';
import * as FileSystem from 'expo-file-system/legacy';

import { LocalAIError, type LocalAIEngine } from './types';

const SYSTEM_PROMPT =
  'You are Git Out, a concise local AI companion for developers. ' +
  'Answer conversationally and do not claim access to remote services.';

const STOP_WORDS = [
  '</s>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
];

function nativeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

export class LlamaRNEngine implements LocalAIEngine {
  private context: LlamaContext | null = null;

  async load(
    modelPath: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new LocalAIError(
        'UNSUPPORTED_PLATFORM',
        'This local AI spike currently supports Android only.',
      );
    }

    const modelInfo = await FileSystem.getInfoAsync(modelPath);
    if (!modelInfo.exists) {
      throw new LocalAIError(
        'MODEL_FILE_MISSING',
        'The selected GGUF model file is no longer available.',
      );
    }

    try {
      this.context = await initLlama(
        {
          model: modelPath,
          n_ctx: 2048,
          n_batch: 256,
          n_gpu_layers: 0,
          use_mlock: false,
        },
        onProgress,
      );
    } catch (error) {
      const message = nativeErrorMessage(error);
      if (message.includes('memory') || message.includes('alloc')) {
        throw new LocalAIError(
          'INSUFFICIENT_MEMORY',
          'This model needs more memory than the device can provide.',
        );
      }
      if (message.includes('jsi') || message.includes('native')) {
        throw new LocalAIError(
          'NATIVE_MODULE_UNAVAILABLE',
          'The local inference native module is unavailable in this build.',
        );
      }
      throw new LocalAIError(
        'MODEL_LOAD_FAILED',
        'The GGUF model failed to load on this device.',
      );
    }
  }

  async generate(prompt: string): Promise<string> {
    if (!this.context) {
      throw new LocalAIError(
        'MODEL_NOT_LOADED',
        'Load a local model before generating a response.',
      );
    }

    try {
      await this.context.clearCache(true);
      const result = await this.context.completion({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        n_predict: 128,
        temperature: 0.7,
        top_p: 0.9,
        stop: STOP_WORDS,
        enable_thinking: false,
      });
      return result.text;
    } catch {
      throw new LocalAIError(
        'INFERENCE_FAILED',
        'The local model could not generate a response.',
      );
    }
  }

  async unload(): Promise<void> {
    if (this.context) {
      await this.context.release();
      this.context = null;
    }
  }
}
