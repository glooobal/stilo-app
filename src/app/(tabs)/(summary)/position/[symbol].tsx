import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { InstrumentDetails } from '@/components/instrument-details';
import { Colors } from '@/constants/colors';
import { usePortfolioData } from '@/hooks/use-portfolio';

/** A position: all portfolios together, or one portfolio (`portfolioId`). */
export default function PositionScreen() {
  const { symbol, portfolioId } = useLocalSearchParams<{ symbol: string; portfolioId?: string }>();
  const { positions, saleResults } = usePortfolioData(portfolioId);
  const position = positions.find((item) => item.instrument.symbol === symbol);

  if (!position) {
    return (
      <>
        <Stack.Title>Pozycja</Stack.Title>
        <View style={styles.missing}>
          <Text style={styles.note}>Brak transakcji dla tego instrumentu.</Text>
        </View>
      </>
    );
  }
  return (
    <InstrumentDetails
      instrument={position.instrument}
      position={position}
      saleResults={saleResults}
      portfolioId={portfolioId}
    />
  );
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    textAlign: 'center',
  },
});
