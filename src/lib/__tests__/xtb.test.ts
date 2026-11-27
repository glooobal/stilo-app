import { mapXtbTicker, parseXtbFile } from '../import/xtb';
import { buildXlsx, excelDate } from './helpers/build-xlsx';

const CLOSED_HEADER = [
  'Instrument', 'Ticker', 'Category', 'Type', 'Volume', 'Open Price', 'Open Time (UTC)',
  'Close Price', 'Close Time (UTC)', 'Product', 'Profit/Loss', 'Gross Profit',
  'Purchase Value', 'Sale Value', 'Stop Loss', 'Take Profit', 'Commission', 'Margin',
  'Swap', 'Rollover', 'Open Conversion Rate', 'Close Conversion Rate', 'Close Origin',
  'Position ID', 'Comment',
];

function closedRow(options: {
  name: string;
  ticker: string;
  volume: number;
  open: [price: number, time: string];
  close: [price: number, time: string];
  id: number;
  rates?: [open: number, close: number];
  commission?: number;
}) {
  const row: (string | number | null)[] = new Array(CLOSED_HEADER.length).fill(null);
  const set = (column: string, value: string | number | null) => {
    row[CLOSED_HEADER.indexOf(column)] = value;
  };
  set('Instrument', options.name);
  set('Ticker', options.ticker);
  set('Category', 'STOCK');
  set('Type', 'BUY');
  set('Volume', options.volume);
  set('Open Price', options.open[0]);
  set('Open Time (UTC)', excelDate(options.open[1]));
  set('Close Price', options.close[0]);
  set('Close Time (UTC)', excelDate(options.close[1]));
  set('Commission', options.commission ?? 0);
  set('Open Conversion Rate', options.rates?.[0] ?? '');
  set('Close Conversion Rate', options.rates?.[1] ?? '');
  set('Position ID', options.id);
  return row;
}

const OPEN_HEADER = [
  'Product', 'Instrument/Position', 'Ticker', 'Category', 'Type', 'Volume', 'Value',
  'Current price', 'Open price', 'Open time (UTC)', 'Stop Loss', 'Take Profit',
  'Net Profit %', 'Net Profit', 'Gross Profit', 'Margin', 'Open Commission', 'Swap', 'Rollover',
];

function sampleFile(options: { withSummary: boolean }) {
  const closed = [
    ['Account number', '53191135'],
    ['Closed Positions', ''],
    [],
    [],
    CLOSED_HEADER,
    closedRow({
      name: 'XTB', ticker: 'XTB.PL', volume: 10, id: 2620519680,
      open: [105.42, '2026-06-08T12:29:45Z'], close: [111.54, '2026-11-19T09:31:54Z'],
    }),
    // One position closed in two parts at the same moment.
    closedRow({
      name: 'GPW', ticker: 'GPW.PL', volume: 3, id: 2672039857,
      open: [94.35, '2026-07-02T11:26:22Z'], close: [101.5, '2026-11-19T09:26:00Z'],
    }),
    closedRow({
      name: 'GPW', ticker: 'GPW.PL', volume: 2, id: 2672039857,
      open: [94.35, '2026-07-02T11:26:22Z'], close: [101.5, '2026-11-19T09:26:00Z'],
    }),
    closedRow({
      name: 'Hoegh Autoliners', ticker: 'HAUTO.NO', volume: 0.75, id: 2408942255,
      open: [136.9, '2026-03-03T08:28:43Z'], close: [143, '2026-04-09T10:16:48Z'],
      rates: [0.38434, 0.3791], commission: 0.38,
    }),
    closedRow({
      name: 'Gold', ticker: 'GOLD', volume: 1, id: 1,
      open: [1, '2026-01-01T10:00:00Z'], close: [2, '2026-01-02T10:00:00Z'],
    }),
  ];
  const open = [
    ['Account number', '53191135'],
    ['Open Positions', ''],
    [],
    ...(options.withSummary
      ? [
          ['Product', 'Metric', 'Amount', 'Currency'],
          ['My Trades', 'Open position value', 3125, 'PLN'],
        ]
      : []),
    [],
    OPEN_HEADER,
    ['My Trades', 'Kruk', 'KRU.PL', 'STOCK', '', 3, 937.5, null, 396.4],
    ['My Trades', '2620520178', 'KRU.PL', '', 'BUY', 3, 937.5, 312.5, 396.4,
      excelDate('2026-06-08T12:30:09Z')],
    // A US lot paid for in PLN, booked as two cash operations (two fills).
    ['My Trades', 'Realty Income', 'O.US', 'STOCK', '', 10, 2250, null, 60],
    ['My Trades', '3000', 'O.US', '', 'BUY', 10, 2250, 61, 60,
      excelDate('2026-05-04T14:00:00Z')],
  ];
  const cash = [
    ['Account number', '53191135'],
    ['Cash Operations', ''],
    [],
    [],
    ['Type', 'Instrument', 'Ticker', 'Category', 'Time', 'Amount', 'ID', 'Comment', 'Product', 'Position ID'],
    // One payment booked per lot, each with its tax line.
    ['Dividend from foreign company on PL market', 'Żabka', 'ZAB.PL', 'STOCK',
      excelDate('2026-07-31T09:57:05Z'), 4.24, '1', 'ZAB.PL PLN 0.5300/ SHR', 'My Trades', '11'],
    ['Tax from dividend from foreign company on PL market', 'Żabka', 'ZAB.PL', 'STOCK',
      excelDate('2026-07-31T09:57:05Z'), -0.64, '2', 'ZAB.PL PLN TFCPLM 15%', 'My Trades', '11'],
    ['Dividend from foreign company on PL market', 'Żabka', 'ZAB.PL', 'STOCK',
      excelDate('2026-07-31T09:57:04Z'), 1.06, '3', 'ZAB.PL PLN 0.5300/ SHR', 'My Trades', '12'],
    ['Tax from dividend from foreign company on PL market', 'Żabka', 'ZAB.PL', 'STOCK',
      excelDate('2026-07-31T09:57:04Z'), -0.16, '4', 'ZAB.PL PLN TFCPLM 15%', 'My Trades', '12'],
    ['Dividend', 'XTB', 'XTB.PL', 'STOCK',
      excelDate('2026-06-24T05:50:32Z'), 40.7, '5', 'XTB.PL PLN 4.0700/ SHR', 'My Trades', '13'],
    ['Withholding tax', 'XTB', 'XTB.PL', 'STOCK',
      excelDate('2026-06-24T05:50:32Z'), -7.73, '6', 'XTB.PL PLN WHT 19%', 'My Trades', '13'],
    ['Stock purchase', 'Realty Income', 'O.US', 'STOCK',
      excelDate('2026-05-04T14:00:00Z'), -1500, '20', 'OPEN BUY 6.6667 @ 60', 'My Trades', '3000'],
    ['Stock purchase', 'Realty Income', 'O.US', 'STOCK',
      excelDate('2026-05-04T14:00:01Z'), -750, '21', 'OPEN BUY 3.3333 @ 60', 'My Trades', '3000'],
    ['Free funds interest', '', '', '', excelDate('2026-10-03T13:14:14Z'), 0.05, '7', 'Interest', 'My Trades', ''],
    ['Free funds interest tax', '', '', '', excelDate('2026-10-03T13:13:51Z'), -0.01, '8', 'Tax', 'My Trades', ''],
    ['Deposit', '', '', '', excelDate('2026-01-02T10:00:00Z'), 5000, '9', 'Deposit', 'My Trades', ''],
    ['Withdrawal', '', '', '', excelDate('2026-11-20T10:00:00Z'), -1000, '10', 'Withdrawal', 'My Trades', ''],
    ['Transfer', '', '', '', excelDate('2026-11-19T09:32:12Z'), -2230.8, '11', 'Transfer to 52362817', 'My Trades', ''],
  ];
  return buildXlsx({ 'Closed Positions': closed, 'Cash Operations': cash, 'Open Positions': open });
}

describe('mapXtbTicker', () => {
  it('maps XTB markets to market data symbols', () => {
    expect(mapXtbTicker('KRU.PL')).toEqual({ symbol: 'KRU.WA', currency: 'PLN' });
    expect(mapXtbTicker('AAPL.US')).toEqual({ symbol: 'AAPL', currency: 'USD' });
    expect(mapXtbTicker('BRK.B.US')).toEqual({ symbol: 'BRK-B', currency: 'USD' });
    expect(mapXtbTicker('HAUTO.NO')).toEqual({ symbol: 'HAUTO.OL', currency: 'NOK' });
  });

  it('rejects unsupported markets', () => {
    expect(mapXtbTicker('GOLD')).toBeNull();
    expect(mapXtbTicker('ABC.XX')).toBeNull();
  });
});

describe('parseXtbFile', () => {
  const file = parseXtbFile(sampleFile({ withSummary: true }), 'PLN_53191135_2026.xlsx');
  const bySymbol = (symbol: string) => file.trades.filter((trade) => trade.symbol === symbol);

  it('reads one purchase per position and a sale per close', () => {
    const xtb = bySymbol('XTB.WA');
    expect(xtb.map((trade) => trade.side)).toEqual(['buy', 'sell']);
    expect(xtb[0]).toMatchObject({ quantity: 10, price: 105.42, fxRate: null });
    expect(xtb[1]).toMatchObject({ quantity: 10, price: 111.54 });
  });

  it('adds up a position closed in parts and keeps the ids unique', () => {
    const gpw = bySymbol('GPW.WA');
    expect(gpw.filter((trade) => trade.side === 'buy')).toHaveLength(1);
    expect(gpw.find((trade) => trade.side === 'buy')?.quantity).toBe(5);
    const ids = file.trades.map((trade) => trade.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the conversion rates and the commission exactly as in the file', () => {
    const [purchase, sale] = bySymbol('HAUTO.OL');
    expect(purchase).toMatchObject({ currency: 'NOK', fxRate: 0.38434 });
    expect(sale).toMatchObject({ fxRate: 0.3791, fee: 0.38, feeCurrency: 'PLN' });
  });

  it('marks open lots as already in today\'s shares (XTB adjusts them for splits)', () => {
    expect(bySymbol('KRU.WA')[0].isInTodaysShares).toBe(true);
    expect(bySymbol('XTB.WA')[0].isInTodaysShares).toBeUndefined();
  });

  it('works out the rate from all cash paid for a purchase booked in parts', () => {
    // 2250 PLN for 10 × 60 USD: 3.75, not 2.5 from the first part alone.
    expect(bySymbol('O')[0]).toMatchObject({ currency: 'USD', fxRate: 3.75 });
  });

  it('reads the open lots', () => {
    expect(bySymbol('KRU.WA')).toMatchObject([{ side: 'buy', quantity: 3, name: 'Kruk' }]);
  });

  it('lists tickers of unsupported markets', () => {
    expect(file.unsupportedTickers).toEqual(['GOLD']);
  });

  it('reads the dividends, adding up the lines of one payment exactly', () => {
    expect(file.dividends.map((item) => [item.symbol, item.gross, item.tax, item.perShare])).toEqual([
      ['XTB.WA', 40.7, 7.73, 4.07],
      ['ZAB.WA', 5.3, 0.8, 0.53],
    ]);
    expect(file.dividends[1]).toMatchObject({ currency: 'PLN', externalId: 'div:ZAB.PL|2026-07-31' });
  });

  it('reads deposits, withdrawals, transfers and interest, without signs', () => {
    expect(file.cashOperations.map((item) => [item.type, item.amount])).toEqual([
      ['deposit', 5000],
      ['tax', 0.01],
      ['interest', 0.05],
      ['withdrawal', 2230.8],
      ['withdrawal', 1000],
    ]);
  });

  it('reads the account currency from the summary', () => {
    expect(file.accountCurrency).toBe('PLN');
  });

  it('does not take the account type in the file name for a currency (IKE)', () => {
    const ike = parseXtbFile(sampleFile({ withSummary: false }), 'IKE_53191135_2026.xlsx');
    expect(ike.accountCurrency).toBe('PLN');
  });

  it('rejects a file that is not an XTB export', () => {
    expect(() => parseXtbFile(buildXlsx({ Arkusz1: [['a']] }), 'x.xlsx')).toThrow();
    expect(() => parseXtbFile(new Uint8Array([1, 2, 3]), 'x.xlsx')).toThrow();
  });
});
