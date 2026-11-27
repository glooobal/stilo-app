import { Platform, PlatformColor, type ColorValue } from 'react-native';

/** iOS system color with a fallback for other platforms. */
function system(ios: string, fallback: string): ColorValue {
  return Platform.OS === 'ios' ? PlatformColor(ios) : fallback;
}

export const Colors = {
  background: Platform.select<ColorValue>({
    ios: PlatformColor('systemBackground'),
    android: PlatformColor('?attr/colorBackground'),
    default: '#FFFFFF',
  }),
  groupedBackground: system('systemGroupedBackground', '#F2F2F7'),
  card: system('secondarySystemGroupedBackground', '#FFFFFF'),
  label: system('label', '#000000'),
  secondaryLabel: system('secondaryLabel', '#6C6C70'),
  tertiaryLabel: system('tertiaryLabel', '#AEAEB2'),
  separator: system('separator', '#C6C6C8'),
  fill: system('systemFill', 'rgba(120, 120, 128, 0.2)'),
  tint: system('systemBlue', '#007AFF'),
  positive: system('systemGreen', '#34C759'),
  negative: system('systemRed', '#FF3B30'),
  warning: system('systemOrange', '#FF9500'),
  /** Background of portfolio icons (always gray, with a white symbol). */
  iconBackground: system('systemGray', '#8E8E93'),
};

/** Plain hex values for native views that need a concrete color (charts). */
export const ChartColors = {
  line: '#007AFF',
  profit: '#34C759',
  loss: '#FF3B30',
  baseline: '#8E8E93',
};
