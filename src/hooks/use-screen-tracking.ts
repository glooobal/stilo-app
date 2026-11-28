import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { applyAnalyticsSetting, trackScreen } from '@/lib/analytics';

/**
 * Reports every screen by its route pattern (from the segments, so
 * `position/[symbol]` and not `position/PZU.WA`). Mount once, in the root layout.
 */
export function useScreenTracking() {
  const segments = useSegments();
  const route = segments.join('/');

  useEffect(() => {
    applyAnalyticsSetting();
  }, []);

  useEffect(() => {
    trackScreen(route || 'index');
  }, [route]);
}
