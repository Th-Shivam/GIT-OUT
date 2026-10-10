import { describe, expect, it } from 'vitest';

import { AndroidSpeechRecognizer } from '../speechRecognizer';
import type {
  SpeechRecognitionModule,
  SpeechRecognitionSubscription,
} from '../types';

class FakeModule implements SpeechRecognitionModule {
  listeners = new Map<string, Set<(event?: any) => void>>();
  permissionGranted = true;
  onDeviceAvailable = true;
  installedLocales = ['en-US'];
  startOptions: Parameters<SpeechRecognitionModule['start']>[0] | null = null;

  requestMicrophonePermissionsAsync = async () => ({ granted: this.permissionGranted });

  supportsOnDeviceRecognition = () => this.onDeviceAvailable;

  getSupportedLocales = async () => ({
    locales: this.installedLocales,
    installedLocales: this.installedLocales,
  });

  addListener(event: string, listener: (event?: any) => void): SpeechRecognitionSubscription {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return { remove: () => listeners.delete(listener) };
  }

  start(options: Parameters<SpeechRecognitionModule['start']>[0]) {
    this.startOptions = options;
  }

  stop() {
    this.emit('end');
  }

  abort() {
    this.emit('error', { error: 'aborted', message: 'Cancelled.' });
  }

  emit(event: string, payload?: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

const androidApi34 = { os: 'android', version: 34 };

describe('AndroidSpeechRecognizer', () => {
  it('rejects when on-device recognition is unavailable', async () => {
    const module = new FakeModule();
    module.onDeviceAvailable = false;
    const recognizer = new AndroidSpeechRecognizer(module, androidApi34);

    await expect(recognizer.start('en-US')).rejects.toMatchObject({
      code: 'ON_DEVICE_UNAVAILABLE',
    });
    expect(module.startOptions).toBeNull();
  });

  it('rejects denied microphone permission', async () => {
    const module = new FakeModule();
    module.permissionGranted = false;
    const recognizer = new AndroidSpeechRecognizer(module, androidApi34);

    await expect(recognizer.start('en-US')).rejects.toMatchObject({
      code: 'MICROPHONE_PERMISSION_DENIED',
    });
  });

  it('rejects a language without an installed offline model', async () => {
    const module = new FakeModule();
    module.installedLocales = ['de-DE'];
    const recognizer = new AndroidSpeechRecognizer(module, androidApi34);

    await expect(recognizer.start('en-US')).rejects.toMatchObject({
      code: 'LANGUAGE_UNAVAILABLE',
    });
  });

  it('returns a final transcript and forces explicit on-device recognition', async () => {
    const module = new FakeModule();
    const recognizer = new AndroidSpeechRecognizer(module, androidApi34);
    const partial: string[] = [];
    const session = await recognizer.start('en-US', (value) => partial.push(value));

    module.emit('result', { isFinal: false, results: [{ transcript: 'Explain a' }] });
    module.emit('result', {
      isFinal: true,
      results: [{ transcript: 'Explain a pull request' }],
    });

    await expect(session.promise).resolves.toBe('Explain a pull request');
    expect(partial).toEqual(['Explain a', 'Explain a pull request']);
    expect(module.startOptions).toMatchObject({
      lang: 'en-US',
      requiresOnDeviceRecognition: true,
    });
  });

  it('does not open the microphone after cancellation during the permission prompt', async () => {
    const module = new FakeModule();
    let cancelled = false;
    module.requestMicrophonePermissionsAsync = async () => {
      cancelled = true;
      return { granted: true };
    };
    const recognizer = new AndroidSpeechRecognizer(module, androidApi34);
    await expect(recognizer.start('en-US', undefined, () => cancelled)).rejects.toMatchObject({ code: 'ABORTED' });
    expect(module.startOptions).toBeNull();
  });

  it('cancels without relying on a native error event and preserves the on-device path on retry', async () => {
    const module = new FakeModule();
    module.abort = () => undefined;
    const recognizer = new AndroidSpeechRecognizer(module, androidApi34);
    const session = await recognizer.start('en-US');
    const failure = expect(session.promise).rejects.toMatchObject({ code: 'ABORTED' });
    session.cancel();
    await failure;
    const retry = await recognizer.start('en-US');
    module.emit('result', { isFinal: true, results: [{ transcript: 'Retry prompt' }] });
    await expect(retry.promise).resolves.toBe('Retry prompt');
    expect(module.startOptions?.requiresOnDeviceRecognition).toBe(true);
  });
});
