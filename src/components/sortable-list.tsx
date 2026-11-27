import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors } from '@/constants/colors';

/** Item id → its index in the list. */
type Positions = Record<string, number>;

const SPRING = { damping: 22, stiffness: 260 };
const LONG_PRESS_MS = 300;

/** Moves one item to a new index and shifts the items in between. */
function moveTo(positions: Positions, id: string, to: number): Positions {
  'worklet';
  const from = positions[id];
  const next: Positions = {};
  for (const key in positions) {
    const position = positions[key];
    if (key === id) next[key] = to;
    else if (from < to && position > from && position <= to) next[key] = position - 1;
    else if (from > to && position < from && position >= to) next[key] = position + 1;
    else next[key] = position;
  }
  return next;
}

function toPositions(ids: string[]): Positions {
  return Object.fromEntries(ids.map((id, index) => [id, index]));
}

type SortableListProps<T> = {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** All rows share this height (needed to compute the drop position). */
  itemHeight: number;
  /** Left inset of the separator lines between rows. */
  separatorInset?: number;
  /**
   * `rows`: rows in one panel, with separators. `cards`: every item draws
   * its own panel (no background or separators here); `itemHeight` then
   * includes the space below each card.
   */
  appearance?: 'rows' | 'cards';
  /** New order of ids after a drag. */
  onReorder: (orderedIds: string[]) => void;
  /** Lets the screen stop scrolling while a row is dragged. */
  onDragStateChange?: (isDragging: boolean) => void;
};

/**
 * List whose rows can be reordered: press and hold a row, then drag it.
 * Other gestures on the rows (taps, horizontal swipes) keep working, because
 * dragging only starts after the long press.
 */
export function SortableList<T>({
  items,
  keyExtractor,
  renderItem,
  itemHeight,
  separatorInset = 16,
  appearance = 'rows',
  onReorder,
  onDragStateChange,
}: SortableListProps<T>) {
  const ids = items.map(keyExtractor);
  const idsKey = ids.join('|');
  const positions = useSharedValue<Positions>(toPositions(ids));

  useEffect(() => {
    positions.value = toPositions(idsKey ? idsKey.split('|') : []);
  }, [idsKey, positions]);

  const handleDragStart = () => onDragStateChange?.(true);
  const handleDrop = (finalPositions: Positions) => {
    onDragStateChange?.(false);
    const ordered = Object.keys(finalPositions).sort(
      (a, b) => finalPositions[a] - finalPositions[b]
    );
    if (ordered.join('|') !== idsKey) onReorder(ordered);
  };

  return (
    <View style={{ height: ids.length * itemHeight }}>
      {items.map((item, index) => {
        const id = keyExtractor(item);
        return (
          <SortableItem
            key={id}
            id={id}
            initialIndex={index}
            count={ids.length}
            positions={positions}
            itemHeight={itemHeight}
            separatorInset={separatorInset}
            isCard={appearance === 'cards'}
            onDragStart={handleDragStart}
            onDrop={handleDrop}>
            {renderItem(item)}
          </SortableItem>
        );
      })}
    </View>
  );
}

type SortableItemProps = {
  id: string;
  initialIndex: number;
  count: number;
  positions: SharedValue<Positions>;
  itemHeight: number;
  separatorInset: number;
  isCard: boolean;
  onDragStart: () => void;
  onDrop: (positions: Positions) => void;
  children: ReactNode;
};

function SortableItem({
  id,
  initialIndex,
  count,
  positions,
  itemHeight,
  separatorInset,
  isCard,
  onDragStart,
  onDrop,
  children,
}: SortableItemProps) {
  const top = useSharedValue(initialIndex * itemHeight);
  const startTop = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Rows that are not dragged slide into their new place.
  useAnimatedReaction(
    () => positions.value[id],
    (next, previous) => {
      if (next == null || next === previous || isDragging.value) return;
      top.value = withSpring(next * itemHeight, SPRING);
    }
  );

  const pan = usePanGesture({
    activateAfterLongPress: LONG_PRESS_MS,
    onActivate: () => {
      'worklet';
      isDragging.value = true;
      startTop.value = top.value;
      scheduleOnRN(onDragStart);
    },
    onUpdate: (event) => {
      'worklet';
      const maxTop = (count - 1) * itemHeight;
      const y = Math.min(Math.max(startTop.value + event.translationY, 0), maxTop);
      top.value = y;
      const target = Math.round(y / itemHeight);
      if (target !== positions.value[id]) {
        positions.value = moveTo(positions.value, id, target);
      }
    },
    onFinalize: () => {
      'worklet';
      if (!isDragging.value) return;
      isDragging.value = false;
      top.value = withSpring(positions.value[id] * itemHeight, SPRING);
      scheduleOnRN(onDrop, positions.value);
    },
  });

  const itemStyle = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: isDragging.value ? 1 : 0,
    shadowOpacity: withTiming(isDragging.value ? 0.18 : 0),
    transform: [{ scale: withTiming(isDragging.value ? 1.02 : 1) }],
  }));
  // No line above the first row or around the dragged one.
  const separatorStyle = useAnimatedStyle(() => ({
    opacity: positions.value[id] === 0 || isDragging.value ? 0 : 1,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.item, !isCard && styles.rowBackground, { height: itemHeight }, itemStyle]}>
        {children}
        {isCard ? null : (
          <Animated.View
            pointerEvents="none"
            style={[styles.separator, { left: separatorInset }, separatorStyle]}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  item: {
    position: 'absolute',
    left: 0,
    right: 0,
    shadowColor: '#000000',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  rowBackground: {
    backgroundColor: Colors.card,
  },
  separator: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.separator,
  },
});
