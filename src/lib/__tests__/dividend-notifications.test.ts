import { planDividendNotifications } from '../dividend-notifications';

const payment = (symbol: string, date: string, net: number) => ({ symbol, name: symbol, date, net });

describe('planDividendNotifications', () => {
  it('reminds of every upcoming payment', () => {
    const planned = planDividendNotifications({
      payments: [payment('PZU', '2026-12-10', 120), payment('KRU', '2026-11-01', 50)],
      goal: null,
      receivedLast12Months: 0,
      currency: 'PLN',
      today: '2026-11-27',
    });
    expect(planned.map((item) => item.date)).toEqual(['2026-12-10']);
    expect(planned[0].title).toBe('Dywidenda: PZU');
  });

  it('announces the goal on the payment that reaches it', () => {
    const planned = planDividendNotifications({
      payments: [payment('A', '2026-12-01', 100), payment('B', '2026-12-15', 200)],
      goal: { amount: 1000, period: 'year', currency: 'PLN' },
      receivedLast12Months: 750,
      currency: 'PLN',
      today: '2026-11-27',
    });
    const goal = planned.find((item) => item.id.endsWith('goal'));
    expect(goal?.date).toBe('2026-12-15');
  });

  it('does not announce a goal reached already', () => {
    const planned = planDividendNotifications({
      payments: [payment('A', '2026-12-01', 100)],
      goal: { amount: 10, period: 'month', currency: 'PLN' },
      receivedLast12Months: 1200,
      currency: 'PLN',
      today: '2026-11-27',
    });
    expect(planned.some((item) => item.id.endsWith('goal'))).toBe(false);
  });
});
