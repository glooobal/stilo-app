import { filterTransactions, hasFilters, NO_FILTERS } from '../transaction-filters';

const rows = [
  { id: '1', side: 'buy' as const, portfolioId: 'ike', symbol: 'ZAB.WA', instrument: { name: 'Żabka Group' } },
  { id: '2', side: 'sell' as const, portfolioId: 'ike', symbol: 'KRU.WA', instrument: { name: 'Kruk' } },
  { id: '3', side: 'buy' as const, portfolioId: 'std', symbol: 'AAPL', instrument: { name: 'Apple' } },
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
