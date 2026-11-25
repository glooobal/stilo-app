import { notifyDataChanged, useDataVersion } from '@/db/events';
import { PORTFOLIO_CURRENCIES } from '@/db/portfolios';

import { readPreference, writePreference } from './preferences';

const SUMMARY_CURRENCY_PREFERENCE = 'settings.summaryCurrency';
const DEFAULT_SUMMARY_CURRENCY = 'PLN';

/** Currency the summary of all portfolios is valued in (set in Settings). */
export function getSummaryCurrency(): string {
  return readPreference(SUMMARY_CURRENCY_PREFERENCE, PORTFOLIO_CURRENCIES, DEFAULT_SUMMARY_CURRENCY);
}

export function setSummaryCurrency(currency: string) {
  writePreference(SUMMARY_CURRENCY_PREFERENCE, currency);
  // Screens re-read their data (and revalue) like after any other change.
  notifyDataChanged();
}

/** The summary currency; updates when it is changed in Settings. */
export function useSummaryCurrency(): string {
  useDataVersion();
  return getSummaryCurrency();
}
