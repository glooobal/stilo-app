import { benchmarkReturns, parseBenchmarkIds } from '../benchmarks';
import { rangeStartDate } from '../ranges';
import { withChanges } from '../valuation';

const day = (date: string) => Date.parse(`${date}T16:00:00Z`);

describe('rangeStartDate', () => {
  const today = new Date(2026, 2, 31); // 31 March 2026

  it('counts rolling ranges back from today', () => {
    expect(rangeStartDate('1D', undefined, today)).toBeNull();
    expect(rangeStartDate('1W', undefined, today)).toBe('2026-03-24');
    expect(rangeStartDate('3M', undefined, today)).toBe('2025-12-31');
    expect(rangeStartDate('6M', undefined, today)).toBe('2025-09-30');
    expect(rangeStartDate('1Y', undefined, today)).toBe('2025-03-31');
    expect(rangeStartDate('5Y', undefined, today)).toBe('2021-03-31');
  });

  it('keeps the end of a shorter month', () => {
    expect(rangeStartDate('1M', undefined, today)).toBe('2026-02-28');
  });

  it('starts the year on 1 January and Max at the first trade', () => {
    expect(rangeStartDate('YTD', undefined, today)).toBe('2026-01-01');
    expect(rangeStartDate('ALL', '2019-05-06', today)).toBe('2019-05-06');
  });
});

describe('withChanges', () => {
  const raw = (date: string, value: number) => ({ time: day(date), value, profit: 0, invested: 0 });

  it('factors out money put in from the time-weighted return', () => {
    // 100 grows to 110 (+10%), 100 is added on a flat day, then 210 grows to 231 (+10%).
    const points = withChanges(
      [raw('2026-01-01', 100), raw('2026-01-02', 110), raw('2026-01-03', 210), raw('2026-01-04', 231)],
      100,
      [{ date: '2026-01-03', amount: 100 }],
      [],
      (date) => date > '2026-01-01'
    );
    expect(points[0].returnRatio).toBe(0);
    expect(points[1].returnRatio).toBeCloseTo(0.1, 12);
    expect(points[2].returnRatio).toBeCloseTo(0.1, 12);
    expect(points[3].returnRatio).toBeCloseTo(0.21, 12);
    expect(points[3].change).toBeCloseTo(31, 12);
    expect(points[3].changeRatio).toBeCloseTo(31 / 200, 12);
  });

  it('counts dividends as part of the return', () => {
    const points = withChanges(
      [raw('2026-01-01', 100), raw('2026-01-02', 100)],
      100,
      [],
      [{ date: '2026-01-02', amount: 5 }],
      (date) => date > '2026-01-01'
    );
    expect(points[1].returnRatio).toBeCloseTo(0.05, 12);
    expect(points[1].change).toBeCloseTo(5, 12);
  });

  it('treats the first purchase as no gain', () => {
    const points = withChanges(
      [raw('2026-01-01', 0), raw('2026-01-02', 50), raw('2026-01-03', 55)],
      0,
      [{ date: '2026-01-02', amount: 50 }],
      [],
      (date) => date > '2026-01-01'
    );
    expect(points[1].returnRatio).toBe(0);
    expect(points[2].returnRatio).toBeCloseTo(0.1, 12);
  });
});

describe('benchmarkReturns', () => {
  const closes = [
    { time: day('2026-01-02'), close: 100 },
    { time: day('2026-01-05'), close: 110 },
  ];

  it('measures the change from the first moment', () => {
    const times = [day('2026-01-02'), day('2026-01-03'), day('2026-01-05')];
    const values = benchmarkReturns(times, closes, null)!;
    expect(values[0]).toBe(0);
    expect(values[1]).toBe(0); // carried over the weekend
    expect(values[2]).toBeCloseTo(0.1, 12);
  });

  it('includes the currency change', () => {
    const fx = [
      { time: day('2026-01-02'), close: 4 },
      { time: day('2026-01-05'), close: 3.6 },
    ];
    const values = benchmarkReturns([day('2026-01-02'), day('2026-01-05')], closes, fx)!;
    expect(values[1]).toBeCloseTo((110 * 3.6) / 400 - 1, 12);
  });

  it('uses yesterday close on the one-day chart', () => {
    const values = benchmarkReturns([day('2026-01-05')], closes, null, { price: 100, rate: null })!;
    expect(values[0]).toBeCloseTo(0.1, 12);
  });
});

describe('parseBenchmarkIds', () => {
  it('falls back to the defaults and drops unknown ids', () => {
    expect(parseBenchmarkIds(null)).toEqual(['wig20', 'sp500']);
    expect(parseBenchmarkIds('')).toEqual([]);
    expect(parseBenchmarkIds('wig,unknown,allworld')).toEqual(['wig', 'allworld']);
  });
});

describe('price-only return', () => {
  const raw = (date: string, value: number) => ({ time: day(date), value, profit: 0, invested: 0 });

  it('leaves out dividends of regular portfolios', () => {
    const points = withChanges(
      [raw('2026-01-01', 100), raw('2026-01-02', 110)],
      100,
      [],
      [{ date: '2026-01-02', amount: 5 }],
      (date) => date > '2026-01-01'
    );
    expect(points[1].returnRatio).toBeCloseTo(0.15, 12);
    expect(points[1].priceReturnRatio).toBeCloseTo(0.1, 12);
  });

  it('leaves out dividends paid into cash', () => {
    // The value already holds the 5 of cash from the dividend.
    const points = withChanges(
      [raw('2026-01-01', 100), raw('2026-01-02', 115)],
      100,
      [],
      [],
      (date) => date > '2026-01-01',
      [{ date: '2026-01-02', amount: 5 }]
    );
    expect(points[1].returnRatio).toBeCloseTo(0.15, 12);
    expect(points[1].priceReturnRatio).toBeCloseTo(0.1, 12);
  });
});
