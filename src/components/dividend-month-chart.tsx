import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import { formatMoney } from '@/lib/number';

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTH_NAMES = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
];
const CHART_HEIGHT = 110;

/**
 * Dividends received per month of a year as simple bars; the current month
 * is marked. Read by VoiceOver as one summary.
 */
export function DividendMonthChart({
  months,
  currency,
  currentMonth,
}: {
  /** Net amount per month, January first. */
  months: number[];
  currency: string;
  /** Index of the current month when the year is the current one. */
  currentMonth: number | null;
}) {
  const max = Math.max(...months, 0);
  const description = months
    .map((amount, index) => (amount > 0 ? `${MONTH_NAMES[index]} ${formatMoney(amount, currency)}` : null))
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={styles.chart}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        description ? `Dywidendy netto w miesiącach: ${description}` : 'Brak dywidend w tym roku'
      }>
      {months.map((amount, index) => {
        const height = max > 0 ? Math.max((amount / max) * CHART_HEIGHT, amount > 0 ? 3 : 0) : 0;
        const isCurrent = index === currentMonth;
        return (
          <View key={MONTHS[index]} style={styles.column}>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  { height },
                  amount > 0 ? styles.filled : null,
                ]}
              />
            </View>
            <Text style={[styles.label, isCurrent && styles.currentLabel]}>{MONTHS[index]}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  track: {
    height: CHART_HEIGHT,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '72%',
    borderRadius: 4,
    borderCurve: 'continuous',
  },
  filled: {
    backgroundColor: Colors.positive,
  },
  label: {
    fontSize: 11,
    color: Colors.secondaryLabel,
  },
  currentLabel: {
    color: Colors.label,
    fontWeight: '600',
  },
});
