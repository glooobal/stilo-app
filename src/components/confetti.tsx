import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#FFCC00', '#30B0C7'];
const COUNT = 48;
const DURATION = 1800;

type Piece = {
  x: number;
  drift: number;
  delay: number;
  rotate: number;
  width: number;
  height: number;
  color: string;
};

function ConfettiPiece({ piece, height }: { piece: Piece; height: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) })
    );
  }, [piece.delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.75 ? 1 : (1 - progress.value) * 4,
    transform: [
      // Bursts up a little, then falls through the screen.
      { translateY: -40 + progress.value * (height * 0.75) - Math.sin(progress.value * Math.PI) * 120 },
      { translateX: progress.value * piece.drift },
      { rotate: `${progress.value * piece.rotate}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: piece.x,
          width: piece.width,
          height: piece.height,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

/**
 * A short burst of confetti over the whole screen (does not catch touches).
 * Render it with a new `key` to play it again.
 */
export function Confetti() {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: COUNT }, (_, index) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 160,
        delay: Math.random() * 250,
        rotate: (Math.random() - 0.5) * 900,
        width: 6 + Math.random() * 5,
        height: 9 + Math.random() * 8,
        color: COLORS[index % COLORS.length],
      })),
    [width]
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay]}>
      {pieces.map((piece, index) => (
        <ConfettiPiece key={index} piece={piece} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 10,
  },
  piece: {
    position: 'absolute',
    top: 0,
    borderRadius: 2,
  },
});
