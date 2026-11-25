import { useRef, type ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Colors } from '@/constants/colors';
import type { TransactionSide } from '@/db/transactions';
import { openNewTransaction } from '@/lib/navigation';

import { HoldingRow } from './holding-row';
import { SwipeAction } from './swipe-action';

type SwipeableHoldingRowProps = ComponentProps<typeof HoldingRow> & {
  /** Portfolio the new transaction goes to (set inside a portfolio). */
  portfolioId?: string;
  /** Called when this row opens, so the list can close the previously open one. */
  onOpen?: (methods: SwipeableMethods) => void;
};

/** Holding row with swipe actions: green "+" to buy more, red "−" to sell. */
export function SwipeableHoldingRow({ onOpen, portfolioId, ...rowProps }: SwipeableHoldingRowProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const { instrument } = rowProps.position;

  const act = (side: TransactionSide) => {
    swipeableRef.current?.close();
    openNewTransaction(side, instrument, portfolioId);
  };

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      childrenContainerStyle={styles.row}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onOpen?.(swipeableRef.current);
      }}
      renderRightActions={() => (
        <>
          <SwipeAction label="Kup" symbol="plus" color={Colors.positive} onPress={() => act('buy')} />
          <SwipeAction
            label="Sprzedaj"
            symbol="minus"
            color={Colors.negative}
            onPress={() => act('sell')}
          />
        </>
      )}>
      <HoldingRow {...rowProps} />
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Colors.card,
  },
});
