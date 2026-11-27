import { goalActual, type DividendGoal } from './dividend-goal-format';
import { formatMoney } from './number';

/** A dividend whose ex-date has passed and whose payment is ahead. */
export type DeclaredPayment = {
  symbol: string;
  name: string;
  /** Estimated payment day, `YYYY-MM-DD`. */
  date: string;
  /** Net amount in the main currency, `null` when no exchange rate is known. */
  net: number | null;
};

export type PlannedNotification = {
  /** Stable, so the same reminder is replaced and not doubled. */
  id: string;
  /** `YYYY-MM-DD`; shown at `NOTIFICATION_HOUR` local time. */
  date: string;
  title: string;
  body: string;
};

export const NOTIFICATION_ID_PREFIX = 'stilo-dividend-';
/** Morning, when the payments of the day are usually on the account. */
export const NOTIFICATION_HOUR = 10;

/**
 * Local notifications about dividends: every payment expected (on its
 * estimated day), and the day the dividend goal will be reached by them,
 * counting the payments in order on top of what came in the last 12 months.
 * A goal reached already is not announced again here.
 */
export function planDividendNotifications(input: {
  payments: readonly DeclaredPayment[];
  goal: DividendGoal | null;
  receivedLast12Months: number;
  currency: string;
  /** Rate of `currency` in the goal's currency; without it the goal is left out. */
  goalRate?: number | null;
  today: string;
}): PlannedNotification[] {
  const planned: PlannedNotification[] = [];
  const payments = input.payments
    .filter((payment) => payment.date > input.today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const payment of payments) {
    planned.push({
      id: `${NOTIFICATION_ID_PREFIX}${payment.symbol}-${payment.date}`,
      date: payment.date,
      title: `Dywidenda: ${payment.name}`,
      body:
        payment.net != null
          ? `Dziś powinna wpłynąć wypłata – ok. ${formatMoney(payment.net, input.currency)} netto.`
          : 'Dziś powinna wpłynąć wypłata dywidendy.',
    });
  }

  const goal = input.goal;
  const rate = goal ? (goal.currency === input.currency ? 1 : (input.goalRate ?? null)) : null;
  if (goal && rate != null && goalActual(goal, input.receivedLast12Months * rate) < goal.amount) {
    let total = input.receivedLast12Months;
    for (const payment of payments) {
      total += payment.net ?? 0;
      if (goalActual(goal, total * rate) >= goal.amount) {
        planned.push({
          id: `${NOTIFICATION_ID_PREFIX}goal`,
          date: payment.date,
          title: 'Cel dywidendowy osiągnięty',
          body: `Twoje dywidendy netto doszły do ${formatMoney(goal.amount, goal.currency)} ${goal.period === 'month' ? 'miesięcznie' : 'rocznie'}. Gratulacje!`,
        });
        break;
      }
    }
  }
  return planned;
}
