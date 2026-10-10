export const theme = {
  colors: {
    canvas: '#0d1117',
    surface: '#161b22',
    surfaceRaised: '#21262d',
    surfaceStrong: '#30363d',
    border: '#30363d',
    borderSubtle: '#21262d',
    text: '#f0f6fc',
    textMuted: '#8b949e',
    textSubtle: '#6e7681',
    green: '#3fb950',
    greenSoft: '#238636',
    blue: '#58a6ff',
    yellow: '#d29922',
    red: '#f85149',
    white: '#ffffff',
  },
  spacing: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  typography: {
    display: 32,
    title: 24,
    heading: 18,
    body: 15,
    small: 12,
    label: 11,
  },
} as const;

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info';

export const statusColors: Record<StatusTone, { background: string; text: string }> = {
  neutral: { background: theme.colors.surfaceStrong, text: theme.colors.textMuted },
  positive: { background: '#1f3d29', text: '#7ee787' },
  warning: { background: '#3d2f16', text: '#e3b341' },
  danger: { background: '#3d1d22', text: '#ff7b72' },
  info: { background: '#172d4d', text: '#79c0ff' },
};
