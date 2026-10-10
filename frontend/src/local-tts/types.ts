export interface TTSVoice {
  id: string;
  language: string;
  networkRequired: boolean;
  installed: boolean;
}

export interface TTSCapabilities {
  voices: TTSVoice[];
  maxSpeechInputLength: number;
}

export interface TTSEvent {
  id: string;
  state: 'speaking' | 'completed' | 'stopped' | 'error';
  message?: string;
}

export interface TTSEngine {
  initialize(): Promise<TTSCapabilities>;
  speak(id: string, text: string, language: string, voiceId: string): Promise<void>;
  stop(): Promise<void>;
  shutdown(): Promise<void>;
  subscribe(listener: (event: TTSEvent) => void): () => void;
}

export interface TTSSnapshot {
  state: 'idle' | 'preparing' | 'ready' | 'speaking' | 'completed' | 'stopped' | 'error';
  voices: TTSVoice[];
  voice: TTSVoice | null;
  error: string;
}

export function ttsErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Android TTS failed. Check installed voice data in Android Settings and retry.';
}
