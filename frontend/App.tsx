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

export default function App() {
  const localAI = useMemo(() => new LocalAI(new LlamaRNEngine()), []);
  const [model, setModel] = useState<StoredModel | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>GIT OUT · PHASE 4</Text>
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
          <ActionButton label="Choose GGUF" onPress={chooseModel} disabled={busy} />
          <ActionButton
            label={modelLoaded ? 'Unload' : 'Load model'}
            onPress={modelLoaded ? unloadModel : loadModel}
            disabled={busy || (!modelLoaded && !model)}
            secondary
          />
        </View>
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
          disabled={busy || !modelLoaded || !prompt.trim()}
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
          <Text style={styles.label}>Response</Text>
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
