export type AllocationSegment = {
  key: string;
  label: string;
  /** Part of the portfolio, 0–1. */
  share: number;
};

/**
 * Biggest positions first; past `maxSegments` the rest is one "Inne"
 * segment, so the bar stays readable. Shares come from the values of the
 * positions and add up to 1.
 */
export function allocationSegments(
  items: { key: string; label: string; share: number }[],
  maxSegments = 5
): AllocationSegment[] {
  const sorted = items.filter((item) => item.share > 0).sort((a, b) => b.share - a.share);
  if (sorted.length <= maxSegments) return sorted;
  const shown = sorted.slice(0, maxSegments - 1);
  const rest = sorted.slice(maxSegments - 1).reduce((sum, item) => sum + item.share, 0);
  return [...shown, { key: 'other', label: 'Inne', share: rest }];
}
