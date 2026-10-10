import { vi } from 'vitest';
import type { TTSCapabilities, TTSEngine, TTSEvent } from '../types';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export const capabilities: TTSCapabilities = {
  maxSpeechInputLength: 4000,
  voices: [
    { id: 'en-US-network', language: 'en-US', networkRequired: true, installed: true },
    { id: 'en-US-missing', language: 'en-US', networkRequired: false, installed: false },
    { id: 'en-US-local', language: 'en-US', networkRequired: false, installed: true },
  ],
};

export function fakeTTS() {
  const listeners = new Set<(event: TTSEvent) => void>();
  const engine = {
    initialize: vi.fn(async () => capabilities),
    speak: vi.fn<TTSEngine['speak']>(async () => undefined),
    stop: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
    subscribe: vi.fn((listener: (event: TTSEvent) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }),
  } satisfies TTSEngine;
  return {
    engine,
    emit: (event: TTSEvent) => listeners.forEach((listener) => listener(event)),
    listeners,
  };
}
