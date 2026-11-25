import {
  getLastStoredDate,
  getPriceHistoryMeta,
  readLatestCloses,
  readStoredCloses,
  storeCloses,
} from '@/db/price-history';
import { getSplitsMeta, storeSplits } from '@/db/splits';
import { fromISODate, toISODate } from '@/lib/date';

import { cached } from './cache';
import { marketData } from './provider';
import type { PriceHistory } from './types';

const INTRADAY_TTL_MS = 2 * 60 * 1000;
/** Stored closes are topped up with new days at most this often. */
const DAILY_REFRESH_MS = 15 * 60 * 1000;
/** Extra days before a range so a price exists at its start (weekends, holidays). */
const LOOKBACK_DAYS = 7;
/** Re-download a few recent days on top-up, as the last candles can still change. */
const OVERLAP_DAYS = 5;

let staleBefore = 0;

/** Makes the next loads top up stored closes regardless of their age (pull to refresh). */
export function markHistoryStale() {
  staleBefore = Date.now();
}

function shiftDate(date: string, days: number): string {
  const day = fromISODate(date);
  day.setDate(day.getDate() + days);
  return toISODate(day);
}

/** Today's session with the latest price and previous close (memory cache only). */
export function loadIntraday(symbol: string): Promise<PriceHistory> {
  return cached(`intraday:${symbol}`, INTRADAY_TTL_MS, () => marketData.getIntraday(symbol));
}

/**
 * Weekly closes of the whole listing (memory cache only; not stored, so the
 * stored daily closes stay daily).
 */
export function loadLongHistory(symbol: string): Promise<PriceHistory> {
  return cached(`long:${symbol}`, 30 * 60 * 1000, () => marketData.getLongHistory(symbol));
}

/**
 * Daily closes from `fromDate` (a few days earlier, see LOOKBACK_DAYS).
 * Served from SQLite; the provider is asked only for days that are missing:
 * the full range on first use, later just the newest days.
 */
export function loadDailyHistory(symbol: string, fromDate: string): Promise<PriceHistory> {
  const readFrom = shiftDate(fromDate, -LOOKBACK_DAYS);

  return cached(`daily:${symbol}:${readFrom}`, 60 * 1000, async () => {
    const meta = getPriceHistoryMeta(symbol);
    let currency = meta?.currency ?? null;

    if (!meta || meta.startDate > readFrom) {
      // Not stored yet, or the range reaches further back than what is stored.
      try {
        const fetched = await marketData.getDailyCloses(symbol, readFrom);
        storeCloses(symbol, fetched.currency, fetched.points, readFrom);
        currency = fetched.currency;
      } catch (error) {
        if (!meta) throw error;
      }
    } else if (Date.now() - meta.fetchedAt > DAILY_REFRESH_MS || meta.fetchedAt <= staleBefore) {
      const lastDate = getLastStoredDate(symbol) ?? readFrom;
      try {
        const fetched = await marketData.getDailyCloses(symbol, shiftDate(lastDate, -OVERLAP_DAYS));
        storeCloses(symbol, fetched.currency, fetched.points, meta.startDate);
        currency = fetched.currency;
      } catch {
        // Offline or rate limited: the stored closes are still useful.
      }
    }

    if (!currency) throw new Error(`No price history for ${symbol}`);
    return {
      symbol,
      currency,
      price: null,
      previousClose: null,
      points: readStoredCloses(symbol, readFrom),
    };
  });
}

/**
 * Quote built from the newest stored daily close, used when the current price
 * cannot be downloaded (offline, rate limit). `null` when nothing is stored.
 */
export function storedQuote(symbol: string): PriceHistory | null {
  const meta = getPriceHistoryMeta(symbol);
  const [latest, previous] = readLatestCloses(symbol);
  if (!meta || !latest) return null;
  return {
    symbol,
    currency: meta.currency,
    price: latest.close,
    previousClose: previous?.close ?? null,
    points: [],
    isMarketOpen: false,
    fetchedAt: meta.fetchedAt,
    isStored: true,
    priceTime: latest.time,
  };
}

/** Yahoo symbol of a currency pair, e.g. `USDPLN=X`. */
export function fxSymbol(from: string, to: string) {
  return `${from}${to}=X`;
}

/** Splits are checked again after this long. */
const SPLITS_REFRESH_MS = 12 * 60 * 60 * 1000;

/** Splits found new that were already reported once (see `loadSplits`). */
const reportedSplits = new Set<string>();

/**
 * Makes sure the splits of a symbol since `fromDate` are stored (checked at
 * most every few hours). Returns `true` once when a new split was found: the
 * transactions then count in different shares and the stored closes were
 * dropped to be downloaded again, already adjusted.
 */
export async function loadSplits(symbol: string, fromDate: string): Promise<boolean> {
  const key = `splits:${symbol}:${fromDate}`;
  const isNew = await cached(key, 5 * 60 * 1000, async () => {
    reportedSplits.delete(key);
    const meta = getSplitsMeta(symbol);
    const isFresh =
      meta != null &&
      meta.checkedFrom <= fromDate &&
      Date.now() - meta.fetchedAt < SPLITS_REFRESH_MS &&
      meta.fetchedAt > staleBefore;
    if (isFresh) return false;
    const checkFrom = meta && meta.checkedFrom < fromDate ? meta.checkedFrom : fromDate;
    const splits = await marketData.getSplits(symbol, checkFrom);
    return storeSplits(symbol, splits, checkFrom);
  });
  // The cached answer is shared; a new split is reported only the first time.
  if (!isNew || reportedSplits.has(key)) return false;
  reportedSplits.add(key);
  return true;
}
