import {
  getAnalytics,
  logEvent,
  logScreenView,
  setAnalyticsCollectionEnabled,
} from '@react-native-firebase/analytics';

import { readTextPreference, writePreference } from './preferences';

/**
 * Usage statistics (Firebase Analytics), as the privacy policy describes:
 * which screens are opened and which features are used. Never amounts,
 * portfolios, transactions or instrument names. The user can switch it off
 * in Settings. Every call is safe: statistics never break the app.
 */

const ENABLED_PREFERENCE = 'analytics.enabled';

/** Events the app reports; parameters are only small counts and kinds. */
export type AnalyticsEvent =
  | { name: 'onboarding_complete'; params: { created_portfolio: boolean; set_goal: boolean } }
  | { name: 'portfolio_create'; params: { account_type: string; is_cash: boolean } }
  | { name: 'transaction_add'; params: { side: string } }
  | {
      name: 'import_complete';
      params: { broker: string; trades: number; dividends: number; cash_operations: number };
    }
  | { name: 'backup_restore'; params: Record<string, never> }
  | { name: 'backup_save'; params: Record<string, never> }
  | { name: 'dividend_goal_set'; params: { period: string } };

/** Statistics switched on in the app (on by default; see the privacy policy). */
export function isAnalyticsOn(): boolean {
  return readTextPreference(ENABLED_PREFERENCE) !== 'false';
}

function analytics() {
  try {
    return getAnalytics();
  } catch {
    // Not in this build (e.g. before the native rebuild).
    return null;
  }
}

/** Applies the setting (call once at start and after a change). */
export function applyAnalyticsSetting() {
  const instance = analytics();
  if (!instance) return;
  setAnalyticsCollectionEnabled(instance, isAnalyticsOn()).catch(() => {});
}

export function setAnalyticsOn(isOn: boolean) {
  writePreference(ENABLED_PREFERENCE, String(isOn));
  applyAnalyticsSetting();
}

export function track(event: AnalyticsEvent) {
  const instance = analytics();
  if (!instance || !isAnalyticsOn()) return;
  // Some typings return void for custom events: wrapped so a failure never surfaces.
  Promise.resolve()
    .then(() => logEvent(instance, event.name, event.params))
    .catch(() => {});
}

/**
 * A screen, by its route pattern (e.g. `(tabs)/(summary)/position/[symbol]`),
 * never with the symbol or ids from the address.
 */
export function trackScreen(route: string) {
  const instance = analytics();
  if (!instance || !isAnalyticsOn() || !route) return;
  logScreenView(instance, { screen_name: route, screen_class: route }).catch(() => {});
}
