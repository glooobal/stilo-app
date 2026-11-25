export type InstrumentType = 'EQUITY' | 'ETF';

export type InstrumentSearchResult = {
  /** Provider symbol, e.g. `AAPL`, `VWCE.DE`, `PKN.WA`. */
  symbol: string;
  name: string;
  /** Provider exchange code, e.g. `NMS`, `GER`. */
  exchange: string;
  /** Human readable exchange name, e.g. `NASDAQ`, `XETRA`. */
  exchangeName: string;
  type: InstrumentType;
};

export type Instrument = InstrumentSearchResult & {
  /** ISO 4217 code the instrument is quoted in. */
  currency: string;
};

export type PriceQuote = {
  symbol: string;
  currency: string;
  price: number;
  /** Date of the price as `YYYY-MM-DD`. */
  date: string;
};

export type ChartRange = '1D' | '1M' | 'YTD' | '1Y' | 'ALL';

export type PricePoint = {
  /** Unix time in milliseconds. */
  time: number;
  close: number;
};

export type PriceHistory = {
  symbol: string;
  currency: string;
  /** Latest price (may be newer than the last point). */
  price: number | null;
  /** Previous session close, the base for the daily change. */
  previousClose: number | null;
  points: PricePoint[];
  /**
   * Intraday only: whether the exchange is in its regular session now.
   * When it is closed, `price` is the last close.
   */
  isMarketOpen?: boolean;
  /** When the data was downloaded (ms). */
  fetchedAt?: number;
  /** Built from stored closes because the current price could not be downloaded. */
  isStored?: boolean;
  /** Stored quotes: time of the close `price` comes from (ms). */
  priceTime?: number;
};

/**
 * Source of market data. The app only talks to this interface, so the
 * provider (currently Yahoo Finance) can be swapped without touching screens.
 */
export interface MarketDataProvider {
  searchInstruments(query: string, signal?: AbortSignal): Promise<InstrumentSearchResult[]>;
  /** Latest price, or the closing price on `date` (`YYYY-MM-DD`) when given. */
  getQuote(symbol: string, date?: string, signal?: AbortSignal): Promise<PriceQuote>;
  /** Today's session in 5-minute steps, with the latest price and previous close. */
  getIntraday(symbol: string, signal?: AbortSignal): Promise<PriceHistory>;
  /**
   * Daily closes from `fromDate` (`YYYY-MM-DD`) until today, in one request.
   * Also works for currency pairs such as `USDPLN=X`.
   */
  getDailyCloses(symbol: string, fromDate: string, signal?: AbortSignal): Promise<PriceHistory>;
  /**
   * The whole listing history in weekly closes (light enough for decades),
   * for the "Max" chart of an instrument.
   */
  getLongHistory(symbol: string, signal?: AbortSignal): Promise<PriceHistory>;
  /** Stock splits since `fromDate` (`YYYY-MM-DD`), oldest first. */
  getSplits(symbol: string, fromDate: string, signal?: AbortSignal): Promise<StockSplit[]>;
}

export type StockSplit = {
  /** First trading day after the split, `YYYY-MM-DD`. */
  date: string;
  numerator: number;
  denominator: number;
};

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketDataError';
  }
}
