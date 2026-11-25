import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { Colors } from '@/constants/colors';

/**
 * Header like Apple Health: no bar background; content scrolling under the
 * header is progressively blurred and dimmed by the iOS 26 "soft" scroll edge
 * effect, so the title stays readable while the content shows through.
 */
export function TabStack() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        ...(Platform.OS === 'ios'
          ? {
              headerTransparent: true,
              scrollEdgeEffects: { top: 'soft' },
            }
          : {}),
      }}
    />
  );
}
