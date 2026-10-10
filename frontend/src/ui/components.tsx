import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { statusColors, theme, type StatusTone } from './theme';

export function Surface({ children, raised = false }: { children: ReactNode; raised?: boolean }) {
  return <View style={[styles.surface, raised && styles.raised]}>{children}</View>;
}

export function SectionHeading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return (
    <View style={styles.headingGroup}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.heading}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  const colors = statusColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <View style={[styles.dot, { backgroundColor: colors.text }]} />
      <Text style={[styles.pillText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  accessibilityLabel?: string;
}

export function AppButton({ label, onPress, disabled = false, variant = 'primary', accessibilityLabel }: AppButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function AppField(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} placeholderTextColor={props.placeholderTextColor ?? theme.colors.textSubtle} style={[styles.field, props.style]} />;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

export type AppTab = 'home' | 'chat' | 'github' | 'settings';

const tabs: Array<{ id: AppTab; label: string; glyph: string }> = [
  { id: 'home', label: 'Home', glyph: '⌂' },
  { id: 'chat', label: 'Chat', glyph: '◌' },
  { id: 'github', label: 'GitHub', glyph: '◈' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

export function TabBar({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab.id }}
          accessibilityLabel={`${tab.label} tab`}
          onPress={() => onChange(tab.id)}
          style={[styles.tab, active === tab.id && styles.tabActive]}
        >
          <Text style={[styles.glyph, active === tab.id && styles.glyphActive]}>{tab.glyph}</Text>
          <Text style={[styles.tabText, active === tab.id && styles.tabTextActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  raised: { backgroundColor: theme.colors.surfaceRaised },
  headingGroup: { gap: theme.spacing.xs },
  eyebrow: { color: theme.colors.green, fontSize: theme.typography.label, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  heading: { color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '800', letterSpacing: -0.4 },
  detail: { color: theme.colors.textMuted, fontSize: theme.typography.body, lineHeight: 22 },
  pill: { alignItems: 'center', borderRadius: theme.radius.pill, flexDirection: 'row', gap: 7, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { borderRadius: theme.radius.pill, height: 7, width: 7 },
  pillText: { fontSize: theme.typography.small, fontWeight: '700' },
  button: { alignItems: 'center', borderRadius: theme.radius.md, justifyContent: 'center', minHeight: 48, paddingHorizontal: theme.spacing.lg, paddingVertical: 12 },
  button_primary: { backgroundColor: theme.colors.greenSoft },
  button_secondary: { backgroundColor: theme.colors.surfaceStrong, borderColor: theme.colors.border, borderWidth: 1 },
  button_quiet: { backgroundColor: 'transparent', borderColor: theme.colors.border, borderWidth: 1 },
  button_danger: { backgroundColor: '#5d2027' },
  buttonText: { fontSize: theme.typography.body, fontWeight: '700', textAlign: 'center' },
  buttonText_primary: { color: theme.colors.white },
  buttonText_secondary: { color: theme.colors.text },
  buttonText_quiet: { color: theme.colors.textMuted },
  buttonText_danger: { color: '#ffdfdc' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  fieldLabel: { color: theme.colors.textMuted, fontSize: theme.typography.small, fontWeight: '700' },
  field: { backgroundColor: theme.colors.canvas, borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, fontSize: theme.typography.body, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12 },
  empty: { alignItems: 'center', borderColor: theme.colors.borderSubtle, borderRadius: theme.radius.md, borderStyle: 'dashed', borderWidth: 1, gap: theme.spacing.sm, padding: theme.spacing.xl },
  emptyTitle: { color: theme.colors.text, fontSize: theme.typography.heading, fontWeight: '700', textAlign: 'center' },
  emptyDetail: { color: theme.colors.textMuted, fontSize: theme.typography.body, lineHeight: 22, textAlign: 'center' },
  tabBar: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderTopWidth: 1, flexDirection: 'row', paddingBottom: 8, paddingHorizontal: 8, paddingTop: 8 },
  tab: { alignItems: 'center', borderRadius: theme.radius.md, flex: 1, gap: 3, minHeight: 54, justifyContent: 'center' },
  tabActive: { backgroundColor: '#1f3d29' },
  glyph: { color: theme.colors.textMuted, fontSize: 19, height: 22 },
  glyphActive: { color: theme.colors.green },
  tabText: { color: theme.colors.textMuted, fontSize: theme.typography.label, fontWeight: '700' },
  tabTextActive: { color: theme.colors.text },
});
