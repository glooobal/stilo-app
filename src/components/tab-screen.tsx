import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, type ColorValue } from 'react-native';

import { HeaderTitle } from './header-title';
import { SettingsButton } from './settings-button';

type TabScreenProps = {
  title: string;
  /** Small line under the title, e.g. when prices were updated. */
  subtitle?: string | null;
  children?: ReactNode;
  backgroundColor?: ColorValue;
  /** Enables pull to refresh. */
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Turned off e.g. while a list row is being dragged. */
  scrollEnabled?: boolean;
};

/**
 * Main tab screen: native header with a small (inline) title, the settings
 * button on the left and scrollable content under the transparent header.
 */
export function TabScreen({
  title,
  subtitle,
  children,
  backgroundColor,
  onRefresh,
  isRefreshing = false,
  scrollEnabled = true,
}: TabScreenProps) {
  return (
    <>
      {/* The plain title also names the back button of screens opened from here. */}
      <Stack.Screen options={{ title }} />
      {subtitle ? (
        <Stack.Title asChild>
          <HeaderTitle title={title} subtitle={subtitle} />
        </Stack.Title>
      ) : (
        <Stack.Title>{title}</Stack.Title>
      )}
      <SettingsButton />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        scrollEnabled={scrollEnabled}
        style={backgroundColor ? { backgroundColor } : undefined}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} /> : undefined
        }
        contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
});
