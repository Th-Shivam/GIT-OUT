import {
  NativeSpeechError,
  type SpeechPlatform,
  type SpeechRecognitionModule,
  type SpeechRecognitionSession,
  type SpeechRecognitionSubscription,
} from './types';

export const DEFAULT_SPEECH_LANGUAGE = 'en-US';

export interface SpeechAvailability {
  language: string;
  installedLanguages: string[];
}

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, '-').toLowerCase();
}

function findMatchingLocale(requested: string, installedLanguages: string[]): string | null {
  const normalizedRequested = normalizeLocale(requested);
  const exact = installedLanguages.find(
    (locale) => normalizeLocale(locale) === normalizedRequested,
  );
  if (exact) {
    return exact;
  }

  const requestedLanguage = normalizedRequested.split('-')[0];
  return (
    installedLanguages.find(
      (locale) => normalizeLocale(locale).split('-')[0] === requestedLanguage,
    ) ?? null
  );
}

export class AndroidSpeechRecognizer {
  private activeSession: SpeechRecognitionSession | null = null;

  constructor(
    private readonly module: SpeechRecognitionModule,
    private readonly platform: SpeechPlatform,
  ) {}

  async checkAvailability(language: string): Promise<SpeechAvailability> {
    if (this.platform.os !== 'android') {
      throw new NativeSpeechError(
        'UNSUPPORTED_PLATFORM',
        'On-device speech recognition currently supports Android only.',
      );
    }

    // expo-speech-recognition uses Android's explicit on-device recognizer on
    // API 33+. We reject older versions instead of allowing a network service.
    if (this.platform.version < 33) {
      throw new NativeSpeechError(
        'ANDROID_VERSION_UNSUPPORTED',
        'Offline speech recognition requires Android 13 or newer.',
      );
    }

    if (!language.trim()) {
      throw new NativeSpeechError(
        'LANGUAGE_UNAVAILABLE',
        'Enter a language code such as en-US before starting recognition.',
      );
    }

    if (!this.module.supportsOnDeviceRecognition()) {
      throw new NativeSpeechError(
        'ON_DEVICE_UNAVAILABLE',
        'On-device speech recognition is unavailable. Install or enable an offline speech service in Android settings.',
      );
    }

    let installedLanguages: string[];
    try {
      const supported = await this.module.getSupportedLocales({});
      installedLanguages = supported.installedLocales;
    } catch {
      throw new NativeSpeechError(
        'ON_DEVICE_UNAVAILABLE',
        'Git Out could not inspect the installed offline speech languages. Check Android speech services in Settings.',
      );
    }

    const matchingLanguage = findMatchingLocale(language, installedLanguages);
    if (!matchingLanguage) {
      const examples = installedLanguages.slice(0, 4).join(', ');
      throw new NativeSpeechError(
        'LANGUAGE_UNAVAILABLE',
        examples
          ? `The offline speech model for ${language} is not installed. Available offline languages: ${examples}.`
          : `The offline speech model for ${language} is not installed. Download that language in Android's on-device speech recognition settings.`,
      );
    }

    return { language: matchingLanguage, installedLanguages };
  }

  async start(
    language: string,
    onPartialResult?: (transcript: string) => void,
  ): Promise<SpeechRecognitionSession> {
    if (this.activeSession) {
      throw new NativeSpeechError(
        'BUSY',
        'Speech recognition is already active. Stop the current recording first.',
      );
    }

    const permission = await this.module.requestMicrophonePermissionsAsync();
    if (!permission.granted) {
      throw new NativeSpeechError(
        'MICROPHONE_PERMISSION_DENIED',
        'Microphone permission is required. Allow it in Android Settings and try again.',
      );
    }

    const availability = await this.checkAvailability(language);
    let resolveResult!: (transcript: string) => void;
    let rejectResult!: (error: NativeSpeechError) => void;
    let subscriptions: SpeechRecognitionSubscription[] = [];
    let settled = false;

    const promise = new Promise<string>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const cleanup = () => {
      subscriptions.forEach((subscription) => subscription.remove());
      subscriptions = [];
      if (this.activeSession === session) {
        this.activeSession = null;
      }
    };

    const resolveSession = (transcript: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveResult(transcript.trim());
    };

    const rejectSession = (error: NativeSpeechError) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectResult(error);
    };

    const session: SpeechRecognitionSession = {
      promise,
      stop: () => this.module.stop(),
      cancel: () => {
        if (!settled) {
          this.module.abort();
        }
      },
    };
    this.activeSession = session;

    subscriptions = [
      this.module.addListener('result', (event) => {
        const transcript = event.results[0]?.transcript?.trim() ?? '';
        if (!transcript) return;
        onPartialResult?.(transcript);
        if (event.isFinal) {
          resolveSession(transcript);
        }
      }),
      this.module.addListener('error', (event) => {
        const code =
          event.error === 'not-allowed'
            ? 'MICROPHONE_PERMISSION_DENIED'
            : event.error === 'language-not-supported'
              ? 'LANGUAGE_UNAVAILABLE'
              : event.error === 'network'
                ? 'ON_DEVICE_UNAVAILABLE'
                : event.error === 'aborted'
                  ? 'ABORTED'
                  : event.error === 'service-not-allowed'
                    ? 'ON_DEVICE_UNAVAILABLE'
                    : 'RECOGNITION_FAILED';
        rejectSession(new NativeSpeechError(code, event.message));
      }),
      this.module.addListener('end', () => {
        rejectSession(
          new NativeSpeechError(
            'NO_SPEECH',
            'No final speech was detected. Try speaking a little longer.',
          ),
        );
      }),
    ];

    try {
      this.module.start({
        lang: availability.language,
        interimResults: true,
        maxAlternatives: 1,
        // This is the important offline guarantee. EXTRA_PREFER_OFFLINE is
        // intentionally not used because Android may ignore that hint.
        requiresOnDeviceRecognition: true,
        addsPunctuation: true,
      });
    } catch {
      rejectSession(
        new NativeSpeechError(
          'RECOGNITION_UNAVAILABLE',
          'The Android on-device speech service could not start. Check Android speech services in Settings.',
        ),
      );
    }

    return session;
  }
}
