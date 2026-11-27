import type { AccountType } from '@/db/portfolios';
import type { DividendEvent } from '@/market/types';

import { fromISODate, toISODate } from './date';
import { defaultDividendTaxRate } from './dividend-tax';
import { tradeDayEnd } from './fx';
import { quantityOn } from './positions';

export type DividendSource = 'auto' | 'manual' | 'xtb';

/** A dividend received (or worked out by the app), as stored. */
export type Dividend = {
  id: string;
  portfolioId: string;
  symbol: string;
  /** Ex-dividend date, when known. */
  exDate: string | null;
  /**
   * When it was paid (`YYYY-MM-DD`). For dividends added by the app the
   * market data only has the ex-date, so the payment day is estimated
   * (`estimatedPaymentDate`) until the user corrects it.
   */
  paidAt: string;
  /** Shares entitled and the gross dividend per share, when known. */
  quantity: number | null;
  perShare: number | null;
  /** Gross amount and tax withheld, in `currency`. */
  gross: number;
  tax: number;
  currency: string;
  /** Rate of `currency` in `fxCurrency` (the portfolio currency) when paid. */
  fxRate: number | null;
  fxCurrency: string | null;
  source: DividendSource;
  externalId: string | null;
  /** Changed by the user: the app no longer updates it. */
  isEdited: boolean;
  isDeleted: boolean;
};

export type NewDividend = Omit<Dividend, 'id' | 'isEdited' | 'isDeleted'>;

type Trade = {
  portfolioId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  tradedAt: string;
};

/** How long after the ex-date a payment still belongs to that dividend. */
const PAYMENT_WINDOW_DAYS = 75;

/**
 * Usual days from the ex-date to the payment, per market (Yahoo suffix).
 * The market data has no payment dates, so dividends added by the app are
 * dated this long after the ex-date: e.g. GPW companies mostly pay 2–4
 * weeks later (PZU: ex-date in September, payment in October).
 */
const PAYMENT_LAG_DAYS: Record<string, number> = {
  WA: 21, // GPW
  DE: 3, // Germany: right after the general meeting
  F: 3,
  PA: 3,
  AS: 21,
  L: 28,
};
/** US and other markets: about two weeks. */
const DEFAULT_PAYMENT_LAG_DAYS = 14;

/** Estimated payment day of a dividend with this ex-date. */
export function estimatedPaymentDate(symbol: string, exDate: string): string {
  const suffix = symbol.includes('.') ? symbol.slice(symbol.lastIndexOf('.') + 1) : '';
  return addDays(exDate, PAYMENT_LAG_DAYS[suffix] ?? DEFAULT_PAYMENT_LAG_DAYS);
}

export function addDays(date: string, days: number): string {
  const day = fromISODate(date);
  day.setDate(day.getDate() + days);
  return toISODate(day);
}

/** Net amount: what reached the account. */
export function netDividend(dividend: Pick<Dividend, 'gross' | 'tax'>): number {
  return dividend.gross - dividend.tax;
}

/** Key of a dividend worked out by the app: one per instrument and ex-date. */
export function autoDividendKey(symbol: string, exDate: string): string {
  return `${symbol}:${exDate}`;
}

/** A dividend entered or imported that stands for the one paid for this ex-date. */
function coversEvent(dividend: Dividend, exDate: string): boolean {
  if (dividend.exDate === exDate) return true;
  return dividend.paidAt >= exDate && dividend.paidAt <= addDays(exDate, PAYMENT_WINDOW_DAYS);
}

export type AutoDividendPlan = {
  insert: NewDividend[];
  update: {
    id: string;
    quantity: number;
    perShare: number;
    gross: number;
    tax: number;
    paidAt: string;
  }[];
  /** Dividends worked out earlier that no longer apply (shares sold, or replaced). */
  remove: string[];
};

/**
 * Dividends the user received, worked out from the dividends per share and
 * the shares held in each portfolio at the end of the day before the
 * ex-date. Dividends the user changed or deleted are left alone, and a
 * dividend entered by hand or imported replaces the worked-out one.
 */
export function planAutoDividends(input: {
  portfolios: { id: string; accountType: AccountType }[];
  /** Adjusted for splits, like the dividends per share. */
  transactions: Trade[];
  events: Map<string, DividendEvent[]>;
  dividends: Dividend[];
  today: string;
}): AutoDividendPlan {
  const plan: AutoDividendPlan = { insert: [], update: [], remove: [] };
  const accountTypes = new Map(input.portfolios.map((item) => [item.id, item.accountType]));

  const tradesByKey = new Map<string, Trade[]>();
  for (const trade of input.transactions) {
    if (!accountTypes.has(trade.portfolioId)) continue;
    const key = `${trade.portfolioId}|${trade.symbol}`;
    const list = tradesByKey.get(key) ?? [];
    list.push(trade);
    tradesByKey.set(key, list);
  }
  const autoByKey = new Map<string, Dividend>();
  const othersByKey = new Map<string, Dividend[]>();
  for (const dividend of input.dividends) {
    const key = `${dividend.portfolioId}|${dividend.symbol}`;
    if (dividend.source === 'auto') {
      autoByKey.set(`${dividend.portfolioId}|${dividend.externalId}`, dividend);
    } else if (!dividend.isDeleted) {
      const list = othersByKey.get(key) ?? [];
      list.push(dividend);
      othersByKey.set(key, list);
    }
  }

  const seen = new Set<string>();
  for (const [key, trades] of tradesByKey) {
    const [portfolioId, symbol] = key.split('|');
    const accountType = accountTypes.get(portfolioId)!;
    const firstTrade = trades.reduce(
      (first, trade) => (trade.tradedAt < first ? trade.tradedAt : first),
      trades[0].tradedAt
    );
    const others = othersByKey.get(key) ?? [];
    const taxRate = defaultDividendTaxRate(symbol, accountType);

    for (const event of input.events.get(symbol) ?? []) {
      if (event.exDate <= firstTrade || event.exDate > input.today) continue;
      const externalId = autoDividendKey(symbol, event.exDate);
      const autoKey = `${portfolioId}|${externalId}`;
      seen.add(autoKey);
      const existing = autoByKey.get(autoKey);
      if (existing && (existing.isDeleted || existing.isEdited)) continue;

      const quantity = quantityOn(trades, addDays(event.exDate, -1));
      const isCovered = others.some((dividend) => coversEvent(dividend, event.exDate));
      if (quantity <= 0 || isCovered) {
        if (existing) plan.remove.push(existing.id);
        continue;
      }

      // Received only once it is paid; until then it is among the upcoming ones.
      const paidAt = estimatedPaymentDate(symbol, event.exDate);
      if (paidAt > input.today) {
        if (existing) plan.remove.push(existing.id);
        continue;
      }
      const gross = quantity * event.amount;
      const tax = gross * taxRate;
      if (existing) {
        if (
          existing.quantity !== quantity ||
          existing.perShare !== event.amount ||
          existing.gross !== gross ||
          existing.tax !== tax ||
          existing.paidAt !== paidAt
        ) {
          plan.update.push({ id: existing.id, quantity, perShare: event.amount, gross, tax, paidAt });
        }
        continue;
      }
      plan.insert.push({
        portfolioId,
        symbol,
        exDate: event.exDate,
        paidAt,
        quantity,
        perShare: event.amount,
        gross,
        tax,
        currency: event.currency,
        fxRate: null,
        fxCurrency: null,
        source: 'auto',
        externalId,
      });
    }
  }

  // Worked-out dividends whose event or holding is gone.
  for (const [key, dividend] of autoByKey) {
    if (!seen.has(key) && !dividend.isDeleted && !dividend.isEdited) plan.remove.push(dividend.id);
  }
  return plan;
}

export type DividendAmounts = { gross: number; tax: number; net: number };

/**
 * A dividend in `baseCurrency`: at the rate given with it, else at the
 * market rate of the payment day. `null` when no rate is known.
 */
export function dividendInBase(
  dividend: Pick<Dividend, 'gross' | 'tax' | 'currency' | 'fxRate' | 'fxCurrency' | 'paidAt'>,
  baseCurrency: string,
  marketFxAt: (currency: string, time: number) => number | null
): DividendAmounts | null {
  let rate: number | null;
  if (dividend.currency === baseCurrency) rate = 1;
  else if (dividend.fxRate && dividend.fxCurrency === baseCurrency) rate = dividend.fxRate;
  else rate = marketFxAt(dividend.currency, tradeDayEnd(dividend.paidAt));
  if (rate == null) return null;
  const gross = dividend.gross * rate;
  const tax = dividend.tax * rate;
  return { gross, tax, net: gross - tax };
}

/** Sum of dividends per share with an ex-date in the 12 months up to `today`. */
export function trailingDividendPerShare(events: DividendEvent[] | undefined, today: string) {
  const from = addDays(today, -365);
  let total = 0;
  for (const event of events ?? []) {
    if (event.exDate > from && event.exDate <= today) total += event.amount;
  }
  return total;
}

export type ExpectedDividend = {
  symbol: string;
  portfolioId: string;
  /**
   * Estimated payment day: of a dividend whose ex-date has passed but which
   * is not paid yet, or of last year's dividend moved by a year.
   */
  expectedDate: string;
  /** The ex-date has passed and the amount is known; only the payment is ahead. */
  isDeclared: boolean;
  perShare: number;
  quantity: number;
  gross: number;
  net: number;
  currency: string;
};

/**
 * Dividends expected in the next 12 months: every dividend of the last 12
 * months is assumed to repeat a year later, on the shares held now. An
 * estimate (companies change their dividends), so screens say so.
 */
export function expectedDividends(input: {
  portfolios: { id: string; accountType: AccountType }[];
  transactions: Trade[];
  events: Map<string, DividendEvent[]>;
  today: string;
}): ExpectedDividend[] {
  const accountTypes = new Map(input.portfolios.map((item) => [item.id, item.accountType]));
  const tradesByKey = new Map<string, Trade[]>();
  for (const trade of input.transactions) {
    if (!accountTypes.has(trade.portfolioId)) continue;
    const key = `${trade.portfolioId}|${trade.symbol}`;
    const list = tradesByKey.get(key) ?? [];
    list.push(trade);
    tradesByKey.set(key, list);
  }

  const from = addDays(input.today, -365);
  const expected: ExpectedDividend[] = [];
  for (const [key, trades] of tradesByKey) {
    const [portfolioId, symbol] = key.split('|');
    const quantity = quantityOn(trades, input.today);
    const taxRate = defaultDividendTaxRate(symbol, accountTypes.get(portfolioId)!);
    for (const event of input.events.get(symbol) ?? []) {
      if (event.exDate <= from || event.exDate > input.today) continue;
      const paidAt = estimatedPaymentDate(symbol, event.exDate);
      // Ex-date passed, payment still ahead: on the shares held before the ex-date.
      if (paidAt > input.today) {
        const entitled = quantityOn(trades, addDays(event.exDate, -1));
        if (entitled > 0) {
          const gross = entitled * event.amount;
          expected.push({
            symbol,
            portfolioId,
            expectedDate: paidAt,
            isDeclared: true,
            perShare: event.amount,
            quantity: entitled,
            gross,
            net: gross * (1 - taxRate),
            currency: event.currency,
          });
        }
      }
      if (quantity <= 0) continue;
      const gross = quantity * event.amount;
      expected.push({
        symbol,
        portfolioId,
        expectedDate: addDays(paidAt, 365),
        isDeclared: false,
        perShare: event.amount,
        quantity,
        gross,
        net: gross * (1 - taxRate),
        currency: event.currency,
      });
    }
  }
  return expected.sort((a, b) => (a.expectedDate < b.expectedDate ? -1 : 1));
}
