/** Navigation bar subtitle: when prices were updated, e.g. "14:15 24.11.2026". */
export function formatUpdatedAt(time: number): string {
  const date = new Date(time);
  const clock = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${clock} ${day}.${month}.${date.getFullYear()}`;
}

/**
 * Navigation bar subtitle of a portfolio screen: when prices were updated,
 * or a short note when downloading them failed (the portfolio stays on
 * screen, valued at the stored prices).
 */
export function formatSyncStatus(updatedAt: number | null, syncError: boolean): string | null {
  if (syncError) return 'Błąd synchronizacji';
  return updatedAt != null ? formatUpdatedAt(updatedAt) : null;
}
