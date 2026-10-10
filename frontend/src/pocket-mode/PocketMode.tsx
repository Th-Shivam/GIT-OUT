import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PocketState } from './pocketControls';
import { AppButton, StatusPill, Surface } from '../ui/components';
import { theme } from '../ui/theme';

interface Props {
  state: PocketState;
  transcript: string;
  answer: string;
  error: string;
  notice?: string;
  onMicrophone(): void;
  onStop(): void;
  onExit(): void;
}

export function PocketMode({ state, transcript, answer, error, notice = '', onMicrophone, onStop, onExit }: Props) {
  const waiting = state === 'Thinking' || state === 'Transcribing';
  const listening = state === 'Listening';
  const speaking = state === 'Speaking';
  const stateTone = state === 'Error' ? 'danger' : state === 'Ready' ? 'neutral' : 'positive';
  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.topRow}>
          <View><Text style={styles.kicker}>GIT OUT / POCKET</Text><Text style={styles.title}>Walk and think.</Text></View>
          <StatusPill label={state} tone={stateTone} />
        </View>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stateLabel}>{stateDescription(state)}</Text>
        <Text style={styles.help}>One tap starts a single question. Git Out stops listening after you finish and submits the transcript once.</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Finish speaking and submit' : 'Start a new voice question'}
          accessibilityState={{ disabled: waiting }}
          disabled={waiting}
          onPress={onMicrophone}
          style={({ pressed }) => [styles.mic, listening && styles.micListening, waiting && styles.disabled, pressed && !waiting && styles.pressed]}
        >
          <Text style={styles.micGlyph}>{listening ? '■' : '●'}</Text>
          <Text style={styles.micText}>{listening ? 'Finish speaking' : waiting ? 'Working locally…' : 'Tap to speak'}</Text>
          <Text style={styles.micHint}>{listening ? 'Your answer will be submitted once' : speaking ? 'Speaking your last answer' : 'Foreground microphone only'}</Text>
        </Pressable>

        <View style={styles.actions}>
          <AppButton label={speaking ? 'Stop speaking' : 'Stop / cancel'} onPress={onStop} variant="danger" />
          <AppButton label="Exit Pocket Mode" onPress={onExit} variant="quiet" />
        </View>

        {error ? <Surface><Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text></Surface> : null}
        {notice ? <Surface><Text style={styles.notice}>{notice}</Text></Surface> : null}
        <Surface raised>
          <Text style={styles.label}>You said</Text>
          <Text selectable style={transcript ? styles.text : styles.placeholder}>{transcript || 'Your completed question will appear here.'}</Text>
        </Surface>
        <Surface raised>
          <Text style={styles.label}>Git Out</Text>
          <Text selectable style={answer ? styles.text : styles.placeholder}>{answer || 'The local answer will stay readable even when speech is unavailable.'}</Text>
        </Surface>
        <Text style={styles.footer}>Headset media buttons can stop active speech and may map to a voice turn on supported Android devices. The in-app controls are the reliable fallback.</Text>
      </ScrollView>
    </View>
  );
}

function stateDescription(state: PocketState) {
  switch (state) {
    case 'Listening': return 'Listening for your thought';
    case 'Transcribing': return 'Transcribing on device';
    case 'Thinking': return 'Thinking with local Qwen';
    case 'Speaking': return 'Speaking your answer';
    case 'Error': return 'Pocket Mode needs attention';
    default: return 'Ready for one question';
  }
}

const styles = StyleSheet.create({
  shell: { backgroundColor: theme.colors.canvas, flex: 1 },
  screen: { gap: theme.spacing.lg, padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, paddingTop: 44 },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: theme.colors.green, fontSize: theme.typography.label, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '800', marginTop: 5 },
  stateLabel: { color: theme.colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  help: { color: theme.colors.textMuted, fontSize: theme.typography.body, lineHeight: 23 },
  mic: { alignItems: 'center', backgroundColor: theme.colors.greenSoft, borderColor: '#56d364', borderRadius: 24, borderWidth: 1, gap: 8, justifyContent: 'center', minHeight: 190, padding: theme.spacing.xl },
  micListening: { backgroundColor: '#5d2027', borderColor: '#ff7b72' },
  micGlyph: { color: theme.colors.white, fontSize: 42 },
  micText: { color: theme.colors.white, fontSize: 23, fontWeight: '800' },
  micHint: { color: '#c8e6ce', fontSize: theme.typography.small },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  label: { color: theme.colors.green, fontSize: theme.typography.label, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  text: { color: theme.colors.text, fontSize: 17, lineHeight: 26 },
  placeholder: { color: theme.colors.textMuted, fontSize: theme.typography.body, lineHeight: 23 },
  error: { color: '#ff7b72', fontSize: theme.typography.body, lineHeight: 22 },
  notice: { color: '#e3b341', fontSize: theme.typography.small, lineHeight: 19 },
  footer: { color: theme.colors.textSubtle, fontSize: theme.typography.small, lineHeight: 19, paddingHorizontal: theme.spacing.sm },
});
