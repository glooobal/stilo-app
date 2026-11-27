import type { BenchmarkId } from '@/lib/benchmarks';

export type BenchmarkMenuProps = {
  selected: readonly BenchmarkId[];
  onChange: (ids: BenchmarkId[]) => void;
  /** One switch for every line, the portfolio included. */
  withDividends: boolean;
  onWithDividendsChange: (withDividends: boolean) => void;
};

/** Toggles one index, keeping the menu order. */
export function toggleBenchmark(
  all: readonly BenchmarkId[],
  selected: readonly BenchmarkId[],
  id: BenchmarkId,
  isOn: boolean
): BenchmarkId[] {
  return all.filter((item) => (item === id ? isOn : selected.includes(item)));
}
