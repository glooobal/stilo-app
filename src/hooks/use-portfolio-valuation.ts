import { useCallback, useEffect, useMemo, useState } from 'react';

import { notifyDataChanged } from '@/db/events';
import type { Position } from '@/lib/positions';
import { readNumberPreference, writePreference } from '@/lib/preferences';
import { rangeStartTime } from '@/lib/ranges';
import {
  buildPortfolioSeries,
  valuePosition,
  type MarketSnapshot,
  type PortfolioSeries,
  type PositionValuation,
} from '@/lib/valuation';
import { clearMarketCache, forgetCached, mapWithConcurrency } from '@/market/cache';
import {
  fxSymbol,
  loadDailyHistory,
  loadIntraday,
  loadSplits,
  markHistoryStale,
  storedQuote,
} from '@/market/history';
import type { ChartRange, PriceHistory } from '@/market/types';

/** Local limit per batch; the shared request queue limits the provider calls. */
const CONCURRENCY = 8;
const UPDATED_AT_PREFERENCE = 'summary.pricesUpdatedAt';

/**
 * Everything downloaded for the positions, for every range at once: daily
 * closes since the first trade of each instrument, so switching the chart
 * range only recalculates and never waits for the network.
 */
type MarketData = {
  quotes: Map<string, PriceHistory>;
  fxQuotes: Map<string, PriceHistory>;
  /** Daily closes since the first trade, per symbol. */
  daily: Map<string, PriceHistory>;
  /** Daily currency rates since the first trade, per instrument currency. */
  fxDaily: Map<string, PriceHistory>;
};

type State = {
  data: MarketData | null;
  isLoading: boolean;
  error: string | null;
  /**
   * Some prices could not be downloaded (offline, rate limit, provider
   * error). The portfolio is still shown, valued at the stored prices; the
   * screens only say so briefly in the navigation bar.
   */
  syncError: boolean;
};

const EMPTY_LOAD = { map: new Map<string, PriceHistory>(), failed: 0 };

/** Data from stored closes only, when downloading failed altogether. */
function storedData(symbols: string[], fxSymbols: Map<string, string>): MarketData {
  const quotes = new Map<string, PriceHistory>();
  for (const symbol of symbols) {
    const quote = storedQuote(symbol);
    if (quote) quotes.set(symbol, quote);
  }
  const fxQuotes = new Map<string, PriceHistory>();
  for (const [currency, symbol] of fxSymbols) {
    const quote = storedQuote(symbol);
    if (quote) fxQuotes.set(currency, quote);
  }
  return { quotes, fxQuotes, daily: new Map(), fxDaily: new Map() };
}

/** Fills missing current quotes with the newest stored close. */
function withStoredFallback(
  result: { map: Map<string, PriceHistory>; failed: number },
  keys: string[],
  toSymbol: (key: string) => string
) {
  let failed = 0;
  for (const key of keys) {
    if (result.map.has(key)) continue;
    const fallback = storedQuote(toSymbol(key));
    if (fallback) result.map.set(key, fallback);
    else failed++;
  }
  return { map: result.map, failed, usedStored: failed < result.failed };
}

async function loadMap(
  keys: string[],
  load: (key: string) => Promise<PriceHistory>
): Promise<{ map: Map<string, PriceHistory>; failed: number }> {
  const results = await mapWithConcurrency(keys, CONCURRENCY, load);
  const map = new Map<string, PriceHistory>();
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') map.set(keys[index], result.value);
    else failed++;
  });
  return { map, failed };
}

type ValuationOptions = {
  /**
   * Download the daily history for charts of longer ranges. Screens that
   * only need current values and the one-day change (portfolio rows, the
   * position screen) turn it off to save requests.
   */
  withHistory?: boolean;
};

/**
 * Loads prices and FX rates for the given positions and values them over the
 * selected range. Data is loaded once for all ranges (everything in
 * parallel) and cached in memory; changing the range only recalculates.
 * `refresh` drops the cache.
 */
export function usePortfolioValuation(
  positions: Position[],
  range: ChartRange,
  baseCurrency: string,
  { withHistory = true }: ValuationOptions = {}
) {
  const [state, setState] = useState<State>({
    data: null,
    isLoading: true,
    error: null,
    syncError: false,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /** First trade per symbol: history and splits are needed from then on. */
  const firstTrades = useMemo(() => {
    const map = new Map<string, string>();
    for (const position of positions) {
      for (const transaction of position.transactions) {
        const first = map.get(position.instrument.symbol);
        if (!first || transaction.tradedAt < first) {
          map.set(position.instrument.symbol, transaction.tradedAt);
        }
      }
    }
    return map;
  }, [positions]);
  const currencies = useMemo(
    () => [
      ...new Set(
        positions.map((p) => p.instrument.currency).filter((currency) => currency !== baseCurrency)
      ),
    ],
    [positions, baseCurrency]
  );
  const firstTradeDate = useMemo(() => {
    let first: string | undefined;
    for (const date of firstTrades.values()) if (!first || date < first) first = date;
    return first;
  }, [firstTrades]);

  // What to download, as text: a new operation of an instrument already held
  // changes the positions but not this, so it does not reload anything.
  const loadKey = [
    baseCurrency,
    withHistory ? 'history' : 'quotes',
    [...firstTrades].map(([symbol, date]) => `${symbol}@${date}`).join(','),
    currencies.join(','),
  ].join('|');

  useEffect(() => {
    const symbols = [...firstTrades.keys()];
    if (symbols.length === 0) {
      setState({ data: null, isLoading: false, error: null, syncError: false });
      setIsRefreshing(false);
      return;
    }

    let isCancelled = false;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));
    const fxSymbols = new Map(
      currencies.map((currency) => [currency, fxSymbol(currency, baseCurrency)])
    );

    // Splits are checked alongside (they rarely change and the check is
    // cached for hours). A new one changes the shares the trades count in
    // and drops the stored closes: then the data is read again.
    const splitsCheck = mapWithConcurrency([...firstTrades], CONCURRENCY, ([symbol, date]) =>
      loadSplits(symbol, date).then((isNew) => (isNew ? symbol : null))
    );

    (async () => {
      try {
        // Everything at once; the slowest request decides, not a chain of them.
        const [liveQuotes, liveFxQuotes, daily, fxDaily] = await Promise.all([
          loadMap(symbols, (symbol) => loadIntraday(symbol)),
          loadMap(currencies, (currency) => loadIntraday(fxSymbols.get(currency)!)),
          withHistory
            ? loadMap(symbols, (symbol) => loadDailyHistory(symbol, firstTrades.get(symbol)!))
            : EMPTY_LOAD,
          // Rates since the first trade: every trade converts at its own day's rate.
          firstTradeDate
            ? loadMap(currencies, (currency) =>
                loadDailyHistory(fxSymbols.get(currency)!, firstTradeDate)
              )
            : EMPTY_LOAD,
        ]);
        if (isCancelled) return;

        // Offline or rate limited: value positions at the last stored close.
        const quotes = withStoredFallback(liveQuotes, symbols, (symbol) => symbol);
        const fxQuotes = withStoredFallback(liveFxQuotes, currencies, (currency) =>
          fxSymbols.get(currency)!
        );
        const failed = quotes.failed + fxQuotes.failed + daily.failed + fxDaily.failed;
        const nothingLoaded = quotes.map.size === 0 && daily.map.size === 0;
        const usedStored = quotes.usedStored || fxQuotes.usedStored;
        setState({
          data: {
            quotes: quotes.map,
            fxQuotes: fxQuotes.map,
            daily: daily.map,
            fxDaily: fxDaily.map,
          },
          isLoading: false,
          error: nothingLoaded
            ? 'Nie udało się pobrać cen. Sprawdź połączenie z internetem.'
            : failed > 0
              ? 'Części cen nie udało się pobrać.'
              : usedStored
                ? 'Brak połączenia – pokazuję ostatnie zapisane ceny.'
                : null,
          syncError: nothingLoaded || failed > 0 || usedStored,
        });
        setIsRefreshing(false);
      } catch {
        // Whatever goes wrong while loading must not take the portfolio off
        // the screen: keep what is shown, or value it at the stored closes.
        if (isCancelled) return;
        setState((previous) => ({
          ...previous,
          data: previous.data ?? storedData(symbols, fxSymbols),
          isLoading: false,
          error: 'Nie udało się pobrać cen.',
          syncError: true,
        }));
        setIsRefreshing(false);
      }

      const splitResults = await splitsCheck;
      if (isCancelled) return;
      const splitSymbols = splitResults.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : []
      );
      if (splitSymbols.length > 0) {
        for (const symbol of splitSymbols) forgetCached(`daily:${symbol}:`);
        notifyDataChanged();
        setReloadKey((key) => key + 1);
      }
    })();

    return () => {
      isCancelled = true;
    };
    // `loadKey` stands for the symbols, first trades and currencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, reloadKey]);

  // The range only picks what to draw from the loaded data.
  const rangeStart = rangeStartTime(range, firstTradeDate);
  const snapshot = useMemo<MarketSnapshot | null>(() => {
    const data = state.data;
    if (!data) return null;
    return {
      quotes: data.quotes,
      fxQuotes: data.fxQuotes,
      // The one-day chart is drawn from today's session.
      histories: range === '1D' ? data.quotes : data.daily,
      fxHistories: range === '1D' ? data.fxQuotes : data.fxDaily,
      fxSinceFirstTrade: data.fxDaily,
    };
  }, [state.data, range]);

  const series = useMemo<PortfolioSeries | null>(
    () =>
      snapshot
        ? buildPortfolioSeries(positions, snapshot, range, baseCurrency, rangeStart)
        : null,
    [snapshot, range, rangeStart, positions, baseCurrency]
  );

  const valuations = useMemo(() => {
    const map = new Map<string, PositionValuation>();
    if (!snapshot) return map;
    for (const position of positions) {
      map.set(position.instrument.symbol, valuePosition(position, snapshot, baseCurrency));
    }
    return map;
  }, [snapshot, positions, baseCurrency]);

  /**
   * When the prices on screen were downloaded: the oldest fresh download, or
   * the last successful update saved earlier (offline). `null` with no
   * positions or no update ever.
   */
  const symbolCount = firstTrades.size;
  const updatedAt = useMemo(() => {
    if (symbolCount === 0) return null;
    const quotes = state.data ? [...state.data.quotes.values()] : [];
    const fresh = quotes.filter((quote) => !quote.isStored && quote.fetchedAt != null);
    if (fresh.length > 0) return Math.min(...fresh.map((quote) => quote.fetchedAt as number));
    return readNumberPreference(UPDATED_AT_PREFERENCE);
  }, [state.data, symbolCount]);

  useEffect(() => {
    const quotes = state.data ? [...state.data.quotes.values()] : [];
    if (updatedAt != null && quotes.some((quote) => !quote.isStored)) {
      writePreference(UPDATED_AT_PREFERENCE, String(updatedAt));
    }
  }, [updatedAt, state.data]);

  const refresh = useCallback(() => {
    clearMarketCache();
    markHistoryStale();
    setIsRefreshing(true);
    setReloadKey((key) => key + 1);
  }, []);

  return {
    series,
    /** Range of the data on screen: the selected one (no waiting for data). */
    displayedRange: range,
    valuations,
    updatedAt,
    isLoading: state.isLoading,
    isRefreshing,
    error: state.error,
    syncError: state.syncError,
    refresh,
  };
}
