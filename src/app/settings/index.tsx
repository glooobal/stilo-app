import { FieldGroup, Host, ListItem, Picker, Row, Spacer, Switch, Text } from '@expo/ui';
import { Directory } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';

import { createBackup } from '@/db/backup';
import { PORTFOLIO_CURRENCIES } from '@/db/portfolios';
import { getAppVersion } from '@/lib/app-version';
import { CONTACT_EMAIL } from '@/lib/contact';
import { backupFileName } from '@/lib/backup';
import { readNumberPreference, writePreference } from '@/lib/preferences';
import { areDividendNotificationsOn, setDividendNotifications } from '@/lib/notifications';
import { formatUpdatedAt } from '@/lib/quotes-status';
import { setSummaryCurrency, useSummaryCurrency } from '@/lib/settings';

const LAST_BACKUP_PREFERENCE = 'settings.lastBackupAt';
const SECONDARY_COLOR = '#8E8E93';

function isCancel(error: unknown): boolean {
  return error instanceof Error && /cancel/i.test(error.message);
}

/** Sheet with app settings: summary currency, backup, privacy policy, version. */
export default function SettingsScreen() {
  const summaryCurrency = useSummaryCurrency();
  const [lastBackupAt, setLastBackupAt] = useState(() =>
    readNumberPreference(LAST_BACKUP_PREFERENCE)
  );
  const [isSaving, setIsSaving] = useState(false);
  const appVersion = getAppVersion();
  const [notificationsOn, setNotificationsOn] = useState(areDividendNotificationsOn);
  const changeNotifications = async (isOn: boolean) => {
    setNotificationsOn(isOn);
    const granted = await setDividendNotifications(isOn);
    if (isOn && !granted) {
      Alert.alert(
        'Powiadomienia są wyłączone',
        'Włącz powiadomienia dla aplikacji w Ustawieniach systemu.',
        [
          { text: 'Anuluj', style: 'cancel' },
          { text: 'Otwórz Ustawienia', isPreferred: true, onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const saveBackup = async () => {
    let directory: Directory;
    try {
      // The user picks the folder (On My iPhone, iCloud Drive, ...).
      directory = await Directory.pickDirectoryAsync();
    } catch (error) {
      if (!isCancel(error)) {
        Alert.alert('Nie udało się zapisać kopii', 'Nie można otworzyć wybranego folderu.');
      }
      return;
    }

    setIsSaving(true);
    try {
      const text = JSON.stringify(createBackup(appVersion));
      const name = backupFileName();
      let file;
      try {
        file = directory.createFile(name, 'application/json');
      } catch {
        // A backup from today is already there: keep both.
        const time = new Date().toTimeString().slice(0, 5).replace(':', '');
        file = directory.createFile(name.replace('.json', `-${time}.json`), 'application/json');
      }
      file.writeSync(text);
      const now = Date.now();
      writePreference(LAST_BACKUP_PREFERENCE, String(now));
      setLastBackupAt(now);
      Alert.alert('Zapisano kopię zapasową', `Plik „${file.name}” w folderze „${directory.name}”.`);
    } catch (error) {
      Alert.alert(
        'Nie udało się zapisać kopii',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Stack.Title>Ustawienia</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark"
          variant="prominent"
          accessibilityLabel="Gotowe"
          onPress={() => router.back()}>
          Gotowe
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={styles.host}>
        <FieldGroup>
          <FieldGroup.Section title="Ogólne">
            <Row alignment="center" spacing={12}>
              <Text>Główna waluta</Text>
              <Spacer flexible />
              <Picker
                selectedValue={summaryCurrency}
                onValueChange={setSummaryCurrency}
                appearance="menu"
                accessibilityLabel="Główna waluta">
                {PORTFOLIO_CURRENCIES.map((code) => (
                  <Picker.Item key={code} label={code} value={code} />
                ))}
              </Picker>
            </Row>
            <FieldGroup.SectionFooter>
              <Text>
                W tej walucie liczona jest wartość wszystkich portfeli razem. Portfele wciąż mogą
                mieć swoje (inne) waluty.
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section title="Powiadomienia">
            <Row alignment="center" spacing={8}>
              <Text>Dywidendy i cel dywidendowy</Text>
              <Spacer />
              <Switch value={notificationsOn} onValueChange={changeNotifications} />
            </Row>
            <FieldGroup.SectionFooter>
              <Text>
                W dniu szacowanej wypłaty dywidendy i gdy osiągniesz cel dywidendowy – także gdy
                aplikacja jest zamknięta.
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section title="Dane">
            <ListItem
              onPress={isSaving ? undefined : saveBackup}
              supportingText={
                <Text textStyle={{ color: SECONDARY_COLOR, fontSize: 13 }}>
                  {lastBackupAt ? `Ostatnia kopia: ${formatUpdatedAt(lastBackupAt)}` : 'Brak kopii'}
                </Text>
              }>
              {isSaving ? 'Zapisywanie…' : 'Zapisz kopię zapasową'}
            </ListItem>
            <FieldGroup.SectionFooter>
              <Text>
                Twoje portfele i operacje są zapisywane tylko tutaj. Kopię zapisz w Plikach lub na
                iCloud Drive, a przywrócisz ją w „+” → Import z pliku → Kopia zapasowa.
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section title="Informacje">
            <ListItem onPress={() => router.push('/settings/privacy')}>
              Polityka prywatności
            </ListItem>
            <ListItem
              onPress={() =>
                Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() =>
                  Alert.alert('Kontakt', `Napisz do nas na ${CONTACT_EMAIL}.`)
                )
              }
              trailing={<Text textStyle={{ color: SECONDARY_COLOR }}>{CONTACT_EMAIL}</Text>}>
              Kontakt
            </ListItem>
            <ListItem
              trailing={<Text textStyle={{ color: SECONDARY_COLOR }}>{appVersion ?? '—'}</Text>}>
              Wersja aplikacji
            </ListItem>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
