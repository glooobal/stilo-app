import { Alert } from 'react-native';

import { countPortfolioTransactions, deletePortfolio, type Portfolio } from '@/db/portfolios';

/** Asks for confirmation (with the number of transactions) and deletes the portfolio. */
export function confirmDeletePortfolio(portfolio: Portfolio, onDeleted?: () => void) {
  const count = countPortfolioTransactions(portfolio.id);
  Alert.alert(
    `Usunąć portfel „${portfolio.name}”?`,
    count > 0
      ? `Razem z nim zostaną usunięte jego transakcje (${count}). Tej operacji nie można cofnąć.`
      : 'Tej operacji nie można cofnąć.',
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deletePortfolio(portfolio.id);
          onDeleted?.();
        },
      },
    ]
  );
}
