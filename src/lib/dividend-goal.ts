import { Storage } from 'expo-sqlite/kv-store';

import { notifyDataChanged, useDataVersion } from '@/db/events';
import { PORTFOLIO_CURRENCIES } from '@/db/portfolios';

import { parseStoredGoal, type DividendGoal } from './dividend-goal-format';
import { toExactString } from './number';
import { readTextPreference, writePreference } from './preferences';
import { getSummaryCurrency } from './settings';

export {
  goalActual,
  goalProgress,
  GOAL_PERIOD_LABELS,
  MIN_GOAL,
  parseStoredGoal,
  type DividendGoal,
  type GoalPeriod,
} from './dividend-goal-format';

/** The goal as one JSON value, so amount, period and currency are saved together. */
const GOAL_PREFERENCE = 'dividends.goal';
const CELEBRATED_PREFERENCE = 'dividends.goalCelebrated';

export function getDividendGoal(): DividendGoal | null {
  return parseStoredGoal(readTextPreference(GOAL_PREFERENCE), getSummaryCurrency());
}

/**
 * Saves the goal (the amount exactly, as text); `null` removes it. Throws
 * when it cannot be saved, and checks that it reads back, so a failure is
 * never silent.
 */
export function setDividendGoal(goal: DividendGoal | null) {
  const value = goal
    ? JSON.stringify({
        amount: toExactString(goal.amount),
        period: goal.period,
        currency: goal.currency,
      })
    : '';
  Storage.setItemSync(GOAL_PREFERENCE, value);
  if (goal && getDividendGoal() == null) {
    throw new Error(`Zapisany cel nie daje się odczytać (${value}).`);
  }
  notifyDataChanged();
}

/**
 * Reads the goal as of a data version. The version is passed in on purpose:
 * the React Compiler caches calls whose arguments do not change, so
 * `getDividendGoal()` alone would be read once and never again.
 */
function readGoal(_version: number): DividendGoal | null {
  return getDividendGoal();
}

/** The dividend goal; updates when it changes. */
export function useDividendGoal(): DividendGoal | null {
  return readGoal(useDataVersion());
}

/** Currencies a goal can be set in. */
export const GOAL_CURRENCIES: readonly string[] = PORTFOLIO_CURRENCIES;

function goalKey(goal: DividendGoal): string {
  return `${toExactString(goal.amount)}|${goal.period}|${goal.currency}`;
}

/** The reached goal was celebrated already (shown once per goal). */
export function wasGoalCelebrated(goal: DividendGoal): boolean {
  return readTextPreference(CELEBRATED_PREFERENCE) === goalKey(goal);
}

export function markGoalCelebrated(goal: DividendGoal) {
  writePreference(CELEBRATED_PREFERENCE, goalKey(goal));
}

export { goalKey };
