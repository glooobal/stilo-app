import type { TransactionWithInstrument } from '@/db/transactions';
import type { ChartRange, PriceHistory, PricePoint } from '@/market/types';

import { fromISODate, toISODate } from './date';
import { isCapitalOperation, signedCashAmount, type CashOperation } from './cash';
import { dividendInBase, type Dividend } from './dividends';
import { checkedTradeRate, convertTrade, tradeRate } from './fx';
import { baseLedgerTotals, quantityOn, type Position } from './positions';

/** What the valuation needs of a dividend. */
export type DividendLike = Pick<
  Dividend,
  'gross' | 'tax' | 'currency' | 'fxRate' | 'fxCurrency' | 'paidAt'
> & { portfolioId?: string };

type RawPoint = {
  time: number;
  /** Portfolio value (base currency). */
  value: number;
  /** Total profit so far: value minus the net money put in until then, plus dividends received. */
  profit: number;
  /** Capital invested until then: money put in (buys) minus money taken out (sales). */
  invested: number;
};

export type SeriesPoint = RawPoint & {
  /**
   * Change from the start of the range until this point, excluding money put
   * in or taken out (at the last point it equals `PortfolioSeries.change`).
   */
  change: number;
  /** `change` relative to the start value plus the money put in since. */
  changeRatio: number | null;
  /**
   * Time-weighted return since the start of the range: the growth of the
   * portfolio with money put in or taken out factored out, comparable with
   * the return of an index.
   */
  returnRatio: number;
  /** Like `returnRatio`, but dividends received do not count (price changes only). */
  priceReturnRatio: number;
};

export type MarketSnapshot = {
  /** Price history for the selected range, per symbol. */
  histories: Map<string, PriceHistory>;
  /** Currency pair history for the selected range, per instrument currency. */
  fxHistories: Map<string, PriceHistory>;
  /** Intraday data with the latest price and previous close, per symbol. */
  quotes: Map<string, PriceHistory>;
  /** Intraday currency pair data, per instrument currency. */
  fxQuotes: Map<string, PriceHistory>;
  /**
   * Currency pairs since the first trade, to convert every trade at the rate
   * of its own day (also trades from before the selected range).
   */
  fxSinceFirstTrade?: Map<string, PriceHistory>;
};

export type PortfolioSeries = {
  points: SeriesPoint[];
  /** Value at the start of the range (in the base currency). */
  startValue: number | null;
  currentValue: number | null;
  /** Change over the range, excluding money put in or taken out (buys/sells). */
  change: number | null;
  changeRatio: number | null;
  /** Total profit now (unrealized + realized + dividends, net), in the base currency. */
  currentProfit: number | null;
  /** Dividends received so far, net, in the base currency. */
  dividends: number;
  /** Cash balance of the cash portfolios now; `null` when there are none. */
  cash: number | null;
  /** Total profit relative to the most capital invested at once (`peakCapital`). */
  profitRatio: number | null;
  /** True when prices of some instruments could not be loaded. */
  isIncomplete: boolean;
};

/**
 * Where the price of a position comes from:
 * - `live`: downloaded now;
 * - `stored`: the last stored close (offline, or no current data);
 * - `trade`: no market data at all (e.g. delisted): the price of the last trade.
 */
export type PriceSource = 'live' | 'stored' | 'trade';

export type PositionValuation = {
  price: number | null;
  priceSource: PriceSource | null;
  /** When the price is from (ms), for stored and trade prices. */
  priceTime: number | null;
  /** Value in the instrument currency. */
  value: number | null;
  /** Value in the portfolio base currency. */
  baseValue: number | null;
  dayChangeRatio: number | null;
  /** Unrealized profit in the instrument currency. */
  profit: number | null;
  profitRatio: number | null;
  /** Cost of the shares held in the base currency, at the rates of the purchases. */
  baseCost: number | null;
  /** Unrealized profit in the base currency, including the exchange rate change. */
  baseProfit: number | null;
  baseProfitRatio: number | null;
  /** Profit of all sales in the base currency, at the rates of the trades. */
  baseRealizedProfit: number | null;
  /**
   * Result shown with the position: the unrealized profit, plus the net
   * dividends of portfolios set to include them, relative to the cost.
   * Set by `withPositionDividends`.
   */
  resultRatio?: number | null;
  /** Net dividends counted in `resultRatio`, in the base currency. */
  includedDividends?: number;
};

/**
 * Adds the dividends of the given portfolios to the result of each
 * position: (unrealized profit + net dividends) ÷ cost. Positions without
 * such dividends keep the price-only result.
 */
export function withPositionDividends(
  valuation: PositionValuation,
  dividendsNet: number
): PositionValuation {
  const priceOnly = valuation.baseProfitRatio ?? valuation.profitRatio;
  if (dividendsNet === 0 || valuation.baseProfit == null || !valuation.baseCost) {
    return { ...valuation, resultRatio: priceOnly, includedDividends: 0 };
  }
  return {
    ...valuation,
    resultRatio: (valuation.baseProfit + dividendsNet) / valuation.baseCost,
    includedDividends: dividendsNet,
  };
}

const MAX_CHART_POINTS = 240;

/** Close of the last point at or before `time` (binary search), else `null`. */
export function priceAt(points: PricePoint[], time: number): number | null {
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (points[middle].time <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found >= 0) return points[found].close;
  // Before the first point (e.g. a currency pair starting a bit later): use the first one.
  return points.length > 0 ? points[0].close : null;
}

function latestPrice(history: PriceHistory | undefined): number | null {
  if (!history) return null;
  return history.price ?? history.points.at(-1)?.close ?? null;
}

function makeFx(baseCurrency: string, histories: Map<string, PriceHistory>) {
  return (currency: string, time: number): number | null => {
    if (currency === baseCurrency) return 1;
    const history = histories.get(currency);
    return history ? priceAt(history.points, time) : null;
  };
}

function currentFx(baseCurrency: string, snapshot: MarketSnapshot, currency: string) {
  return currency === baseCurrency ? 1 : latestPrice(snapshot.fxQuotes.get(currency));
}

/** The last trade of a position (newest date), for a price when there is no market data. */
function lastTrade(position: Position) {
  let last = position.transactions[0];
  for (const transaction of position.transactions) {
    if (transaction.tradedAt >= last.tradedAt) last = transaction;
  }
  return last;
}

/**
 * Price of a position and where it comes from: the downloaded price, the
 * last stored close, or, without any market data (delisted, renamed), the
 * price of the last trade, so the position still counts in the portfolio.
 */
function resolvePrice(
  position: Position,
  quote: PriceHistory | undefined
): { price: number | null; source: PriceSource | null; time: number | null } {
  const price = latestPrice(quote);
  if (price != null && quote) {
    return quote.isStored
      ? { price, source: 'stored', time: quote.priceTime ?? quote.fetchedAt ?? null }
      : { price, source: 'live', time: null };
  }
  const trade = position.transactions.length > 0 ? lastTrade(position) : null;
  if (!trade) return { price: null, source: null, time: null };
  return { price: trade.price, source: 'trade', time: fromISODate(trade.tradedAt).getTime() };
}

/** Current rate of the instrument currency, else the rate of the last trade. */
function resolveFx(position: Position, snapshot: MarketSnapshot, baseCurrency: string) {
  const current = currentFx(baseCurrency, snapshot, position.instrument.currency);
  if (current != null || position.transactions.length === 0) return current;
  return tradeRate(lastTrade(position), baseCurrency);
}

export function valuePosition(
  position: Position,
  snapshot: MarketSnapshot,
  baseCurrency: string
): PositionValuation {
  const quote = snapshot.quotes.get(position.instrument.symbol);
  const { price, source, time } = resolvePrice(position, quote);
  const fx = resolveFx(position, snapshot, baseCurrency);
  const value = price != null ? price * position.quantity : null;
  const profit = value != null ? value - position.openCost : null;
  const profitRatio = profit != null && position.openCost > 0 ? profit / position.openCost : null;
  const dayChangeRatio =
    source === 'live' && price != null && quote?.previousClose
      ? price / quote.previousClose - 1
      : null;
  const baseValue = value != null && fx != null ? value * fx : null;

  const totals = baseLedgerTotals(
    position.transactions,
    baseCurrency,
    makeFx(baseCurrency, snapshot.fxSinceFirstTrade ?? snapshot.fxHistories)
  );
  const baseCost = position.quantity > 0 && totals ? totals.openCost : null;
  const baseProfit = baseValue != null && baseCost != null ? baseValue - baseCost : null;

  return {
    price,
    priceSource: source,
    priceTime: time,
    value,
    baseValue,
    dayChangeRatio,
    profit,
    profitRatio,
    baseCost,
    baseProfit,
    baseProfitRatio: baseProfit != null && baseCost ? baseProfit / baseCost : null,
    baseRealizedProfit: totals?.realizedProfit ?? null,
  };
}

function dayBefore(date: string): string {
  const day = fromISODate(date);
  day.setDate(day.getDate() - 1);
  return toISODate(day);
}

/** Cash put into (+) or taken out of (−) the position by a trade, in the trade's currency. */
function cashFlow(trade: Pick<TransactionWithInstrument, 'side' | 'quantity' | 'price' | 'fee'>) {
  const gross = trade.quantity * trade.price;
  return trade.side === 'buy' ? gross + trade.fee : -(gross - trade.fee);
}

type Flow = { date: string; amount: number; portfolioId?: string };

/**
 * Every trade as money in (+) or out (−), in the base currency at the rate
 * entered with the trade, else at the market rate of its day.
 */
function buildFlows(
  positions: Position[],
  baseCurrency: string,
  fxAt: (currency: string, time: number) => number | null
): Flow[] {
  const flows: Flow[] = [];
  for (const position of positions) {
    for (const transaction of position.transactions) {
      // The given rate, unless it cannot be right; else the market rate of the day.
      const fx = checkedTradeRate(transaction, baseCurrency, fxAt);
      if (fx == null) continue;
      // Converted as a whole, so a fee paid in the base currency stays exact.
      flows.push({
        date: transaction.tradedAt,
        amount: cashFlow(convertTrade(transaction, fx, baseCurrency)),
        portfolioId: transaction.portfolioId,
      });
    }
  }
  return flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The most capital that was invested at once: the highest running total of
 * money put in (buys) minus money taken out (sales), going through the
 * trades in order. Buying 1000, selling for 1500 and buying again for 1000
 * peaks at 1000, not 2000.
 */
export function peakCapital(flows: readonly { date: string; amount: number }[]): number {
  let running = 0;
  let peak = 0;
  for (let index = 0; index < flows.length; index++) {
    running += flows[index].amount;
    // Trades of one day count together (a sale and a purchase the same day).
    if (index + 1 < flows.length && flows[index + 1].date === flows[index].date) continue;
    peak = Math.max(peak, running);
  }
  return peak;
}

const QUANTITY_EPSILON = 1e-9;

type QuantityTimeline = { dates: string[]; totals: number[] };

/** Shares held after each trade day, for quick lookups along the chart. */
function quantityTimeline(position: Position): QuantityTimeline {
  const sorted = [...position.transactions].sort((a, b) =>
    a.tradedAt < b.tradedAt ? -1 : a.tradedAt > b.tradedAt ? 1 : 0
  );
  const dates: string[] = [];
  const totals: number[] = [];
  let total = 0;
  for (const transaction of sorted) {
    total += transaction.side === 'buy' ? transaction.quantity : -transaction.quantity;
    if (dates.at(-1) === transaction.tradedAt) totals[totals.length - 1] = total;
    else {
      dates.push(transaction.tradedAt);
      totals.push(total);
    }
  }
  return { dates, totals };
}

/** Same as `quantityOn`, by binary search in the timeline. */
function quantityAt(timeline: QuantityTimeline, date: string): number {
  let low = 0;
  let high = timeline.dates.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (timeline.dates[middle] <= date) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const quantity = found >= 0 ? timeline.totals[found] : 0;
  return quantity > QUANTITY_EPSILON ? quantity : 0;
}

function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

/**
 * Adds the change since the start of the range and the time-weighted return
 * to every point. Money moved between two points counts at the later one
 * (the chart has one point a day, so a trade lands on the close of its day).
 */
export function withChanges(
  points: readonly RawPoint[],
  startValue: number,
  capital: readonly Flow[],
  income: readonly Flow[],
  isFlowInRange: (date: string) => boolean,
  /** Dividends paid into the cash of cash portfolios (part of the value). */
  cashIncome: readonly Flow[] = []
): SeriesPoint[] {
  const capitalInRange = capital.filter((flow) => isFlowInRange(flow.date));
  const incomeInRange = income.filter((flow) => isFlowInRange(flow.date));
  const cashIncomeInRange = cashIncome.filter((flow) => isFlowInRange(flow.date));
  let capitalIndex = 0;
  let incomeIndex = 0;
  let cashIncomeIndex = 0;
  let priceGrowth = 1;
  let netCapital = 0;
  let inflows = 0;
  let incomeSoFar = 0;
  let previousValue = startValue;
  let growth = 1;

  return points.map((point) => {
    const date = toISODate(new Date(point.time));
    let stepCapital = 0;
    let stepIncome = 0;
    while (capitalIndex < capitalInRange.length && capitalInRange[capitalIndex].date <= date) {
      const amount = capitalInRange[capitalIndex].amount;
      stepCapital += amount;
      if (amount > 0) inflows += amount;
      capitalIndex++;
    }
    while (incomeIndex < incomeInRange.length && incomeInRange[incomeIndex].date <= date) {
      stepIncome += incomeInRange[incomeIndex].amount;
      incomeIndex++;
    }
    let stepCashIncome = 0;
    while (
      cashIncomeIndex < cashIncomeInRange.length &&
      cashIncomeInRange[cashIncomeIndex].date <= date
    ) {
      stepCashIncome += cashIncomeInRange[cashIncomeIndex].amount;
      cashIncomeIndex++;
    }
    netCapital += stepCapital;
    incomeSoFar += stepIncome;

    // Growth of what was there at the previous point; nothing there yet
    // (the first purchase) is no gain and no loss.
    if (previousValue > 0) {
      growth *= (point.value - stepCapital + stepIncome) / previousValue;
      // Without dividends: a dividend paid into cash counts like money put in.
      priceGrowth *= (point.value - stepCapital - stepCashIncome) / previousValue;
    }
    previousValue = point.value;

    const change = point.value - startValue - netCapital + incomeSoFar;
    const base = startValue + inflows;
    return {
      ...point,
      change,
      changeRatio: base > 0 ? change / base : null,
      returnRatio: growth - 1,
      priceReturnRatio: priceGrowth - 1,
    };
  });
}

/** Cash portfolios and their deposits, withdrawals, interest and tax. */
export type CashInput = {
  portfolioIds: ReadonlySet<string>;
  operations: readonly Pick<CashOperation, 'portfolioId' | 'type' | 'amount' | 'date'>[];
};

const NO_CASH: CashInput = { portfolioIds: new Set(), operations: [] };

function byDate(a: { date: string }, b: { date: string }) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/** Running total of dated amounts, read in date order. */
function cursor(flows: Flow[]) {
  let index = 0;
  let total = 0;
  return (date: string) => {
    while (index < flows.length && flows[index].date <= date) {
      total += flows[index].amount;
      index++;
    }
    return total;
  };
}

function sumUntil(flows: Flow[], date: string) {
  let total = 0;
  for (const flow of flows) if (flow.date <= date) total += flow.amount;
  return total;
}

/**
 * Value of the portfolio over the range, in the base currency.
 * Quantities follow the trade dates, prices and FX rates are carried forward
 * over gaps (weekends, different trading hours across markets).
 *
 * Capital and result:
 * - a regular portfolio: the money put in is what the purchases cost minus
 *   what the sales brought; dividends add to the profit;
 * - a cash portfolio: the money put in is the deposits minus the
 *   withdrawals; trades, dividends and interest only move money between
 *   the cash and the shares, so its value is shares + cash.
 */
export function buildPortfolioSeries(
  positions: Position[],
  snapshot: MarketSnapshot,
  range: ChartRange,
  baseCurrency: string,
  /** Start of the range (ms); earlier points only serve as prices carried forward. */
  rangeStart: number | null = null,
  now = Date.now(),
  /** Dividends received; their net amount counts towards the profit. */
  dividends: readonly DividendLike[] = [],
  cash: CashInput = NO_CASH
): PortfolioSeries {
  const fxAt = makeFx(baseCurrency, snapshot.fxHistories);
  const flowFxAt = makeFx(baseCurrency, snapshot.fxSinceFirstTrade ?? snapshot.fxHistories);
  const isCash = (portfolioId: string | undefined) =>
    portfolioId != null && cash.portfolioIds.has(portfolioId);

  const trades = buildFlows(positions, baseCurrency, flowFxAt);
  /** Money put in (+) or taken out (−). */
  const capital: Flow[] = [];
  /** Changes of the cash balance of cash portfolios. */
  const cashMoves: Flow[] = [];
  /** Dividends of regular portfolios: income on top of the value. */
  const income: Flow[] = [];
  /** Dividends of cash portfolios (already in the value, as cash). */
  const cashIncome: Flow[] = [];
  let allDividends = 0;

  for (const trade of trades) {
    if (isCash(trade.portfolioId)) cashMoves.push({ date: trade.date, amount: -trade.amount });
    else capital.push(trade);
  }
  for (const operation of cash.operations) {
    if (!isCash(operation.portfolioId)) continue;
    const amount = signedCashAmount(operation);
    cashMoves.push({ date: operation.date, amount });
    if (isCapitalOperation(operation)) capital.push({ date: operation.date, amount });
  }
  for (const dividend of dividends) {
    const amounts = dividendInBase(dividend, baseCurrency, flowFxAt);
    if (!amounts) continue;
    allDividends += amounts.net;
    const flow = { date: dividend.paidAt, amount: amounts.net };
    if (isCash(dividend.portfolioId)) {
      cashMoves.push(flow);
      cashIncome.push(flow);
    } else income.push(flow);
  }
  capital.sort(byDate);
  cashMoves.sort(byDate);
  income.sort(byDate);
  cashIncome.sort(byDate);

  const totalCapital = capital.reduce((sum, flow) => sum + flow.amount, 0);
  const totalCash = cashMoves.reduce((sum, flow) => sum + flow.amount, 0);
  const totalIncome = income.reduce((sum, flow) => sum + flow.amount, 0);
  const peakInvested = peakCapital(capital);
  const hasCash = cash.portfolioIds.size > 0;
  let isIncomplete = false;

  // Current value from the latest prices (or the last known ones), plus cash.
  const valuations = new Map<string, PositionValuation>();
  let currentValue = hasCash ? totalCash : 0;
  for (const position of positions) {
    const valuation = valuePosition(position, snapshot, baseCurrency);
    valuations.set(position.instrument.symbol, valuation);
    if (position.quantity <= 0) continue;
    if (valuation.baseValue == null) isIncomplete = true;
    else currentValue += valuation.baseValue;
  }

  // Timeline: every price point of every instrument in the range.
  const times = new Set<number>();
  for (const position of positions) {
    const history = snapshot.histories.get(position.instrument.symbol);
    if (!history) {
      isIncomplete = true;
      continue;
    }
    for (const point of history.points) {
      if (rangeStart == null || point.time >= rangeStart) times.add(point.time);
    }
  }
  const sortedTimes = [...times].sort((a, b) => a - b);

  const timelines = new Map(
    positions.map((position) => [position.instrument.symbol, quantityTimeline(position)])
  );
  const capitalAt = cursor(capital);
  const cashAt = cursor(cashMoves);
  const incomeAt = cursor(income);
  let points: RawPoint[] = [];
  for (const time of sortedTimes) {
    const date = toISODate(new Date(time));
    const investedSoFar = capitalAt(date);
    const cashSoFar = cashAt(date);
    const incomeSoFar = incomeAt(date);
    let value = hasCash ? cashSoFar : 0;
    for (const position of positions) {
      const quantity = quantityAt(timelines.get(position.instrument.symbol)!, date);
      if (quantity <= 0) continue;
      const history = snapshot.histories.get(position.instrument.symbol);
      // Without price history (e.g. delisted) the last known price holds.
      const fallback = valuations.get(position.instrument.symbol);
      const price = history ? priceAt(history.points, time) : (fallback?.price ?? null);
      const fx =
        fxAt(position.instrument.currency, time) ??
        (fallback?.value && fallback.baseValue != null ? fallback.baseValue / fallback.value : null);
      if (price != null && fx != null) value += quantity * price * fx;
    }
    points.push({
      time,
      value,
      profit: value - investedSoFar + incomeSoFar,
      invested: investedSoFar,
    });
  }

  // Skip the part of the range before the first purchase (or deposit).
  const firstHeld = points.findIndex((point) => point.value !== 0);
  points = firstHeld >= 0 ? points.slice(firstHeld) : [];
  const hasActivity = trades.length > 0 || cashMoves.length > 0;
  const currentProfit = hasActivity ? currentValue - totalCapital + totalIncome : null;
  // Relative to the most money that was in the portfolio at once, which
  // stays fair when the same capital is invested again after a sale.
  const profitRatio =
    currentProfit != null && peakInvested > 0 ? currentProfit / peakInvested : null;

  // Daily ranges end with the current value. The one-day chart ends with the
  // last price of the session instead: outside trading hours (evening,
  // weekend) a point "now" would add a misleading time to the axis.
  if (
    range !== '1D' &&
    hasActivity &&
    (currentValue !== 0 || points.length > 0) &&
    (points.length === 0 || now > points[points.length - 1].time)
  ) {
    points.push({
      time: now,
      value: currentValue,
      profit: currentValue - totalCapital + totalIncome,
      invested: totalCapital,
    });
  }

  const cashBalance = hasCash ? totalCash : null;
  if (points.length === 0) {
    return {
      points: [],
      startValue: null,
      currentValue: currentValue !== 0 ? currentValue : null,
      change: null,
      changeRatio: null,
      currentProfit,
      profitRatio,
      dividends: allDividends,
      cash: cashBalance,
      isIncomplete,
    };
  }

  // Start value and the money put in during the range.
  const startDate = toISODate(new Date(points[0].time));
  let startValue = points[0].value;
  let isFlowInRange = (date: string) => date > startDate;

  if (range === '1D') {
    // The daily change is measured against yesterday's close.
    const previousDay = dayBefore(startDate);
    startValue = hasCash ? sumUntil(cashMoves, previousDay) : 0;
    for (const position of positions) {
      const quantity = quantityOn(position.transactions, previousDay);
      if (quantity <= 0) continue;
      const quote = snapshot.quotes.get(position.instrument.symbol);
      const currency = position.instrument.currency;
      const fxHistory = snapshot.fxQuotes.get(currency);
      const fx =
        currency === baseCurrency
          ? 1
          : (fxHistory?.previousClose ?? fxHistory?.points[0]?.close ?? null);
      if (quote?.previousClose != null && fx != null) {
        startValue += quantity * quote.previousClose * fx;
      }
    }
    isFlowInRange = (date: string) => date >= startDate;
  }

  let netCapital = 0;
  let inflows = 0;
  for (const flow of capital) {
    if (!isFlowInRange(flow.date)) continue;
    netCapital += flow.amount;
    if (flow.amount > 0) inflows += flow.amount;
  }

  // Dividends of regular portfolios received in the range are part of its result.
  let incomeInRange = 0;
  for (const item of income) if (isFlowInRange(item.date)) incomeInRange += item.amount;

  const endValue = points[points.length - 1].value;
  const change = endValue - startValue - netCapital + incomeInRange;
  const invested = startValue + inflows;

  return {
    points: downsample(withChanges(points, startValue, capital, income, isFlowInRange, cashIncome), MAX_CHART_POINTS),
    startValue,
    currentValue: endValue,
    change,
    changeRatio: invested > 0 ? change / invested : null,
    currentProfit,
    profitRatio,
    dividends: allDividends,
    cash: cashBalance,
    isIncomplete,
  };
}
