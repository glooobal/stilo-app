import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { HeaderTitle } from '@/components/header-title';
import { PortfolioDashboard } from '@/components/portfolio-dashboard';
import { Colors } from '@/constants/colors';
import { usePortfolioDashboard } from '@/hooks/use-portfolio-dashboard';
import { openImport, openNewTransaction, openPortfolioEditor } from '@/lib/navigation';
import { formatSyncStatus } from '@/lib/quotes-status';

/** One portfolio: the same panels as the summary, limited to this portfolio. */
export default function PortfolioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dashboard = usePortfolioDashboard(id);
  const { portfolio } = dashboard;

  // The portfolio was deleted (e.g. from its edit sheet): go back to the list.
  useEffect(() => {
    if (!portfolio && router.canGoBack()) router.back();
  }, [portfolio]);

  if (!portfolio) return null;

  return (
    <>
      <Stack.Title asChild>
        <HeaderTitle
          title={portfolio.name}
          subtitle={formatSyncStatus(dashboard.updatedAt, dashboard.syncError)}
        />
      </Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="pencil"
          accessibilityLabel="Edytuj portfel"
          onPress={() => openPortfolioEditor(portfolio.id)}>
          Edytuj
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Menu icon="plus" variant="prominent" accessibilityLabel="Dodaj transakcję">
          <Stack.Toolbar.MenuAction
            icon="plus.circle"
            onPress={() => openNewTransaction('buy', undefined, portfolio.id)}>
            Kupno
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="minus.circle"
            onPress={() => openNewTransaction('sell', undefined, portfolio.id)}>
            Sprzedaż
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="square.and.arrow.down"
            onPress={() => openImport(portfolio.id)}>
            Import z pliku
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={dashboard.isRefreshing} onRefresh={dashboard.refresh} />
        }>
        <PortfolioDashboard dashboard={dashboard} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: Colors.groupedBackground,
  },
});
