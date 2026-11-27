import { useEffect, useMemo, useState } from 'react';

import { benchmarkReturns, benchmarkSymbol, type BenchmarkId } from '@/lib/benchmarks';
import { toISODate } from '@/lib/date';
import { loadDailyHistory, loadIntraday } from '@/market/history';
import type { ChartRange, PriceHistory } from '@/market/types';

export type BenchmarkLine = {
  id: BenchmarkId;
  /** Return since the start of the range at every point of the portfolio chart. */
  values: number[];
};

type Loaded = { prices: PriceHistory };

/**
 * Returns of the selected indices over the same moments as the portfolio
 * chart, each in its own currency (no exchange rate). Loads only while `enabled` (the comparison
 * page is on screen), each index once per range start; closes are stored,
 * so later loads only top up the newest days.
 */
export function useBenchmarks(
  ids: readonly BenchmarkId[],
  range: ChartRange,
  times: readonly number[],
  enabled: boolean,
  /** Total return versions (dividends reinvested) or prices only. */
  withDividends: boolean
) {
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState<BenchmarkId[]>([]);
  const isDay = range === '1D';
  const fromDate = times.length > 0 && !isDay ? toISODate(new Date(times[0])) : null;
  const loadKey = (id: BenchmarkId) =>
    `${benchmarkSymbol(id, withDividends)}|${isDay ? '1D' : fromDate}`;

  useEffect(() => {
    if (!enabled || times.length === 0) return;
    const missing = ids.filter((id) => !loaded.has(loadKey(id)));
    if (missing.length === 0) return;
    let isCancelled = false;
    setIsLoading(true);

    Promise.all(
      missing.map(async (id) => {
        const symbol = benchmarkSymbol(id, withDividends);
        try {
          const prices = isDay ? await loadIntraday(symbol) : await loadDailyHistory(symbol, fromDate!);
          return { id, data: { prices } as Loaded };
        } catch {
          return { id, data: null };
        }
      })
    ).then((results) => {
      if (isCancelled) return;
      setLoaded((previous) => {
        const next = new Map(previous);
        for (const result of results) if (result.data) next.set(loadKey(result.id), result.data);
        return next;
      });
      setFailed(results.filter((result) => !result.data).map((result) => result.id));
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
      setIsLoading(false);
    };
    // `loaded` is read to skip what is there; adding it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(','), isDay, fromDate, enabled, withDividends, times.length > 0]);

  const lines = useMemo(() => {
    const result: BenchmarkLine[] = [];
    for (const id of ids) {
      const data = loaded.get(loadKey(id));
      if (!data) continue;
      const values = benchmarkReturns(
        times,
        data.prices.points,
        null,
        isDay ? { price: data.prices.previousClose, rate: null } : undefined
      );
      if (values) result.push({ id, values });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(','), loaded, times, isDay, fromDate, withDividends]);

  return { lines, isLoading, failed };
}
