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

/** A dividend read from a broker's file: one payment of one instrument on one day. */
export type ImportedDividend = {
  externalId: string;
  brokerTicker: string;
  symbol: string;
  name: string;
  /** Unix time (ms) of the payment. */
  time: number;
  /** Gross amount and tax withheld, exactly as in the file, in `currency`. */
  gross: number;
  tax: number;
  /** Currency the amounts are in (for XTB: the account currency). */
  currency: string;
  /** Gross dividend per share, when the file gives it in `currency`. */
  perShare: number | null;
};

/** A deposit, withdrawal, interest or interest tax read from a broker's file. */
export type ImportedCashOperation = {
  externalId: string;
  type: 'deposit' | 'withdrawal' | 'interest' | 'tax';
  /** Exactly as in the file, without the sign; in the account currency. */
  amount: number;
  time: number;
  note: string | null;
};

export type ImportFile = {
  /** Currency of the broker account (the rates are given in it). */
  accountCurrency: string | null;
  trades: ImportedTrade[];
  dividends: ImportedDividend[];
  cashOperations: ImportedCashOperation[];
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
