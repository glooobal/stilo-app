import type { TransactionSide } from '@/db/transactions';
import type { InstrumentType } from '@/market/types';

/** A trade read from a broker's file, before it is saved. */
export type ImportedTrade = {
  /** Stable id of the trade at the broker, to skip it when imported again. */
  externalId: string;
  /** Ticker as in the file, e.g. `KRU.PL`. */
  brokerTicker: string;
  /** Market data symbol, e.g. `KRU.WA`. */
  symbol: string;
  name: string;
  type: InstrumentType;
  /** Currency the instrument is quoted in. */
  currency: string;
  side: TransactionSide;
  quantity: number;
  /** Price per share in `currency`. */
  price: number;
  /** Commission, in `feeCurrency`, exactly as in the file. */
  fee: number;
  /** Currency of the commission; `null`: the instrument currency. */
  feeCurrency: string | null;
  /** Unix time (ms). */
  time: number;
  /** Rate of `currency` in the account currency, for foreign instruments. */
  fxRate: number | null;
  /**
   * Quantity and price are already in today's shares (a broker adjusts open
   * positions after a split); they are turned back into the shares of the
   * trade's day when saved.
   */
  isInTodaysShares?: boolean;
};

export type ImportFile = {
  /** Currency of the broker account (the rates are given in it). */
  accountCurrency: string | null;
  trades: ImportedTrade[];
  /** Tickers that could not be mapped to a supported market. */
  unsupportedTickers: string[];
};

export type Broker = {
  id: string;
  name: string;
  /** Website, for the logo (Brandfetch). */
  domain: string;
  /** How to get the file, shown under the file picker. */
  exportHint: string;
  mimeTypes: string[];
  parse: (bytes: Uint8Array, fileName: string) => ImportFile;
};
