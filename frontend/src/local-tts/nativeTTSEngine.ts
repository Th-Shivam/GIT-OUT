import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { TTSEngine, TTSEvent } from './types';

interface NativeTTS extends Omit<TTSEngine, 'subscribe'> {
  addListener(name: 'utterance', listener: (event: TTSEvent) => void): { remove(): void };
}

export class NativeTTSEngine implements TTSEngine {
  private module: NativeTTS | null = null;

  private getModule(): NativeTTS {
    if (Platform.OS !== 'android') {
      throw new Error('Native speech output is available on Android only. Your answer remains available as text.');
    }
    this.module ??= requireOptionalNativeModule<NativeTTS>('GitOutTts');
    if (!this.module) {
      throw new Error('The Android TTS module is missing. Rebuild and install the development app, then retry speech.');
    }
    return this.module;
  }

  async initialize() { return this.getModule().initialize(); }
  async speak(id: string, text: string, language: string, voiceId: string) {
    await this.getModule().speak(id, text, language, voiceId);
  }
  async stop() { await this.module?.stop(); }
  async shutdown() { await this.module?.shutdown(); }
  subscribe(listener: (event: TTSEvent) => void) {
    const subscription = this.getModule().addListener('utterance', listener);
    return () => subscription.remove();
  }
}
