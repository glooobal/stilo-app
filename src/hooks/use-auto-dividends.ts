import { useEffect } from 'react';

import { syncAutoDividends } from '@/db/dividends';
import { notifyDataChanged, useDataVersion } from '@/db/events';

/**
 * Keeps the dividends worked out by the app in step with the data: after
 * every change (a new trade, downloaded dividends per share, an import)
 * they are worked out again. Ends by itself: a second pass changes nothing.
 */
export function useAutoDividends() {
  const dataVersion = useDataVersion();
  useEffect(() => {
    try {
      if (syncAutoDividends()) notifyDataChanged();
    } catch {
      // Worked-out dividends are a convenience; never break the app over them.
    }
  }, [dataVersion]);
}
