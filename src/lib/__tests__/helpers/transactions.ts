import type { TransactionWithInstrument } from '@/db/transactions';

import { adjustForSplits, splitRatio, type Split } from '../../splits';

type TradeInput = {
  id: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  tradedAt: string;
  fee?: number;
  /** Currency the fee was paid in (default: the instrument currency). */
  feeCurrency?: string | null;
  symbol?: string;
  currency?: string;
  portfolioId?: string;
  portfolioCurrency?: string;
  fxRate?: number | null;
  splits?: Split[];
};

/**
 * A transaction as the database layer returns it: adjusted for splits, with
 * the fee in the instrument currency (converted at the trade's rate when it
 * was paid in another currency).
 */
export function makeTransaction(input: TradeInput): TransactionWithInstrument {
  const symbol = input.symbol ?? 'TEST';
  const currency = input.currency ?? 'PLN';
  const portfolioCurrency = input.portfolioCurrency ?? 'PLN';
  const fee = input.fee ?? 0;
  const feeCurrency = input.feeCurrency ?? null;
  const ratio = splitRatio(input.splits, input.tradedAt);
  const adjusted = adjustForSplits(input.quantity, input.price, ratio);
  const fxRate = input.fxRate ?? null;
  const instrumentFee =
    feeCurrency && feeCurrency !== currency && fxRate ? fee / fxRate : fee;
  return {
    id: input.id,
    portfolioId: input.portfolioId ?? 'p1',
    symbol,
    side: input.side,
    quantity: adjusted.quantity,
    price: adjusted.price,
    fee: instrumentFee,
    feeCurrency,
    currency,
    tradedAt: input.tradedAt,
    createdAt: '',
    fxRate,
    fxCurrency: fxRate != null ? portfolioCurrency : null,
    portfolioCurrency,
    enteredQuantity: input.quantity,
    enteredPrice: input.price,
    enteredFee: fee,
    splitRatio: ratio,
    instrument: {
      symbol,
      name: symbol,
      exchange: 'TEST',
      exchangeName: 'Test',
      type: 'EQUITY',
      currency,
    },
  };
}
