import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { getBrandLogoUrl } from '@/market/logos';



/**
 * Companies listed on the GPW, by website (Brandfetch finds logos by
 * domain most reliably), with where their bubble floats: `x`, `y` as parts
 * of the area (centre), `size` in points.
 */
const BUBBLES: { domain: string; x: number; y: number; size: number }[] = [
  { domain: 'pzu.pl', x: 0.52, y: 0.46, size: 120 },
  { domain: 'cdprojektred.com', x: 0.74, y: 0.24, size: 110 },
  { domain: 'xtb.com', x: 0.3, y: 0.64, size: 104 },
  { domain: 'mbank.pl', x: 0.34, y: 0.16, size: 92 },
  { domain: 'orlen.pl', x: 0.84, y: 0.62, size: 96 },
  { domain: 'lpp.com', x: 0.6, y: 0.8, size: 84 },
  { domain: 'pkobp.pl', x: 0.1, y: 0.38, size: 80 },
  { domain: 'budimex.pl', x: 0.92, y: 0.08, size: 62 },
  { domain: 'kghm.com', x: 0.13, y: 0.86, size: 58 },
  { domain: 'erstegroup.com', x: 0.96, y: 0.88, size: 48 },
  { domain: 'mobruk.pl', x: 0.4, y: 0.94, size: 46 },
  { domain: 'digitalnetwork.pl', x: 0.06, y: 0.1, size: 42 },
  { domain: 'grupadino.pl', x: 0.58, y: 0.06, size: 36 },
  { domain: 'kruk.eu', x: 0.22, y: 0.36, size: 30 },
  { domain: 'pekao.com.pl', x: 0.99, y: 0.4, size: 26 },
].sort((a, b) => a.size - b.size); // Larger bubbles in front, as in a heap.

function Bubble({
  domain,
  left,
  top,
  size,
  index,
}: {
  domain: string;
  left: number;
  top: number;
  size: number;
  index: number;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const appear = useSharedValue(0);
  const float = useSharedValue(0);

  // Each bubble pops in a little later and floats at its own pace.
  useEffect(() => {
    if (!isLoaded) return;
    appear.value = withDelay(index * 70, withSpring(1, { damping: 12, stiffness: 120 }));
    const duration = 2600 + (index % 5) * 450;
    float.value = withDelay(
      index * 120,
      withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
          withTiming(-1, { duration, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, [isLoaded, index, appear, float]);

  const drift = 4 + (size / 118) * 6;
  // Scale only: the glass effect does not take part in opacity changes.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: float.value * drift },
      { translateX: float.value * (index % 2 === 0 ? 2 : -2) },
      { scale: appear.value },
    ],
  }));

  const url = getBrandLogoUrl(domain, size);
  // No logo, no bubble: never a placeholder.
  if (!url || hasFailed) return null;

  const radius = size / 2;
  // The logo fills the whole bubble.
  const inset = 0;
  return (
    <Animated.View
      style={[
        styles.bubble,
        { left: left - radius, top: top - radius, width: size, height: size, borderRadius: radius },
        animatedStyle,
      ]}>
      <Image
        source={url}
        contentFit="cover"
        style={{
          position: 'absolute',
          left: inset,
          top: inset,
          width: size - inset * 2,
          height: size - inset * 2,
          borderRadius: radius - inset,
        }}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasFailed(true)}
      />
      {/* A glass sphere over it: brighter towards the edge, darker at the
          bottom, a sharp highlight at the top left. No blur: the logo stays crisp. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { borderRadius: radius }]} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.specular, { borderRadius: radius }]}
      />
    </Animated.View>
  );
}

/** Logos of GPW companies floating in Liquid Glass bubbles (onboarding welcome). */
export function LogoBubbles({ height }: { height: number }) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BUBBLES.map((bubble, index) => (
        <Bubble
          key={bubble.domain}
          domain={bubble.domain}
          left={bubble.x * width}
          top={bubble.y * height}
          size={bubble.size * Math.min(1, width / 400)}
          index={index}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  edge: {
    backgroundImage:
      'radial-gradient(circle farthest-side at 50% 50%, rgba(255, 255, 255, 0) 62%, rgba(255, 255, 255, 0.12) 84%, rgba(255, 255, 255, 0.35) 100%)',
  },
  shade: {
    backgroundImage:
      'radial-gradient(circle farthest-side at 42% 30%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.14) 100%)',
  },
  specular: {
    backgroundImage:
      'radial-gradient(ellipse 34% 20% at 36% 20%, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.35) 45%, rgba(255, 255, 255, 0) 100%)',
  },
});
