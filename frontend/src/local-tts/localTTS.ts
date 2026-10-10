import {
  ttsErrorMessage,
  type TTSEngine,
  type TTSSnapshot,
  type TTSVoice,
  type TTSMediaEvent,
} from './types';

function selectVoice(voices: TTSVoice[], language: string): TTSVoice {
  const requested = language.trim().replace(/_/g, '-').toLowerCase();
  const voice = voices.find((candidate) =>
    candidate.installed && !candidate.networkRequired &&
    candidate.language.toLowerCase() === requested,
  );
  if (!requested || !voice) {
    throw new Error(`No installed non-network TTS voice for ${language || 'this language'}. Choose an installed language or install voice data in Android Text-to-speech settings, then retry.`);
  }
  return voice;
}

/** Serializes native commands; revision checks invalidate work waiting on initialization. */
export class LocalTTS {
  private revision = 0;
  private tail: Promise<void> = Promise.resolve();
  private activeId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private snapshot: TTSSnapshot = { state: 'idle', voices: [], voice: null, error: '' };

  constructor(private readonly engine: TTSEngine) {}

  getSnapshot = (): TTSSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  subscribeMedia(listener: (event: TTSMediaEvent) => void): () => void {
    return this.engine.subscribeMedia?.(listener) ?? (() => undefined);
  }

  setPocketControls(enabled: boolean): Promise<void> {
    return this.engine.setPocketControls?.(enabled) ?? Promise.resolve();
  }

  cancelPendingSpeech() {
    if (this.snapshot.state === 'preparing') void this.stop().catch(() => undefined);
  }

  private update(change: Partial<TTSSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener());
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const task = this.tail.then(operation);
    this.tail = task.catch(() => undefined);
    return task;
  }

  private listen() {
    this.unsubscribe ??= this.engine.subscribe((event) => {
      if (event.id !== this.activeId) return;
      if (event.state !== 'speaking') this.activeId = null;
      this.update({ state: event.state, error: event.state === 'error' ? (event.message || 'Android TTS synthesis failed. Retry speech.') : '' });
    });
  }

  private prepareOrSpeak(language: string, text?: string): Promise<void> {
    const revision = ++this.revision;
    this.activeId = null;
    this.update({ state: 'preparing', voice: null, error: '' });
    return this.enqueue(async () => {
      if (revision !== this.revision) return;
      try {
        await this.engine.stop();
        if (revision !== this.revision) return;
        if (text !== undefined && !text.trim()) throw new Error('There is no response to speak. Generate an answer first.');
        this.listen();
        const capabilities = await this.engine.initialize();
        if (revision !== this.revision) return;
        this.update({ voices: capabilities.voices });
        const voice = selectVoice(capabilities.voices, language);
        this.update({ voice });
        if (text === undefined) {
          this.update({ state: 'ready' });
          return;
        }
        if (text.length > capabilities.maxSpeechInputLength) {
          throw new Error(`This answer exceeds Android's ${capabilities.maxSpeechInputLength}-character speech limit. Read the text or request a shorter answer.`);
        }
        this.activeId = `git-out-${revision}`;
        await this.engine.speak(this.activeId, text.trim(), voice.language, voice.id);
        // Native speak() returns once the utterance is accepted, before some
        // engines deliver onStart. Treat it as active so a background event
        // cannot cancel speech that has already started at the platform layer.
        if (revision === this.revision && this.snapshot.state === 'preparing') {
          this.update({ state: 'speaking' });
        }
      } catch (error) {
        if (revision !== this.revision) return;
        this.activeId = null;
        this.update({ state: 'error', error: ttsErrorMessage(error) });
        throw error;
      }
    });
  }

  prepare(language: string): Promise<void> { return this.prepareOrSpeak(language); }
  speak(text: string, language: string): Promise<void> { return this.prepareOrSpeak(language, text); }

  stop(): Promise<void> {
    const revision = ++this.revision;
    this.activeId = null;
    this.update({ state: 'stopped', error: '' });
    return this.enqueue(async () => {
      try { await this.engine.stop(); } catch (error) {
        if (revision === this.revision) this.update({ state: 'error', error: ttsErrorMessage(error) });
        throw error;
      }
    });
  }

  shutdown(): Promise<void> {
    ++this.revision;
    this.activeId = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.update({ state: 'idle', voice: null });
    return this.enqueue(() => this.engine.shutdown());
  }
}
