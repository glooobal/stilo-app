import type { PricePoint } from '@/market/types';

import { priceAt } from './valuation';

export type BenchmarkId = 'wig20' | 'wig' | 'mwig40' | 'sp500' | 'nasdaq100' | 'allworld';

export type Benchmark = {
  id: BenchmarkId;
  name: string;
  /** Yahoo Finance symbol, with dividends reinvested (total return). */
  symbol: string;
  /** Price-only version; none when the index always includes dividends (WIG). */
  priceSymbol?: string;
  /** What it is, shown under the name in the menu. */
  description: string;
  /** Line color (`#RRGGBB`); the portfolio itself is blue. */
  color: string;
};

/**
 * Indices to compare the portfolio with, in the menu order. With dividends
 * they are the total return indices (WIG is one by itself) or an
 * accumulating ETF where Yahoo has no total return index.
 */
export const BENCHMARKS: readonly Benchmark[] = [
  { id: 'wig20', name: 'WIG20', symbol: 'ETFBW20TR.WA', priceSymbol: 'WIG20.WA', description: '20 największych spółek GPW', color: '#FF9500' },
  { id: 'wig', name: 'WIG', symbol: 'WIG.WA', description: 'Cała GPW (zawsze z dywidendami)', color: '#FF2D55' },
  { id: 'mwig40', name: 'mWIG40', symbol: 'ETFBM40TR.WA', priceSymbol: 'MWIG40.WA', description: '40 średnich spółek GPW', color: '#A2845E' },
  { id: 'sp500', name: 'S&P 500', symbol: '^SP500TR', priceSymbol: '^GSPC', description: '500 dużych spółek z USA', color: '#AF52DE' },
  { id: 'nasdaq100', name: 'Nasdaq 100', symbol: '^XNDX', priceSymbol: '^NDX', description: '100 spółek technologicznych z USA', color: '#30B0C7' },
  { id: 'allworld', name: 'FTSE All-World', symbol: 'VWCE.DE', priceSymbol: 'VGWL.DE', description: 'Akcje z całego świata', color: '#34C759' },
];

export const BENCHMARK_IDS = BENCHMARKS.map((benchmark) => benchmark.id);

/** Shown before the user picks anything. */
export const DEFAULT_BENCHMARKS: readonly BenchmarkId[] = ['wig20', 'sp500'];

export function getBenchmark(id: BenchmarkId): Benchmark {
  return BENCHMARKS.find((benchmark) => benchmark.id === id)!;
}

/**
 * Symbol to download: the total return version, or the price-only one
 * without dividends (the same symbol when the index has no such version).
 * VWCE reinvests dividends, VWRL (`VGWL.DE`) pays them out, so its price
 * leaves them out.
 */
export function benchmarkSymbol(id: BenchmarkId, withDividends: boolean): string {
  const benchmark = getBenchmark(id);
  return withDividends ? benchmark.symbol : (benchmark.priceSymbol ?? benchmark.symbol);
}

/** Saved as a comma separated list; unknown ids are dropped. */
export function parseBenchmarkIds(text: string | null): BenchmarkId[] {
  if (text == null) return [...DEFAULT_BENCHMARKS];
  if (text === '') return [];
  return text
    .split(',')
    .filter((id): id is BenchmarkId => (BENCHMARK_IDS as string[]).includes(id));
}

/** Price (or rate) at a moment, falling back to the first known one. */
function valueAt(points: readonly PricePoint[], time: number): number | null {
  return priceAt(points as PricePoint[], time) ?? points[0]?.close ?? null;
}

/**
 * Return of an index at every moment of the portfolio chart, relative to
 * the start (0.05 = +5%), converted to the base currency when `fx` is given:
 * a Polish investor in the S&P 500 also gains or loses on the dollar.
 * `start` overrides the starting price and rate (yesterday's close on the
 * one-day chart). `null` when there are no prices.
 */
export function benchmarkReturns(
  times: readonly number[],
  prices: readonly PricePoint[],
  fx: readonly PricePoint[] | null,
  start?: { price: number | null; rate: number | null }
): number[] | null {
  if (times.length === 0 || prices.length === 0 || (fx && fx.length === 0)) return null;
  const startPrice = start?.price ?? valueAt(prices, times[0]);
  const startRate = fx ? (start?.rate ?? valueAt(fx, times[0])) : 1;
  if (!startPrice || !startRate) return null;
  const startValue = startPrice * startRate;
  return times.map((time) => {
    const price = valueAt(prices, time) ?? startPrice;
    const rate = fx ? (valueAt(fx, time) ?? startRate) : 1;
    return (price * rate) / startValue - 1;
  });
}
