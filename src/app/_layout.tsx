import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAutoDividends } from '@/hooks/use-auto-dividends';
import { useDividendNotifications } from '@/hooks/use-dividend-notifications';
import { useScreenTracking } from '@/hooks/use-screen-tracking';
import { useLiveQuotes } from '@/market/live-quotes';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useAutoDividends();
  useLiveQuotes();
  useDividendNotifications();
  useScreenTracking();

  return (
    // Needed for gestures such as swipe actions on list rows.
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaction" options={{ presentation: 'modal' }} />
          <Stack.Screen name="history" options={{ presentation: 'modal' }} />
          <Stack.Screen name="portfolio" options={{ presentation: 'modal' }} />
          <Stack.Screen name="import" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="dividend" options={{ presentation: 'modal' }} />
          <Stack.Screen name="cash" options={{ presentation: 'modal' }} />
          <Stack.Screen name="goal" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="onboarding"
            options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
          />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
