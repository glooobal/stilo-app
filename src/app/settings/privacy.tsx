import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/colors';
import { CONTACT_EMAIL } from '@/lib/contact';

/** Who is responsible for the app and how to reach them. */
const ADMINISTRATOR = 'Jakub Górzny';
const UPDATED_AT = '27 listopada 2026';

const SECTIONS: [title: string, body: string][] = [
  [
    'W skrócie',
    'Stilo nie ma kont użytkowników ani reklam. Twoje portfele, transakcje i dywidendy są zapisane tylko na Twoim urządzeniu i nigdzie nie są wysyłane. Jedyne, co zbieramy, to anonimowe statystyki użycia aplikacji (Firebase Analytics), które pomagają nam ją ulepszać. Nie sprzedajemy ani nie udostępniamy Twoich danych.',
  ],
  [
    'Kto odpowiada za aplikację',
    `Administratorem danych jest ${ADMINISTRATOR}, twórca aplikacji Stilo. W sprawach prywatności napisz na ${CONTACT_EMAIL}.`,
  ],
  [
    'Dane zapisane na urządzeniu',
    'Portfele, transakcje, dywidendy, wpłaty i wypłaty, cel dywidendowy i ustawienia aplikacji są przechowywane wyłącznie w pamięci Twojego urządzenia. Aplikacja nie wysyła ich nigdzie – nie mamy do nich dostępu i nie możemy ich odczytać, odzyskać ani usunąć za Ciebie.',
  ],
  [
    'Import plików od brokera',
    'Pliki z historią transakcji (np. z XTB) są odczytywane tylko na urządzeniu. Aplikacja zapisuje z nich operacje, a sam plik nie jest nigdzie przesyłany.',
  ],
  [
    'Notowania i kursy walut',
    'Aby pokazać ceny, kursy walut i dywidendy, aplikacja pobiera dane z Yahoo Finance. W zapytaniach wysyłane są tylko symbole instrumentów i par walut (np. PZU.WA, USDPLN) oraz tekst wpisany w wyszukiwarkę walorów. Nie są wysyłane ilości, kwoty ani informacje o Twoich portfelach.',
  ],
  [
    'Loga spółek',
    'Loga są pobierane z serwisu Brandfetch na podstawie symbolu lub adresu strony spółki. Nie są przy tym wysyłane żadne Twoje dane.',
  ],
  [
    'Usługi zewnętrzne',
    'Jak przy każdym połączeniu z internetem, Yahoo Finance, Brandfetch i Google (Firebase) widzą adres IP Twojego urządzenia oraz informacje techniczne zapytania. Przetwarzają je zgodnie z własnymi politykami prywatności.',
  ],
  [
    'Kopie zapasowe',
    'Kopię zapasową tworzysz sam i zapisujesz w wybranym przez siebie miejscu (np. w Plikach lub na iCloud Drive). Plik nie jest szyfrowany i zawiera Twoje portfele i operacje – przechowuj go tak, jak inne prywatne dokumenty.',
  ],
  [
    'Powiadomienia',
    'Powiadomienia o wypłatach dywidend i celu dywidendowym są planowane na urządzeniu. Nie korzystamy z serwera powiadomień. Możesz je wyłączyć w Ustawieniach aplikacji lub systemu.',
  ],
  [
    'Statystyki użycia (Firebase Analytics)',
    'Korzystamy z Firebase Analytics firmy Google, aby wiedzieć, jak aplikacja jest używana: które ekrany są otwierane, jak długo trwają sesje, na jakich urządzeniach i wersjach systemu działa aplikacja oraz z jakiego kraju lub regionu (ustalanego w przybliżeniu na podstawie adresu IP). Każda instalacja ma losowy identyfikator Firebase, niepowiązany z Twoim imieniem, adresem e-mail ani kontem.\n\nDo statystyk nie trafiają Twoje portfele, transakcje, kwoty ani nazwy walorów. Nie używamy identyfikatora reklamowego (IDFA), nie śledzimy Cię w innych aplikacjach i nie wyświetlamy reklam.\n\nPodstawą przetwarzania jest nasz prawnie uzasadniony interes – rozwój i poprawa aplikacji. Google może przetwarzać te dane także poza Europejskim Obszarem Gospodarczym, na zasadach przewidzianych w RODO (m.in. standardowe klauzule umowne, EU-US Data Privacy Framework). Statystyki są przechowywane przez okres ustawiony w Firebase, nie dłużej niż 14 miesięcy.',
  ],
  [
    'Usunięcie danych',
    'Możesz usunąć pojedyncze operacje i portfele w aplikacji. Usunięcie aplikacji z urządzenia usuwa wszystkie jej dane (poza kopiami zapasowymi zapisanymi przez Ciebie w innym miejscu).',
  ],
  [
    'Twoje prawa',
    'Twoje portfele i operacje są wyłącznie pod Twoją kontrolą na urządzeniu. W zakresie statystyk użycia masz prawo dostępu do danych, ich usunięcia, ograniczenia przetwarzania oraz sprzeciwu wobec przetwarzania. Masz też prawo złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych. Z pytaniami i wnioskami pisz na ' +
      `${CONTACT_EMAIL}.`,
  ],
  [
    'Zmiany polityki',
    `O istotnych zmianach poinformujemy w aplikacji. Ostatnia aktualizacja: ${UPDATED_AT}.`,
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
