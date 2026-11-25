import { useMemo } from 'react';

import { useDataVersion } from '@/db/events';
import { listPortfolios, type Portfolio } from '@/db/portfolios';
import { getTransactions } from '@/db/transactions';
import { buildPositions } from '@/lib/positions';
import { useSummaryCurrency } from '@/lib/settings';


/** Active portfolios; refreshes after writes. */
export function usePortfolios(): Portfolio[] {
  const dataVersion = useDataVersion();
  // `dataVersion` changes after every write, forcing a re-read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => listPortfolios(), [dataVersion]);
}

/**
 * Transactions and positions of one portfolio, or of all portfolios together
 * when `portfolioId` is not given. Refreshes after writes.
 */
export function usePortfolioData(portfolioId?: string) {
  const dataVersion = useDataVersion();
  const portfolios = usePortfolios();
  const summaryCurrency = useSummaryCurrency();
  const portfolio = portfolioId
    ? (portfolios.find((item) => item.id === portfolioId) ?? null)
    : null;

  const transactions = useMemo(
    () => getTransactions(portfolioId ? [portfolioId] : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolioId, dataVersion]
  );
  const { positions, saleResults } = useMemo(() => buildPositions(transactions), [transactions]);
  const openPositions = useMemo(
    () => positions.filter((position) => position.quantity > 0),
    [positions]
  );

  return {
    portfolios,
    /** The portfolio when `portfolioId` is given and exists. */
    portfolio,
    transactions,
    positions,
    openPositions,
    saleResults,
    /** Currency values are shown in: the portfolio's, or the summary currency for all together. */
    baseCurrency: portfolio?.baseCurrency ?? summaryCurrency,
  };
}
