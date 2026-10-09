import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
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

export default function App() {
  const localAI = useMemo(() => new LocalAI(new LlamaRNEngine()), []);
  const {
    isChecking,
    isRecording,
    partialTranscript,
    startRecognition,
    stopRecognition,
  } = useSpeechRecognition();
  const [model, setModel] = useState<StoredModel | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [speechLanguage, setSpeechLanguage] = useState(DEFAULT_SPEECH_LANGUAGE);
  const [transcript, setTranscript] = useState('');
  const [prompt, setPrompt] = useState('Explain what a pull request is');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void findStoredModel().then(setModel);
    return () => {
      void localAI.unloadModel();
    };
  }, [localAI]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
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
        setResponse('');
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

  const generate = () =>
    runAction(async () => {
      setResponse(await localAI.generate(prompt));
    });

  const recordOrTranscribe = () => {
    if (isRecording) {
      stopRecognition();
      return;
    }

    setError('');
    setTranscript('');
    void startRecognition(speechLanguage.trim())
      .then((nextTranscript) => {
        const promptText = transcriptForPrompt(nextTranscript);
        setTranscript(promptText);
        setPrompt(promptText);
      })
      .catch((actionError) => {
        setError(
          actionError instanceof NativeSpeechError
            ? actionError.message
            : actionError instanceof Error
              ? actionError.message
              : 'The offline speech action failed.',
        );
      });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>GIT OUT · PHASE 5</Text>
      <Text style={styles.title}>Local AI</Text>
      <Text style={styles.subtitle}>
        A small Android-first proof that inference can happen on the device.
      </Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Model</Text>
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
            disabled={busy || isChecking || isRecording}
          />
          <ActionButton
            label={modelLoaded ? 'Unload' : 'Load model'}
            onPress={modelLoaded ? unloadModel : loadModel}
            disabled={busy || isChecking || isRecording || (!modelLoaded && !model)}
            secondary
          />
        </View>
      </View>

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
              : isChecking
                ? 'Checking offline support...'
                : 'Record prompt'
          }
          onPress={recordOrTranscribe}
          disabled={isChecking || busy}
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
          label={busy ? 'Working...' : 'Generate'}
          onPress={generate}
          disabled={busy || isChecking || isRecording || !modelLoaded || !prompt.trim()}
        />
        {busy ? <ActivityIndicator color="#f4f1e8" style={styles.spinner} /> : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
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
