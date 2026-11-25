import { StyleSheet, View } from 'react-native';

import { AddPortfolioCard } from '@/components/add-portfolio-card';
import { AddTransactionMenu } from '@/components/add-transaction-menu';
import { PortfolioDashboard } from '@/components/portfolio-dashboard';
import { TabScreen } from '@/components/tab-screen';
import { Colors } from '@/constants/colors';
import { usePortfolioDashboard } from '@/hooks/use-portfolio-dashboard';
import { formatSyncStatus } from '@/lib/quotes-status';

/** All portfolios together, valued in the summary currency (Settings). */
export default function SummaryScreen() {
  const dashboard = usePortfolioDashboard();
  const hasPortfolios = dashboard.portfolios.length > 0;

  return (
    <>
      <AddTransactionMenu />
      <TabScreen
        title="Podsumowanie"
        subtitle={formatSyncStatus(dashboard.updatedAt, dashboard.syncError)}
        backgroundColor={Colors.groupedBackground}
        onRefresh={hasPortfolios ? dashboard.refresh : undefined}
        isRefreshing={dashboard.isRefreshing}>
        {hasPortfolios ? (
          <PortfolioDashboard dashboard={dashboard} />
        ) : (
          <View style={styles.empty}>
            <AddPortfolioCard />
          </View>
        )}
      </TabScreen>
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingTop: 8,
  },
});
