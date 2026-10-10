export type PocketState = 'Ready' | 'Checking' | 'Listening' | 'Transcribing' | 'Thinking' | 'Speaking' | 'Error';
export type MediaAction = 'play' | 'pause' | 'toggle' | 'stop' | 'interrupt';
export type PocketAction = 'record' | 'finish' | 'stop' | 'none';

export interface PocketStatus {
  checking: boolean;
  listening: boolean;
  transcribing: boolean;
  thinking: boolean;
  speaking: boolean;
  error: string;
}

export function pocketState(status: PocketStatus): PocketState {
  if (status.listening) return 'Listening';
  if (status.transcribing) return 'Transcribing';
  if (status.checking) return 'Checking';
  if (status.thinking) return 'Thinking';
  if (status.speaking) return 'Speaking';
  return status.error ? 'Error' : 'Ready';
}

/** No media action is ever allowed to open a microphone in the background. */
export function pocketAction(action: MediaAction, state: PocketState, foreground: boolean): PocketAction {
  if (action === 'stop' || action === 'interrupt') return 'stop';
  if (state === 'Speaking') return action === 'play' ? 'none' : 'stop';
  if (!foreground) return 'none';
  if (state === 'Listening') return action === 'play' ? 'none' : 'finish';
  if (state === 'Checking' || state === 'Thinking' || state === 'Transcribing' || action === 'pause') return 'none';
  return 'record';
}

/** Handles repeated deliveries/held buttons without delaying an explicit Stop. */
export class PocketCommandGate {
  private lastId = '';
  private lastTime = -Infinity;

  accept(id: string, action: MediaAction, now: number): boolean {
    if (id === this.lastId) return false;
    this.lastId = id;
    if (action !== 'stop' && action !== 'interrupt' && now - this.lastTime < 600) return false;
    this.lastTime = now;
    return true;
  }
}
