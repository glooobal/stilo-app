import type { InstrumentType } from '@/market/types';

import { excelDateToTime, readWorkbook, SpreadsheetError, type Cell } from '../xlsx';
import { toISODate } from '../date';
import { sumExact } from '../number';
import type {
  Broker,
  ImportedCashOperation,
  ImportedDividend,
  ImportedTrade,
  ImportFile,
} from './types';

/**
 * XTB ticker suffix → market data suffix and the currency of the market.
 * `KRU.PL` is `KRU.WA`, `AAPL.US` is `AAPL`.
 */
const MARKETS: Record<string, { suffix: string; currency: string }> = {
  PL: { suffix: '.WA', currency: 'PLN' },
  US: { suffix: '', currency: 'USD' },
  UK: { suffix: '.L', currency: 'GBP' },
  DE: { suffix: '.DE', currency: 'EUR' },
  FR: { suffix: '.PA', currency: 'EUR' },
  NL: { suffix: '.AS', currency: 'EUR' },
  BE: { suffix: '.BR', currency: 'EUR' },
  PT: { suffix: '.LS', currency: 'EUR' },
  IT: { suffix: '.MI', currency: 'EUR' },
  ES: { suffix: '.MC', currency: 'EUR' },
  IE: { suffix: '.IR', currency: 'EUR' },
  AT: { suffix: '.VI', currency: 'EUR' },
  FI: { suffix: '.HE', currency: 'EUR' },
  CH: { suffix: '.SW', currency: 'CHF' },
  SE: { suffix: '.ST', currency: 'SEK' },
  DK: { suffix: '.CO', currency: 'DKK' },
  NO: { suffix: '.OL', currency: 'NOK' },
  CZ: { suffix: '.PR', currency: 'CZK' },
};

const CATEGORIES: Record<string, InstrumentType> = { STOCK: 'EQUITY', ETF: 'ETF' };

export function mapXtbTicker(ticker: string): { symbol: string; currency: string } | null {
  const dot = ticker.lastIndexOf('.');
  if (dot <= 0) return null;
  const market = MARKETS[ticker.slice(dot + 1).toUpperCase()];
  if (!market) return null;
  let base = ticker.slice(0, dot).toUpperCase();
  // Share classes: `BRK.B.US` is `BRK-B` in market data.
  if (market.suffix === '') base = base.replace(/\./g, '-');
  return { symbol: base + market.suffix, currency: market.currency };
}

type Table = { rows: Cell[][]; column: (row: Cell[], name: string) => Cell };

/** Finds the header row (it starts with `firstHeader`) and gives access by column name. */
function table(sheet: Cell[][] | undefined, firstHeader: string): Table | null {
  if (!sheet) return null;
  const headerIndex = sheet.findIndex(
    (row) => typeof row[0] === 'string' && row[0].trim() === firstHeader
  );
  if (headerIndex < 0) return null;
  const columns = new Map<string, number>();
  sheet[headerIndex].forEach((cell, index) => {
    if (typeof cell === 'string') columns.set(cell.trim().toLowerCase(), index);
  });
  return {
    rows: sheet.slice(headerIndex + 1),
    column: (row, name) => {
      const index = columns.get(name.toLowerCase());
      return index != null ? (row[index] ?? null) : null;
    },
  };
}

function text(cell: Cell): string {
  if (cell == null) return '';
  if (typeof cell === 'number') return Number.isInteger(cell) ? String(cell) : String(cell);
  return cell.trim();
}

function number(cell: Cell): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell === 'string' && cell.trim() !== '') {
    const value = Number(cell.replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/** Position ids are numbers in some sheets and text in others. */
function positionId(cell: Cell): string {
  if (typeof cell === 'number') return String(Math.round(cell));
  return text(cell);
}

function time(cell: Cell): number | null {
  if (typeof cell === 'number') return excelDateToTime(cell);
  if (typeof cell === 'string' && cell) {
    // "2026-06-09 10:31:38" (UTC) in case dates come as text.
    const value = Date.parse(`${cell.replace(' ', 'T')}Z`);
    return Number.isNaN(value) ? null : value;
  }
  return null;
}

type CashOperation = { time: number; amount: number };

/** "Stock purchase" / "Stock sell" amounts in the account currency, per position id. */
function readCashOperations(sheet: Cell[][] | undefined) {
  const purchases = new Map<string, CashOperation[]>();
  const sales = new Map<string, CashOperation[]>();
  const cash = table(sheet, 'Type');
  if (!cash) return { purchases, sales };
  const seen = new Set<string>();
  for (const row of cash.rows) {
    const type = text(cash.column(row, 'Type'));
    const target = /stock purchase/i.test(type)
      ? purchases
      : /stock (sell|sale)/i.test(type)
        ? sales
        : null;
    if (!target) continue;
    const id = positionId(cash.column(row, 'Position ID'));
    const operationId = text(cash.column(row, 'ID'));
    const at = time(cash.column(row, 'Time'));
    const amount = number(cash.column(row, 'Amount'));
    if (!id || at == null || amount == null) continue;
    if (operationId && seen.has(operationId)) continue;
    if (operationId) seen.add(operationId);
    const list = target.get(id) ?? [];
    list.push({ time: at, amount: Math.abs(amount) });
    target.set(id, list);
  }
  return { purchases, sales };
}

/**
 * All cash operations within a few minutes of a moment, added up: XTB can
 * book one purchase in several parts (e.g. fills of one order).
 */
function totalNear(operations: CashOperation[] | undefined, at: number): number | null {
  let total = 0;
  let found = false;
  for (const operation of operations ?? []) {
    if (Math.abs(operation.time - at) > 5 * 60_000) continue;
    total += operation.amount;
    found = true;
  }
  return found ? total : null;
}

/** The cash operation closest in time (within a few minutes). */
function nearest(operations: CashOperation[] | undefined, at: number): CashOperation | null {
  if (!operations?.length) return null;
  let best: CashOperation | null = null;
  for (const operation of operations) {
    if (Math.abs(operation.time - at) > 5 * 60_000) continue;
    if (!best || Math.abs(operation.time - at) < Math.abs(best.time - at)) best = operation;
  }
  return best;
}

/** Currencies an XTB account can be kept in. */
const ACCOUNT_CURRENCIES = new Set(['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'HUF', 'RON']);

/**
 * Currency of the account, from (in this order): the summary of open
 * positions, the trades themselves (a trade without a conversion rate is in
 * the account currency), or the file name. Names of IKE/IKZE exports start
 * with the account type instead (`IKE_53191135_…`), so only real currency
 * codes count there.
 */
function accountCurrencyOf(
  workbook: ReturnType<typeof readWorkbook>,
  closed: Table | null,
  open: Table | null,
  fileName: string
): string | null {
  const summary = table(workbook.get('Open Positions'), 'Product');
  if (summary) {
    for (const row of summary.rows) {
      const currency = text(summary.column(row, 'Currency')).toUpperCase();
      if (ACCOUNT_CURRENCIES.has(currency)) return currency;
      if (text(row[0]) === '' || text(row[0]) === 'Note') break;
    }
  }

  const votes = new Map<string, number>();
  const vote = (currency: string) => votes.set(currency, (votes.get(currency) ?? 0) + 1);
  if (closed) {
    for (const row of closed.rows) {
      const mapped = mapXtbTicker(text(closed.column(row, 'Ticker')));
      if (!mapped || !number(closed.column(row, 'Volume'))) continue;
      const rate = number(closed.column(row, 'Open Conversion Rate'));
      if (rate == null || rate === 1) vote(mapped.currency);
    }
  }
  if (open) {
    // A lot's value is in the account currency: equal to volume × price when
    // the instrument is quoted in it too.
    for (const row of open.rows) {
      const mapped = mapXtbTicker(text(open.column(row, 'Ticker')));
      const volume = number(open.column(row, 'Volume'));
      const value = number(open.column(row, 'Value'));
      const price = number(open.column(row, 'Current price'));
      if (!mapped || !volume || !value || !price) continue;
      if (Math.abs(value - volume * price) <= Math.max(0.02, value * 0.001)) vote(mapped.currency);
    }
  }
  const inferred = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (inferred && ACCOUNT_CURRENCIES.has(inferred)) return inferred;

  for (const token of fileName.toUpperCase().split(/[^A-Z]+/)) {
    if (ACCOUNT_CURRENCIES.has(token)) return token;
  }
  return null;
}

/** A dividend payment ("Dividend", older exports: "DIVIDENT"). */
function isDividendType(type: string): boolean {
  const lower = type.toLowerCase();
  return /divid(en|ent)/.test(lower) && !/tax/.test(lower);
}

/** The tax withheld from a dividend. */
function isDividendTaxType(type: string): boolean {
  const lower = type.toLowerCase();
  return /withholding tax/.test(lower) || (/tax/.test(lower) && /divid(en|ent)/.test(lower));
}

/**
 * Dividends from the cash operations: XTB books every lot separately (with
 * its tax line), so the lines of one instrument on one day are added up
 * exactly into one payment. Amounts are in the account currency.
 */
function readDividends(
  sheet: Cell[][] | undefined,
  accountCurrency: string | null,
  instrumentOf: (ticker: string, category: string) => { symbol: string } | null
): ImportedDividend[] {
  const cash = table(sheet, 'Type');
  if (!cash || !accountCurrency) return [];
  type Payment = {
    ticker: string;
    symbol: string;
    name: string;
    time: number;
    gross: number[];
    tax: number[];
    perShare: number | null;
  };
  const payments = new Map<string, Payment>();
  const seen = new Set<string>();

  for (const row of cash.rows) {
    const type = text(cash.column(row, 'Type'));
    const isDividend = isDividendType(type);
    if (!isDividend && !isDividendTaxType(type)) continue;
    const operationId = text(cash.column(row, 'ID'));
    if (operationId && seen.has(operationId)) continue;
    if (operationId) seen.add(operationId);

    const ticker = text(cash.column(row, 'Ticker'));
    const at = time(cash.column(row, 'Time'));
    const amount = number(cash.column(row, 'Amount'));
    if (!ticker || at == null || amount == null) continue;
    const instrument = instrumentOf(ticker, text(cash.column(row, 'Category')));
    if (!instrument) continue;

    const key = `${ticker}|${toISODate(new Date(at))}`;
    const payment = payments.get(key) ?? {
      ticker,
      symbol: instrument.symbol,
      name: text(cash.column(row, 'Instrument')) || ticker,
      time: at,
      gross: [],
      tax: [],
      perShare: null,
    };
    if (isDividend) {
      payment.gross.push(amount);
      // "XTB.PL PLN 4.0700/ SHR": the dividend per share and its currency.
      const match = /\b([A-Z]{3})\s+([\d.]+)\s*\/\s*SHR/.exec(text(cash.column(row, 'Comment')));
      if (match && match[1] === accountCurrency) payment.perShare = Number(match[2]);
    } else {
      payment.tax.push(Math.abs(amount));
    }
    payments.set(key, payment);
  }

  const dividends: ImportedDividend[] = [];
  for (const [key, payment] of payments) {
    if (payment.gross.length === 0) continue;
    dividends.push({
      externalId: `div:${key}`,
      brokerTicker: payment.ticker,
      symbol: payment.symbol,
      name: payment.name,
      time: payment.time,
      gross: sumExact(payment.gross),
      tax: payment.tax.length > 0 ? sumExact(payment.tax) : 0,
      currency: accountCurrency,
      perShare: payment.perShare,
    });
  }
  return dividends.sort((a, b) => a.time - b.time);
}

/** How a cash operation of the file counts for the cash of the portfolio. */
function moneyOperationType(type: string, amount: number): ImportedCashOperation['type'] {
  const lower = type.toLowerCase();
  if (/interest|odsetk/.test(lower)) return /tax|podat/.test(lower) || amount < 0 ? 'tax' : 'interest';
  if (/transfer|przelew/.test(lower)) return amount > 0 ? 'deposit' : 'withdrawal';
  if (/deposit|wpłat/.test(lower)) return amount > 0 ? 'deposit' : 'withdrawal';
  if (/withdraw|wypłat/.test(lower)) return amount < 0 ? 'withdrawal' : 'deposit';
  return amount > 0 ? 'income' : 'fee';
}

/**
 * Every cash operation that the trades and dividends do not already bring,
 * so the cash of the portfolio matches the account: deposits, withdrawals,
 * transfers (by their sign), interest and its tax, and everything else as
 * other income or a fee (e.g. currency conversion, corrections, the result
 * of CFD positions, dividends of instruments the app cannot import).
 */
function readMoneyOperations(
  sheet: Cell[][] | undefined,
  /** Positions imported as trades: their purchases, sales and commissions are in the trades. */
  tradedPositions: ReadonlySet<string>,
  /** Dividends of these instruments are imported as dividends. */
  isImportedInstrument: (ticker: string, category: string) => boolean
): ImportedCashOperation[] {
  const cash = table(sheet, 'Type');
  if (!cash) return [];
  const operations: ImportedCashOperation[] = [];
  const seen = new Set<string>();
  for (const row of cash.rows) {
    const type = text(cash.column(row, 'Type'));
    const amount = number(cash.column(row, 'Amount'));
    const at = time(cash.column(row, 'Time'));
    const id = text(cash.column(row, 'ID'));
    if (!type || amount == null || amount === 0 || at == null || !id || seen.has(id)) continue;

    const position = positionId(cash.column(row, 'Position ID'));
    const ticker = text(cash.column(row, 'Ticker'));
    const category = text(cash.column(row, 'Category'));
    const isDividend = isDividendType(type) || isDividendTaxType(type);
    if (isDividend && ticker && isImportedInstrument(ticker, category)) continue;
    if (!isDividend && position && tradedPositions.has(position)) continue;
    if (!isDividend && /stock (purchase|sell|sale)/i.test(type)) continue;

    seen.add(id);
    const kind = moneyOperationType(type, amount);
    const comment = text(cash.column(row, 'Comment'));
    const isOther = kind === 'income' || kind === 'fee';
    operations.push({
      externalId: `cash:${id}`,
      type: kind,
      amount: Math.abs(amount),
      time: at,
      // Other operations keep the broker's name, so the user sees what they were.
      note: isOther ? [type, ticker, comment].filter(Boolean).join(' · ') : comment || null,
    });
  }
  return operations.sort((a, b) => a.time - b.time);
}

type Purchase = Omit<ImportedTrade, 'side' | 'externalId'> & { positionId: string };

/**
 * Reads the XTB account history export (xStation → History → Export → XLSX):
 * purchases and sales of stocks and ETFs from "Closed Positions" and the
 * open lots from "Open Positions". Every XTB position becomes one purchase
 * (keyed by its position id) and every close of it a sale, so a later export
 * only adds what is new. Rates come from the conversion rate columns, or
 * from the cash operations of the position.
 */
export function parseXtbFile(bytes: Uint8Array, fileName: string): ImportFile {
  const workbook = readWorkbook(bytes);
  const closed = table(workbook.get('Closed Positions'), 'Instrument');
  // The open positions table starts after a summary block, also with "Product".
  const openSheet = workbook.get('Open Positions');
  const openHeader = openSheet?.findIndex((row) => text(row[1]) === 'Instrument/Position') ?? -1;
  const open = openHeader >= 0 ? table(openSheet!.slice(openHeader), 'Product') : null;
  if (!closed && !open) {
    throw new SpreadsheetError(
      'To nie wygląda na historię konta XTB. Wyeksportuj ją w xStation jako plik XLSX.'
    );
  }

  const accountCurrency = accountCurrencyOf(workbook, closed, open, fileName);
  const { purchases: cashPurchases, sales: cashSales } = readCashOperations(
    workbook.get('Cash Operations')
  );
  const unsupported = new Set<string>();
  const purchases = new Map<string, Purchase>();
  const trades: ImportedTrade[] = [];

  /** Rate of the instrument currency in the account currency. */
  const rateFor = (
    currency: string,
    given: number | null,
    cash: CashOperation | null,
    value: number
  ): number | null => {
    if (!accountCurrency || currency === accountCurrency) return null;
    if (given != null && given > 0) return given;
    if (cash && value > 0) return cash.amount / value;
    return null;
  };

  const instrumentOf = (ticker: string, category: string) => {
    const type = CATEGORIES[category.toUpperCase()] ?? (category ? null : 'EQUITY');
    const mapped = mapXtbTicker(ticker);
    if (!mapped || !type) {
      if (ticker) unsupported.add(ticker);
      return null;
    }
    return { ...mapped, type };
  };

  const addPurchase = (purchase: Purchase) => {
    const existing = purchases.get(purchase.positionId);
    if (existing) {
      // A partly closed position: the closed and the open part together.
      existing.quantity += purchase.quantity;
      existing.fee += purchase.fee;
      if (purchase.fee > 0) existing.feeCurrency = purchase.feeCurrency;
      // The closed part is in the shares of its day; the whole purchase is then.
      existing.isInTodaysShares = existing.isInTodaysShares && purchase.isInTodaysShares;
    } else {
      purchases.set(purchase.positionId, purchase);
    }
  };

  if (closed) {
    for (const row of closed.rows) {
      const id = positionId(closed.column(row, 'Position ID'));
      const ticker = text(closed.column(row, 'Ticker'));
      if (!id || !ticker || text(closed.column(row, 'Type')).toUpperCase() !== 'BUY') continue;
      const instrument = instrumentOf(ticker, text(closed.column(row, 'Category')));
      if (!instrument) continue;

      const quantity = number(closed.column(row, 'Volume'));
      const openPrice = number(closed.column(row, 'Open Price'));
      const closePrice = number(closed.column(row, 'Close Price'));
      const openTime = time(closed.column(row, 'Open Time (UTC)'));
      const closeTime = time(closed.column(row, 'Close Time (UTC)'));
      if (!quantity || !openPrice || !closePrice || openTime == null || closeTime == null) continue;

      // XTB's own rate of the purchase; without it, the rate is worked out
      // from the cash paid once all parts of the position are known (below).
      const openRate = rateFor(
        instrument.currency,
        number(closed.column(row, 'Open Conversion Rate')),
        null,
        quantity * openPrice
      );
      const closeRate = rateFor(
        instrument.currency,
        number(closed.column(row, 'Close Conversion Rate')),
        nearest(cashSales.get(id), closeTime),
        quantity * closePrice
      );
      // Commission is charged in the account currency; it is kept with the
      // sale, exactly as in the file.
      const commission = Math.abs(number(closed.column(row, 'Commission')) ?? 0);
      const name = text(closed.column(row, 'Instrument')) || ticker;
      const common = { brokerTicker: ticker, name, ...instrument };

      addPurchase({
        ...common,
        positionId: id,
        quantity,
        price: openPrice,
        fee: 0,
        feeCurrency: null,
        time: openTime,
        fxRate: openRate,
      });
      trades.push({
        ...common,
        externalId: `${id}:sell:${closeTime}`,
        side: 'sell',
        quantity,
        price: closePrice,
        fee: commission,
        // Without a rate (same currency, or unknown) it counts as the instrument's.
        feeCurrency: closeRate != null ? accountCurrency : null,
        time: closeTime,
        fxRate: closeRate,
      });
    }
  }

  if (open) {
    let groupName = '';
    for (const row of open.rows) {
      const ticker = text(open.column(row, 'Ticker'));
      const label = text(open.column(row, 'Instrument/Position'));
      const type = text(open.column(row, 'Type')).toUpperCase();
      if (!ticker) continue;
      // Rows without a type sum up an instrument; the lots below follow it.
      if (type === '') {
        groupName = label;
        continue;
      }
      if (type !== 'BUY') continue;
      const instrument = instrumentOf(ticker, text(open.column(row, 'Category')));
      if (!instrument) continue;

      const quantity = number(open.column(row, 'Volume'));
      const openPrice = number(open.column(row, 'Open price'));
      const openTime = time(open.column(row, 'Open time (UTC)'));
      if (!label || !quantity || !openPrice || openTime == null) continue;

      // Worked out from the cash paid, after the parts are merged (below).
      const rate: number | null = null;
      const commission = Math.abs(number(open.column(row, 'Open Commission')) ?? 0);
      addPurchase({
        brokerTicker: ticker,
        name: groupName || ticker,
        ...instrument,
        positionId: label,
        quantity,
        price: openPrice,
        fee: commission,
        feeCurrency: rate != null ? accountCurrency : null,
        time: openTime,
        fxRate: rate,
        // XTB adjusts open positions for splits (volume and open price).
        isInTodaysShares: true,
      });
    }
  }

  for (const { positionId: id, ...purchase } of purchases.values()) {
    // The cash paid for the whole position (all its parts and fills) over the
    // whole volume: a partly closed or partly filled position stays right.
    let fxRate = purchase.fxRate;
    if (fxRate == null && accountCurrency && purchase.currency !== accountCurrency) {
      const paid = totalNear(cashPurchases.get(id), purchase.time);
      const value = purchase.quantity * purchase.price;
      if (paid != null && paid > 0 && value > 0) fxRate = paid / value;
    }
    trades.push({
      ...purchase,
      fxRate,
      feeCurrency: purchase.fee > 0 && fxRate != null ? accountCurrency : purchase.feeCurrency,
      externalId: `${id}:buy`,
      side: 'buy',
    });
  }
  trades.sort((a, b) => a.time - b.time);

  // A position closed in parts at the same moment gives equal ids: number
  // the repeats (in file order, so the ids stay the same in a later export).
  const used = new Map<string, number>();
  for (const trade of trades) {
    const count = used.get(trade.externalId) ?? 0;
    used.set(trade.externalId, count + 1);
    if (count > 0) trade.externalId = `${trade.externalId}:${count + 1}`;
  }

  const dividends = readDividends(workbook.get('Cash Operations'), accountCurrency, instrumentOf);

  const tradedPositions = new Set([...purchases.keys()]);
  const isImportedInstrument = (ticker: string, category: string) =>
    mapXtbTicker(ticker) != null &&
    (CATEGORIES[category.toUpperCase()] ?? (category ? null : 'EQUITY')) != null;
  const cashOperations = readMoneyOperations(
    workbook.get('Cash Operations'),
    tradedPositions,
    isImportedInstrument
  );

  return {
    accountCurrency,
    trades,
    dividends,
    cashOperations,
    unsupportedTickers: [...unsupported].sort(),
  };
}

export const XTB: Broker = {
  id: 'xtb',
  name: 'XTB',
  domain: 'xtb.com',
  exportHint:
    'W xStation otwórz Historię konta, wybierz cały okres i wyeksportuj go jako plik XLSX.',
  mimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ],
  parse: parseXtbFile,
};
