import { Stack } from 'expo-router';

import { usePortfolios } from '@/hooks/use-portfolio';
import {
  openCashOperation,
  openImport,
  openNewDividend,
  openNewTransaction,
} from '@/lib/navigation';
import type { Instrument } from '@/market/types';

/** "+" header button with a native menu for adding a transaction or importing a file. */
export function AddTransactionMenu({
  instrument,
  portfolioId,
}: {
  instrument?: Instrument;
  portfolioId?: string;
}) {
  const portfolios = usePortfolios();
  // Deposits and withdrawals belong to cash portfolios only.
  const hasCash = portfolioId
    ? portfolios.some((item) => item.id === portfolioId && item.isCash)
    : portfolios.some((item) => item.isCash);
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
        {instrument ? (
          <Stack.Toolbar.MenuAction
            icon="banknote"
            onPress={() => openNewDividend(instrument.symbol, portfolioId)}>
            Dywidenda
          </Stack.Toolbar.MenuAction>
        ) : null}
        {!instrument && hasCash ? (
          <Stack.Toolbar.MenuAction
            icon="arrow.down.circle"
            onPress={() => openCashOperation('deposit', portfolioId)}>
            Wpłata
          </Stack.Toolbar.MenuAction>
        ) : null}
        {!instrument && hasCash ? (
          <Stack.Toolbar.MenuAction
            icon="arrow.up.circle"
            onPress={() => openCashOperation('withdrawal', portfolioId)}>
            Wypłata
          </Stack.Toolbar.MenuAction>
        ) : null}
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
