/** Formats a date as a local `YYYY-MM-DD` string. */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a `YYYY-MM-DD` string as a local date (midnight). */
export function fromISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayISODate(): string {
  return toISODate(new Date());
}

/** `YYYY-MM-DD` as a short Polish date, e.g. `24 lis 2026`. */
export function formatDisplayDate(value: string): string {
  return fromISODate(value).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Time as `14:15`. */
export function formatTime(time: number): string {
  return new Date(time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Date of a chart point. Intraday points show the time with the session day
 * ("Dziś, 15:30", or "pt., 21 lis, 15:30" when the last session was earlier,
 * e.g. on a weekend); daily points show the day.
 */
export function formatPointDate(time: number, isIntraday: boolean): string {
  const date = new Date(time);
  if (isIntraday) {
    const isToday = toISODate(date) === toISODate(new Date());
    const day = isToday
      ? 'Dziś'
      : date.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${day}, ${formatTime(time)}`;
  }
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}
