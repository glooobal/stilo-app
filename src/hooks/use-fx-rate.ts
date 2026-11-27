import { useEffect, useState } from 'react';

import { fxSymbol, loadIntraday, storedQuote } from '@/market/history';

/** The newest stored rate of `from` in `to` (also via the reverse pair), or `null`. */
export function storedRate(from: string, to: string): number | null {
  if (from === to) return 1;
  const direct = storedQuote(fxSymbol(from, to))?.price;
  if (direct) return direct;
  const reverse = storedQuote(fxSymbol(to, from))?.price;
  return reverse ? 1 / reverse : null;
}

/**
 * Current rate of `from` in `to`: the stored one at once, then the
 * downloaded one (e.g. for a dividend goal in another currency).
 */
export function useFxRate(from: string, to: string): number | null {
  const [rate, setRate] = useState<number | null>(() => storedRate(from, to));
  useEffect(() => {
    setRate(storedRate(from, to));
    if (from === to) return;
    let isCancelled = false;
    loadIntraday(fxSymbol(from, to))
      .then((quote) => {
        const price = quote.price ?? quote.points.at(-1)?.close ?? null;
        if (!isCancelled && price) setRate(price);
      })
      .catch(() => {
        // The stored rate (or none) stays.
      });
    return () => {
      isCancelled = true;
    };
  }, [from, to]);
  return rate;
}
