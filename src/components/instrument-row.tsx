import { Platform, PlatformColor, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Instrument, InstrumentSearchResult } from '@/market/types';

import { InstrumentLogo } from './instrument-logo';

/** Logo size in rows; also used to inset separators so they align with the text. */
export const INSTRUMENT_LOGO_SIZE = 36;

type InstrumentRowProps = {
  instrument: InstrumentSearchResult | Instrument;
  /** Optional right-hand detail, e.g. held quantity. */
  detail?: string;
  /** Shows a "W portfelu" badge: the user holds this instrument. */
  isHeld?: boolean;
  onPress: () => void;
};

const TYPE_LABELS: Record<InstrumentSearchResult['type'], string> = {
  EQUITY: 'Akcje',
  ETF: 'ETF',
};

export function InstrumentRow({ instrument, detail, isHeld = false, onPress }: InstrumentRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <InstrumentLogo
        symbol={instrument.symbol}
        name={instrument.name}
        size={INSTRUMENT_LOGO_SIZE}
      />
      <View style={styles.texts}>
        <Text numberOfLines={1} style={styles.name}>
          {instrument.name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {instrument.symbol} · {instrument.exchangeName} · {TYPE_LABELS[instrument.type]}
        </Text>
      </View>
      {isHeld ? (
        <View style={styles.badge} accessibilityLabel="Masz w portfelu">
          <Text style={styles.badgeText}>W portfelu</Text>
        </View>
      ) : null}
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </Pressable>
  );
}

const color = (ios: string, fallback: string) =>
  Platform.OS === 'ios' ? PlatformColor(ios) : fallback;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  pressed: {
    backgroundColor: color('systemFill', 'rgba(120, 120, 128, 0.2)'),
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 17,
    color: color('label', '#000000'),
  },
  meta: {
    fontSize: 13,
    color: color('secondaryLabel', '#6C6C70'),
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: color('systemFill', 'rgba(120, 120, 128, 0.2)'),
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: color('systemBlue', '#007AFF'),
  },
  detail: {
    fontSize: 15,
    color: color('secondaryLabel', '#6C6C70'),
    fontVariant: ['tabular-nums'],
  },
});
