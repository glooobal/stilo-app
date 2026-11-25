import { StyleSheet, View } from 'react-native';

import type { PortfolioDashboardData } from '@/hooks/use-portfolio-dashboard';

import { PortfolioOverviewCard } from './portfolio-overview-card';
import { RecentTransactionsCard } from './recent-transactions-card';

/** Overview panels shared by the summary (all portfolios) and a single portfolio. */
export function PortfolioDashboard({ dashboard }: { dashboard: PortfolioDashboardData }) {
  return (
    <View style={styles.content}>
      <PortfolioOverviewCard
        portfolioId={dashboard.portfolioId}
        baseCurrency={dashboard.baseCurrency}
        positions={dashboard.openPositions}
        series={dashboard.series}
        valuations={dashboard.valuations}
        range={dashboard.range}
        displayedRange={dashboard.displayedRange}
        onRangeChange={dashboard.setRange}
        isLoading={dashboard.isLoading}
      />
      <RecentTransactionsCard
        portfolioId={dashboard.portfolioId}
        transactions={dashboard.transactions}
        saleResults={dashboard.saleResults}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
});
