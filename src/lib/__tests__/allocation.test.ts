import { allocationSegments } from '../allocation';

const item = (key: string, share: number) => ({ key, label: key, share });

describe('allocationSegments', () => {
  it('orders positions from the biggest', () => {
    expect(allocationSegments([item('a', 0.2), item('b', 0.8)]).map((s) => s.key)).toEqual([
      'b',
      'a',
    ]);
  });

  it('joins the smallest into "Inne" past the limit', () => {
    const segments = allocationSegments(
      [item('a', 0.4), item('b', 0.3), item('c', 0.2), item('d', 0.06), item('e', 0.04)],
      3
    );
    expect(segments.map((s) => s.key)).toEqual(['a', 'b', 'other']);
    expect(segments[2].share).toBeCloseTo(0.3, 10);
  });

  it('leaves out positions without a value', () => {
    expect(allocationSegments([item('a', 1), item('b', 0)])).toHaveLength(1);
  });
});
