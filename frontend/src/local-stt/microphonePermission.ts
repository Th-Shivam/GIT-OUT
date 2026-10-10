import { NativeSpeechError, type SpeechRecognitionPermission } from './types';

interface ActivityState {
  currentState: string | null;
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void };
}

/** Android's permission Activity can pause the app without cancelling the user's tap. */
export class MicrophonePermissionRequest {
  pending = false;

  constructor(private readonly activity: ActivityState) {}

  async request(ask: () => Promise<SpeechRecognitionPermission>): Promise<SpeechRecognitionPermission> {
    this.pending = true;
    try {
      const permission = await ask();
      // Permission results can arrive just before React Native's resume event.
      // Only bridge that short transition; never wait indefinitely for the user
      // to return from another app and unexpectedly open the microphone.
      if (this.activity.currentState !== 'active') await this.waitForResume();
      return permission;
    } finally {
      this.pending = false;
    }
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve, reject) => {
      const subscription = this.activity.addEventListener('change', (state) => {
        if (state !== 'active') return;
        clearTimeout(timeout);
        subscription.remove();
        resolve();
      });
      const timeout = setTimeout(() => {
        subscription.remove();
        reject(new NativeSpeechError('ABORTED', 'Microphone setup was interrupted. Return to Git Out and tap to speak again.'));
      }, 1500);
    });
  }
}
