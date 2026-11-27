import { useMemo } from 'react';

import { useDataVersion } from '@/db/events';
import { listPortfolios, type Portfolio } from '@/db/portfolios';
import { getCashOperations } from '@/db/cash';
import { getDividends } from '@/db/dividends';
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
  const dividends = useMemo(
    () => getDividends(portfolioId ? [portfolioId] : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolioId, dataVersion]
  );
  const cashOperations = useMemo(
    () => getCashOperations(portfolioId ? [portfolioId] : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolioId, dataVersion]
  );
  /** Cash portfolios in scope, with their operations, for the valuation. */
  const cash = useMemo(() => {
    const cashPortfolios = portfolios.filter(
      (item) => item.isCash && (!portfolioId || item.id === portfolioId)
    );
    return {
      portfolioIds: new Set(cashPortfolios.map((item) => item.id)),
      operations: cashOperations,
      // Cash is kept in each portfolio's own currency.
      currencies: new Map(cashPortfolios.map((item) => [item.id, item.baseCurrency])),
    };
  }, [portfolios, portfolioId, cashOperations]);
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
    /** Dividends received, oldest first. */
    dividends,
    /** Deposits, withdrawals and interest of cash portfolios, oldest first. */
    cashOperations,
    cash,
    /** Currency values are shown in: the portfolio's, or the summary currency for all together. */
    baseCurrency: portfolio?.baseCurrency ?? summaryCurrency,
  };
}
