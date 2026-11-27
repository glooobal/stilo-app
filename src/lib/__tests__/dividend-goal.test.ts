import { goalActual, goalProgress, parseStoredGoal } from '../dividend-goal-format';

describe('parseStoredGoal', () => {
  it('reads amount, period and currency', () => {
    expect(parseStoredGoal('{"amount":"500","period":"year","currency":"EUR"}', 'PLN')).toEqual({
      amount: 500,
      period: 'year',
      currency: 'EUR',
    });
  });

  it('uses the main currency for goals saved without one', () => {
    expect(parseStoredGoal('{"amount":"12.5","period":"month"}', 'PLN')?.currency).toBe('PLN');
  });

  it('rejects removed, broken or too small goals', () => {
    expect(parseStoredGoal('', 'PLN')).toBeNull();
    expect(parseStoredGoal('{', 'PLN')).toBeNull();
    expect(parseStoredGoal('{"amount":"0.5"}', 'PLN')).toBeNull();
  });
});

describe('goal progress', () => {
  const goal = { amount: 100, period: 'month' as const, currency: 'PLN' };

  it('compares a monthly goal with the monthly average', () => {
    expect(goalActual(goal, 1800)).toBe(150);
    expect(goalProgress(goal, 150)).toBe(1.5);
  });
});
