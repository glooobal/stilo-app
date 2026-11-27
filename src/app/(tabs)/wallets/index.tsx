import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AddPortfolioCard } from '@/components/add-portfolio-card';
import { PORTFOLIO_ROW_HEIGHT, PortfolioListRow } from '@/components/portfolio-list-row';
import { SortableList } from '@/components/sortable-list';
import { TabScreen } from '@/components/tab-screen';
import { Colors } from '@/constants/colors';
import { reorderPortfolios } from '@/db/portfolios';
import { usePortfolios } from '@/hooks/use-portfolio';
import { openPortfolioEditor } from '@/lib/navigation';

export default function WalletsScreen() {
  const portfolios = usePortfolios();
  const [isDragging, setIsDragging] = useState(false);
  // Only one row shows its swipe actions at a time.
  const openRowRef = useRef<SwipeableMethods | null>(null);

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="plus"
          variant="prominent"
          accessibilityLabel="Dodaj portfel"
          onPress={() => openPortfolioEditor()}>
          Dodaj portfel
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <TabScreen
        title="Portfele"
        backgroundColor={Colors.groupedBackground}
        scrollEnabled={!isDragging}>
        <View style={styles.content}>
          {portfolios.length === 0 ? (
            <AddPortfolioCard />
          ) : (
            <SortableList
              items={portfolios}
              keyExtractor={(portfolio) => portfolio.id}
              itemHeight={PORTFOLIO_ROW_HEIGHT}
              appearance="cards"
              onReorder={reorderPortfolios}
              onDragStateChange={(dragging) => {
                if (dragging) openRowRef.current?.close();
                setIsDragging(dragging);
              }}
              renderItem={(portfolio) => (
                <PortfolioListRow
                  portfolio={portfolio}
                  onOpen={(methods) => {
                    if (openRowRef.current && openRowRef.current !== methods) {
                      openRowRef.current.close();
                    }
                    openRowRef.current = methods;
                  }}
                />
              )}
            />
          )}
        </View>
      </TabScreen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    paddingBottom: 32,
  },
});
