import {
  Platform,
  PlatformColor,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';

import { Colors } from '@/constants/colors';
import type { AllocationSegment } from '@/lib/allocation';
import { formatPercent } from '@/lib/number';

/** Segment colors in order; "Inne" is always gray. */
const SEGMENT_COLORS: [ios: string, fallback: string][] = [
  ['systemBlue', '#007AFF'],
  ['systemTeal', '#30B0C7'],
  ['systemIndigo', '#5856D6'],
  ['systemOrange', '#FF9500'],
  ['systemPink', '#FF2D55'],
];

function segmentColor(segment: AllocationSegment, index: number): ColorValue {
  if (segment.key === 'other') return Colors.tertiaryLabel;
  const [ios, fallback] = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
  return Platform.OS === 'ios' ? PlatformColor(ios) : fallback;
}

/**
 * Structure of the portfolio as one thin bar of the biggest positions, with
 * the legend in one line under it that scrolls sideways when it does not fit.
 */
export function AllocationBar({ segments }: { segments: AllocationSegment[] }) {
  if (segments.length < 2) return null;
  const description = segments
    .map((segment) => `${segment.label} ${formatPercent(segment.share, false)}`)
    .join(', ');

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Struktura portfela: ${description}`}>
      <View style={styles.bar}>
        {segments.map((segment, index) => (
          <View
            key={segment.key}
            style={{ flex: segment.share, backgroundColor: segmentColor(segment, index) }}
          />
        ))}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Edge to edge, so items scroll out under the card's rounded border.
        style={styles.legendScroll}
        contentContainerStyle={styles.legend}>
        {segments.map((segment, index) => (
          <View key={segment.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: segmentColor(segment, index) }]} />
            <Text numberOfLines={1} style={styles.legendLabel}>
              {segment.label}
            </Text>
            <Text style={styles.legendShare}>{formatPercent(segment.share, false)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 18,
  },
  bar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
  },
  legendScroll: {
    marginHorizontal: -16,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 13,
    color: Colors.label,
  },
  legendShare: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    fontVariant: ['tabular-nums'],
  },
});
