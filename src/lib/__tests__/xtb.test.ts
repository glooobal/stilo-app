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
  ];
  return buildXlsx({ 'Closed Positions': closed, 'Cash Operations': [], 'Open Positions': open });
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

  it('reads the open lots', () => {
    expect(bySymbol('KRU.WA')).toMatchObject([{ side: 'buy', quantity: 3, name: 'Kruk' }]);
  });

  it('lists tickers of unsupported markets', () => {
    expect(file.unsupportedTickers).toEqual(['GOLD']);
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
