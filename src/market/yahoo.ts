import { fromISODate, toISODate } from '@/lib/date';

import { RateLimitedError, RequestQueue } from './request-queue';
import {
  MarketDataError,
  type InstrumentSearchResult,
  type InstrumentType,
  type MarketDataProvider,
  type PriceHistory,
  type PriceQuote,
  type DividendEvent,
  type StockSplit,
} from './types';

// Unofficial Yahoo Finance endpoints. They can change without notice; keep all
// Yahoo-specific parsing in this file.
const BASE_URL = 'https://query2.finance.yahoo.com';

const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

/**
 * Yahoo exchange codes for the supported markets: the US and Europe.
 * German regional exchanges (Frankfurt, Stuttgart, Munich, Berlin, ...) are
 * left out on purpose: they mostly carry secondary listings of foreign stocks,
 * which made every search show the same company several times. Xetra (GER)
 * stays as the main German market.
 */
const SUPPORTED_EXCHANGES = new Set([
  // United States
  'NMS', 'NGM', 'NCM', 'NYQ', 'ASE', 'PCX', 'BTS', 'NAS', 'NYS',
  // Germany (Xetra)
  'GER',
  // Rest of Europe
  'LSE', 'IOB', 'PAR', 'AMS', 'BRU', 'LIS', 'MIL', 'MCE', 'EBS', 'VIE', 'STO',
  'CPH', 'HEL', 'OSL', 'ICE', 'WSE', 'ISE', 'PRA', 'ATH', 'BUD',
]);

const SUPPORTED_TYPES = new Set<InstrumentType>(['EQUITY', 'ETF']);

type YahooSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
};

type YahooChartResult = {
  meta?: {
    currency?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    currentTradingPeriod?: { regular?: { start?: number; end?: number } };
  };
  timestamp?: number[];
  events?: {
    splits?: Record<string, { date?: number; numerator?: number; denominator?: number }>;
    dividends?: Record<string, { date?: number; amount?: number }>;
  };
  indicators?: { quote?: { close?: (number | null)[] }[] };
};

/** Shared by all requests to Yahoo, see `RequestQueue`. */
// Like a browser loading a page: a few parallel requests, briefly spaced.
const queue = new RequestQueue({ maxConcurrent: 6, minIntervalMs: 40, cooldownMs: 30_000 });

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return queue.run(async () => {
    let response: Response;
    try {
      response = await fetch(url, { headers: HEADERS, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new MarketDataError('Brak połączenia z serwerem notowań.');
    }
    if (response.status === 429) {
      queue.markRateLimited();
      throw new MarketDataError('Zbyt wiele zapytań. Spróbuj ponownie za chwilę.');
    }
    if (!response.ok) {
      throw new MarketDataError(`Nie udało się pobrać danych (${response.status}).`);
    }
    try {
      return (await response.json()) as T;
    } catch {
      // An HTML error page or a cut-off response instead of JSON.
      throw new MarketDataError('Nieprawidłowa odpowiedź serwera notowań.');
    }
  }, signal).catch((error: unknown) => {
    if (error instanceof RateLimitedError) throw new MarketDataError(error.message);
    throw error;
  });
}

/**
 * Yahoo keeps prices as 32-bit floats, so a close of 27.81 arrives as
 * 27.809999465942383. This recovers the decimal price it stands for (the
 * shortest one with the same 32-bit value), without rounding anything:
 * a value that is not a 32-bit float is returned as it is.
 */
export function decodeYahooPrice(value: number): number {
  if (!Number.isFinite(value) || Math.fround(value) !== value) return value;
  for (let digits = 1; digits <= 9; digits++) {
    const candidate = Number(value.toPrecision(digits));
    if (Math.fround(candidate) === value) return candidate;
  }
  return value;
}

/**
 * Some markets quote in minor units (London in pence, `GBp`).
 * Prices are converted to the major currency by dividing by 100 (exact for
 * decimal prices, unlike multiplying by 0.01).
 */
function currencyDivisor(currency: string): { currency: string; divisor: number } {
  if (currency === 'GBp' || currency === 'GBX') {
    return { currency: 'GBP', divisor: 100 };
  }
  return { currency: currency.toUpperCase(), divisor: 1 };
}

function toPrice(value: number, divisor: number): number {
  return decodeYahooPrice(value) / divisor;
}

function normalizeCurrency(currency: string, price: number): { currency: string; price: number } {
  const { currency: normalized, divisor } = currencyDivisor(currency);
  return { currency: normalized, price: toPrice(price, divisor) };
}

const SECONDS_PER_DAY = 24 * 60 * 60;

/** Fetches `/v8/finance/chart` and normalizes it to a `PriceHistory`. */
async function fetchChart(
  symbol: string,
  query: Record<string, string>,
  isIntraday: boolean,
  signal?: AbortSignal
): Promise<PriceHistory> {
  const params = new URLSearchParams({ ...query, includePrePost: 'false' });
  const data = await getJson<{ chart?: { result?: YahooChartResult[] | null } }>(
    `${BASE_URL}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`,
    signal
  );
  const result = data.chart?.result?.[0];
  const rawCurrency = result?.meta?.currency;
  if (!result || !rawCurrency) {
    throw new MarketDataError('Brak danych o cenie dla tego instrumentu.');
  }

  const { currency, divisor } = currencyDivisor(rawCurrency);
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points = [];
  for (let index = 0; index < timestamps.length; index++) {
    const close = closes[index];
    if (close != null) points.push({ time: timestamps[index] * 1000, close: toPrice(close, divisor) });
  }

  const meta = result.meta ?? {};
  // For a one-day chart `chartPreviousClose` is yesterday's close.
  const previousClose = isIntraday
    ? (meta.chartPreviousClose ?? meta.previousClose)
    : meta.previousClose;
  const regular = meta.currentTradingPeriod?.regular;
  const now = Date.now() / 1000;
  return {
    symbol,
    currency,
    price: meta.regularMarketPrice != null ? toPrice(meta.regularMarketPrice, divisor) : null,
    previousClose: previousClose != null ? toPrice(previousClose, divisor) : null,
    points,
    isMarketOpen:
      isIntraday && regular?.start != null && regular.end != null
        ? now >= regular.start && now < regular.end
        : undefined,
    fetchedAt: Date.now(),
  };
}

export const yahooFinance: MarketDataProvider = {
  async searchInstruments(query, signal) {
    const params = new URLSearchParams({
      q: query,
      quotesCount: '20',
      newsCount: '0',
      listsCount: '0',
    });
    const data = await getJson<{ quotes?: YahooSearchQuote[] }>(
      `${BASE_URL}/v1/finance/search?${params}`,
      signal
    );

    const results: InstrumentSearchResult[] = [];
    for (const quote of data.quotes ?? []) {
      const type = quote.quoteType as InstrumentType | undefined;
      if (!quote.symbol || !quote.exchange || !type) continue;
      if (!SUPPORTED_TYPES.has(type) || !SUPPORTED_EXCHANGES.has(quote.exchange)) continue;

      results.push({
        symbol: quote.symbol,
        name: quote.longname ?? quote.shortname ?? quote.symbol,
        exchange: quote.exchange,
        exchangeName: quote.exchDisp ?? quote.exchange,
        type,
      });
    }
    return results;
  },

  async getQuote(symbol, date, signal) {
    const params = new URLSearchParams({ interval: '1d' });
    if (date) {
      // A window before the date covers weekends and holidays.
      const day = Math.floor(fromISODate(date).getTime() / 1000);
      params.set('period1', String(day - 7 * SECONDS_PER_DAY));
      params.set('period2', String(day + SECONDS_PER_DAY));
    } else {
      params.set('range', '5d');
    }

    const data = await getJson<{ chart?: { result?: YahooChartResult[] | null } }>(
      `${BASE_URL}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`,
      signal
    );
    const result = data.chart?.result?.[0];
    const currency = result?.meta?.currency;
    if (!result || !currency) {
      throw new MarketDataError('Brak danych o cenie dla tego instrumentu.');
    }

    if (!date) {
      const price = result.meta?.regularMarketPrice;
      const time = result.meta?.regularMarketTime;
      if (price == null) {
        throw new MarketDataError('Brak aktualnej ceny dla tego instrumentu.');
      }
      return {
        symbol,
        ...normalizeCurrency(currency, price),
        date: toISODate(time ? new Date(time * 1000) : new Date()),
      } satisfies PriceQuote;
    }

    // Last close on or before the requested date.
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    for (let index = timestamps.length - 1; index >= 0; index--) {
      const close = closes[index];
      const closeDate = toISODate(new Date(timestamps[index] * 1000));
      if (close != null && closeDate <= date) {
        return { symbol, ...normalizeCurrency(currency, close), date: closeDate };
      }
    }
    throw new MarketDataError('Brak ceny zamknięcia z tego dnia.');
  },

  getIntraday(symbol, signal) {
    return fetchChart(symbol, { range: '1d', interval: '5m' }, true, signal);
  },

  getLongHistory(symbol, signal) {
    return fetchChart(symbol, { range: 'max', interval: '1wk' }, false, signal);
  },

  async getCorporateEvents(symbol, fromDate, signal) {
    // Monthly candles keep the response small; only the events matter.
    const params = new URLSearchParams({
      period1: String(Math.floor(fromISODate(fromDate).getTime() / 1000)),
      period2: String(Math.floor(Date.now() / 1000)),
      interval: '1mo',
      events: 'div,split',
    });
    const data = await getJson<{ chart?: { result?: YahooChartResult[] | null } }>(
      `${BASE_URL}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`,
      signal
    );
    const result = data.chart?.result?.[0];
    if (!result) throw new MarketDataError('Brak danych o zdarzeniach dla tego instrumentu.');

    const splits: StockSplit[] = [];
    for (const event of Object.values(result.events?.splits ?? {})) {
      const { date, numerator, denominator } = event;
      if (date == null || !numerator || !denominator) continue;
      splits.push({ date: toISODate(new Date(date * 1000)), numerator, denominator });
    }

    // Dividends are in the currency of the quotes (London in pence too).
    const { currency, divisor } = currencyDivisor(result.meta?.currency ?? '');
    const dividends: DividendEvent[] = [];
    for (const event of Object.values(result.events?.dividends ?? {})) {
      if (event.date == null || !event.amount || !currency) continue;
      dividends.push({
        exDate: toISODate(new Date(event.date * 1000)),
        amount: toPrice(event.amount, divisor),
        currency,
      });
    }
    const byDate = <T extends { date?: string; exDate?: string }>(a: T, b: T) =>
      (a.date ?? a.exDate ?? '') < (b.date ?? b.exDate ?? '') ? -1 : 1;
    return { splits: splits.sort(byDate), dividends: dividends.sort(byDate) };
  },

  getDailyCloses(symbol, fromDate, signal) {
    const period1 = Math.floor(fromISODate(fromDate).getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    return fetchChart(
      symbol,
      { period1: String(period1), period2: String(period2), interval: '1d' },
      false,
      signal
    );
  },
};
