import {
  filterDividends,
  filterTransactions,
  hasFilters,
  NO_FILTERS,
  yearsOf,
} from '../transaction-filters';

const rows = [
  { id: '1', tradedAt: '2025-03-01', side: 'buy' as const, portfolioId: 'ike', symbol: 'ZAB.WA', instrument: { name: 'Żabka Group' } },
  { id: '2', tradedAt: '2026-02-01', side: 'sell' as const, portfolioId: 'ike', symbol: 'KRU.WA', instrument: { name: 'Kruk' } },
  { id: '3', tradedAt: '2026-05-01', side: 'buy' as const, portfolioId: 'std', symbol: 'AAPL', instrument: { name: 'Apple' } },
];
const ids = (list: { id: string }[]) => list.map((row) => row.id);

describe('filterTransactions', () => {
  it('keeps everything without filters', () => {
    expect(ids(filterTransactions(rows, NO_FILTERS))).toEqual(['1', '2', '3']);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it('filters by kind and portfolio', () => {
    expect(ids(filterTransactions(rows, { ...NO_FILTERS, side: 'buy' }))).toEqual(['1', '3']);
    expect(ids(filterTransactions(rows, { ...NO_FILTERS, portfolioId: 'ike' }))).toEqual(['1', '2']);
  });

  it('finds an instrument by name or symbol, without Polish letters', () => {
    expect(ids(filterTransactions(rows, { ...NO_FILTERS, query: 'zabka' }))).toEqual(['1']);
    expect(ids(filterTransactions(rows, { ...NO_FILTERS, query: 'kru.wa' }))).toEqual(['2']);
  });
});

describe('filterDividends', () => {
  const dividends = [
    { id: '1', portfolioId: 'a', symbol: 'PKN.WA', paidAt: '2025-08-01', instrument: { name: 'Orlen' } },
    { id: '2', portfolioId: 'b', symbol: 'AAPL', paidAt: '2026-08-01', instrument: { name: 'Apple' } },
  ];

  it('shows dividends with all kinds or the dividend kind only', () => {
    expect(filterDividends(dividends, NO_FILTERS)).toHaveLength(2);
    expect(filterDividends(dividends, { ...NO_FILTERS, side: 'dividend' })).toHaveLength(2);
    expect(filterDividends(dividends, { ...NO_FILTERS, side: 'buy' })).toHaveLength(0);
    expect(filterTransactions([], { ...NO_FILTERS, side: 'dividend' })).toHaveLength(0);
  });

  it('filters by portfolio and instrument', () => {
    expect(filterDividends(dividends, { ...NO_FILTERS, portfolioId: 'b' }).map((d) => d.id)).toEqual(['2']);
    expect(filterDividends(dividends, { ...NO_FILTERS, query: 'orl' }).map((d) => d.id)).toEqual(['1']);
  });
});

describe('year filter', () => {
  it('keeps the operations of one year', () => {
    expect(ids(filterTransactions(rows, { ...NO_FILTERS, year: 2026 }))).toEqual(['2', '3']);
    expect(hasFilters({ ...NO_FILTERS, year: 2026 })).toBe(true);
  });

  it('lists the years newest first', () => {
    expect(yearsOf(['2025-03-01', '2026-02-01', '2025-12-31'])).toEqual([2026, 2025]);
  });
});

describe('date range filter', () => {
  it('keeps operations between the dates, both included', () => {
    const filters = { ...NO_FILTERS, from: '2026-02-01', to: '2026-04-30' };
    expect(ids(filterTransactions(rows, filters))).toEqual(['2']);
    expect(hasFilters(filters)).toBe(true);
  });

  it('works with only one end', () => {
    expect(ids(filterTransactions(rows, { ...NO_FILTERS, from: '2026-01-01' }))).toEqual(['2', '3']);
  });
});
