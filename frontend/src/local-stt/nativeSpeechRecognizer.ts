import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { AndroidSpeechRecognizer } from './speechRecognizer';

export class NativeSpeechRecognizer extends AndroidSpeechRecognizer {
  constructor() {
    super(ExpoSpeechRecognitionModule, {
      os: Platform.OS,
      version: Number(Platform.Version),
    });
  }
}
