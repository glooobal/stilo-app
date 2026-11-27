import { getImportedCashIds } from '@/db/cash';
import { getImportedDividendIds } from '@/db/dividends';
import { getSavedInstrument } from '@/db/instruments';
import { getSplits } from '@/db/splits';
import type { Portfolio } from '@/db/portfolios';
import {
  getImportedIds,
  getSimilarityKeys,
  getTransactions,
  similarityKey,
  type NewTransaction,
} from '@/db/transactions';
import { marketData, type Instrument } from '@/market';
import { loadCorporateEvents } from '@/market/history';

import { toISODate } from '../date';
import type { NewCashOperation } from '../cash';
import type { NewDividend } from '../dividends';
import { findOversell } from '../fifo';
import { adjustForSplits, splitRatio } from '../splits';
import type { Broker, ImportedTrade, ImportFile } from './types';

/** Exchange shown for an instrument market data search did not return. */
const EXCHANGES: Record<string, { exchange: string; exchangeName: string }> = {
  WA: { exchange: 'WSE', exchangeName: 'Warsaw' },
  L: { exchange: 'LSE', exchangeName: 'London' },
  DE: { exchange: 'GER', exchangeName: 'XETRA' },
  PA: { exchange: 'PAR', exchangeName: 'Paris' },
  AS: { exchange: 'AMS', exchangeName: 'Amsterdam' },
  BR: { exchange: 'BRU', exchangeName: 'Brussels' },
  LS: { exchange: 'LIS', exchangeName: 'Lisbon' },
  MI: { exchange: 'MIL', exchangeName: 'Milan' },
  MC: { exchange: 'MCE', exchangeName: 'Madrid' },
  IR: { exchange: 'ISE', exchangeName: 'Irish' },
  VI: { exchange: 'VIE', exchangeName: 'Vienna' },
  HE: { exchange: 'HEL', exchangeName: 'Helsinki' },
  SW: { exchange: 'EBS', exchangeName: 'Swiss' },
  ST: { exchange: 'STO', exchangeName: 'Stockholm' },
  CO: { exchange: 'CPH', exchangeName: 'Copenhagen' },
  OL: { exchange: 'OSL', exchangeName: 'Oslo' },
  PR: { exchange: 'PRA', exchangeName: 'Prague' },
};

export type ImportPlan = {
  accountCurrency: string | null;
  instruments: Instrument[];
  /** New trades, ready to save. */
  transactions: NewTransaction[];
  /**
   * New trades that look like operations already in the portfolio (same
   * instrument, side, day, quantity and price), e.g. entered by hand before.
   * Left out unless the user chooses to add them.
   */
  possibleDuplicates: NewTransaction[];
  buyCount: number;
  sellCount: number;
  /** Trades already imported earlier. */
  duplicateCount: number;
  /** New dividends, ready to save (they replace the ones worked out by the app). */
  dividends: NewDividend[];
  /** Dividends already imported earlier. */
  duplicateDividendCount: number;
  /** Deposits, withdrawals and interest (cash portfolios only). */
  cashOperations: NewCashOperation[];
  /**
   * Why the file's deposits and withdrawals are left out: the portfolio
   * does not keep cash, or keeps it in another currency.
   */
  cashSkipReason: 'not-cash' | 'currency' | null;
  /** Tickers left out: not supported, or without market data. */
  skippedTickers: string[];
  /** The account currency differs from the portfolio's (rates are not used then). */
  isCurrencyMismatch: boolean;
  /** A sale would exceed the shares held in the portfolio (e.g. a partial history). */
  oversoldSymbol: string | null;
  /** The same, when the possible duplicates are added too. */
  oversoldWithDuplicates: string | null;
};

async function resolveInstrument(
  trade: ImportedTrade,
  signal: AbortSignal
): Promise<{ instrument: Instrument; isInPence: boolean } | null> {
  const firstDate = toISODate(new Date(trade.time));
  let quote: Awaited<ReturnType<typeof marketData.getQuote>>;
  try {
    quote = await marketData.getQuote(trade.symbol, firstDate, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }

  // Splits (and dividends) since the first trade, to count every trade in
  // the right shares.
  try {
    await loadCorporateEvents(trade.symbol, firstDate);
  } catch (error) {
    if (signal.aborted) throw error;
  }

  const saved = getSavedInstrument(trade.symbol);
  let found: Omit<Instrument, 'currency'> | null = saved;
  if (!found) {
    try {
      const results = await marketData.searchInstruments(trade.symbol, signal);
      found = results.find((result) => result.symbol === trade.symbol) ?? null;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  const suffix = trade.symbol.includes('.') ? trade.symbol.split('.').pop()! : '';
  const exchange = EXCHANGES[suffix] ?? { exchange: 'US', exchangeName: 'USA' };

  // Some brokers quote London in pence: then the price is ~100× the market's.
  const ratio = quote.price > 0 ? trade.price / quote.price : 1;
  const isInPence = quote.currency === 'GBP' && ratio > 50 && ratio < 200;

  return {
    instrument: {
      symbol: trade.symbol,
      name: found?.name ?? trade.name,
      exchange: found?.exchange ?? exchange.exchange,
      exchangeName: found?.exchangeName ?? exchange.exchangeName,
      type: found?.type ?? trade.type,
      currency: quote.currency,
    },
    isInPence,
  };
}

/**
 * Checks a broker file against a portfolio: finds the instruments in market
 * data, leaves out trades imported before and turns the rest into
 * transactions of the portfolio.
 */
export async function prepareImport(
  file: ImportFile,
  broker: Broker,
  portfolio: Portfolio,
  signal: AbortSignal
): Promise<ImportPlan> {
  const imported = getImportedIds(portfolio.id, broker.id);
  const fresh = file.trades.filter((trade) => !imported.has(trade.externalId));
  const duplicateCount = file.trades.length - fresh.length;

  // The first trade of every instrument (for the price check).
  const firstTrades = new Map<string, ImportedTrade>();
  for (const trade of fresh) if (!firstTrades.has(trade.symbol)) firstTrades.set(trade.symbol, trade);
  const resolved = new Map<string, Awaited<ReturnType<typeof resolveInstrument>>>();
  const queue = [...firstTrades.values()];
  // A few requests at a time.
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let trade = queue.shift(); trade; trade = queue.shift()) {
        resolved.set(trade.symbol, await resolveInstrument(trade, signal));
      }
    })
  );

  const skipped = new Set(file.unsupportedTickers);
  const transactions: NewTransaction[] = [];
  for (const trade of fresh) {
    const match = resolved.get(trade.symbol);
    if (!match) {
      skipped.add(trade.brokerTicker);
      continue;
    }
    const { instrument, isInPence } = match;
    const tradedAt = toISODate(new Date(trade.time));
    // Saved in the shares of the trade's day, like a manual entry.
    const ratio = splitRatio(getSplits(instrument.symbol), tradedAt);
    const quantity = trade.isInTodaysShares
      ? (trade.quantity * ratio.denominator) / ratio.numerator
      : trade.quantity;
    const tradePrice = trade.isInTodaysShares
      ? (trade.price * ratio.numerator) / ratio.denominator
      : trade.price;
    // Pence → pounds by dividing (exact for decimal prices); the rate per
    // pound is then 100× the rate per penny.
    const divisor = isInPence ? 100 : 1;
    // Market data knows the currency best (the file only implies it by market).
    const isSameCurrency = instrument.currency === file.accountCurrency;
    transactions.push({
      portfolioId: portfolio.id,
      symbol: instrument.symbol,
      side: trade.side,
      quantity,
      price: tradePrice / divisor,
      // A commission in the account currency stays exactly as in the file.
      fee: trade.feeCurrency ? trade.fee : trade.fee / divisor,
      feeCurrency: trade.feeCurrency,
      currency: instrument.currency,
      tradedAt,
      fxRate: !isSameCurrency && trade.fxRate != null ? trade.fxRate * divisor : null,
      fxCurrency: file.accountCurrency,
      source: broker.id,
      externalId: trade.externalId,
    });
  }

  // Operations that are already in the portfolio under another origin.
  const existingKeys = getSimilarityKeys(portfolio.id);
  const unique: NewTransaction[] = [];
  const possibleDuplicates: NewTransaction[] = [];
  for (const transaction of transactions) {
    const key = similarityKey(transaction);
    const count = existingKeys.get(key) ?? 0;
    if (count > 0) {
      // Each existing operation matches one imported operation at most.
      existingKeys.set(key, count - 1);
      possibleDuplicates.push(transaction);
    } else {
      unique.push(transaction);
    }
  }

  // Sales must stay covered together with what the portfolio already holds.
  const existing = getTransactions([portfolio.id]);
  const findOversold = (added: NewTransaction[]) => {
    for (const symbol of new Set(added.map((transaction) => transaction.symbol))) {
      const splits = getSplits(symbol);
      const trades = [
        ...existing.filter((transaction) => transaction.symbol === symbol),
        // Existing operations are in today's shares; count the new ones so too.
        ...added
          .filter((transaction) => transaction.symbol === symbol)
          .map((transaction) => ({
            ...transaction,
            ...adjustForSplits(
              transaction.quantity,
              transaction.price,
              splitRatio(splits, transaction.tradedAt)
            ),
          })),
      ];
      if (findOversell(trades)) return symbol;
    }
    return null;
  };

  // Dividends of instruments found above or already in the app.
  const importedDividends = getImportedDividendIds(portfolio.id, broker.id);
  const knownSymbols = new Set(
    [...resolved.values()].flatMap((match) => (match ? [match.instrument.symbol] : []))
  );
  const dividends: NewDividend[] = [];
  let duplicateDividendCount = 0;
  for (const dividend of file.dividends) {
    if (importedDividends.has(dividend.externalId)) {
      duplicateDividendCount++;
      continue;
    }
    if (!knownSymbols.has(dividend.symbol) && !getSavedInstrument(dividend.symbol)) {
      skipped.add(dividend.brokerTicker);
      continue;
    }
    dividends.push({
      portfolioId: portfolio.id,
      symbol: dividend.symbol,
      exDate: null,
      paidAt: toISODate(new Date(dividend.time)),
      quantity: null,
      perShare: dividend.perShare,
      gross: dividend.gross,
      tax: dividend.tax,
      currency: dividend.currency,
      fxRate: null,
      fxCurrency: null,
      source: broker.id as NewDividend['source'],
      externalId: dividend.externalId,
    });
  }

  // Money in and out, for a cash portfolio in the account's currency.
  const cashOperations: NewCashOperation[] = [];
  let cashSkipReason: ImportPlan['cashSkipReason'] = null;
  if (file.cashOperations.length > 0) {
    if (!portfolio.isCash) cashSkipReason = 'not-cash';
    else if (file.accountCurrency !== portfolio.baseCurrency) cashSkipReason = 'currency';
    else {
      const imported = getImportedCashIds(portfolio.id, broker.id);
      for (const operation of file.cashOperations) {
        if (imported.has(operation.externalId)) continue;
        cashOperations.push({
          portfolioId: portfolio.id,
          type: operation.type,
          amount: operation.amount,
          date: toISODate(new Date(operation.time)),
          note: operation.note,
          source: broker.id,
          externalId: operation.externalId,
        });
      }
    }
  }

  return {
    accountCurrency: file.accountCurrency,
    dividends,
    cashOperations,
    cashSkipReason,
    duplicateDividendCount,
    instruments: [...resolved.values()].flatMap((match) => (match ? [match.instrument] : [])),
    transactions: unique,
    possibleDuplicates,
    buyCount: unique.filter((transaction) => transaction.side === 'buy').length,
    sellCount: unique.filter((transaction) => transaction.side === 'sell').length,
    duplicateCount,
    skippedTickers: [...skipped].sort(),
    isCurrencyMismatch:
      file.accountCurrency != null && file.accountCurrency !== portfolio.baseCurrency,
    oversoldSymbol: findOversold(unique),
    oversoldWithDuplicates: findOversold([...unique, ...possibleDuplicates]),
  };
}
