/** Parses user input that may use a comma or a dot as the decimal separator. */
export function parseDecimal(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || !/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Every digit of a number, without rounding it: `0.38434` stays `0.38434`.
 *
 * Doubles hold about 15 significant digits; beyond that is only binary noise
 * of arithmetic (`0.1 + 0.2` = `0.30000000000000004`). Reading the value at
 * 15 digits drops that noise and keeps every digit that was entered,
 * imported or downloaded. Never uses exponent notation (`1e-7`).
 */
export function toExactString(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const text = String(Number(value.toPrecision(15)));
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(text);
  if (!match) return text;
  const [, sign, integer, fraction = '', exponentText] = match;
  const digits = integer + fraction;
  const point = integer.length + Number(exponentText);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** Number of decimal places of the exact value (see `toExactString`). */
export function decimalPlaces(value: number): number {
  const fraction = toExactString(value).split('.')[1];
  return fraction ? fraction.length : 0;
}

/**
 * A number for an input field or a quantity, with a Polish decimal comma
 * and all its decimal places (never rounded: an edited transaction must be
 * saved with exactly the values it had).
 */
export function formatDecimalInput(value: number): string {
  return toExactString(value).replace('.', ',');
}

function formatCurrency(value: number, currency: string, fractionDigits: number): string {
  try {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      minimumFractionDigits: Math.min(2, fractionDigits),
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `${toExactString(value).replace('.', ',')} ${currency}`;
  }
}

/**
 * An amount of money (value, cost, profit) for display, to the grosz/cent
 * like on a bank statement. Display only: calculations always use the full
 * value. Prices of single shares use `formatPrice`.
 */
export function formatMoney(value: number, currency: string): string {
  return formatCurrency(value, currency, 2);
}

/**
 * An average price is cost ÷ quantity and can have endless decimals; it is
 * shown to this many places (the cost itself is kept in full).
 */
export const AVERAGE_PRICE_DIGITS = 4;

/**
 * Price of one share (or an exchange rate) with all its decimal places,
 * at least two: `5,996 zł`, `0,0377 zł`, `108,76 zł`.
 *
 * `maxFractionDigits` limits values that come from a division and have no
 * end (an average price like 133,333…); entered, imported and downloaded
 * prices are always shown in full.
 */
export function formatPrice(value: number, currency: string, maxFractionDigits = 15): string {
  return formatCurrency(value, currency, Math.max(2, Math.min(decimalPlaces(value), maxFractionDigits)));
}

/**
 * A downloaded market price (a chart point, the current quote). Quotes have
 * at most 4 meaningful decimals; the digits after them are noise of how the
 * provider stores and adjusts prices (e.g. 60.36000061035156 for 60,36, or
 * old closes divided after a split), not part of the price. Display only:
 * calculations keep the value as it is.
 */
export function formatQuote(value: number, currency: string): string {
  return formatPrice(Number(value.toFixed(4)), currency);
}

export function formatPercent(ratio: number, signed = true): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'percent',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(ratio);
}

/** Signed money amount, e.g. `+185,00 USD`. */
export function formatSignedMoney(value: number, currency: string): string {
  return `${value > 0 ? '+' : ''}${formatMoney(value, currency)}`;
}

/** Signed money with percent, e.g. `+185,00 USD (+18,30%)`. */
export function formatProfit(amount: number, ratio: number | null, currency: string): string {
  const money = formatSignedMoney(amount, currency);
  return ratio == null ? money : `${money} (${formatPercent(ratio)})`;
}

/**
 * Exact sum of decimal amounts (e.g. dividend lines of one payment from a
 * broker file): 4.24 + 1.06 + 9.54 + 5.3 is 20.14, not 20.140000000000001.
 * Adds them as whole numbers of their smallest decimal place, so nothing is
 * rounded; values with more than 15 significant digits fall back to `+`.
 */
export function sumExact(values: readonly number[]): number {
  const parts = values.map((value) => toExactString(value));
  const places = Math.max(0, ...parts.map((part) => part.split('.')[1]?.length ?? 0));
  try {
    let total = BigInt(0);
    for (const part of parts) {
      const [integer, fraction = ''] = part.replace('-', '').split('.');
      const digits = BigInt(integer + fraction.padEnd(places, '0'));
      total += part.startsWith('-') ? -digits : digits;
    }
    const negative = total < BigInt(0);
    const text = (negative ? -total : total).toString().padStart(places + 1, '0');
    const whole = text.slice(0, text.length - places);
    const fraction = places > 0 ? `.${text.slice(text.length - places)}` : '';
    return Number(`${negative ? '-' : ''}${whole}${fraction}`);
  } catch {
    return values.reduce((sum, value) => sum + value, 0);
  }
}
