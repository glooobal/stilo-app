import { tradeMarkers } from '../chart-markers';

const close = (date: string) => Date.parse(`${date}T15:00:00Z`);

describe('tradeMarkers', () => {
  const times = [close('2026-03-02'), close('2026-03-03'), close('2026-03-04'), close('2026-03-05')];

  it('puts a trade on the close of its day', () => {
    expect(tradeMarkers(times, [{ side: 'buy', quantity: 10, tradedAt: '2026-03-03' }])).toEqual([
      { index: 1, kind: 'buy', label: 'Kupno 10 szt.' },
    ]);
  });

  it('sums up trades on one point and marks both sides', () => {
    const markers = tradeMarkers(times, [
      { side: 'buy', quantity: 2, tradedAt: '2026-03-05' },
      { side: 'buy', quantity: 3, tradedAt: '2026-03-05' },
      { side: 'sell', quantity: 1, tradedAt: '2026-03-05' },
    ]);
    expect(markers).toEqual([{ index: 3, kind: 'both', label: 'Kupno 5 szt. · Sprzedaż 1 szt.' }]);
  });

  it('leaves out trades far outside the chart', () => {
    expect(tradeMarkers(times, [{ side: 'sell', quantity: 1, tradedAt: '2025-01-10' }])).toEqual([]);
  });

  it('puts a weekend trade on the nearest trading day', () => {
    const markers = tradeMarkers(times, [{ side: 'sell', quantity: 1, tradedAt: '2026-03-07' }]);
    expect(markers[0].index).toBe(3);
  });
});

describe('dividend markers', () => {
  const times = [close('2026-03-02'), close('2026-03-03'), close('2026-03-04')];

  it('marks a dividend on its payment day', () => {
    expect(tradeMarkers(times, [], [{ paidAt: '2026-03-04', label: 'Dywidenda 12,40 zł' }])).toEqual([
      { index: 2, kind: 'dividend', label: 'Dywidenda 12,40 zł' },
    ]);
  });

  it('keeps the trade color and adds the dividend to the label', () => {
    const markers = tradeMarkers(
      times,
      [{ side: 'buy', quantity: 1, tradedAt: '2026-03-03' }],
      [{ paidAt: '2026-03-03', label: 'Dywidenda 5,00 zł' }]
    );
    expect(markers).toEqual([{ index: 1, kind: 'buy', label: 'Kupno 1 szt. · Dywidenda 5,00 zł' }]);
  });
});
