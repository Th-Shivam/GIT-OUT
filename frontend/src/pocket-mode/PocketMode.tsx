import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PocketState } from './pocketControls';

interface Props {
  state: PocketState;
  transcript: string;
  answer: string;
  error: string;
  onMicrophone(): void;
  onStop(): void;
  onExit(): void;
}

export function PocketMode({ state, transcript, answer, error, onMicrophone, onStop, onExit }: Props) {
  const waiting = state === 'Thinking' || state === 'Transcribing';
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Pocket Mode</Text>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.state}>{state}</Text>
      <Text style={styles.help}>Tap to speak. Your completed transcript is submitted once, and the final answer is spoken.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state === 'Listening' ? 'Finish speaking and submit' : 'Start a new voice question'}
        accessibilityState={{ disabled: waiting }}
        disabled={waiting}
        onPress={onMicrophone}
        style={[styles.control, waiting && styles.disabled]}
      >
        <Text style={styles.controlText}>{state === 'Listening' ? 'Finish speaking' : waiting ? 'Please wait…' : 'Microphone'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onStop} style={[styles.control, styles.stop]}>
        <Text style={styles.controlText}>Stop speaking / cancel</Text>
      </Pressable>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <View style={styles.textCard}>
        <Text style={styles.label}>You said</Text>
        <Text selectable style={styles.text}>{transcript || 'Your question will appear here.'}</Text>
      </View>
      <View style={styles.textCard}>
        <Text style={styles.label}>Git Out</Text>
        <Text selectable style={styles.text}>{answer || 'The answer will stay here, even if speech is unavailable.'}</Text>
      </View>
      <Text style={styles.help}>Microphone actions require Git Out in the foreground. Use these controls if your headset buttons are unsupported.</Text>
      <Pressable accessibilityRole="button" onPress={onExit} style={[styles.control, styles.exit]}>
        <Text style={styles.controlText}>Exit Pocket Mode</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: '#f4f1e8', padding: 24, paddingTop: 48, gap: 18 },
  title: { color: '#1e2a23', fontSize: 28, fontWeight: '700' },
  state: { color: '#2f6f4e', fontSize: 40, fontWeight: '800' },
  help: { color: '#526056', fontSize: 16, lineHeight: 24 },
  control: { minHeight: 80, padding: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#2f6f4e' },
  controlText: { color: '#fffdf7', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  stop: { backgroundColor: '#7e2f2a' },
  exit: { backgroundColor: '#526056' },
  disabled: { opacity: 0.5 },
  textCard: { backgroundColor: '#fffdf7', padding: 18, borderRadius: 16, gap: 10 },
  label: { color: '#526056', fontSize: 14, fontWeight: '700' },
  text: { color: '#1e2a23', fontSize: 19, lineHeight: 28 },
  error: { color: '#7e2f2a', fontSize: 17, lineHeight: 25 },
});
