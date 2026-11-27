import { MAX_RECENT_VIEWS, parseRecentViews, withRecentView } from '../recent-views';

const instrument = (symbol: string) => ({
  symbol,
  name: symbol,
  exchange: 'WSE',
  exchangeName: 'GPW',
  type: 'EQUITY' as const,
});

describe('withRecentView', () => {
  it('puts the instrument first, once', () => {
    const list = withRecentView([instrument('PZU.WA'), instrument('KRU.WA')], instrument('KRU.WA'));
    expect(list.map((item) => item.symbol)).toEqual(['KRU.WA', 'PZU.WA']);
  });

  it('keeps only the newest ones', () => {
    let list: ReturnType<typeof withRecentView> = [];
    for (let index = 0; index < 15; index++) list = withRecentView(list, instrument(`S${index}`));
    expect(list).toHaveLength(MAX_RECENT_VIEWS);
    expect(list[0].symbol).toBe('S14');
  });
});

describe('parseRecentViews', () => {
  it('skips broken entries and text', () => {
    expect(parseRecentViews('[{"symbol":"PZU.WA"}]')).toEqual([]);
    expect(parseRecentViews('nope')).toEqual([]);
    expect(parseRecentViews(null)).toEqual([]);
  });
});
