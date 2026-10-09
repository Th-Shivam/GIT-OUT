import { NativeSpeechError } from './types';

export function transcriptForPrompt(transcript: string): string {
  const normalized = transcript.trim();
  if (!normalized) {
    throw new NativeSpeechError('NO_SPEECH', 'The speech recognizer returned no text.');
  }
  return normalized;
}
