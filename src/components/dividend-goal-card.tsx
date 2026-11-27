import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import { goalActual, goalProgress, type DividendGoal } from '@/lib/dividend-goal';
import { formatMoney, formatPercent } from '@/lib/number';

import { Card } from './card';

const openGoalSheet = () => router.push('/goal');

/**
 * The dividend goal against the net dividends received in the last 12
 * months (a monthly goal: their monthly average). Without a goal, a row to
 * set one; once reached, a row to set the next one.
 */
export function DividendGoalCard({
  goal,
  receivedLast12Months,
}: {
  goal: DividendGoal | null;
  /** Net dividends received in the last 12 months, in the goal's currency. */
  receivedLast12Months: number;
}) {
  if (goal == null) {
    return (
      <Card>
        <Pressable
          accessibilityRole="button"
          onPress={openGoalSheet}
          style={({ pressed }) => [styles.setRow, pressed && styles.pressedRow]}>
          <View style={styles.icon}>
            <SymbolView name="target" size={18} tintColor={Colors.tint} />
          </View>
          <Text style={styles.setTitle}>Ustaw cel dywidendowy</Text>
          <SymbolView name="chevron.right" size={13} tintColor={Colors.tertiaryLabel} />
        </Pressable>
      </Card>
    );
  }

  const currency = goal.currency;
  const isMonthly = goal.period === 'month';
  const unit = isMonthly ? 'mies.' : 'rok';
  const actual = goalActual(goal, receivedLast12Months);
  const progress = goalProgress(goal, actual);
  const isReached = progress >= 1;

  return (
    <Card
      title={isReached ? 'Cel osiągnięty' : 'Cel dywidendowy'}
      accessory={
        isReached ? undefined : (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={openGoalSheet}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.link}>Zmień</Text>
          </Pressable>
        )
      }>
      <View
        style={styles.block}
        accessible
        accessibilityLabel={`${isReached ? 'Cel osiągnięty' : 'Cel dywidendowy'}: ${formatMoney(goal.amount, currency)} na ${unit}. Otrzymujesz ${formatMoney(actual, currency)}, ${formatPercent(progress, false)} celu.`}>
        <Text style={styles.amount}>
          {formatMoney(actual, currency)}
          <Text style={styles.goal}>{` / ${formatMoney(goal.amount, currency)} ${unit}`}</Text>
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              {
                width: `${Math.min(progress, 1) * 100}%`,
                backgroundColor: isReached ? Colors.positive : Colors.tint,
              },
            ]}
          />
        </View>
        <Text style={styles.secondary}>
          {isReached
            ? `${formatPercent(progress, false)} celu – gratulacje!`
            : `${formatPercent(progress, false)} celu · brakuje ${formatMoney(goal.amount - actual, currency)} na ${unit}`}
        </Text>
      </View>
      {isReached ? (
        <Pressable
          accessibilityRole="button"
          onPress={openGoalSheet}
          style={({ pressed }) => [styles.nextRow, pressed && styles.pressedRow]}>
          <SymbolView name="target" size={17} tintColor={Colors.tint} />
          <Text style={styles.link}>Ustaw kolejny cel</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pressedRow: {
    backgroundColor: Colors.fill,
  },
  pressed: {
    opacity: 0.5,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.fill,
  },
  setTitle: {
    flex: 1,
    fontSize: 17,
    color: Colors.label,
  },
  link: {
    fontSize: 15,
    color: Colors.tint,
  },
  block: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  amount: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.label,
    fontVariant: ['tabular-nums'],
  },
  goal: {
    fontSize: 17,
    fontWeight: '500',
    color: Colors.secondaryLabel,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.fill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  secondary: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    fontVariant: ['tabular-nums'],
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.separator,
  },
});
