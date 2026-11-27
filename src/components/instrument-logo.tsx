import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, PlatformColor, StyleSheet, Text, View, type ColorValue } from 'react-native';

import { getBrandLogoUrl, getInstrumentLogoUrls, markLogoMissing } from '@/market/logos';

type InstrumentLogoProps = {
  symbol: string;
  name: string;
  size?: number;
  /** Logo by website domain instead of the ticker (e.g. a broker: `xtb.com`). */
  domain?: string;
};

const MONOGRAM_COLORS: [ios: string, fallback: string][] = [
  ['systemBlue', '#007AFF'],
  ['systemIndigo', '#5856D6'],
  ['systemPurple', '#AF52DE'],
  ['systemPink', '#FF2D55'],
  ['systemOrange', '#FF9500'],
  ['systemTeal', '#30B0C7'],
  ['systemGreen', '#34C759'],
  ['systemBrown', '#A2845E'],
];

/** Stable color per symbol, so a company always gets the same monogram color. */
function monogramColor(symbol: string): ColorValue {
  let hash = 0;
  for (let index = 0; index < symbol.length; index++) {
    hash = (hash * 31 + symbol.charCodeAt(index)) | 0;
  }
  const [ios, fallback] = MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
  return Platform.OS === 'ios' ? PlatformColor(ios) : fallback;
}

/** Company logo with a colored monogram while loading or when none exists. */
export function InstrumentLogo({ symbol, name, size = 36, domain }: InstrumentLogoProps) {
  // Several sources are tried in turn (ticker, then the company website);
  // the failed ones are remembered per symbol (rows get reused).
  const [failed, setFailed] = useState<{ symbol: string; urls: string[] }>({ symbol, urls: [] });
  const failedUrls = failed.symbol === symbol ? failed.urls : [];
  const urls = domain
    ? [getBrandLogoUrl(domain, size)].filter((url): url is string => url != null)
    : getInstrumentLogoUrls(symbol, size);
  const url = urls.find((candidate) => !failedUrls.includes(candidate)) ?? null;
  const letter = (name.trim()[0] ?? symbol[0] ?? '?').toUpperCase();

  return (
    <View
      accessible={false}
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: monogramColor(symbol) },
      ]}>
      <Text style={[styles.letter, { fontSize: size * 0.45 }]}>{letter}</Text>
      {url ? (
        <Image
          source={url}
          recyclingKey={url}
          contentFit="cover"
          transition={150}
          style={StyleSheet.absoluteFill}
          onError={() => {
            if (!domain) markLogoMissing(url);
            setFailed({ symbol, urls: [...failedUrls, url] });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
