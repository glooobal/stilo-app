import { parseDecimal } from './number';

export type GoalPeriod = 'month' | 'year';

/** Net dividends to receive a month or a year, in `currency`. */
export type DividendGoal = { amount: number; period: GoalPeriod; currency: string };

/** The smallest goal that can be set. */
export const MIN_GOAL = 1;

export const GOAL_PERIOD_LABELS: Record<GoalPeriod, string> = {
  month: 'Miesięcznie',
  year: 'Rocznie',
};

/**
 * Reads a saved goal: `{"amount":"500","period":"month","currency":"PLN"}`.
 * Goals saved before currencies existed are in `fallbackCurrency`.
 */
export function parseStoredGoal(text: string | null, fallbackCurrency: string): DividendGoal | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as { amount?: unknown; period?: unknown; currency?: unknown };
    const amount =
      typeof data.amount === 'string'
        ? parseDecimal(data.amount)
        : typeof data.amount === 'number'
          ? data.amount
          : null;
    if (amount == null || !Number.isFinite(amount) || amount < MIN_GOAL) return null;
    return {
      amount,
      period: data.period === 'year' ? 'year' : 'month',
      currency:
        typeof data.currency === 'string' && data.currency ? data.currency : fallbackCurrency,
    };
  } catch {
    return null;
  }
}

/**
 * Net dividends received in the last 12 months (already in the goal's
 * currency), as the goal counts them: the sum for a yearly goal, the
 * monthly average for a monthly one.
 */
export function goalActual(goal: DividendGoal, receivedLast12Months: number): number {
  return goal.period === 'year' ? receivedLast12Months : receivedLast12Months / 12;
}

/** How far towards the goal (0–1, more when exceeded). */
export function goalProgress(goal: DividendGoal, actual: number): number {
  return goal.amount > 0 ? Math.max(0, actual) / goal.amount : 0;
}
