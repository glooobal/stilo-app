import type { InstrumentSearchResult } from '@/market/types';

import { readTextPreference, writePreference } from './preferences';
import { parseRecentViews } from './recent-views';

const RECENT_VIEWS_PREFERENCE = 'search.recentViews';

/** Instruments opened from the search, newest first. */
export function getRecentViews(): InstrumentSearchResult[] {
  return parseRecentViews(readTextPreference(RECENT_VIEWS_PREFERENCE));
}

export function saveRecentViews(list: readonly InstrumentSearchResult[]) {
  writePreference(RECENT_VIEWS_PREFERENCE, JSON.stringify(list));
}
