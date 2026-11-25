import { router } from 'expo-router';
import { Alert } from 'react-native';

import { listPortfolios } from '@/db/portfolios';
import type { TransactionSide } from '@/db/transactions';
import type { Instrument } from '@/market/types';

export function openTransactionEditor(transactionId: string) {
  router.push({ pathname: '/transaction/form', params: { transactionId } });
}

/** Add or edit a portfolio (sheet). */
export function openPortfolioEditor(portfolioId?: string) {
  router.push({ pathname: '/portfolio/form', params: portfolioId ? { portfolioId } : {} });
}

export function openPortfolio(portfolioId: string) {
  router.push({ pathname: '/wallets/[id]', params: { id: portfolioId } });
}

/**
 * Transactions belong to a portfolio: without one, asks to add it first
 * and returns `false`.
 */
function ensurePortfolio(): boolean {
  if (listPortfolios().length > 0) return true;
  Alert.alert(
    'Najpierw dodaj portfel',
    'Każda transakcja należy do portfela. Dodaj pierwszy portfel, a potem operację.',
    [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Dodaj portfel', isPreferred: true, onPress: () => openPortfolioEditor() },
    ]
  );
  return false;
}

/**
 * Import from a broker's file or a backup (sheet). Works without portfolios:
 * a backup brings its own (e.g. on a new phone).
 */
export function openImport(portfolioId?: string) {
  router.push({ pathname: '/import', params: portfolioId ? { portfolioId } : {} });
}

/**
 * Opens the transaction sheet: the instrument picker, or the form directly.
 * Transactions belong to a portfolio, so without one the user is asked to
 * add a portfolio first.
 */
export function openNewTransaction(
  side: TransactionSide,
  instrument?: Instrument,
  portfolioId?: string
) {
  if (!ensurePortfolio()) return;

  const portfolioParams = portfolioId ? { portfolioId } : {};
  if (!instrument) {
    router.push({ pathname: '/transaction', params: { side, ...portfolioParams } });
    return;
  }
  router.push({
    pathname: '/transaction/form',
    params: {
      side,
      symbol: instrument.symbol,
      name: instrument.name,
      exchange: instrument.exchange,
      exchangeName: instrument.exchangeName,
      type: instrument.type,
      ...portfolioParams,
    },
  });
}

/** Position screen; within a portfolio when `portfolioId` is given. */
export function openPosition(symbol: string, portfolioId?: string) {
  if (portfolioId) {
    router.push({ pathname: '/wallets/position/[symbol]', params: { symbol, portfolioId } });
  } else {
    router.push({ pathname: '/position/[symbol]', params: { symbol } });
  }
}

/** Full operation history (sheet); of one portfolio when `portfolioId` is given. */
export function openHistory(portfolioId?: string) {
  router.push({ pathname: '/history', params: portfolioId ? { portfolioId } : {} });
}
