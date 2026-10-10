import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  findStoredModel,
  LlamaRNEngine,
  LocalAI,
  LocalAIError,
  pickAndStoreModel,
  type StoredModel,
} from './src/local-ai';
import {
  DEFAULT_SPEECH_LANGUAGE,
  NativeSpeechError,
  transcriptForPrompt,
  useSpeechRecognition,
} from './src/local-stt';
import { LocalTTS } from './src/local-tts/localTTS';
import { NativeTTSEngine } from './src/local-tts/nativeTTSEngine';
import { VoiceConversation } from './src/voice-conversation/voiceConversation';
import { PocketMode } from './src/pocket-mode/PocketMode';
import { pocketState } from './src/pocket-mode/pocketControls';

export default function App() {
  const localAI = useMemo(() => new LocalAI(new LlamaRNEngine()), []);
  const tts = useMemo(() => new LocalTTS(new NativeTTSEngine()), []);
  const conversation = useMemo(() => new VoiceConversation(localAI, tts), [localAI, tts]);
  const { response, generating, error: inferenceError, speakResponse, language: ttsLanguage } =
    useSyncExternalStore(conversation.subscribe, conversation.getSnapshot);
  const speechOutput = useSyncExternalStore(tts.subscribe, tts.getSnapshot);
  const {
    isChecking,
    isRecording,
    isTranscribing,
    partialTranscript,
    startRecognition,
    stopRecognition,
    cancelRecognition,
  } = useSpeechRecognition();
  const [model, setModel] = useState<StoredModel | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [speechLanguage, setSpeechLanguage] = useState(DEFAULT_SPEECH_LANGUAGE);
  const [transcript, setTranscript] = useState('');
  const [prompt, setPrompt] = useState('Explain what a pull request is');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const actionRef = useRef(false);
  const microphoneRef = useRef(false);
  const mountedRef = useRef(true);
  const lifecycleRef = useRef(0);
  const [startingMic, setStartingMic] = useState(false);
  const [pocketEnabled, setPocketEnabled] = useState(false);
  const pocketRef = useRef(false);
  const turnRef = useRef(0);
  const previousSpeakRef = useRef(false);
  const working = busy || generating;
  const microphoneBusy = startingMic || isChecking || isRecording || isTranscribing;
  const ttsActive = speechOutput.state === 'preparing' || speechOutput.state === 'speaking';
  const selectedTTSVoice = speechOutput.voice?.language.toLowerCase() === ttsLanguage.trim().replace(/_/g, '-').toLowerCase()
    ? speechOutput.voice : null;

  useEffect(() => {
    mountedRef.current = true;
    const lifecycle = ++lifecycleRef.current;
    conversation.attach();
    conversation.setForeground(AppState.currentState === 'active');
    void findStoredModel().then((stored) => { if (mountedRef.current) setModel(stored); });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') ++turnRef.current;
      conversation.setForeground(state === 'active');
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
      void conversation.detach().catch(() => undefined);
      // Never release llama's context while its existing generate() is running.
      void conversation.whenIdle().then(() => {
        if (!mountedRef.current && lifecycleRef.current === lifecycle) return localAI.unloadModel();
      }).catch(() => undefined);
    };
  }, [localAI, conversation]);

  const runAction = async (action: () => Promise<void>) => {
    if (actionRef.current || microphoneRef.current || conversation.getSnapshot().generating) return;
    actionRef.current = true;
    setBusy(true);
    setError('');
    try {
      await conversation.stopSpeaking();
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof LocalAIError
          ? actionError.message
          : actionError instanceof Error
            ? actionError.message
            : 'The local AI action failed.',
      );
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  };

  const chooseModel = () =>
    runAction(async () => {
      await localAI.unloadModel();
      setModelLoaded(false);
      const storedModel = await pickAndStoreModel();
      if (storedModel) {
        setModel(storedModel);
        conversation.clearResponse();
      }
    });

  const loadModel = () =>
    runAction(async () => {
      if (!model) {
        throw new LocalAIError(
          'MODEL_FILE_MISSING',
          'Choose a GGUF model before loading it.',
        );
      }
      setLoadProgress(0);
      await localAI.loadModel(model.uri, setLoadProgress);
      setModelLoaded(true);
    });

  const unloadModel = () =>
    runAction(async () => {
      await localAI.unloadModel();
      setModelLoaded(false);
      setLoadProgress(0);
    });

  const generate = () => {
    if (actionRef.current || microphoneRef.current) return;
    setError('');
    void conversation.generate(prompt);
  };

  const recordOrTranscribe = () => {
    if (isRecording) {
      stopRecognition();
      return;
    }

    if (microphoneRef.current || actionRef.current || conversation.getSnapshot().generating) return;
    microphoneRef.current = true;
    const turn = ++turnRef.current;
    const submitOnFinal = pocketRef.current;
    setStartingMic(true);

    setError('');
    setTranscript('');
    // Wait until output stops before opening the mic, so TTS isn't transcribed.
    void conversation.stopSpeaking()
      .then(() => {
        if (turn !== turnRef.current || !mountedRef.current || AppState.currentState !== 'active') throw new Error('Return to Git Out and tap Record prompt again.');
        return startRecognition(speechLanguage.trim());
      })
      .then((nextTranscript) => {
        if (!mountedRef.current || turn !== turnRef.current) return;
        const promptText = transcriptForPrompt(nextTranscript);
        setTranscript(promptText);
        setPrompt(promptText);
        if (submitOnFinal && pocketRef.current) void conversation.generate(promptText);
      })
      .catch((actionError) => {
        if (!mountedRef.current || turn !== turnRef.current) return;
        setError(
          actionError instanceof NativeSpeechError
            ? actionError.message
            : actionError instanceof Error
              ? actionError.message
              : 'The offline speech action failed.',
        );
      }).finally(() => {
        microphoneRef.current = false;
        if (mountedRef.current) setStartingMic(false);
      });
  };

  const stopPocket = () => {
    ++turnRef.current;
    cancelRecognition();
    void conversation.stopSpeaking().catch(() => undefined);
  };

  const exitPocket = () => {
    stopPocket();
    pocketRef.current = false;
    setPocketEnabled(false);
    conversation.setSpeakResponse(previousSpeakRef.current);
  };

  if (pocketEnabled) {
    return <PocketMode
      state={pocketState({
        listening: isRecording,
        transcribing: isTranscribing || (!isRecording && startingMic),
        thinking: generating,
        speaking: ttsActive,
        error: error || inferenceError || speechOutput.error,
      })}
      transcript={partialTranscript || transcript}
      answer={response}
      error={error || inferenceError || speechOutput.error}
      onMicrophone={recordOrTranscribe}
      onStop={stopPocket}
      onExit={exitPocket}
    />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>GIT OUT · PHASE 7</Text>
      <Text style={styles.title}>Local AI</Text>
      <Text style={styles.subtitle}>
        A small Android-first proof that inference can happen on the device.
      </Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Local LLM model</Text>
          <Text style={styles.status}>{modelLoaded ? 'Loaded' : 'Not loaded'}</Text>
        </View>
        <Text style={styles.modelName}>{model?.name ?? 'No GGUF selected'}</Text>
        {loadProgress > 0 && loadProgress < 1 ? (
          <Text style={styles.progress}>{Math.round(loadProgress * 100)}% loading</Text>
        ) : null}
        <View style={styles.buttonRow}>
          <ActionButton
            label="Choose GGUF"
            onPress={chooseModel}
            disabled={working || microphoneBusy}
          />
          <ActionButton
            label={modelLoaded ? 'Unload' : 'Load model'}
            onPress={modelLoaded ? unloadModel : loadModel}
            disabled={working || microphoneBusy || (!modelLoaded && !model)}
            secondary
          />
        </View>
      </View>

      <ActionButton
        label="Enter Pocket Mode"
        disabled={!modelLoaded || working || microphoneBusy}
        onPress={() => {
          if (actionRef.current || microphoneRef.current || conversation.getSnapshot().generating) return;
          previousSpeakRef.current = conversation.getSnapshot().speakResponse;
          conversation.setSpeakResponse(true);
          setError('');
          pocketRef.current = true;
          setPocketEnabled(true);
        }}
      />

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Offline speech input</Text>
          <Text style={styles.localBadge}>ANDROID ON-DEVICE</Text>
        </View>
        <Text style={styles.label}>Language (BCP-47)</Text>
        <TextInput
          value={speechLanguage}
          onChangeText={setSpeechLanguage}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!microphoneBusy}
          accessibilityLabel="STT language code"
          placeholder="en-US"
          placeholderTextColor="#7d887f"
          style={styles.languageInput}
        />
        <Text style={styles.hint}>
          {isChecking
            ? 'Checking Android on-device support and installed language models...'
            : isRecording
              ? 'Listening on the device. Tap stop when you finish speaking.'
              : 'Git Out checks the installed offline language before listening and never falls back to network recognition.'}
        </Text>
        <ActionButton
          label={
            isRecording
              ? 'Stop and transcribe'
              : isChecking || startingMic
                ? 'Checking offline support...'
                : 'Record prompt'
          }
          onPress={recordOrTranscribe}
          disabled={working || (!isRecording && (startingMic || isChecking))}
        />
        {partialTranscript || transcript ? (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>
              {partialTranscript ? 'Listening transcript' : 'Transcript · copied to prompt'}
            </Text>
            <Text style={styles.transcript}>{partialTranscript || transcript}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Speak response</Text>
          <Switch
            accessibilityLabel="Speak completed responses"
            value={speakResponse}
            onValueChange={(enabled) => {
              conversation.setSpeakResponse(enabled);
              if (enabled) void tts.prepare(ttsLanguage).catch(() => undefined);
            }}
          />
        </View>
        <Text style={styles.hint}>Android TTS · installed voice: {selectedTTSVoice?.id ?? 'not checked / unavailable'}</Text>
        <Text style={styles.label}>TTS language (BCP-47)</Text>
        <TextInput
          accessibilityLabel="TTS language code"
          value={ttsLanguage}
          onChangeText={(language) => conversation.setLanguage(language)}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.languageInput}
          placeholder="en-US"
        />
        <Text style={styles.hint} accessibilityLiveRegion="polite">Speech output: {speechOutput.state}</Text>
        {speechOutput.voices.length ? (
          <Text style={styles.hint}>
            Installed non-network TTS languages: {Array.from(new Set(speechOutput.voices.filter((voice) => voice.installed && !voice.networkRequired).map((voice) => voice.language))).join(', ') || 'none'}
          </Text>
        ) : null}
        <View style={styles.buttonRow}>
          <ActionButton
            label="Check TTS voice"
            onPress={() => { void tts.prepare(ttsLanguage).catch(() => undefined); }}
            disabled={working || microphoneBusy || ttsActive}
            secondary
          />
          <ActionButton
            label="Stop speaking"
            onPress={() => { void conversation.stopSpeaking().catch(() => undefined); }}
            disabled={!ttsActive && !(generating && speakResponse)}
          />
        </View>
        <ActionButton
          label="Speak answer again / retry"
          onPress={() => {
            if (!microphoneRef.current && !actionRef.current) void conversation.retrySpeech().catch(() => undefined);
          }}
          disabled={!response.trim() || working || microphoneBusy}
          secondary
        />
        {speechOutput.error ? <Text style={styles.ttsError} accessibilityLiveRegion="polite">TTS: {speechOutput.error} Your text answer is kept.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Prompt</Text>
        <TextInput
          multiline
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ask the local model something..."
          placeholderTextColor="#7d887f"
          style={styles.input}
        />
        <ActionButton
          label={working ? 'Working...' : 'Generate'}
          onPress={generate}
          disabled={working || microphoneBusy || !modelLoaded || !prompt.trim()}
        />
        {working ? <ActivityIndicator color="#f4f1e8" style={styles.spinner} /> : null}
      </View>

      {error || inferenceError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error || inferenceError}</Text>
        </View>
      ) : null}

      <View style={styles.responseBox}>
        <View style={styles.row}>
          <Text style={styles.responseLabel}>Response</Text>
          <Text style={styles.localBadge}>LOCAL DEVICE</Text>
        </View>
        <Text style={response ? styles.response : styles.emptyResponse}>
          {response || 'Load a model and generate a response to see local inference.'}
        </Text>
      </View>
      <StatusBar style="auto" />
    </ScrollView>
  );
}

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f1e8',
    padding: 24,
    gap: 16,
  },
  eyebrow: {
    color: '#2f6f4e',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 16,
  },
  title: {
    color: '#1e2a23',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#526056',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
    marginBottom: 8,
  },
  hint: {
    color: '#d0e2d3',
    fontSize: 13,
    lineHeight: 19,
  },
  ttsError: {
    color: '#ffcec6',
    fontSize: 14,
    lineHeight: 21,
  },
  languageInput: {
    backgroundColor: '#fffdf7',
    borderRadius: 12,
    color: '#1e2a23',
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  card: {
    backgroundColor: '#26382d',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    gap: 14,
  },
  responseBox: {
    backgroundColor: '#fffdf7',
    borderColor: '#d6d9cd',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    width: '100%',
    gap: 14,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#f4f1e8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  status: {
    color: '#b9e7c7',
    fontSize: 13,
    fontWeight: '700',
  },
  modelName: {
    color: '#fffdf7',
    fontSize: 18,
    fontWeight: '700',
  },
  progress: {
    color: '#b9e7c7',
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2f6f4e',
    borderRadius: 12,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButton: {
    backgroundColor: '#dcebdd',
  },
  buttonText: {
    color: '#fffdf7',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#1e2a23',
  },
  disabledButton: {
    opacity: 0.45,
  },
  pressedButton: {
    opacity: 0.8,
  },
  input: {
    backgroundColor: '#fffdf7',
    borderRadius: 12,
    color: '#1e2a23',
    fontSize: 16,
    minHeight: 110,
    padding: 14,
    textAlignVertical: 'top',
  },
  transcriptBox: {
    backgroundColor: '#fffdf7',
    borderRadius: 12,
    gap: 8,
    padding: 14,
  },
  transcriptLabel: {
    color: '#2f6f4e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  transcript: {
    color: '#1e2a23',
    fontSize: 16,
    lineHeight: 23,
  },
  spinner: {
    position: 'absolute',
    right: 32,
    top: 226,
  },
  errorBox: {
    backgroundColor: '#f7d9d4',
    borderRadius: 14,
    padding: 14,
    width: '100%',
  },
  errorText: {
    color: '#7e2f2a',
    fontSize: 14,
  },
  localBadge: {
    color: '#2f6f4e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  responseLabel: {
    color: '#526056',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  response: {
    color: '#1e2a23',
    fontSize: 16,
    lineHeight: 24,
  },
  emptyResponse: {
    color: '#7d887f',
    fontSize: 15,
    lineHeight: 22,
  },
});
