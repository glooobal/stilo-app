import { useCallback, useEffect, useState } from 'react';

import { fromISODate } from '@/lib/date';
import { rangeStartDate } from '@/lib/ranges';
import { clearMarketCache } from '@/market/cache';
import { loadDailyHistory, loadIntraday, loadLongHistory, markHistoryStale } from '@/market/history';
import type { ChartRange, PriceHistory, PricePoint } from '@/market/types';

/** Decades of daily closes are thinned out for the chart (the last point stays). */
const MAX_CHART_POINTS = 400;

function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

type State = {
  /** Points of the selected range. */
  points: PricePoint[];
  /** Price at the start of the range (yesterday's close for 1D). */
  startPrice: number | null;
  /** Intraday data: latest price and previous close. */
  quote: PriceHistory | null;
  /** Range of the points on screen (lags behind the requested one while loading). */
  displayedRange: ChartRange;
  isLoading: boolean;
  error: string | null;
};

/** Price history of one instrument for the selected range, plus its latest quote. */
export function useInstrumentHistory(symbol: string, range: ChartRange) {
  const [state, setState] = useState<State>({
    points: [],
    startPrice: null,
    quote: null,
    displayedRange: range,
    isLoading: true,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // For an instrument, Max means its whole listing history (not the user's
  // trades), in weekly closes: decades of daily ones would be heavy to
  // download only to be thinned out for the chart.
  const isMax = range === 'ALL';
  const startDate = isMax ? null : rangeStartDate(range);
  const startTime = startDate ? fromISODate(startDate).getTime() : null;

  useEffect(() => {
    let isCancelled = false;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));

    Promise.all([
      loadIntraday(symbol),
      isMax
        ? loadLongHistory(symbol)
        : // One year covers Miesiąc, Rok and this year: switching between them
          // reads the same (cached) closes instead of downloading again.
          startDate
          ? loadDailyHistory(symbol, rangeStartDate('1Y') ?? startDate)
          : null,
    ])
      .then(([quote, history]) => {
        if (isCancelled) return;
        if (history && isMax) {
          setState({
            quote,
            points: downsample(history.points, MAX_CHART_POINTS),
            startPrice: history.points[0]?.close ?? null,
            displayedRange: range,
            isLoading: false,
            error: null,
          });
          return;
        }
        const daily = history;
        if (!daily || startTime == null) {
          setState({
            quote,
            points: quote.points,
            startPrice: quote.previousClose,
            displayedRange: range,
            isLoading: false,
            error: null,
          });
          return;
        }
        const before = daily.points.filter((point) => point.time < startTime);
        const inRange = daily.points.filter((point) => point.time >= startTime);
        setState({
          quote,
          points: downsample(inRange, MAX_CHART_POINTS),
          // Close on the last trading day before the range, else the first in it.
          startPrice: before.at(-1)?.close ?? inRange[0]?.close ?? null,
          displayedRange: range,
          isLoading: false,
          error: null,
        });
      })
      .catch(() => {
        if (isCancelled) return;
        setState((previous) => ({
          ...previous,
          isLoading: false,
          error: 'Nie udało się pobrać notowań.',
        }));
      })
      .finally(() => {
        if (!isCancelled) setIsRefreshing(false);
      });

    return () => {
      isCancelled = true;
    };
    // `range` follows `startDate`; it only tags the loaded points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, isMax, startDate, startTime, reloadKey]);

  const refresh = useCallback(() => {
    clearMarketCache();
    markHistoryStale();
    setIsRefreshing(true);
    setReloadKey((key) => key + 1);
  }, []);

  return { ...state, isRefreshing, refresh };
}
