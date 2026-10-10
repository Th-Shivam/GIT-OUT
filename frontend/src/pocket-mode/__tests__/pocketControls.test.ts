import { describe, expect, it } from 'vitest';
import { pocketAction, pocketState, PocketCommandGate, type PocketState } from '../pocketControls';

describe('Pocket controls', () => {
  it('represents a full one-shot voice turn and recovery', () => {
    const idle = { listening: false, transcribing: false, thinking: false, speaking: false, error: '' };
    const states = [idle, { ...idle, listening: true }, { ...idle, transcribing: true },
      { ...idle, thinking: true }, { ...idle, speaking: true }, idle,
      { ...idle, error: 'Install voice data' }, idle];
    expect(states.map(pocketState)).toEqual(['Ready', 'Listening', 'Transcribing', 'Thinking', 'Speaking', 'Ready', 'Error', 'Ready']);
  });

  it.each<[PocketState, string]>([
    ['Ready', 'record'], ['Error', 'record'], ['Listening', 'finish'],
    ['Transcribing', 'none'], ['Thinking', 'none'], ['Speaking', 'stop'],
  ])('maps toggle in %s to %s', (state, result) => {
    expect(pocketAction('toggle', state, true)).toBe(result);
  });

  it('never uses pause to open the mic, or play to stop current speech', () => {
    expect(pocketAction('pause', 'Ready', true)).toBe('none');
    expect(pocketAction('play', 'Speaking', true)).toBe('none');
    expect(pocketAction('play', 'Listening', true)).toBe('none');
  });

  it('rejects background microphone commands while preserving stop/interruption', () => {
    expect(pocketAction('play', 'Ready', false)).toBe('none');
    expect(pocketAction('toggle', 'Ready', false)).toBe('none');
    expect(pocketAction('toggle', 'Speaking', false)).toBe('stop');
    expect(pocketAction('stop', 'Thinking', false)).toBe('stop');
    expect(pocketAction('interrupt', 'Listening', false)).toBe('stop');
  });

  it('debounces duplicate headset events without swallowing Stop', () => {
    const gate = new PocketCommandGate();
    expect(gate.accept('1', 'toggle', 0)).toBe(true);
    expect(gate.accept('1', 'toggle', 700)).toBe(false);
    expect(gate.accept('2', 'toggle', 100)).toBe(false);
    expect(gate.accept('3', 'stop', 200)).toBe(true);
    expect(gate.accept('4', 'toggle', 300)).toBe(false);
    expect(gate.accept('5', 'toggle', 1000)).toBe(true);
  });
});
