import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getAllDividendEvents } from '@/db/dividend-events';
import { getDividends } from '@/db/dividends';
import { useDataVersion } from '@/db/events';
import { listPortfolios } from '@/db/portfolios';
import { getTransactions } from '@/db/transactions';
import { fromISODate, todayISODate } from '@/lib/date';
import { getDividendGoal, goalActual, goalKey } from '@/lib/dividend-goal';
import { storedRate } from '@/hooks/use-fx-rate';
import {
  NOTIFICATION_HOUR,
  NOTIFICATION_ID_PREFIX,
  planDividendNotifications,
  type DeclaredPayment,
} from '@/lib/dividend-notifications';
import { addDays, dividendInBase, expectedDividends } from '@/lib/dividends';
import { areDividendNotificationsOn, hasNotificationPermission } from '@/lib/notifications';
import { formatMoney } from '@/lib/number';
import { readTextPreference, writePreference } from '@/lib/preferences';
import { getSummaryCurrency } from '@/lib/settings';
import { fxSymbol, storedQuote } from '@/market/history';

const GOAL_NOTIFIED_PREFERENCE = 'notifications.goalReached';

async function replanNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.identifier.startsWith(NOTIFICATION_ID_PREFIX))
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
  );
  if (!areDividendNotificationsOn() || !(await hasNotificationPermission())) return;

  const currency = getSummaryCurrency();
  const today = todayISODate();
  // Current rates from the stored quotes (no download needed for reminders).
  const rate = (from: string) =>
    from === currency ? 1 : (storedQuote(fxSymbol(from, currency))?.price ?? null);

  const transactions = getTransactions();
  const names = new Map(transactions.map((item) => [item.symbol, item.instrument.name]));

  // Expected payments, one per company and day (summed over portfolios).
  const payments = new Map<string, DeclaredPayment>();
  for (const item of expectedDividends({
    portfolios: listPortfolios(),
    transactions,
    events: getAllDividendEvents(),
    today,
  })) {
    if (!item.isDeclared) continue;
    const fx = rate(item.currency);
    const net = fx != null ? item.net * fx : null;
    const key = `${item.symbol}|${item.expectedDate}`;
    const existing = payments.get(key);
    payments.set(key, {
      symbol: item.symbol,
      name: names.get(item.symbol) ?? item.symbol,
      date: item.expectedDate,
      net: existing ? (existing.net != null && net != null ? existing.net + net : null) : net,
    });
  }

  const from = addDays(today, -365);
  let received = 0;
  for (const dividend of getDividends()) {
    if (dividend.paidAt <= from || dividend.paidAt > today) continue;
    received += dividendInBase(dividend, currency, (code) => rate(code))?.net ?? 0;
  }

  const goal = getDividendGoal();
  const goalRate = goal ? storedRate(currency, goal.currency) : null;
  // A goal reached right now: say so once (the payment reminders cannot).
  if (
    goal &&
    goalRate != null &&
    goalActual(goal, received * goalRate) >= goal.amount &&
    readTextPreference(GOAL_NOTIFIED_PREFERENCE) !== goalKey(goal)
  ) {
    writePreference(GOAL_NOTIFIED_PREFERENCE, goalKey(goal));
    await Notifications.scheduleNotificationAsync({
      identifier: `${NOTIFICATION_ID_PREFIX}goal-now`,
      content: {
        title: 'Cel dywidendowy osiągnięty',
        body: `Twoje dywidendy netto doszły do ${formatMoney(goal.amount, goal.currency)} ${goal.period === 'month' ? 'miesięcznie' : 'rocznie'}. Gratulacje!`,
      },
      trigger: null,
    });
  }

  for (const item of planDividendNotifications({
    payments: [...payments.values()],
    goal,
    receivedLast12Months: received,
    currency,
    goalRate,
    today,
  })) {
    const date = fromISODate(item.date);
    date.setHours(NOTIFICATION_HOUR, 0, 0, 0);
    await Notifications.scheduleNotificationAsync({
      identifier: item.id,
      content: { title: item.title, body: item.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
}

/**
 * Keeps the dividend reminders (payments, the goal) scheduled with the
 * system after every change of the data and when the app comes back, so
 * they arrive also while the app is closed.
 */
export function useDividendNotifications() {
  const dataVersion = useDataVersion();
  const [foregroundKey, setForegroundKey] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundKey((key) => key + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Planned a moment later: right after a change the data settles first.
    const timer = setTimeout(() => {
      replanNotifications().catch(() => {
        // Reminders are a nicety; never break the app over them.
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [dataVersion, foregroundKey]);
}
