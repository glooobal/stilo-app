import { Stack } from 'expo-router';

import { openImport, openNewTransaction } from '@/lib/navigation';
import type { Instrument } from '@/market/types';

/** "+" header button with a native menu for adding a transaction or importing a file. */
export function AddTransactionMenu({
  instrument,
  portfolioId,
}: {
  instrument?: Instrument;
  portfolioId?: string;
}) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="plus" variant="prominent" accessibilityLabel="Dodaj transakcję">
        <Stack.Toolbar.MenuAction
          icon="plus.circle"
          onPress={() => openNewTransaction('buy', instrument, portfolioId)}>
          Kupno
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="minus.circle"
          onPress={() => openNewTransaction('sell', instrument, portfolioId)}>
          Sprzedaż
        </Stack.Toolbar.MenuAction>
        {instrument ? null : (
          <Stack.Toolbar.MenuAction
            icon="square.and.arrow.down"
            onPress={() => openImport(portfolioId)}>
            Import z pliku
          </Stack.Toolbar.MenuAction>
        )}
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}
