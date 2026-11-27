import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { notifyDataChanged } from '@/db/events';
import { dividendInBase, type DividendAmounts } from '@/lib/dividends';
import type { Position } from '@/lib/positions';
import { readNumberPreference, writePreference } from '@/lib/preferences';
import { rangeStartTime } from '@/lib/ranges';
import {
  buildPortfolioSeries,
  valuePosition,
  withPositionDividends,
  type CashInput,
  type DividendLike,
  type MarketSnapshot,
  type PortfolioSeries,
  type PositionValuation,
} from '@/lib/valuation';
import { forgetCached, mapWithConcurrency } from '@/market/cache';
import { refreshQuotes, reportMarketOpen, useQuotesVersion } from '@/market/live-quotes';
import {
  fxSymbol,
  loadDailyHistory,
  loadIntraday,
  loadCorporateEvents,
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
  /** Dividends received; their net amount counts towards the profit. */
  dividends?: readonly (DividendLike & { id: string; portfolioId: string; symbol: string })[];
  /** Portfolios whose dividends also count towards the result of each position. */
  positionDividendPortfolios?: ReadonlySet<string>;
  /** Cash portfolios: their value includes the cash and the result counts from deposits. */
  cash?: CashInput;
};

const NO_CASH: CashInput = { portfolioIds: new Set(), operations: [] };

const NO_PORTFOLIOS: ReadonlySet<string> = new Set();

const NO_DIVIDENDS: readonly (DividendLike & {
  id: string;
  portfolioId: string;
  symbol: string;
})[] = [];

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
  {
    withHistory = true,
    dividends = NO_DIVIDENDS,
    positionDividendPortfolios = NO_PORTFOLIOS,
    cash = NO_CASH,
  }: ValuationOptions = {}
) {
  const [state, setState] = useState<State>({
    data: null,
    isLoading: true,
    error: null,
    syncError: false,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const quotesVersion = useQuotesVersion();
  const dataRef = useRef<MarketData | null>(null);
  dataRef.current = state.data;

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
  // Rates are needed for the instruments and for the cash of cash
  // portfolios kept in another currency than the one shown.
  const currencies = useMemo(
    () => [
      ...new Set(
        [
          ...positions.map((p) => p.instrument.currency),
          ...[...cash.portfolioIds].map((id) => cash.currencies?.get(id) ?? baseCurrency),
        ].filter((currency) => currency !== baseCurrency)
      ),
    ],
    [positions, baseCurrency, cash]
  );
  const firstTradeDate = useMemo(() => {
    let first: string | undefined;
    for (const date of firstTrades.values()) if (!first || date < first) first = date;
    // A deposit can come before the first trade; its rate is needed too.
    for (const operation of cash.operations) {
      if (cash.portfolioIds.has(operation.portfolioId) && (!first || operation.date < first)) {
        first = operation.date;
      }
    }
    return first;
  }, [firstTrades, cash]);

  // What to download, as text: a new operation of an instrument already held
  // changes the positions but not this, so it does not reload anything.
  const loadKey = [
    baseCurrency,
    withHistory ? 'history' : 'quotes',
    [...firstTrades].map(([symbol, date]) => `${symbol}@${date}`).join(','),
    currencies.join(','),
    firstTradeDate ?? '',
  ].join('|');

  useEffect(() => {
    const symbols = [...firstTrades.keys()];
    if (symbols.length === 0 && currencies.length === 0) {
      // Nothing to download; a cash portfolio is still valued (its cash).
      const empty: MarketData = {
        quotes: new Map(),
        fxQuotes: new Map(),
        daily: new Map(),
        fxDaily: new Map(),
      };
      setState({ data: empty, isLoading: false, error: null, syncError: false });
      setIsRefreshing(false);
      return;
    }

    let isCancelled = false;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));
    const fxSymbols = new Map(
      currencies.map((currency) => [currency, fxSymbol(currency, baseCurrency)])
    );

    // Splits and dividends are checked alongside (they rarely change and the
    // check is cached for hours). A new split changes the shares the trades
    // count in and drops the stored closes: then the data is read again.
    const splitsCheck = mapWithConcurrency([...firstTrades], CONCURRENCY, ([symbol, date]) =>
      loadCorporateEvents(symbol, date)
    );

    (async () => {
      try {
        // Everything at once; the slowest request decides, not a chain of them.
        const quotesLoad = Promise.all([
          loadMap(symbols, (symbol) => loadIntraday(symbol)),
          loadMap(currencies, (currency) => loadIntraday(fxSymbols.get(currency)!)),
        ]);
        const historyLoad = Promise.all([
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
        const [liveQuotes, liveFxQuotes] = await quotesLoad;
        if (isCancelled) return;

        // Offline or rate limited: value positions at the last stored close.
        const quotes = withStoredFallback(liveQuotes, symbols, (symbol) => symbol);
        const fxQuotes = withStoredFallback(liveFxQuotes, currencies, (currency) =>
          fxSymbols.get(currency)!
        );
        reportMarketOpen([...quotes.map.values()].some((quote) => quote.isMarketOpen));
        // On a refresh the new prices show at once; the history (already on
        // screen) is only topped up after them.
        if (dataRef.current) {
          setState((previous) =>
            previous.data
              ? { ...previous, data: { ...previous.data, quotes: quotes.map, fxQuotes: fxQuotes.map } }
              : previous
          );
          setIsRefreshing(false);
        }

        const [daily, fxDaily] = await historyLoad;
        if (isCancelled) return;
        const failed = quotes.failed + fxQuotes.failed + daily.failed + fxDaily.failed;
        const nothingLoaded =
          symbols.length > 0 && quotes.map.size === 0 && daily.map.size === 0;
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

      const eventResults = await splitsCheck;
      if (isCancelled) return;
      const symbolsList = [...firstTrades.keys()];
      const news = eventResults.map((result) =>
        result.status === 'fulfilled' ? result.value : null
      );
      const splitSymbols = symbolsList.filter((_, index) => news[index]?.hasNewSplit);
      if (splitSymbols.length > 0) {
        for (const symbol of splitSymbols) forgetCached(`daily:${symbol}:`);
        setReloadKey((key) => key + 1);
      }
      // Re-read the data: positions after a split, dividends after new ones.
      if (news.some((item) => item?.hasNewSplit || item?.hasNewDividends)) notifyDataChanged();
    })();

    return () => {
      isCancelled = true;
    };
    // `loadKey` stands for the symbols, first trades and currencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, reloadKey, quotesVersion]);

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
        ? buildPortfolioSeries(
            positions,
            snapshot,
            range,
            baseCurrency,
            rangeStart,
            Date.now(),
            dividends,
            cash
          )
        : null,
    [snapshot, range, rangeStart, positions, baseCurrency, dividends, cash]
  );

  /** Every dividend in the base currency (gross, tax, net), by id. */
  const dividendAmounts = useMemo(() => {
    const map = new Map<string, DividendAmounts>();
    if (!snapshot) return map;
    const fxAt = (currency: string, time: number) => {
      if (currency === baseCurrency) return 1;
      const history = snapshot.fxSinceFirstTrade?.get(currency);
      if (!history || history.points.length === 0) {
        // No history (e.g. a currency without positions): today's rate.
        const quote = snapshot.fxQuotes.get(currency);
        return quote?.price ?? null;
      }
      let rate = history.points[0].close;
      for (const point of history.points) {
        if (point.time > time) break;
        rate = point.close;
      }
      return rate;
    };
    for (const dividend of dividends) {
      const amounts = dividendInBase(dividend, baseCurrency, fxAt);
      if (amounts) map.set(dividend.id, amounts);
    }
    return map;
  }, [snapshot, dividends, baseCurrency]);

  const priceValuations = useMemo(() => {
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

  // Pull to refresh: current prices of everything on screen. Daily closes
  // are topped up on their own schedule (they are stored), so this is one
  // request per instrument and currency instead of two.
  const refresh = useCallback(() => {
    setIsRefreshing(true);
    refreshQuotes();
  }, []);

  // The result of each position, with the dividends of portfolios set to include them.
  const valuations = useMemo(() => {
    const included = new Map<string, number>();
    for (const dividend of dividends) {
      if (!positionDividendPortfolios.has(dividend.portfolioId)) continue;
      const amounts = dividendAmounts.get(dividend.id);
      if (amounts) included.set(dividend.symbol, (included.get(dividend.symbol) ?? 0) + amounts.net);
    }
    const map = new Map<string, PositionValuation>();
    for (const [symbol, valuation] of priceValuations) {
      map.set(symbol, withPositionDividends(valuation, included.get(symbol) ?? 0));
    }
    return map;
  }, [priceValuations, dividends, dividendAmounts, positionDividendPortfolios]);

  return {
    series,
    /** Range of the data on screen: the selected one (no waiting for data). */
    displayedRange: range,
    valuations,
    dividendAmounts,
    updatedAt,
    isLoading: state.isLoading,
    isRefreshing,
    error: state.error,
    syncError: state.syncError,
    refresh,
  };
}
