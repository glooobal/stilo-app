import { checkedTradeRate, isImplausibleRate } from '../fx';

const market = (rate: number | null) => () => rate;
const trade = (fxRate: number | null) => ({
  currency: 'USD',
  fxRate,
  fxCurrency: 'PLN',
  tradedAt: '2025-06-02',
});

describe('checkedTradeRate', () => {
  it('keeps the rate given with the trade when it is plausible', () => {
    expect(checkedTradeRate(trade(3.7412), 'PLN', market(3.75))).toBe(3.7412);
  });

  it('uses the market rate instead of an impossible one', () => {
    // 3.2132 when the dollar cost about 3.75: a rate read wrongly from a file.
    expect(checkedTradeRate(trade(3.21320098556828), 'PLN', market(3.75))).toBe(3.75);
  });

  it('uses the market rate when none was given, 1 in the same currency', () => {
    expect(checkedTradeRate(trade(null), 'PLN', market(3.75))).toBe(3.75);
    expect(checkedTradeRate({ ...trade(null), currency: 'PLN' }, 'PLN', market(null))).toBe(1);
  });

  it('keeps the given rate when the market rate is unknown', () => {
    expect(checkedTradeRate(trade(3.2), 'PLN', market(null))).toBe(3.2);
  });
});

describe('isImplausibleRate', () => {
  it('allows the daily moves of a currency', () => {
    expect(isImplausibleRate(3.8, 3.75)).toBe(false);
    expect(isImplausibleRate(3.5, 3.75)).toBe(true);
  });
});
