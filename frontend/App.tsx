import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>GIT OUT</Text>
      <Text style={styles.title}>Your next walk starts here.</Text>
      <Text style={styles.subtitle}>
        A voice-first companion for talking through your code while you touch
        grass.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f1e8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
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
    textAlign: 'center',
  },
  subtitle: {
    color: '#526056',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
    maxWidth: 320,
    textAlign: 'center',
  },
});
