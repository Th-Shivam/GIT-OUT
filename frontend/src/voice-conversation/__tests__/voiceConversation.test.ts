import { describe, expect, it, vi } from 'vitest';
import { LocalAI } from '../../local-ai/localAI';
import { transcriptForPrompt } from '../../local-stt/prompt';
import { LocalTTS } from '../../local-tts/localTTS';
import { deferred, fakeTTS } from '../../local-tts/__tests__/fixtures';
import { VoiceConversation } from '../voiceConversation';

describe('VoiceConversation', () => {
  it('keeps manual submit and uses the existing LocalAI flow before speaking a final answer', async () => {
    const generate = vi.fn(async () => 'A pull request proposes a change.');
    const localAI = new LocalAI({ load: async () => undefined, generate, unload: async () => undefined });
    await localAI.loadModel('file:///models/qwen.gguf');
    const speak = vi.fn(async () => undefined);
    const conversation = new VoiceConversation(localAI, { speak, stop: async () => undefined, shutdown: async () => undefined });
    const prompt = transcriptForPrompt('  Explain a pull request  ');
    expect(generate).not.toHaveBeenCalled();
    await conversation.generate(prompt);
    expect(generate).toHaveBeenCalledWith('Explain a pull request');
    expect(conversation.getSnapshot().response).toContain('proposes a change');
    expect(speak).not.toHaveBeenCalled();
    conversation.setSpeakResponse(true);
    await conversation.generate(prompt);
    expect(speak).toHaveBeenCalledWith('A pull request proposes a change.', 'en-US');
  });

  it('publishes text before synthesis, retains it on TTS failure, and can retry', async () => {
    const { engine } = fakeTTS();
    const tts = new LocalTTS(engine);
    engine.initialize.mockRejectedValueOnce(new Error('TTS initialization failed'));
    const conversation = new VoiceConversation({ generate: async () => 'Saved answer' }, tts);
    conversation.setSpeakResponse(true);
    await conversation.generate('hello');
    await vi.waitFor(() => expect(tts.getSnapshot().state).toBe('error'));
    expect(conversation.getSnapshot()).toMatchObject({ response: 'Saved answer', error: '', generating: false });
    await conversation.retrySpeech();
    expect(engine.speak.mock.calls[0][1]).toBe('Saved answer');
  });

  it('stops playback before a new generation and ignores rapid duplicate submits', async () => {
    const result = deferred<string>();
    const generate = vi.fn(() => result.promise);
    const stop = vi.fn(async () => undefined);
    const speak = vi.fn(async () => undefined);
    const conversation = new VoiceConversation({ generate }, { speak, stop, shutdown: async () => undefined });
    const first = conversation.generate('first');
    const duplicate = conversation.generate('duplicate');
    await Promise.resolve();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0]);
    result.resolve('Final');
    await Promise.all([first, duplicate]);
    expect(conversation.getSnapshot().response).toBe('Final');
  });

  it.each(['stop', 'background', 'disable', 'language', 'unmount'])(
    'suppresses stale autoplay after %s while inference is pending', async (action) => {
      const result = deferred<string>();
      const speak = vi.fn(async () => undefined);
      const shutdown = vi.fn(async () => undefined);
      const conversation = new VoiceConversation({ generate: () => result.promise }, { speak, stop: async () => undefined, shutdown });
      conversation.setSpeakResponse(true);
      const pending = conversation.generate('question');
      await Promise.resolve();
      if (action === 'stop') await conversation.stopSpeaking();
      if (action === 'background') { conversation.setForeground(false); conversation.setForeground(true); }
      if (action === 'disable') conversation.setSpeakResponse(false);
      if (action === 'language') conversation.setLanguage('de-DE');
      if (action === 'unmount') await conversation.detach();
      result.resolve('Keep as text');
      await pending;
      expect(speak).not.toHaveBeenCalled();
      if (action !== 'unmount') expect(conversation.getSnapshot().response).toBe('Keep as text');
      else expect(shutdown).toHaveBeenCalledOnce();
    },
  );

  it('keeps text inference available after a TTS stop error and skips autoplay', async () => {
    const speak = vi.fn(async () => undefined);
    const conversation = new VoiceConversation({ generate: async () => 'Still readable' }, {
      speak, stop: async () => { throw new Error('native stop error'); }, shutdown: async () => undefined,
    });
    conversation.setSpeakResponse(true);
    await conversation.generate('question');
    expect(conversation.getSnapshot().response).toBe('Still readable');
    expect(speak).not.toHaveBeenCalled();
  });

  it('does not speak empty or failed inference results', async () => {
    const speak = vi.fn(async () => undefined);
    const generate = vi.fn(async () => '').mockRejectedValueOnce(new Error('Load the local model first.'));
    const conversation = new VoiceConversation({ generate }, { speak, stop: async () => undefined, shutdown: async () => undefined });
    conversation.setSpeakResponse(true);
    await conversation.generate('hello');
    expect(conversation.getSnapshot().error).toContain('Load the local model');
    await conversation.generate('hello');
    expect(speak).not.toHaveBeenCalled();
  });

  it('does not start inference after unmount while waiting for old speech to stop', async () => {
    const stopped = deferred<void>();
    const generate = vi.fn(async () => 'Should not run');
    const conversation = new VoiceConversation({ generate }, {
      speak: async () => undefined,
      stop: () => stopped.promise,
      shutdown: async () => undefined,
    });
    const pending = conversation.generate('hello');
    await conversation.detach();
    stopped.resolve();
    await pending;
    expect(generate).not.toHaveBeenCalled();
  });
});
