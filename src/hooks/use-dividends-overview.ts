import { useMemo, useState } from 'react';

import { getAllDividendEvents } from '@/db/dividend-events';
import type { DividendWithInstrument } from '@/db/dividends';
import { useDataVersion } from '@/db/events';
import { todayISODate } from '@/lib/date';
import {
  addDays,
  expectedDividends,
  trailingDividendPerShare,
  type DividendAmounts,
  type ExpectedDividend,
} from '@/lib/dividends';
import type { Position } from '@/lib/positions';

import { usePortfolioData } from './use-portfolio';
import { usePortfolioValuation } from './use-portfolio-valuation';

/** How far ahead the "Przyszłe dywidendy" list looks. */
const UPCOMING_DAYS = 90;

export type ReceivedDividend = DividendWithInstrument & { amounts: DividendAmounts | null };

export type DividendPosition = {
  position: Position;
  /** Dividends per share of the last 12 months, in the instrument currency. */
  trailingPerShare: number;
  /** Relative to the current price. */
  yield: number | null;
  /** Relative to the average purchase price. */
  yieldOnCost: number | null;
  /** Gross for a year on the shares held now, in the base currency. */
  annualGross: number | null;
};

export type ExpectedInBase = ExpectedDividend & { netBase: number | null; grossBase: number | null };

/**
 * Everything the Dividends tab shows: dividends received (in the summary
 * currency), the next 12 months estimated from the last 12, and the
 * dividend yield of every position.
 */
export function useDividendsOverview() {
  const data = usePortfolioData();
  const dataVersion = useDataVersion();
  const baseCurrency = data.baseCurrency;
  const valuation = usePortfolioValuation(data.positions, '1D', baseCurrency, {
    withHistory: false,
    dividends: data.dividends,
  });
  const events = useMemo(
    () => getAllDividendEvents(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataVersion]
  );
  const today = todayISODate();

  const received = useMemo<ReceivedDividend[]>(
    () =>
      data.dividends.map((dividend) => ({
        ...dividend,
        amounts: valuation.dividendAmounts.get(dividend.id) ?? null,
      })),
    [data.dividends, valuation.dividendAmounts]
  );

  const years = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const dividend of data.dividends) set.add(Number(dividend.paidAt.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [data.dividends]);
  const [year, setYear] = useState(() => new Date().getFullYear());

  const yearSummary = useMemo(() => {
    const months = Array.from({ length: 12 }, () => 0);
    let gross = 0;
    let tax = 0;
    let net = 0;
    let isComplete = true;
    const list: ReceivedDividend[] = [];
    for (const dividend of received) {
      if (Number(dividend.paidAt.slice(0, 4)) !== year) continue;
      list.push(dividend);
      if (!dividend.amounts) {
        isComplete = false;
        continue;
      }
      months[Number(dividend.paidAt.slice(5, 7)) - 1] += dividend.amounts.net;
      gross += dividend.amounts.gross;
      tax += dividend.amounts.tax;
      net += dividend.amounts.net;
    }
    list.sort((a, b) => (a.paidAt < b.paidAt ? 1 : a.paidAt > b.paidAt ? -1 : 0));

    // The year before, over the same part of the year (to today's date for
    // the current year), so the comparison is fair mid-year.
    const isCurrentYear = year === new Date().getFullYear();
    const sameDayLastYear = `${year - 1}${today.slice(4)}`;
    let previousNet = 0;
    let hasPrevious = false;
    for (const dividend of received) {
      if (Number(dividend.paidAt.slice(0, 4)) !== year - 1) continue;
      if (isCurrentYear && dividend.paidAt > sameDayLastYear) continue;
      hasPrevious = true;
      previousNet += dividend.amounts?.net ?? 0;
    }
    const companies = new Set(list.map((dividend) => dividend.symbol)).size;
    return {
      months,
      gross,
      tax,
      net,
      isComplete,
      list,
      companies,
      /** Change against the year before (same period); `null` without dividends then. */
      changeRatio: hasPrevious && previousNet > 0 ? net / previousNet - 1 : null,
      isCurrentYear,
    };
  }, [received, year, today]);

  /** Current rate of an instrument currency in the base currency (from the valuations). */
  const currentFx = useMemo(() => {
    const map = new Map<string, number>([[baseCurrency, 1]]);
    for (const position of data.positions) {
      const item = valuation.valuations.get(position.instrument.symbol);
      if (item?.value && item.baseValue != null) {
        map.set(position.instrument.currency, item.baseValue / item.value);
      }
    }
    return map;
  }, [data.positions, valuation.valuations, baseCurrency]);

  const expected = useMemo<ExpectedInBase[]>(
    () =>
      expectedDividends({
        portfolios: data.portfolios,
        transactions: data.transactions,
        events,
        today,
      }).map((item) => {
        const fx = currentFx.get(item.currency) ?? null;
        return {
          ...item,
          grossBase: fx != null ? item.gross * fx : null,
          netBase: fx != null ? item.net * fx : null,
        };
      }),
    [data.portfolios, data.transactions, events, today, currentFx]
  );

  const forecast = useMemo(() => {
    let net = 0;
    let gross = 0;
    for (const item of expected) {
      // A dividend already declared is last year's one repeating: count it once.
      if (item.isDeclared) continue;
      net += item.netBase ?? 0;
      gross += item.grossBase ?? 0;
    }
    const value = valuation.series?.currentValue ?? null;
    return { net, gross, yield: value && gross > 0 ? gross / value : null };
  }, [expected, valuation.series]);

  /** Net dividends received in the last 12 months (towards the dividend goal). */
  const receivedLast12Months = useMemo(() => {
    const from = addDays(today, -365);
    let net = 0;
    for (const dividend of received) {
      if (dividend.paidAt > from && dividend.paidAt <= today) net += dividend.amounts?.net ?? 0;
    }
    return net;
  }, [received, today]);

  const upcomingUntil = addDays(today, UPCOMING_DAYS);
  const upcoming = useMemo(
    () => expected.filter((item) => item.expectedDate <= upcomingUntil),
    [expected, upcomingUntil]
  );

  const positions = useMemo<DividendPosition[]>(() => {
    const list: DividendPosition[] = [];
    for (const position of data.positions) {
      if (position.quantity <= 0) continue;
      const symbolEvents = events.get(position.instrument.symbol);
      // Only dividends in the currency of the quotes can be compared with the price.
      const comparable = symbolEvents?.filter(
        (event) => event.currency === position.instrument.currency
      );
      const trailingPerShare = trailingDividendPerShare(comparable, today);
      if (trailingPerShare <= 0) continue;
      const item = valuation.valuations.get(position.instrument.symbol);
      const fx = currentFx.get(position.instrument.currency) ?? null;
      list.push({
        position,
        trailingPerShare,
        yield: item?.price ? trailingPerShare / item.price : null,
        yieldOnCost: position.averagePrice > 0 ? trailingPerShare / position.averagePrice : null,
        annualGross: fx != null ? trailingPerShare * position.quantity * fx : null,
      });
    }
    return list.sort((a, b) => (b.annualGross ?? 0) - (a.annualGross ?? 0));
  }, [data.positions, events, today, valuation.valuations, currentFx]);

  return {
    baseCurrency,
    hasPositions: data.positions.length > 0,
    hasPortfolios: data.portfolios.length > 0,
    portfolios: data.portfolios,
    years,
    year,
    setYear,
    yearSummary,
    forecast,
    receivedLast12Months,
    upcoming,
    positions,
    isLoading: valuation.isLoading,
    isRefreshing: valuation.isRefreshing,
    refresh: valuation.refresh,
    updatedAt: valuation.updatedAt,
    syncError: valuation.syncError,
  };
}
