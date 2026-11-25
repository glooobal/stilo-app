import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/colors';

// Placeholder: the final privacy policy is still to be written.
const SECTIONS: [title: string, body: string][] = [
  [
    'Treść do ustalenia',
    'Pełna polityka prywatności pojawi się przed publikacją aplikacji.',
  ],
  [
    'Twoje dane',
    'Portfele i operacje są zapisane wyłącznie na tym urządzeniu. Aplikacja nie ma kont użytkowników i nie wysyła Twoich transakcji na żaden serwer.',
  ],
  [
    'Notowania i loga',
    'Aby pokazać ceny, aplikacja pobiera notowania z Yahoo Finance, a loga spółek z Brandfetch. W zapytaniach są tylko symbole instrumentów.',
  ],
];

export default function PrivacyPolicyScreen() {
  return (
    <>
      <Stack.Title>Polityka prywatności</Stack.Title>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scroll}
        contentContainerStyle={styles.content}>
        {SECTIONS.map(([title, body]) => (
          <Text key={title} style={styles.body}>
            <Text style={styles.title}>{`${title}\n`}</Text>
            {body}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: Colors.background,
  },
  content: {
    gap: 20,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.label,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.secondaryLabel,
  },
});
