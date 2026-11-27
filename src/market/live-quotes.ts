import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { forgetCached } from './cache';

/**
 * Keeps current prices fresh while the app is open. One clock for the whole
 * app: it drops the cached intraday quotes and bumps a version, and every
 * mounted valuation reloads them (sharing the same requests). Stored daily
 * closes are not downloaded again, so a refresh is only one request per
 * instrument and currency.
 */

/** While some market is open: about as often as Yahoo's minute candles matter. */
const OPEN_MARKET_INTERVAL_MS = 60 * 1000;
/** Everything closed (evening, weekend): prices hardly change. */
const CLOSED_MARKET_INTERVAL_MS = 15 * 60 * 1000;
const CHECK_EVERY_MS = 15 * 1000;

let version = 0;
let lastRefresh = Date.now();
let isSomeMarketOpen = true;
const listeners = new Set<() => void>();

/** Fetches current prices again (pull to refresh, the timer, back from background). */
export function refreshQuotes() {
  forgetCached('intraday:');
  lastRefresh = Date.now();
  version++;
  for (const listener of listeners) listener();
}

/** Reported after quotes load, to slow the timer down when nothing trades. */
export function reportMarketOpen(isOpen: boolean) {
  isSomeMarketOpen = isOpen;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever current prices should be loaded again. */
export function useQuotesVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

function refreshIfDue() {
  const interval = isSomeMarketOpen ? OPEN_MARKET_INTERVAL_MS : CLOSED_MARKET_INTERVAL_MS;
  if (Date.now() - lastRefresh >= interval) refreshQuotes();
}

/** Runs the clock while the app is in the foreground (mount once, in the root layout). */
export function useLiveQuotes() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      refreshIfDue();
      timer = setInterval(refreshIfDue, CHECK_EVERY_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, []);
}
