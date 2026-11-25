import { FieldGroup, Host, ListItem, Picker, Row, Spacer, Text } from '@expo/ui';
import { Directory } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { createBackup } from '@/db/backup';
import { PORTFOLIO_CURRENCIES } from '@/db/portfolios';
import { getAppVersion } from '@/lib/app-version';
import { backupFileName } from '@/lib/backup';
import { readNumberPreference, writePreference } from '@/lib/preferences';
import { formatUpdatedAt } from '@/lib/quotes-status';
import { setSummaryCurrency, useSummaryCurrency } from '@/lib/settings';

const LAST_BACKUP_PREFERENCE = 'settings.lastBackupAt';

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
            <Row spacing={12}>
              <Text>Waluta podsumowania</Text>
              <Spacer flexible />
              <Picker
                selectedValue={summaryCurrency}
                onValueChange={setSummaryCurrency}
                appearance="menu"
                accessibilityLabel="Waluta podsumowania">
                {PORTFOLIO_CURRENCIES.map((code) => (
                  <Picker.Item key={code} label={code} value={code} />
                ))}
              </Picker>
            </Row>
            <FieldGroup.SectionFooter>
              <Text>
                W tej walucie liczona jest wartość wszystkich portfeli razem. Każdy portfel ma
                swoją walutę.
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section title="Dane">
            <ListItem
              onPress={isSaving ? undefined : saveBackup}
              supportingText={
                lastBackupAt ? `Ostatnia kopia: ${formatUpdatedAt(lastBackupAt)}` : 'Brak kopii'
              }>
              {isSaving ? 'Zapisywanie…' : 'Zapisz kopię zapasową'}
            </ListItem>
            <FieldGroup.SectionFooter>
              <Text>
                Portfele i operacje są zapisane tylko na tym telefonie. Kopię zapisz w Plikach lub
                na iCloud Drive, a przywrócisz ją w „+” → Import z pliku → Kopia zapasowa.
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section title="Informacje">
            <ListItem onPress={() => router.push('/settings/privacy')}>
              Polityka prywatności
            </ListItem>
            <ListItem trailing={appVersion ?? '—'}>Wersja aplikacji</ListItem>
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
