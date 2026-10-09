export type NativeSpeechErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'ANDROID_VERSION_UNSUPPORTED'
  | 'ON_DEVICE_UNAVAILABLE'
  | 'LANGUAGE_UNAVAILABLE'
  | 'MICROPHONE_PERMISSION_DENIED'
  | 'RECOGNITION_UNAVAILABLE'
  | 'RECOGNITION_FAILED'
  | 'NO_SPEECH'
  | 'BUSY'
  | 'ABORTED';

export interface SpeechRecognitionPermission {
  granted: boolean;
}

export interface SpeechRecognitionResult {
  transcript: string;
}

export interface SpeechRecognitionResultEvent {
  isFinal: boolean;
  results: SpeechRecognitionResult[];
}

export interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

export interface SpeechRecognitionSubscription {
  remove(): void;
}

export interface SpeechRecognitionModule {
  requestMicrophonePermissionsAsync(): Promise<SpeechRecognitionPermission>;
  supportsOnDeviceRecognition(): boolean;
  getSupportedLocales(options: { androidRecognitionServicePackage?: string }): Promise<{
    locales: string[];
    installedLocales: string[];
  }>;
  addListener(
    event: 'result',
    listener: (event: SpeechRecognitionResultEvent) => void,
  ): SpeechRecognitionSubscription;
  addListener(
    event: 'error',
    listener: (event: SpeechRecognitionErrorEvent) => void,
  ): SpeechRecognitionSubscription;
  addListener(event: 'end', listener: () => void): SpeechRecognitionSubscription;
  start(options: {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    requiresOnDeviceRecognition: boolean;
    addsPunctuation: boolean;
  }): void;
  stop(): void;
  abort(): void;
}

export interface SpeechPlatform {
  os: string;
  version: number;
}

export interface SpeechRecognitionSession {
  promise: Promise<string>;
  stop(): void;
  cancel(): void;
}

export class NativeSpeechError extends Error {
  constructor(
    public readonly code: NativeSpeechErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NativeSpeechError';
  }
}
