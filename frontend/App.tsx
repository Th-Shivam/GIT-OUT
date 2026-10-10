import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

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
import type { TTSMediaEvent } from './src/local-tts/types';
import { VoiceConversation } from './src/voice-conversation/voiceConversation';
import { PocketMode } from './src/pocket-mode/PocketMode';
import {
  pocketAction,
  PocketCommandGate,
  pocketState,
} from './src/pocket-mode/pocketControls';
import { ChatPanel, type ConversationEntry } from './src/chat/ChatPanel';
import { GitHubPanel } from './src/github/GitHubPanel';
import { HomePanel } from './src/home/HomePanel';
import { SettingsPanel } from './src/settings/SettingsPanel';
import { AppTab, SectionHeading, StatusPill, Surface, TabBar } from './src/ui/components';
import { theme } from './src/ui/theme';

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
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const actionRef = useRef(false);
  const microphoneRef = useRef(false);
  const mountedRef = useRef(true);
  const lifecycleRef = useRef(0);
  const turnRef = useRef(0);
  const historyIdRef = useRef(0);
  const historyKeysRef = useRef(new Set<string>());
  const [startingMic, setStartingMic] = useState(false);
  const [pocketEnabled, setPocketEnabled] = useState(false);
  const pocketRef = useRef(false);
  const previousSpeakRef = useRef(false);
  const mediaGateRef = useRef(new PocketCommandGate());
  const mediaActionHandlerRef = useRef<(event: TTSMediaEvent) => void>(() => undefined);
  const working = busy || generating;
  const microphoneBusy = startingMic || isChecking || isRecording || isTranscribing;
  const ttsActive = speechOutput.state === 'preparing' || speechOutput.state === 'speaking';
  const selectedTTSVoice = speechOutput.voice?.language.toLowerCase() === ttsLanguage.trim().replace(/_/g, '-').toLowerCase()
    ? speechOutput.voice : null;
  const currentPocketState = pocketState({
    listening: isRecording,
    transcribing: isTranscribing || (!isRecording && startingMic),
    thinking: generating,
    speaking: ttsActive,
    error: error || inferenceError || speechOutput.error,
  });

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

  const chooseModel = () => runAction(async () => {
    await localAI.unloadModel();
    setModelLoaded(false);
    const storedModel = await pickAndStoreModel();
    if (storedModel) {
      setModel(storedModel);
      conversation.clearResponse();
    }
  });

  const loadModel = () => runAction(async () => {
    if (!model) throw new LocalAIError('MODEL_FILE_MISSING', 'Choose a GGUF model before loading it.');
    setLoadProgress(0);
    await localAI.loadModel(model.uri, setLoadProgress);
    setModelLoaded(true);
  });

  const unloadModel = () => runAction(async () => {
    await localAI.unloadModel();
    setModelLoaded(false);
    setLoadProgress(0);
  });

  const submitPrompt = (nextPrompt: string): Promise<void> => {
    const normalized = nextPrompt.trim();
    if (!normalized) return Promise.resolve();
    setError('');
    const pending = conversation.generate(normalized);
    void pending.then(() => {
      if (!mountedRef.current) return;
      const nextResponse = conversation.getSnapshot().response.trim();
      if (!nextResponse) return;
      const key = `${normalized}\n${nextResponse}`;
      if (historyKeysRef.current.has(key)) return;
      historyKeysRef.current.add(key);
      setHistory((current) => [...current, { id: `turn-${++historyIdRef.current}`, prompt: normalized, response: nextResponse }]);
    });
    return pending;
  };

  const generate = () => {
    if (actionRef.current || microphoneRef.current) return;
    void submitPrompt(prompt);
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
        if (submitOnFinal && pocketRef.current) void submitPrompt(promptText);
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

  const enterPocket = () => {
    if (actionRef.current || microphoneRef.current || conversation.getSnapshot().generating) return;
    previousSpeakRef.current = conversation.getSnapshot().speakResponse;
    conversation.setSpeakResponse(true);
    setError('');
    pocketRef.current = true;
    setPocketEnabled(true);
  };

  const exitPocket = () => {
    stopPocket();
    pocketRef.current = false;
    setPocketEnabled(false);
    conversation.setSpeakResponse(previousSpeakRef.current);
  };

  mediaActionHandlerRef.current = (event) => {
    if (!mediaGateRef.current.accept(event.id, event.action, Date.now())) return;
    const action = pocketAction(event.action, currentPocketState, AppState.currentState === 'active');
    if (action === 'stop') {
      if (pocketRef.current) stopPocket();
      else void conversation.stopSpeaking().catch(() => undefined);
    } else if (action === 'finish' && isRecording) {
      stopRecognition();
    } else if (action === 'record' && pocketRef.current) {
      recordOrTranscribe();
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    try {
      return tts.subscribeMedia((event) => mediaActionHandlerRef.current(event));
    } catch {
      return undefined;
    }
  }, [tts]);

  useEffect(() => {
    if (Platform.OS === 'android') void tts.setPocketControls(pocketEnabled).catch(() => undefined);
  }, [tts, pocketEnabled]);

  if (pocketEnabled) {
    return (
      <PocketMode
        state={currentPocketState}
        transcript={partialTranscript || transcript}
        answer={response}
        error={error || inferenceError || speechOutput.error}
        onMicrophone={recordOrTranscribe}
        onStop={stopPocket}
        onExit={exitPocket}
      />
    );
  }

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>GIT OUT</Text>
            <Text style={styles.headerTitle}>Developer companion</Text>
          </View>
          <StatusPill label={modelLoaded ? 'LOCAL READY' : 'SETUP REQUIRED'} tone={modelLoaded ? 'positive' : 'warning'} />
        </View>
        {activeTab === 'home' ? (
          <HomePanel
            modelReady={modelLoaded}
            modelName={model?.name ?? ''}
            pocketState={currentPocketState}
            response={response}
            recording={isRecording}
            working={working}
            onPocket={enterPocket}
            onRecord={recordOrTranscribe}
            onChat={() => setActiveTab('chat')}
          />
        ) : null}
        {activeTab === 'chat' ? (
          <ChatPanel
            prompt={prompt}
            onPromptChange={setPrompt}
            onGenerate={generate}
            onRetrySpeech={() => { if (!microphoneRef.current && !actionRef.current) void conversation.retrySpeech().catch(() => undefined); }}
            response={response}
            history={history}
            modelReady={modelLoaded}
            working={working}
            canRetrySpeech={Boolean(response.trim()) && !microphoneBusy}
          />
        ) : null}
        {activeTab === 'github' ? <GitHubPanel /> : null}
        {activeTab === 'settings' ? (
          <SettingsPanel
            model={model}
            modelLoaded={modelLoaded}
            loadProgress={loadProgress}
            working={working}
            microphoneBusy={microphoneBusy}
            onChooseModel={chooseModel}
            onLoadModel={loadModel}
            onUnloadModel={unloadModel}
            speechLanguage={speechLanguage}
            onSpeechLanguageChange={setSpeechLanguage}
            isChecking={isChecking}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            startingMic={startingMic}
            onRecord={recordOrTranscribe}
            transcript={transcript}
            partialTranscript={partialTranscript}
            speakResponse={speakResponse}
            onSpeakResponseChange={(enabled) => { conversation.setSpeakResponse(enabled); if (enabled) void tts.prepare(ttsLanguage).catch(() => undefined); }}
            ttsLanguage={ttsLanguage}
            onTTSLanguageChange={(language) => conversation.setLanguage(language)}
            ttsSnapshot={speechOutput}
            selectedVoice={selectedTTSVoice}
            ttsActive={ttsActive}
            onCheckVoice={() => { void tts.prepare(ttsLanguage).catch(() => undefined); }}
            onStopSpeaking={() => { void conversation.stopSpeaking().catch(() => undefined); }}
          />
        ) : null}
        {error || inferenceError ? (
          <Surface>
            <SectionHeading eyebrow="Action needed" title="The local loop needs attention" detail={error || inferenceError} />
          </Surface>
        ) : null}
      </ScrollView>
      <TabBar active={activeTab} onChange={setActiveTab} />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: theme.colors.canvas, flex: 1 },
  container: { gap: theme.spacing.lg, padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: theme.spacing.sm },
  brand: { color: theme.colors.green, fontSize: theme.typography.label, fontWeight: '900', letterSpacing: 2 },
  headerTitle: { color: theme.colors.text, fontSize: theme.typography.heading, fontWeight: '800', marginTop: 4 },
});
