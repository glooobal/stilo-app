import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Colors } from '@/constants/colors';
import { openImport, openPortfolioEditor } from '@/lib/navigation';

import { Card } from './card';

/** Shown when there is no portfolio yet: transactions need one first. */
export function AddPortfolioCard() {
  return (
    <Card>
      <View style={styles.content}>
        <SymbolView name="wallet.bifold" tintColor={Colors.tint} size={36} />
        <Text style={styles.title}>Dodaj pierwszy portfel</Text>
        <Text style={styles.text}>
          Transakcje zapisujesz w portfelach, np. „Konto maklerskie” albo „IKE”. Zacznij od
          dodania portfela.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => openPortfolioEditor()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonLabel}>Dodaj portfel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => openImport()}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.link}>Przywróć z kopii zapasowej</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.label,
    marginTop: 4,
  },
  text: {
    fontSize: 15,
    textAlign: 'center',
    color: Colors.secondaryLabel,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: Colors.tint,
  },
  pressed: {
    opacity: 0.8,
  },
  link: {
    fontSize: 15,
    color: Colors.tint,
    marginTop: 4,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
