import type { TransactionWithInstrument } from '@/db/transactions';
import type { ChartRange, PriceHistory, PricePoint } from '@/market/types';

import { fromISODate, toISODate } from './date';
import { convertTrade, tradeDayEnd, tradeRate } from './fx';
import { baseLedgerTotals, quantityOn, type Position } from './positions';

export type SeriesPoint = {
  time: number;
  /** Portfolio value (base currency). */
  value: number;
  /** Total profit so far: value minus the net money put in until then. */
  profit: number;
  /** Capital invested until then: money put in (buys) minus money taken out (sales). */
  invested: number;
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
  /** Total profit now (unrealized + realized), in the base currency. */
  currentProfit: number | null;
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
};

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

type Flow = { date: string; amount: number };

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
      const fx =
        tradeRate(transaction, baseCurrency) ??
        fxAt(transaction.currency, tradeDayEnd(transaction.tradedAt));
      if (fx == null) continue;
      // Converted as a whole, so a fee paid in the base currency stays exact.
      flows.push({
        date: transaction.tradedAt,
        amount: cashFlow(convertTrade(transaction, fx, baseCurrency)),
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

function downsample(points: SeriesPoint[], max: number): SeriesPoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

/**
 * Value of the portfolio over the range, in the base currency.
 * Quantities follow the trade dates, prices and FX rates are carried forward
 * over gaps (weekends, different trading hours across markets).
 */
export function buildPortfolioSeries(
  positions: Position[],
  snapshot: MarketSnapshot,
  range: ChartRange,
  baseCurrency: string,
  /** Start of the range (ms); earlier points only serve as prices carried forward. */
  rangeStart: number | null = null,
  now = Date.now()
): PortfolioSeries {
  const fxAt = makeFx(baseCurrency, snapshot.fxHistories);
  const flowFxAt = makeFx(baseCurrency, snapshot.fxSinceFirstTrade ?? snapshot.fxHistories);
  const flows = buildFlows(positions, baseCurrency, flowFxAt);
  const totalNetFlow = flows.reduce((sum, flow) => sum + flow.amount, 0);
  const peakInvested = peakCapital(flows);
  let isIncomplete = false;

  // Current value from the latest prices (or the last known ones).
  const valuations = new Map<string, PositionValuation>();
  let currentValue: number | null = 0;
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
  let points: SeriesPoint[] = [];
  let flowIndex = 0;
  let netFlowSoFar = 0;
  for (const time of sortedTimes) {
    const date = toISODate(new Date(time));
    while (flowIndex < flows.length && flows[flowIndex].date <= date) {
      netFlowSoFar += flows[flowIndex].amount;
      flowIndex++;
    }
    let value = 0;
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
    points.push({ time, value, profit: value - netFlowSoFar, invested: netFlowSoFar });
  }

  // Skip the part of the range before the first purchase.
  const firstHeld = points.findIndex((point) => point.value > 0);
  points = firstHeld >= 0 ? points.slice(firstHeld) : [];
  const hasTrades = flows.length > 0;
  const currentProfit = hasTrades ? currentValue - totalNetFlow : null;
  // Relative to the most money that was in the portfolio at once, which
  // stays fair when the same capital is invested again after a sale.
  const profitRatio =
    currentProfit != null && peakInvested > 0 ? currentProfit / peakInvested : null;

  // Daily ranges end with the current value. The one-day chart ends with the
  // last price of the session instead: outside trading hours (evening,
  // weekend) a point "now" would add a misleading time to the axis.
  if (
    range !== '1D' &&
    hasTrades &&
    (currentValue > 0 || points.length > 0) &&
    (points.length === 0 || now > points[points.length - 1].time)
  ) {
    points.push({
      time: now,
      value: currentValue,
      profit: currentValue - totalNetFlow,
      invested: totalNetFlow,
    });
  }

  if (points.length === 0) {
    return {
      points,
      startValue: null,
      currentValue: currentValue > 0 ? currentValue : null,
      change: null,
      changeRatio: null,
      currentProfit,
      profitRatio,
      isIncomplete,
    };
  }

  // Start value and the trades that happened inside the range.
  const startDate = toISODate(new Date(points[0].time));
  let startValue = points[0].value;
  let isFlowInRange = (tradedAt: string) => tradedAt > startDate;

  if (range === '1D') {
    // The daily change is measured against yesterday's close.
    const previousDay = dayBefore(startDate);
    startValue = 0;
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
    isFlowInRange = (tradedAt: string) => tradedAt >= startDate;
  }

  let netFlows = 0;
  let inflows = 0;
  for (const flow of flows) {
    if (!isFlowInRange(flow.date)) continue;
    netFlows += flow.amount;
    if (flow.amount > 0) inflows += flow.amount;
  }

  const endValue = points[points.length - 1].value;
  const change = endValue - startValue - netFlows;
  const invested = startValue + inflows;

  return {
    points: downsample(points, MAX_CHART_POINTS),
    startValue,
    currentValue: endValue,
    change,
    changeRatio: invested > 0 ? change / invested : null,
    currentProfit,
    profitRatio,
    isIncomplete,
  };
}
