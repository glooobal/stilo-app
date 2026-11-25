import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import type { TransactionWithInstrument } from '@/db/transactions';
import { usePortfolios } from '@/hooks/use-portfolio';
import { openHistory, openTransactionEditor } from '@/lib/navigation';
import type { SaleResult } from '@/lib/positions';
import { sortNewestFirst } from '@/lib/transactions';

import { Card } from './card';
import { Separator } from './separator';
import { TransactionRow } from './transaction-row';

const VISIBLE_COUNT = 3;

/** Latest operations, newest first, with a link to the full history sheet. */
export function RecentTransactionsCard({
  portfolioId,
  transactions,
  saleResults,
}: {
  /** Set inside a single portfolio; the full history then shows only it. */
  portfolioId?: string;
  transactions: TransactionWithInstrument[];
  saleResults: Map<string, SaleResult>;
}) {
  const newestFirst = sortNewestFirst(transactions);
  const portfolios = usePortfolios();
  // In the summary (several portfolios together) each row names its portfolio.
  const portfolioNames =
    !portfolioId && portfolios.length > 1
      ? new Map(portfolios.map((item) => [item.id, item.name]))
      : undefined;
  const visible = newestFirst.slice(0, VISIBLE_COUNT);

  return (
    <Card
      title="Historia operacji"
      accessory={
        transactions.length > VISIBLE_COUNT ? (
          <Pressable accessibilityRole="link" onPress={() => openHistory(portfolioId)} hitSlop={8}>
            <Text style={styles.link}>Pokaż wszystkie</Text>
          </Pressable>
        ) : null
      }>
      {visible.length === 0 ? (
        <Text style={styles.empty}>Tu pojawią się Twoje transakcje.</Text>
      ) : (
        visible.map((transaction, index) => (
          <View key={transaction.id}>
            {index > 0 ? <Separator inset={64} /> : null}
            <TransactionRow
              transaction={transaction}
              saleResult={saleResults.get(transaction.id)}
              portfolioName={portfolioNames?.get(transaction.portfolioId)}
              onPress={() => openTransactionEditor(transaction.id)}
            />
          </View>
        ))
      )}
      <View style={styles.bottomSpace} />
    </Card>
  );
}

const styles = StyleSheet.create({
  link: {
    fontSize: 15,
    color: Colors.tint,
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 13,
    color: Colors.secondaryLabel,
  },
  bottomSpace: {
    height: 6,
  },
});
