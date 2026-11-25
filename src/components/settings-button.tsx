import { router, Stack } from 'expo-router';

import { Colors } from '@/constants/colors';

/** Gear on the left of the main screens; opens the settings sheet. */
export function SettingsButton() {
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button
        icon="gear"
        tintColor={Colors.label}
        accessibilityLabel="Ustawienia"
        onPress={() => router.push('/settings')}>
        Ustawienia
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
