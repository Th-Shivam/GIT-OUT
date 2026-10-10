import { describe, expect, it } from 'vitest';
import { LocalTTS } from '../localTTS';
import { capabilities, deferred, fakeTTS } from './fixtures';

describe('LocalTTS', () => {
  it('waits for successful initialization and selects an installed non-network voice', async () => {
    const { engine, emit } = fakeTTS();
    const init = deferred<typeof capabilities>();
    const entered = deferred<void>();
    engine.initialize.mockImplementationOnce(() => { entered.resolve(); return init.promise; });
    const tts = new LocalTTS(engine);
    const speech = tts.speak('Final Qwen answer', 'en-US');
    await entered.promise;
    expect(engine.speak).not.toHaveBeenCalled();
    init.resolve(capabilities);
    await speech;
    const [id] = engine.speak.mock.calls[0];
    expect(engine.speak).toHaveBeenCalledWith(id, 'Final Qwen answer', 'en-US', 'en-US-local');
    emit({ id, state: 'speaking' });
    expect(tts.getSnapshot().state).toBe('speaking');
    emit({ id, state: 'completed' });
    expect(tts.getSnapshot().state).toBe('completed');
  });

  it('reports initialization failure and permits an explicit retry', async () => {
    const { engine } = fakeTTS();
    engine.initialize.mockRejectedValueOnce(new Error('Enable Android TTS in Settings.'));
    const tts = new LocalTTS(engine);
    await expect(tts.prepare('en-US')).rejects.toThrow('Enable Android TTS');
    expect(tts.getSnapshot()).toMatchObject({ state: 'error', error: 'Enable Android TTS in Settings.' });
    expect(engine.speak).not.toHaveBeenCalled();
    await tts.prepare('en-US');
    expect(tts.getSnapshot().state).toBe('ready');
  });

  it.each(['fr-FR', 'en-GB', ''])('rejects unavailable exact language %s without switching voices', async (language) => {
    const { engine } = fakeTTS();
    const tts = new LocalTTS(engine);
    await expect(tts.speak('Answer', language)).rejects.toThrow('No installed non-network');
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('rejects a language advertised only by network or not-installed voices', async () => {
    const { engine } = fakeTTS();
    engine.initialize.mockResolvedValue({ ...capabilities, voices: capabilities.voices.slice(0, 2) });
    await expect(new LocalTTS(engine).speak('Answer', 'en-US')).rejects.toThrow('No installed non-network');
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('rejects empty and over-limit text without synthesis', async () => {
    const { engine } = fakeTTS();
    const tts = new LocalTTS(engine);
    await expect(tts.speak('  ', 'en-US')).rejects.toThrow('no response');
    await expect(tts.speak('a'.repeat(4001), 'en-US')).rejects.toThrow('speech limit');
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('stops current speech and ignores late completion/error events', async () => {
    const { engine, emit } = fakeTTS();
    const tts = new LocalTTS(engine);
    await tts.speak('Answer', 'en-US');
    const [id] = engine.speak.mock.calls[0];
    emit({ id, state: 'speaking' });
    await tts.stop();
    expect(engine.stop).toHaveBeenCalledTimes(2);
    emit({ id, state: 'error', message: 'late error' });
    expect(tts.getSnapshot()).toMatchObject({ state: 'stopped', error: '' });
  });

  it('invalidates pending initialization when stopped, preventing delayed autoplay', async () => {
    const { engine } = fakeTTS();
    const init = deferred<typeof capabilities>();
    const entered = deferred<void>();
    engine.initialize.mockImplementationOnce(() => { entered.resolve(); return init.promise; });
    const tts = new LocalTTS(engine);
    const speech = tts.speak('Stale answer', 'en-US');
    await entered.promise;
    const stop = tts.stop();
    init.resolve(capabilities);
    await Promise.all([speech, stop]);
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('serializes replacement speech and ignores old utterance callbacks', async () => {
    const { engine, emit } = fakeTTS();
    const accepted = deferred<void>();
    const entered = deferred<void>();
    engine.speak.mockImplementationOnce(() => { entered.resolve(); return accepted.promise; });
    const tts = new LocalTTS(engine);
    const first = tts.speak('First', 'en-US');
    await entered.promise;
    const second = tts.speak('Second', 'en-US');
    expect(engine.speak).toHaveBeenCalledTimes(1);
    accepted.resolve();
    await Promise.all([first, second]);
    const oldId = engine.speak.mock.calls[0][0];
    const newId = engine.speak.mock.calls[1][0];
    expect(engine.stop.mock.invocationCallOrder[1]).toBeLessThan(engine.speak.mock.invocationCallOrder[1]);
    emit({ id: newId, state: 'speaking' });
    emit({ id: oldId, state: 'completed' });
    expect(tts.getSnapshot().state).toBe('speaking');
  });

  it('surfaces native synthesis and stop errors and never overlaps after a stop failure', async () => {
    const { engine, emit } = fakeTTS();
    const tts = new LocalTTS(engine);
    await tts.speak('Answer', 'en-US');
    emit({ id: engine.speak.mock.calls[0][0], state: 'error', message: 'Voice data unavailable; retry.' });
    expect(tts.getSnapshot()).toMatchObject({ state: 'error', error: 'Voice data unavailable; retry.' });
    engine.stop.mockRejectedValueOnce(new Error('Stop failed'));
    await expect(tts.speak('Next', 'en-US')).rejects.toThrow('Stop failed');
    expect(engine.speak).toHaveBeenCalledTimes(1);
  });

  it('releases resources and subscriptions on shutdown, including pending speech', async () => {
    const { engine, listeners } = fakeTTS();
    const tts = new LocalTTS(engine);
    await tts.prepare('en-US');
    const speech = tts.speak('Never started', 'en-US');
    const shutdown = tts.shutdown();
    await Promise.all([speech, shutdown]);
    expect(engine.speak).not.toHaveBeenCalled();
    expect(engine.shutdown).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });

  it('backgrounding cancels initialization but preserves an active native utterance', async () => {
    const { engine, emit } = fakeTTS();
    const tts = new LocalTTS(engine);
    const init = deferred<typeof capabilities>();
    const entered = deferred<void>();
    engine.initialize.mockImplementationOnce(() => { entered.resolve(); return init.promise; });
    const pending = tts.speak('Stale', 'en-US');
    await entered.promise;
    tts.cancelPendingSpeech();
    init.resolve(capabilities);
    await pending;
    expect(engine.speak).not.toHaveBeenCalled();
    await tts.speak('Active', 'en-US');
    emit({ id: engine.speak.mock.calls[0][0], state: 'speaking' });
    const stops = engine.stop.mock.calls.length;
    tts.cancelPendingSpeech();
    expect(tts.getSnapshot().state).toBe('speaking');
    expect(engine.stop).toHaveBeenCalledTimes(stops);
  });

  it('marks accepted native speech active before the first progress callback', async () => {
    const { engine } = fakeTTS();
    const tts = new LocalTTS(engine);

    await tts.speak('Accepted answer', 'en-US');

    expect(tts.getSnapshot().state).toBe('speaking');
  });
});
