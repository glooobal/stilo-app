import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/colors';

/** Hairline separator, inset to start under the row text. */
export function Separator({ inset = 16 }: { inset?: number }) {
  return <View style={[styles.separator, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.separator,
  },
});
