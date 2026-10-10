import { AppState, Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { AndroidSpeechRecognizer } from './speechRecognizer';
import { MicrophonePermissionRequest } from './microphonePermission';

export class NativeSpeechRecognizer extends AndroidSpeechRecognizer {
  private readonly permissionRequest = new MicrophonePermissionRequest(AppState);

  isRequestingPermission = () => this.permissionRequest.pending;

  protected requestMicrophonePermission() {
    return this.permissionRequest.request(() => super.requestMicrophonePermission());
  }

  constructor() {
    super(ExpoSpeechRecognitionModule, {
      os: Platform.OS,
      version: Number(Platform.Version),
    });
  }
}
