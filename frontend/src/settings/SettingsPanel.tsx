import { StyleSheet, Text, View } from 'react-native';
import type { StoredModel } from '../local-ai';
import type { TTSSnapshot, TTSVoice } from '../local-tts/types';
import { AppButton, AppField, FieldLabel, SectionHeading, StatusPill, Surface } from '../ui/components';
import { theme } from '../ui/theme';

interface Props {
  model: StoredModel | null;
  modelLoaded: boolean;
  loadProgress: number;
  working: boolean;
  microphoneBusy: boolean;
  onChooseModel(): void;
  onLoadModel(): void;
  onUnloadModel(): void;
  speechLanguage: string;
  onSpeechLanguageChange(value: string): void;
  isChecking: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  startingMic: boolean;
  onRecord(): void;
  transcript: string;
  partialTranscript: string;
  speakResponse: boolean;
  onSpeakResponseChange(value: boolean): void;
  ttsLanguage: string;
  onTTSLanguageChange(value: string): void;
  ttsSnapshot: TTSSnapshot;
  selectedVoice: TTSVoice | null;
  ttsActive: boolean;
  onCheckVoice(): void;
  onStopSpeaking(): void;
}

export function SettingsPanel(props: Props) {
  const { model, modelLoaded, loadProgress, working, microphoneBusy } = props;
  return (
    <View style={styles.content}>
      <SectionHeading eyebrow="Settings / device" title="Make the local loop yours" detail="Model weights, speech packs, and voice data stay under your control." />
      <Surface>
        <View style={styles.statusRow}>
          <Text style={styles.cardLabel}>Qwen GGUF model</Text>
          <StatusPill label={modelLoaded ? 'Loaded' : 'Not loaded'} tone={modelLoaded ? 'positive' : 'warning'} />
        </View>
        <Text style={styles.modelName}>{model?.name ?? 'No model selected'}</Text>
        {loadProgress > 0 && loadProgress < 1 ? <Text style={styles.progress}>{Math.round(loadProgress * 100)}% loading into memory</Text> : null}
        <View style={styles.row}>
          <AppButton label="Choose GGUF" onPress={props.onChooseModel} disabled={working || microphoneBusy} variant="secondary" />
          <AppButton label={modelLoaded ? 'Unload' : 'Load model'} onPress={modelLoaded ? props.onUnloadModel : props.onLoadModel} disabled={working || microphoneBusy || (!modelLoaded && !model)} />
        </View>
        <Text style={styles.note}>Inference is local and works without GitHub or the FastAPI service after the model is loaded.</Text>
      </Surface>

      <Surface>
        <View style={styles.statusRow}>
          <Text style={styles.cardLabel}>Speech input</Text>
          <StatusPill label="ANDROID ON-DEVICE" tone="info" />
        </View>
        <FieldLabel>Recognition language · BCP-47</FieldLabel>
        <AppField value={props.speechLanguage} onChangeText={props.onSpeechLanguageChange} autoCapitalize="none" autoCorrect={false} editable={!microphoneBusy} placeholder="en-US" />
        <Text style={styles.note}>{props.isChecking ? 'Checking installed offline language packs…' : props.isRecording ? 'Listening. Stop when your thought is complete.' : 'Requires Android on-device recognition and an installed language pack.'}</Text>
        <AppButton label={props.isRecording ? 'Stop and transcribe' : props.isTranscribing || props.startingMic ? 'Transcribing…' : 'Record prompt'} onPress={props.onRecord} disabled={working || (!props.isRecording && (props.startingMic || props.isChecking || props.isTranscribing))} />
        {props.partialTranscript || props.transcript ? <View style={styles.transcript}><Text style={styles.transcriptLabel}>{props.partialTranscript ? 'Live transcript' : 'Completed transcript'}</Text><Text style={styles.transcriptText}>{props.partialTranscript || props.transcript}</Text></View> : null}
      </Surface>

      <Surface>
        <View style={styles.statusRow}>
          <Text style={styles.cardLabel}>Speech output</Text>
          <StatusPill label={props.speakResponse ? 'Enabled' : 'Manual'} tone={props.speakResponse ? 'positive' : 'neutral'} />
        </View>
        <AppButton label={props.speakResponse ? 'Disable automatic answers' : 'Enable automatic answers'} onPress={() => props.onSpeakResponseChange(!props.speakResponse)} variant="secondary" />
        <FieldLabel>TTS language · exact installed voice</FieldLabel>
        <AppField value={props.ttsLanguage} onChangeText={props.onTTSLanguageChange} autoCapitalize="none" autoCorrect={false} placeholder="en-US" />
        <Text style={styles.note}>Selected voice: {props.selectedVoice?.id ?? 'not checked'}</Text>
        <Text style={styles.note}>Playback state: {props.ttsSnapshot.state}</Text>
        {props.ttsSnapshot.error ? <Text style={styles.error}>{props.ttsSnapshot.error}</Text> : null}
        <View style={styles.row}>
          <AppButton label="Check voice" onPress={props.onCheckVoice} disabled={working || microphoneBusy || props.ttsActive} variant="secondary" />
          <AppButton label="Stop speaking" onPress={props.onStopSpeaking} disabled={!props.ttsActive} variant="danger" />
        </View>
      </Surface>

      <Surface raised>
        <Text style={styles.cardLabel}>Privacy & connectivity</Text>
        <Text style={styles.note}>Local chat, on-device speech recognition, and eligible TTS voices do not need a network connection.</Text>
        <Text style={styles.note}>GitHub browsing needs the backend and its server-side token. Git Out never puts that token in the mobile app.</Text>
        <Text style={styles.note}>Pocket Mode never listens continuously and never reopens the microphone in the background.</Text>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.lg },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardLabel: { color: theme.colors.text, fontSize: theme.typography.heading, fontWeight: '800' },
  modelName: { color: theme.colors.textMuted, fontSize: theme.typography.body },
  progress: { color: theme.colors.green, fontSize: theme.typography.small, fontWeight: '700' },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  note: { color: theme.colors.textMuted, fontSize: theme.typography.small, lineHeight: 19 },
  transcript: { backgroundColor: theme.colors.canvas, borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, gap: 6, padding: theme.spacing.md },
  transcriptLabel: { color: theme.colors.green, fontSize: theme.typography.label, fontWeight: '800', letterSpacing: 1 },
  transcriptText: { color: theme.colors.text, fontSize: theme.typography.body, lineHeight: 22 },
  error: { color: '#ff7b72', fontSize: theme.typography.small, lineHeight: 19 },
});
