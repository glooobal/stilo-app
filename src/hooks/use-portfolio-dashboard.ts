import { useState } from 'react';

import { readPreference, writePreference } from '@/lib/preferences';
import { CHART_RANGES } from '@/lib/ranges';
import type { ChartRange } from '@/market/types';

import { usePortfolioData } from './use-portfolio';
import { usePortfolioValuation } from './use-portfolio-valuation';

/**
 * Everything an overview screen needs: data, valuation and the selected chart
 * range (remembered separately for the summary and for every portfolio).
 */
export function usePortfolioDashboard(portfolioId?: string) {
  const data = usePortfolioData(portfolioId);
  const preferenceKey = portfolioId ? `portfolio.${portfolioId}.range` : 'summary.range';
  const [range, setRangeState] = useState<ChartRange>(() =>
    readPreference(preferenceKey, CHART_RANGES, 'ALL')
  );
  const setRange = (next: ChartRange) => {
    setRangeState(next);
    writePreference(preferenceKey, next);
  };
  const valuation = usePortfolioValuation(data.positions, range, data.baseCurrency);

  return { ...data, ...valuation, portfolioId, range, setRange };
}

export type PortfolioDashboardData = ReturnType<typeof usePortfolioDashboard>;
