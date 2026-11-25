import { useEffect } from 'react';
import { StyleSheet, type DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Colors } from '@/constants/colors';

type SkeletonProps = {
  width: DimensionValue;
  height: number;
  radius?: number;
};

/**
 * Placeholder block shown while data loads for the first time; it pulses
 * gently (still when the user prefers reduced motion).
 */
export function Skeleton({ width, height, radius = 6 }: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessible={false}
      style={[styles.block, { width, height, borderRadius: radius }, style]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: Colors.fill,
  },
});
