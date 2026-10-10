import type { LocalAI } from '../local-ai/localAI';
import type { LocalTTS } from '../local-tts/localTTS';

export interface ConversationSnapshot {
  response: string;
  generating: boolean;
  error: string;
  speakResponse: boolean;
  language: string;
}

/** Coordinates final answers only; LocalAI remains the sole inference service. */
export class VoiceConversation {
  private snapshot: ConversationSnapshot = {
    response: '', generating: false, error: '', speakResponse: false, language: 'en-US',
  };
  private listeners = new Set<() => void>();
  private speechRevision = 0;
  private foreground = true;
  private attached = true;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly localAI: Pick<LocalAI, 'generate'>,
    private readonly tts: Pick<LocalTTS, 'speak' | 'stop' | 'shutdown'>,
  ) {}

  getSnapshot = (): ConversationSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(change: Partial<ConversationSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener());
  }

  clearResponse() { this.update({ response: '', error: '' }); }
  setSpeakResponse(enabled: boolean) {
    this.update({ speakResponse: enabled });
    if (!enabled) void this.stopSpeaking().catch(() => undefined);
  }
  setLanguage(language: string) {
    this.update({ language });
    void this.stopSpeaking().catch(() => undefined);
  }

  stopSpeaking(): Promise<void> {
    ++this.speechRevision;
    return this.tts.stop();
  }

  generate(prompt: string): Promise<void> {
    // A synchronous guard covers double taps before React renders disabled controls.
    if (this.snapshot.generating || !this.attached || !this.foreground) return this.pending;
    const revision = ++this.speechRevision;
    this.update({ generating: true, error: '' });
    this.pending = (async () => {
      // A TTS error must never prevent local text inference.
      let stopped = true;
      try { await this.tts.stop(); } catch { stopped = false; }
      try {
        if (!this.attached) return;
        const response = await this.localAI.generate(prompt);
        if (!this.attached) return;
        this.update({ response });
        if (stopped && response.trim() && this.foreground && this.snapshot.speakResponse && revision === this.speechRevision) {
          // LocalTTS owns synthesis errors; text has already been published.
          void this.tts.speak(response, this.snapshot.language).catch(() => undefined);
        }
      } catch (error) {
        if (this.attached) this.update({ error: error instanceof Error ? error.message : 'Local inference failed. Retry your prompt.' });
      } finally {
        if (this.attached) this.update({ generating: false });
      }
    })();
    return this.pending;
  }

  async retrySpeech(): Promise<void> {
    if (!this.attached || !this.foreground || this.snapshot.generating) return;
    ++this.speechRevision;
    await this.tts.speak(this.snapshot.response, this.snapshot.language);
  }

  setForeground(foreground: boolean) {
    this.foreground = foreground;
    if (!foreground) void this.stopSpeaking().catch(() => undefined);
  }

  // React development builds can mount/cleanup/mount effects on the same instance.
  attach() { this.attached = true; }
  detach(): Promise<void> {
    this.attached = false;
    ++this.speechRevision;
    return this.tts.shutdown();
  }
  whenIdle(): Promise<void> { return this.pending; }
}
