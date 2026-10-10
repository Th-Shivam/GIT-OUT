import { StyleSheet, Text, View } from 'react-native';
import type { PocketState } from '../pocket-mode/pocketControls';
import { AppButton, SectionHeading, StatusPill, Surface } from '../ui/components';
import { theme } from '../ui/theme';

interface Props {
  modelReady: boolean;
  modelName: string;
  pocketState: PocketState;
  response: string;
  recording: boolean;
  working: boolean;
  onPocket(): void;
  onRecord(): void;
  onChat(): void;
}

export function HomePanel({ modelReady, modelName, pocketState, response, recording, working, onPocket, onRecord, onChat }: Props) {
  return (
    <View style={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <Text style={styles.kicker}>LOCAL-FIRST / ANDROID</Text>
        <Text style={styles.title}>Think out loud.</Text>
        <Text style={styles.subtitle}>A private developer companion for the moments between commits.</Text>
        <View style={styles.heroMeta}>
          <StatusPill label={modelReady ? 'Qwen model ready' : 'Model needs setup'} tone={modelReady ? 'positive' : 'warning'} />
          <StatusPill label={`Voice · ${pocketState}`} tone={pocketState === 'Error' ? 'danger' : 'neutral'} />
        </View>
        <AppButton label="Open Pocket Mode" onPress={onPocket} disabled={!modelReady || working} />
        <AppButton label={recording ? 'Finish voice question' : 'Quick voice question'} onPress={onRecord} disabled={!modelReady || working} variant="secondary" />
      </View>

      <Surface>
        <SectionHeading eyebrow="The loop" title="From thought to next step" detail="The model, speech recognizer, and voice are kept on your device." />
        <View style={styles.steps}>
          <Step number="01" title="Speak" detail="Native on-device speech" />
          <Step number="02" title="Think" detail="Local Qwen inference" />
          <Step number="03" title="Listen" detail="Installed Android voice" />
        </View>
      </Surface>

      <Surface raised>
        <View style={styles.responseHeader}>
          <Text style={styles.cardLabel}>Latest answer</Text>
          <Text style={styles.model}>{modelName || 'No GGUF selected'}</Text>
        </View>
        <Text style={response ? styles.response : styles.emptyResponse}>
          {response || 'Load a local GGUF from Settings, then ask Git Out about Git, code review, or your next implementation step.'}
        </Text>
        <AppButton label="Open local chat" onPress={onChat} variant="quiet" />
      </Surface>
    </View>
  );
}

function Step({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepNumber}>{number}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.lg },
  hero: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, borderWidth: 1, gap: theme.spacing.lg, overflow: 'hidden', padding: theme.spacing.xl, position: 'relative' },
  heroGlow: { backgroundColor: '#1f3d29', borderRadius: 160, height: 220, opacity: 0.28, position: 'absolute', right: -90, top: -105, width: 220 },
  kicker: { color: theme.colors.green, fontSize: theme.typography.label, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: theme.colors.text, fontSize: 35, fontWeight: '800', letterSpacing: -1.2, maxWidth: 280 },
  subtitle: { color: theme.colors.textMuted, fontSize: theme.typography.body, lineHeight: 23, maxWidth: 330 },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  steps: { flexDirection: 'row', gap: theme.spacing.sm },
  step: { flex: 1, gap: 4 },
  stepNumber: { color: theme.colors.green, fontSize: theme.typography.label, fontWeight: '800' },
  stepTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '800' },
  stepDetail: { color: theme.colors.textSubtle, fontSize: theme.typography.label, lineHeight: 16 },
  responseHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardLabel: { color: theme.colors.text, fontSize: theme.typography.heading, fontWeight: '800' },
  model: { color: theme.colors.textSubtle, flexShrink: 1, fontSize: theme.typography.label },
  response: { color: theme.colors.text, fontSize: theme.typography.body, lineHeight: 23 },
  emptyResponse: { color: theme.colors.textMuted, fontSize: theme.typography.body, lineHeight: 23 },
});
